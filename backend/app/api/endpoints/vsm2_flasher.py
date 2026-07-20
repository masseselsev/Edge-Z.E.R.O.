import os
import glob
import sys
import importlib.util
import asyncio
import queue
import paramiko
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List
from sqlalchemy import select
from app.models.user import User
from app.api import deps
from app.db.session import AsyncSessionLocal
from app.models.system_settings import SystemSettings
from app.services.vsm2_repo import get_repo_info, sync_repo, REPO_CACHE_DIR
from app.services.vsm2_worker import FlashWorker, LOG_QUEUE, LOG_HISTORY, SUBSCRIBERS, ACTIVE_TASKS, ACTIVE_TASKS_LOCK, parse_ip_ranges, clean_ansi

router = APIRouter()
CONSOLE_SESSIONS = {}  # username -> (ssh, channel)

class FlashRequest(BaseModel):
    ips: str
    username: str
    password: str
    port: int = 2222
    advertised_ip: str

class ConsoleConnectRequest(BaseModel):
    ip: str
    ssh_port: int = 2222
    username: str
    password: str
    port: str = ""  # serial port candidate override

class ConsoleSendCommand(BaseModel):
    command: str

class DumpRequest(BaseModel):
    ip: str
    ssh_port: int = 2222
    username: str
    password: str
    serial_port: str
    params: List[str]

async def get_system_setting(key: str, default: str = "") -> str:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(SystemSettings).where(SystemSettings.key == key))
        setting = res.scalars().first()
        return setting.value if setting else default

@router.get("/repo-status")
async def repo_status(current_user: User = Depends(deps.get_current_user)):
    return get_repo_info()

@router.post("/repo-sync")
async def trigger_repo_sync(current_user: User = Depends(deps.get_current_user)):
    success = sync_repo()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to sync repository cache")
    return {"status": "synced"}

