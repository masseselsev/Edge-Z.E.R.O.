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
    serial_port: str = ""
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
    success = await asyncio.to_thread(sync_repo)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to sync repository cache")
    return {"status": "synced"}

@router.get("/files/{filename:path}")
async def get_repo_file(filename: str):
    safe_path = os.path.normpath(os.path.join(REPO_CACHE_DIR, filename))
    if not (safe_path == REPO_CACHE_DIR or safe_path.startswith(REPO_CACHE_DIR + os.sep)) or not os.path.exists(safe_path) or os.path.isdir(safe_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(safe_path)

@router.get("/api/repo/list")
async def list_repo_files(request: Request, path: str = ""):
    safe_path = os.path.normpath(os.path.join(REPO_CACHE_DIR, path))
    if not (safe_path == REPO_CACHE_DIR or safe_path.startswith(REPO_CACHE_DIR + os.sep)):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not os.path.exists(safe_path) or not os.path.isdir(safe_path):
        raise HTTPException(status_code=404, detail="Directory not found")
        
    files = []
    base_url = str(request.base_url).rstrip('/')
    flasher_base_url = f"{base_url}/api/vsm2-flasher"
    
    for item in os.listdir(safe_path):
        item_path = os.path.join(safe_path, item)
        item_rel = os.path.join(path, item)
        
        if item.startswith('.'):
            continue
            
        if os.path.isfile(item_path):
            files.append({
                "name": item,
                "type": "file",
                "download_url": f"{flasher_base_url}/files/{item_rel}"
            })
        elif os.path.isdir(item_path):
            files.append({
                "name": item,
                "type": "dir",
                "download_url": None
            })
            
    return files

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
    
    await asyncio.to_thread(sync_repo) # Trigger repo check
    
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
    cmd_path = os.path.join(REPO_CACHE_DIR, 'controlboard', 'dist', 'commands.py')
    if not os.path.exists(cmd_path):
        return []
    try:
        spec = importlib.util.spec_from_file_location("commands", cmd_path)
        commands = importlib.util.module_from_spec(spec)
        sys.path.append(os.path.join(REPO_CACHE_DIR, 'controlboard', 'dist'))
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
        await asyncio.to_thread(ssh.connect, payload.ip, port=payload.ssh_port, username=payload.username, password=payload.password, timeout=15)
        sftp = await asyncio.to_thread(ssh.open_sftp)
        
        stdin, stdout, stderr = ssh.exec_command("mkdir -p ~/controlboard")
        await asyncio.to_thread(stdout.channel.recv_exit_status)
        
        for f in ['app.py', 'dist/commands.py', 'dist/controlboard.py']:
            src = os.path.join(REPO_CACHE_DIR, 'controlboard', f)
            dest = f"controlboard/{f}"
            if os.path.exists(src):
                if '/' in f:
                    subfolder = f.split('/')[0]
                    stdin_sub, stdout_sub, stderr_sub = ssh.exec_command(f"mkdir -p ~/controlboard/{subfolder}")
                    await asyncio.to_thread(stdout_sub.channel.recv_exit_status)
                await asyncio.to_thread(sftp.put, src, dest)
                
        # Upload offline wheels if they exist in repo cache
        wheels_dir = os.path.join(REPO_CACHE_DIR, 'controlboard', 'wheels')
        if os.path.isdir(wheels_dir):
            stdin_whl, stdout_whl, stderr_whl = ssh.exec_command("mkdir -p ~/controlboard/wheels")
            await asyncio.to_thread(stdout_whl.channel.recv_exit_status)
            for whl_path in glob.glob(os.path.join(wheels_dir, "*.whl")):
                filename = os.path.basename(whl_path)
                await asyncio.to_thread(sftp.put, whl_path, f"controlboard/wheels/{filename}")
                
        await asyncio.to_thread(sftp.close)
        
        # Check if environment is already configured, otherwise build it
        # Try local wheels first, then fallback to network index with fast-timeout
        check_cmd = (
            "if [ -f ~/controlboard/env/bin/python3 ] && ~/controlboard/env/bin/python3 -c 'import serial, requests' 2>/dev/null; then "
            "  echo 'OK'; "
            "else "
            "  FOUND_PYTHON=\"\"; "
            "  for py in python3.14 python3.13 /opt/edge/venv/bin/python3 /opt/edge/venv/bin/python python3 python; do "
            "    if command -v \"$py\" >/dev/null 2>&1 || [ -x \"$py\" ]; then "
            "      if \"$py\" -c \"import venv, ensurepip\" >/dev/null 2>&1; then "
            "        FOUND_PYTHON=\"$py\"; "
            "        break; "
            "      fi; "
            "    fi; "
            "  done; "
            "  if [ -z \"$FOUND_PYTHON\" ]; then "
            "    echo 'ERROR: No Python interpreter with working venv/ensurepip found.' >&2; "
            "    exit 1; "
            "  fi; "
            "  \"$FOUND_PYTHON\" -m venv env && "
            "  (./env/bin/pip install --no-index --find-links wheels/ pyserial requests || "
            "   ./env/bin/pip install --timeout 3 --retries 1 pyserial requests); "
            "fi"
        )
        stdin_env, stdout_env, stderr_env = ssh.exec_command(f"cd ~/controlboard && {check_cmd}")
        exit_status = await asyncio.to_thread(stdout_env.channel.recv_exit_status)
        if exit_status != 0:
            err = (await asyncio.to_thread(stderr_env.read)).decode(errors='ignore')
            raise HTTPException(status_code=500, detail=f"Failed to setup python virtual environment: {err}")
            
        stdin_usr, stdout_usr, stderr_usr = ssh.exec_command(f"echo '{payload.password}' | sudo -S usermod -aG dialout {payload.username}")
        await asyncio.to_thread(stdout_usr.channel.recv_exit_status)
         
        # Automatically detect correct serial port on target box
        stdin, stdout, stderr = ssh.exec_command("ls -1 /dev/ttyUSB* /dev/ttyACM* 2>/dev/null")
        await asyncio.to_thread(stdout.channel.recv_exit_status)
        ports = [line.strip() for line in (await asyncio.to_thread(stdout.read)).decode().split('\n') if line.strip()]
        if not ports:
            raise HTTPException(status_code=404, detail="VSM2 controller not found (no serial ports /dev/ttyUSB* or /dev/ttyACM* detected on the target box).")
         
        target_port = None
        # Smart Port Detection: check which port responds to tech_data command
        for port in ports:
            check_cmd = f"sg dialout -c 'cd ~/controlboard && timeout 5s ~/controlboard/env/bin/python3 -u dist/controlboard.py read tech_data -p {port}'"
            stdin_check, stdout_check, stderr_check = ssh.exec_command(check_cmd)
            await asyncio.to_thread(stdout_check.channel.recv_exit_status)
            out = (await asyncio.to_thread(stdout_check.read)).decode()
            if "Update Version:" in out:
                target_port = port
                break
         
        if not target_port:
            # Default to /dev/ttyUSB2 if it exists, otherwise first candidate
            usb2 = "/dev/ttyUSB2"
            if usb2 in ports:
                target_port = usb2
            else:
                target_port = ports[0]
         
        channel = await asyncio.to_thread(ssh.invoke_shell)
         
        # Run port scan inside the interactive shell so the user sees the output visually
        cmd_seq = (
            "cd ~/controlboard && "
            "echo '=== SCANNING SERIAL PORTS ===' && "
            "for port in /dev/ttyUSB* /dev/ttyACM*; do "
            "  if [ -e \"$port\" ]; then "
            "    echo \"Checking port: $port\" && "
            "    sg dialout -c \"timeout 5s ~/controlboard/env/bin/python3 -u dist/controlboard.py read tech_data -p $port\" 2>&1; "
            "  fi; "
            "done && "
            "echo '=== STARTING INTERACTIVE SHELL ===' && "
            "sg dialout -c '~/controlboard/env/bin/python3 -u app.py'\n"
        )
        await asyncio.to_thread(channel.send, cmd_seq)
         
        await asyncio.sleep(4.0)
        await asyncio.to_thread(channel.send, f"{target_port}\n")
        await asyncio.sleep(1.0)
        await asyncio.to_thread(channel.send, "19200\n")
        await asyncio.sleep(1.0)
        
        CONSOLE_SESSIONS[username] = (ssh, channel)
        out = ""
        if channel.recv_ready():
            out = channel.recv(4096).decode('utf-8', errors='ignore')
            return {"status": "connected", "banner": clean_ansi(out)}
        return {"status": "connected", "banner": "Console connection established"}
    except HTTPException:
        raise
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
        await asyncio.to_thread(ssh.connect, payload.ip, port=payload.ssh_port, username=payload.username, password=payload.password, timeout=10)
        
        # Automatically detect correct serial port on target box
        stdin, stdout, stderr = ssh.exec_command("ls -1 /dev/ttyUSB* 2>/dev/null")
        await asyncio.to_thread(stdout.channel.recv_exit_status)
        ports = [line.strip() for line in (await asyncio.to_thread(stdout.read)).decode().split('\n') if line.strip()]
        if not ports:
            raise HTTPException(status_code=404, detail="VSM2 controller not found (no serial ports /dev/ttyUSB* detected on the target box).")
        target_port = ports[0]
        
        results = {}
        for p in payload.params:
            cmd = f"sg dialout -c 'cd ~/controlboard && ~/controlboard/env/bin/python3 -u dist/controlboard.py read {p} -p {target_port}'"
            stdin, stdout, stderr = ssh.exec_command(cmd)
            await asyncio.to_thread(stdout.channel.recv_exit_status)
            out = clean_ansi((await asyncio.to_thread(stdout.read)).decode())
            err = clean_ansi((await asyncio.to_thread(stderr.read)).decode())
            results[p] = out if out else f"ERROR: {err}"
        await asyncio.to_thread(ssh.close)
        return {"status": "success", "results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