@router.get("/files/{filename:path}")
async def get_repo_file(filename: str):
    safe_path = os.path.normpath(os.path.join(REPO_CACHE_DIR, filename))
    if not safe_path.startswith(REPO_CACHE_DIR) or not os.path.exists(safe_path) or os.path.isdir(safe_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(safe_path)

@router.post("/flash")
async def flash_devices(payload: FlashRequest, current_user: User = Depends(deps.get_current_user)):
    ips = parse_ip_ranges(payload.ips)
    if not ips:
        raise HTTPException(status_code=400, detail="No valid IPs found")
        
    with ACTIVE_TASKS_LOCK:
        available_ips = []
        for ip in ips:
            if ip not in ACTIVE_TASKS:
                available_ips.append(ip)
                ACTIVE_TASKS.add(ip)
                
    if not available_ips:
        raise HTTPException(status_code=409, detail="All devices are currently busy!")
        
    tg_token = await get_system_setting("TELEGRAM_BOT_TOKEN")
    tg_chat_id = await get_system_setting("TELEGRAM_CHAT_ID")
    timezone = await get_system_setting("DEFAULT_TIMEZONE", "UTC")
    
    sync_repo() # Trigger repo check
    
    for ip in available_ips:
        worker = FlashWorker(
            ip=ip, username=payload.username, password=payload.password, port=payload.port,
            tg_token=tg_token, tg_chat_id=tg_chat_id, advertised_ip=payload.advertised_ip,
            timezone=timezone
        )
        worker.start()
    return {"status": "started", "count": len(available_ips)}

@router.get("/stream")
async def stream_logs(current_user: User = Depends(deps.get_current_user)):
    def event_generator():
        q = queue.Queue()
        SUBSCRIBERS.append(q)
        for old in list(LOG_HISTORY):
            yield f"data: {old}\n\n"
        try:
            while True:
                try:
                    msg = q.get(timeout=10.0)
                    yield f"data: {msg}\n\n"
                except queue.Empty:
                    yield ": keep-alive\n\n"
        finally:
            if q in SUBSCRIBERS:
                SUBSCRIBERS.remove(q)
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/logs/clear")
async def clear_logs(current_user: User = Depends(deps.get_current_user)):
    global LOG_HISTORY
    LOG_HISTORY.clear()
    return {"status": "cleared"}

@router.get("/console/ports")
async def get_console_ports(current_user: User = Depends(deps.get_current_user)):
    ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')
    if not ports:
        ports = ['/dev/ttyUSB0 (Simulated)']
    return ports

@router.get("/console/commands")
async def get_console_commands(current_user: User = Depends(deps.get_current_user)):
    cmd_path = os.path.join(REPO_CACHE_DIR, 'dist', 'commands.py')
    if not os.path.exists(cmd_path):
        return []
    try:
        spec = importlib.util.spec_from_file_location("commands", cmd_path)
        commands = importlib.util.module_from_spec(spec)
        sys.path.append(os.path.join(REPO_CACHE_DIR, 'dist'))
        spec.loader.exec_module(commands)
        cmds = []
        def add_cmds(array, type_name):
            for name, data in array.items():
                cmds.append({
                    "value": f"{type_name} {name}", 
                    "label": f"{name} ({type_name})", 
                    "desc": data.get("description", "")
                })
        if hasattr(commands, 'cmd_read_array'): add_cmds(commands.cmd_read_array, 'read')
        if hasattr(commands, 'cmd_write_array'): add_cmds(commands.cmd_write_array, 'write')
        if hasattr(commands, 'cmd_control_array'): add_cmds(commands.cmd_control_array, 'control')
        if hasattr(commands, 'cmd_test_array'): add_cmds(commands.cmd_test_array, 'test')
        if hasattr(commands, 'cmd_util_array'): add_cmds(commands.cmd_util_array, 'util')
        return cmds
    except Exception:
        return []

@router.post("/console/connect")
async def console_connect(payload: ConsoleConnectRequest, current_user: User = Depends(deps.get_current_user)):
    username = current_user.username
    if username in CONSOLE_SESSIONS:
        try:
            CONSOLE_SESSIONS[username][0].close()
        except:
            pass
        del CONSOLE_SESSIONS[username]
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(payload.ip, port=payload.ssh_port, username=payload.username, password=payload.password, timeout=15)
        sftp = ssh.open_sftp()
        ssh.exec_command("mkdir -p ~/controlboard")
        for f in ['app.py', 'dist/commands.py', 'dist/controlboard.py']:
            src = os.path.join(REPO_CACHE_DIR, f)
            dest = f"controlboard/{f}"
            if os.path.exists(src):
                if '/' in f:
                    ssh.exec_command(f"mkdir -p ~/controlboard/{f.split('/')[0]}")
                sftp.put(src, dest)
        sftp.close()
        
        ssh.exec_command("cd ~/controlboard && python3 -m venv env && ./env/bin/pip install pyserial requests")
        ssh.exec_command(f"echo '{payload.password}' | sudo -S usermod -aG dialout {payload.username}")
        
        target_port = payload.port or "/dev/ttyUSB0"
        channel = ssh.invoke_shell()
        channel.send(f"sg dialout -c 'cd ~/controlboard && ~/controlboard/env/bin/python3 -u app.py'\n")
        
        await asyncio.sleep(2.0)
        channel.send(f"{target_port}\n")
        await asyncio.sleep(1.0)
        channel.send("19200\n")
        await asyncio.sleep(1.0)
        
        CONSOLE_SESSIONS[username] = (ssh, channel)
        out = ""
        if channel.recv_ready():
            out = channel.recv(4096).decode('utf-8', errors='ignore')
            return {"status": "connected", "banner": clean_ansi(out)}
        return {"status": "connected", "banner": "Console connection established"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/console/send")
async def console_send(payload: ConsoleSendCommand, current_user: User = Depends(deps.get_current_user)):
    username = current_user.username
    if username not in CONSOLE_SESSIONS:
        raise HTTPException(status_code=400, detail="Console not connected")
    ssh, channel = CONSOLE_SESSIONS[username]
    try:
        channel.send(f"{payload.command}\n")
        await asyncio.sleep(1.0)
        out = ""
        while channel.recv_ready():
            out += channel.recv(4096).decode('utf-8', errors='ignore')
        return {"output": clean_ansi(out)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/console/disconnect")
async def console_disconnect(current_user: User = Depends(deps.get_current_user)):
    username = current_user.username
    if username in CONSOLE_SESSIONS:
        ssh, channel = CONSOLE_SESSIONS[username]
        try: channel.close()
        except: pass
        try: ssh.close()
        except: pass
        del CONSOLE_SESSIONS[username]
    return {"status": "disconnected"}

@router.post("/console/batch_read")
async def console_batch_read(payload: DumpRequest, current_user: User = Depends(deps.get_current_user)):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(payload.ip, port=payload.ssh_port, username=payload.username, password=payload.password, timeout=10)
        results = {}
        for p in payload.params:
            cmd = f"sg dialout -c 'cd ~/controlboard && ~/controlboard/env/bin/python3 -u dist/controlboard.py read {p} -p {payload.serial_port}'"
            stdin, stdout, stderr = ssh.exec_command(cmd)
            out = clean_ansi(stdout.read().decode())
            err = clean_ansi(stderr.read().decode())
            results[p] = out if out else f"ERROR: {err}"
        ssh.close()
        return {"status": "success", "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
