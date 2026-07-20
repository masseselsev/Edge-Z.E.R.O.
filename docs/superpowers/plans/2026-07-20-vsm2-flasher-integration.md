# VSM2 Flasher Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the VSM2 flasher (`mass_flasher`) tool into the Overwatch hub (`overwatch`) as a React tab and FastAPI backend routes, integrating settings correctly.

**Architecture:** We will implement a FastAPI router mounted at `/api/vsm2-flasher` for repository caching, multi-threaded flashing with SSE log streaming, and SSH-based console interaction. The React tab UI will be placed between Settings and Edge-B.R.O., and the existing "Edge B.R.O." tab will be renamed to "Edge-B.R.O.".

**Tech Stack:** FastAPI, React (TypeScript), Tailwind CSS, asyncssh, paramiko, gitpython.

## Global Constraints
- **File Length:** Do not exceed 500-600 lines per file (strict project limit in Edge-Z.E.R.O.).
- **Abstraction:** Put helper logic in separate service files under `backend/app/services/`.
- **DRY/YAGNI:** Keep operations simple and do not duplicate settings structure.

---

### Task 1: Repository Cache Service and Static File Routes

**Files:**
- Create: `backend/app/services/vsm2_repo.py`
- Modify: `backend/app/main.py:28-30`
- Create: `backend/app/api/endpoints/vsm2_flasher.py`
- Create: `backend/test_vsm2_repo.py`
- Modify: `backend/.gitignore`

**Interfaces:**
- Consumes: `git` library for repo cloning.
- Produces: `sync_repo()`, `get_repo_info()`, `/api/vsm2-flasher/repo-status` endpoint, `/api/vsm2-flasher/files/{path}` endpoint.

- [ ] **Step 1: Update .gitignore to exclude local repo cache**
  Modify `/home/masse/projects/overwatch/.gitignore` to ignore the local cached repository:
  ```diff
  # OS Generated
  dnsmasq.ethers
  pxelinux.cfg/
+ 
+ # VSM2 Repo Cache
+ backend/vsm2_repo_cache/
  ```

- [ ] **Step 2: Create `backend/app/services/vsm2_repo.py`**
  Write repository caching and management operations:
  ```python
  import os
  import git
  import threading
  import logging

  logger = logging.getLogger(__name__)
  REPO_URL = "https://github.com/masseselsev/controlboard.git"
  REPO_CACHE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "vsm2_repo_cache"))
  REPO_LOCK = threading.Lock()

  def sync_repo():
      with REPO_LOCK:
          try:
              env = os.environ.copy()
              env['GIT_TERMINAL_PROMPT'] = '0'
              if not os.path.exists(os.path.join(REPO_CACHE_DIR, '.git')):
                  logger.info(f"Cloning {REPO_URL} to {REPO_CACHE_DIR}")
                  os.makedirs(REPO_CACHE_DIR, exist_ok=True)
                  git.Repo.clone_from(REPO_URL, REPO_CACHE_DIR, env=env)
              else:
                  logger.info(f"Updating {REPO_CACHE_DIR}")
                  repo = git.Repo(REPO_CACHE_DIR)
                  with repo.git.custom_environment(GIT_TERMINAL_PROMPT='0'):
                      repo.remotes.origin.fetch()
                      repo.git.reset('--hard', 'origin/main')
                      repo.git.clean('-fdx')
              return True
          except Exception as e:
              logger.error(f"Repo sync failed: {e}")
              return False

  def get_repo_info():
      if not os.path.exists(os.path.join(REPO_CACHE_DIR, '.git')):
          return {"exists": False}
      try:
          repo = git.Repo(REPO_CACHE_DIR)
          head = repo.head.commit
          fetch_head = os.path.join(REPO_CACHE_DIR, '.git', 'FETCH_HEAD')
          last_synced = "Never"
          if os.path.exists(fetch_head):
              import datetime
              mtime = os.path.getmtime(fetch_head)
              last_synced = datetime.datetime.fromtimestamp(mtime, tz=datetime.timezone.utc).isoformat()
          return {
              "exists": True,
              "commit": head.hexsha[:7],
              "author": str(head.author),
              "date": head.committed_datetime.isoformat(),
              "message": head.message.strip(),
              "branch": repo.active_branch.name,
              "last_synced": last_synced
          }
      except Exception as e:
          return {"exists": False, "error": str(e)}
  ```

- [ ] **Step 3: Create router `backend/app/api/endpoints/vsm2_flasher.py`**
  Create the initial routes to expose repo status and static file downloader:
  ```python
  import os
  from fastapi import APIRouter, Depends, HTTPException
  from fastapi.responses import FileResponse
  from app.services.vsm2_repo import get_repo_info, sync_repo, REPO_CACHE_DIR
  from app.models.user import User
  from app.api import deps

  router = APIRouter()

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
  ```

- [ ] **Step 4: Mount VSM2 Flasher Router in `backend/app/main.py`**
  Update `main.py` to register the new router and trigger repo sync on startup:
  ```python
  # Insert around line 28
  from app.api.endpoints import vsm2_flasher
  app.include_router(vsm2_flasher.router, prefix="/api/vsm2-flasher", tags=["vsm2-flasher"])

  # Inside startup_event, spawn sync_repo background check
  @app.on_event("startup")
  async def startup_event():
      import threading
      from app.services.vsm2_repo import sync_repo
      threading.Thread(target=sync_repo, daemon=True).start()
  ```

- [ ] **Step 5: Write backend test in `backend/test_vsm2_repo.py`**
  Add unit tests validating endpoints:
  ```python
  from fastapi.testclient import TestClient
  from app.main import app
  import pytest

  def test_repo_endpoints():
      client = TestClient(app)
      response = client.get("/api/vsm2-flasher/repo-status")
      # Expect 401 since user is not logged in
      assert response.status_code == 401
      
      # We check files without login
      response = client.get("/api/vsm2-flasher/files/controlboard/setup.sh")
      # Can be 404 if clone hasn't completed, but shouldn't crash
      assert response.status_code in (200, 404)
  ```

- [ ] **Step 6: Run tests and verify**
  Run: `pytest backend/test_vsm2_repo.py -v`
  Expected: PASS

- [ ] **Step 7: Commit**
  ```bash
  git add backend/app/services/vsm2_repo.py backend/app/api/endpoints/vsm2_flasher.py backend/app/main.py backend/test_vsm2_repo.py .gitignore
  git commit -m "feat: add vsm2 repo cache service and static file server"
  ```

---

### Task 2: Implement SSH Workers, Log Stream & SSE endpoint

**Files:**
- Create: `backend/app/services/vsm2_worker.py`
- Modify: `backend/app/api/endpoints/vsm2_flasher.py`
- Create: `backend/test_vsm2_worker.py`

**Interfaces:**
- Consumes: target credentials, queue system, database session.
- Produces: `FlashWorker` threads, `LOG_QUEUE` queue, SSE stream yield.

- [ ] **Step 1: Create `backend/app/services/vsm2_worker.py`**
  Define multi-threaded log broadcaster and `FlashWorker` classes:
  ```python
  import time
  import socket
  import re
  import threading
  import queue
  import requests
  import paramiko
  from datetime import datetime
  from zoneinfo import ZoneInfo
  from app.services.vsm2_repo import sync_repo

  LOG_QUEUE = queue.Queue()
  LOG_HISTORY = []
  MAX_HISTORY = 500
  SUBSCRIBERS = []
  ACTIVE_TASKS = set()
  ACTIVE_TASKS_LOCK = threading.Lock()

  def clean_ansi(text):
      ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
      text = ansi_escape.sub('', text)
      text = re.sub(r'[\x00-\x09\x0b-\x1f\x7f]', '', text) 
      return text.strip()

  def broadcast_logger():
      global LOG_HISTORY
      while True:
          try:
              msg = LOG_QUEUE.get()
              LOG_HISTORY.append(msg)
              if len(LOG_HISTORY) > MAX_HISTORY:
                  LOG_HISTORY.pop(0)
              for sub in SUBSCRIBERS[:]:
                  try:
                      sub.put(msg)
                  except:
                      pass
          except Exception:
              time.sleep(0.1)

  threading.Thread(target=broadcast_logger, daemon=True).start()

  def send_telegram_notification(ip, status, token, chat_id, error_detail=None):
      if status in ["SUCCESS", "SKIPPED"] or not token or not chat_id:
          return
      status_icon = "❌"
      status_text = "СБОЙ"
      message = f"<b>[VSM2 Flash&Control]</b>\n{status_icon} <b>Отчет о прошивке</b>\n\n" \
                f"<b>Устройство:</b> {ip}\n" \
                f"<b>Статус:</b> {status_text}\n"
      if error_detail:
          message += f"<b>Ошибка:</b> {error_detail}\n"
      message += f"<b>Действие:</b> Обновление прошивки и перезагрузка"
      url = f"https://api.telegram.org/bot{token}/sendMessage"
      try:
          requests.post(url, json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"}, timeout=5)
      except:
          pass

  class FlashWorker(threading.Thread):
      def __init__(self, ip, username, password, port, tg_token, tg_chat_id, advertised_ip, timezone="UTC"):
          super().__init__()
          self.ip = ip
          self.username = username
          self.password = password
          self.port = port
          self.tg_token = tg_token
          self.tg_chat_id = tg_chat_id
          self.advertised_ip = advertised_ip
          self.timezone = timezone
          self.status = "FAILURE"

      def log(self, message):
          try:
              tz = ZoneInfo(self.timezone)
          except:
              tz = None
          timestamp = datetime.now(tz).strftime("%H:%M:%S") if tz else time.strftime("%H:%M:%S")
          formatted = f"[{timestamp}] [{self.ip}] {message}"
          LOG_QUEUE.put(formatted)

      def run(self):
          self.log("Connecting...")
          client = paramiko.SSHClient()
          client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
          reboot_triggered = False
          try:
              client.connect(self.ip, port=self.port, username=self.username, password=self.password, timeout=5)
              self.log("Connected. Starting flash process...")
              
              base_url_env = f'export BASE_URL="http://{self.advertised_ip}:7000/api/vsm2-flasher"; ' if self.advertised_ip else ""
              env_vars = f'export TELEGRAM_BOT_TOKEN="{self.tg_token}"; export TELEGRAM_CHAT_ID="{self.tg_chat_id}"; export TERM=xterm-256color; {base_url_env}'
              
              if base_url_env:
                  setup_url = f"http://{self.advertised_ip}:7000/api/vsm2-flasher/files/controlboard/setup.sh"
                  cmd = env_vars + f'mkdir -p ~/controlboard; if wget --timeout=5 -t 1 -q -O ~/controlboard/setup.sh "{setup_url}"; then chmod +x ~/controlboard/setup.sh; ~/controlboard/setup.sh "{setup_url}" --flash-cleanup; else echo "Error: Failed to download setup.sh from {setup_url}"; exit 1; fi'
              else:
                  cmd = env_vars + 'mkdir -p ~/controlboard; url="https://raw.githubusercontent.com/masseselsev/controlboard/main/controlboard/setup.sh"; if wget --timeout=5 -t 1 -q -O ~/controlboard/setup.sh "$url"; then chmod +x ~/controlboard/setup.sh; ~/controlboard/setup.sh "$url" --flash-cleanup; else echo "Error: Failed to download setup.sh"; exit 1; fi'
              
              stdin, stdout, stderr = client.exec_command(cmd, get_pty=True)
              channel = stdout.channel
              buffer = ""
              JUNK_PATTERNS = ["Got byte", "Send byte", "Index finish", "Sent 'run'", "Sent 'yes'", "byte:", "Detected version:", "Trying send", "Start address"]
              
              while not channel.exit_status_ready() or channel.recv_ready():
                  if channel.recv_ready():
                      data = channel.recv(4096).decode('utf-8', errors='replace')
                      buffer += data
                      while '\n' in buffer or '\r' in buffer:
                          idx_n = buffer.find('\n')
                          idx_r = buffer.find('\r')
                          if idx_n != -1 and (idx_r == -1 or idx_n < idx_r):
                              line = buffer[:idx_n]
                              buffer = buffer[idx_n+1:]
                              clean_content = clean_ansi(line)
                              if "The system will reboot now" in clean_content or "Перезагрузка..." in clean_content:
                                  reboot_triggered = True
                              if clean_content and not any(x in line for x in JUNK_PATTERNS) and not clean_content.startswith("Hit:") and not clean_content.startswith("Get:") and not re.match(r'^[\d\s]+$', clean_content):
                                  self.log(clean_content)
                          elif idx_r != -1:
                              line = buffer[:idx_r]
                              buffer = buffer[idx_r+1:]
                              clean_content = clean_ansi(line)
                              if "The system will reboot now" in clean_content or "Перезагрузка..." in clean_content:
                                  reboot_triggered = True
                              if ("progress:" in line or "Working" in line or "%" in line) and clean_content:
                                  self.log(clean_content + "\r")
                              elif clean_content and not any(x in line for x in JUNK_PATTERNS) and not clean_content.startswith("Hit:") and not clean_content.startswith("Get:") and not re.match(r'^[\d\s]+$', clean_content):
                                  self.log(clean_content)
                  else:
                      time.sleep(0.01)
              
              exit_status = stdout.channel.recv_exit_status()
              if exit_status == 0 or (exit_status == -1 and reboot_triggered):
                  self.log("SUCCESS: Flash completed and reboot triggered.")
                  self.status = "SUCCESS"
              elif exit_status == 2:
                  self.log("SUCCESS: Firmware already up to date (Skipped).")
                  self.status = "SKIPPED"
              else:
                  self.log(f"FAILURE: Process exited with code {exit_status}")
                  self.status = "FAILURE"
          except Exception as e:
              if reboot_triggered:
                  self.log("SUCCESS: Flash completed and reboot triggered.")
                  self.status = "SUCCESS"
              else:
                  self.log(f"ERROR: {str(e)}")
                  self.status = "FAILURE"
          finally:
              client.close()
              with ACTIVE_TASKS_LOCK:
                  ACTIVE_TASKS.discard(self.ip)
              send_telegram_notification(self.ip, self.status, self.tg_token, self.tg_chat_id)
  ```

- [ ] **Step 2: Add API endpoints in `backend/app/api/endpoints/vsm2_flasher.py`**
  Modify `/home/masse/projects/overwatch/backend/app/api/endpoints/vsm2_flasher.py` to add `flash` and `stream` routes:
  ```python
  from fastapi import APIRouter, Depends, HTTPException, Request
  from fastapi.responses import StreamingResponse
  import asyncio
  import queue
  from pydantic import BaseModel
  from typing import List
  from app.models.user import User
  from app.api import deps
  from app.db.session import AsyncSessionLocal
  from sqlalchemy import select
  from app.models.system_settings import SystemSettings
  from app.services.vsm2_worker import FlashWorker, LOG_QUEUE, LOG_HISTORY, SUBSCRIBERS, ACTIVE_TASKS, ACTIVE_TASKS_LOCK
  from ssh_utils import parse_ip_ranges # Use existing range parser

  class FlashRequest(BaseModel):
      ips: str
      username: str
      password: str
      port: int = 2222
      advertised_ip: str

  async def get_system_setting(key: str, default: str = "") -> str:
      async with AsyncSessionLocal() as db:
          res = await db.execute(select(SystemSettings).where(SystemSettings.key == key))
          setting = res.scalars().first()
          return setting.value if setting else default

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
  ```

- [ ] **Step 3: Create backend tests in `backend/test_vsm2_worker.py`**
  Verify the flash configuration endpoints and log streaming router initialization:
  ```python
  from fastapi.testclient import TestClient
  from app.main import app

  def test_flasher_routes():
      client = TestClient(app)
      res = client.get("/api/vsm2-flasher/stream")
      assert res.status_code == 401 # Auth required

      res = client.post("/api/vsm2-flasher/logs/clear")
      assert res.status_code == 401
  ```

- [ ] **Step 4: Run tests and verify**
  Run: `pytest backend/test_vsm2_worker.py -v`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add backend/app/services/vsm2_worker.py backend/app/api/endpoints/vsm2_flasher.py backend/test_vsm2_worker.py
  git commit -m "feat: implement SSH FlashWorker and log streaming SSE endpoints"
  ```

---

### Task 3: Interactive Console SSH Tunnels & Batch Register Dump

**Files:**
- Modify: `backend/app/api/endpoints/vsm2_flasher.py`
- Create: `backend/test_vsm2_console.py`

**Interfaces:**
- Consumes: ssh credentials, commands catalog, serial console IO.
- Produces: Connect/Disconnect REPL channels, autocomplete JSON, batch registers readout reports.

- [ ] **Step 1: Add Console REPL routes in `vsm2_flasher.py`**
  Modify `/home/masse/projects/overwatch/backend/app/api/endpoints/vsm2_flasher.py` to add Console routes, including dynamically loading `dist/commands.py` if present:
  ```python
  # Add to backend/app/api/endpoints/vsm2_flasher.py imports and class properties:
  import glob
  import sys
  import importlib.util
  import paramiko

  CONSOLE_SESSIONS = {} # username -> channel

  class ConsoleConnectRequest(BaseModel):
      ip: str
      ssh_port: int = 2222
      username: str
      password: str
      port: str = "" # serial port candidate override

  class ConsoleSendCommand(BaseModel):
      command: str

  class DumpRequest(BaseModel):
      ip: str
      ssh_port: int = 2222
      username: str
      password: str
      serial_port: str
      params: List[str]

  @router.get("/console/ports")
  async def get_console_ports(current_user: User = Depends(deps.get_current_user)):
      ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')
      if not ports:
          ports = ['/dev/ttyUSB0 (Simulated)']
      return ports

  @router.get("/console/commands")
  async def get_console_commands(current_user: User = Depends(deps.get_current_user)):
      # Dynamically import commands from cached repo
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
          try: CONSOLE_SESSIONS[username].close()
          except: pass
          del CONSOLE_SESSIONS[username]
      
      ssh = paramiko.SSHClient()
      ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
      try:
          ssh.connect(payload.ip, port=payload.ssh_port, username=payload.username, password=payload.password, timeout=15)
          # Bootstrapping files (ensure controlboard is setup on node)
          sftp = ssh.open_sftp()
          ssh.exec_command("mkdir -p ~/controlboard")
          # Copy app files from local cache
          for f in ['app.py', 'dist/commands.py', 'dist/controlboard.py']:
              src = os.path.join(REPO_CACHE_DIR, f)
              dest = f"controlboard/{f}"
              if os.path.exists(src):
                  if '/' in f:
                      ssh.exec_command(f"mkdir -p ~/controlboard/{f.split('/')[0]}")
                  sftp.put(src, dest)
          sftp.close()
          
          # Check venv and pyserial/requests
          ssh.exec_command("cd ~/controlboard && python3 -m venv env && ./env/bin/pip install pyserial requests")
          ssh.exec_command(f"echo '{payload.password}' | sudo -S usermod -aG dialout {payload.username}")
          
          # Detect active serial port
          target_port = payload.port or "/dev/ttyUSB0"
          channel = ssh.invoke_shell()
          channel.send(f"sg dialout -c 'cd ~/controlboard && ~/controlboard/env/bin/python3 -u app.py'\n")
          
          # Standard prompts wait
          await asyncio.sleep(2.0)
          channel.send(f"{target_port}\n")
          await asyncio.sleep(1.0)
          channel.send("19200\n")
          await asyncio.sleep(1.0)
          
          CONSOLE_SESSIONS[username] = (ssh, channel)
          # Consume startup buffer
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
  ```

- [ ] **Step 2: Create unit tests in `backend/test_vsm2_console.py`**
  Validate console connect validation schemas:
  ```python
  from fastapi.testclient import TestClient
  from app.main import app

  def test_vsm2_console_routes():
      client = TestClient(app)
      res = client.get("/api/vsm2-flasher/console/ports")
      assert res.status_code == 401
      
      res = client.post("/api/vsm2-flasher/console/disconnect")
      assert res.status_code == 401
  ```

- [ ] **Step 3: Run tests and verify**
  Run: `pytest backend/test_vsm2_console.py -v`
  Expected: PASS

- [ ] **Step 4: Commit**
  ```bash
  git add backend/app/api/endpoints/vsm2_flasher.py backend/test_vsm2_console.py
  git commit -m "feat: implement console connect, autocomplete, and batch read registers"
  ```

---

### Task 4: Rename "Edge B.R.O." tab to "Edge-B.R.O." and update translations

**Files:**
- Modify: `frontend/src/components/Header.tsx:117-126`, `262-265`
- Modify: `frontend/src/i18n/translations.ts:12`, `136`, `250`

**Interfaces:**
- Consumes: translation context.
- Produces: updated tab titles in the navigation header.

- [ ] **Step 1: Modify `frontend/src/components/Header.tsx`**
  Rename tab key or representation from "Edge B.R.O." to "Edge-B.R.O.":
  ```tsx
  // Around line 117
  { 
    id: 'edgebro', 
    label: t('tabEdgeBro'), 
    icon: (
      // SVG remains identical
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" ... />
    )
  }
  ```

- [ ] **Step 2: Modify `frontend/src/i18n/translations.ts`**
  Change values of `tabEdgeBro` in all locales and add new translations for VSM2 Flasher:
  ```typescript
  // English (line 12):
  tabEdgeBro: 'Edge-B.R.O.',
  tabVsm2Flasher: 'VSM2 Flasher',

  // Ukrainian (line 136):
  tabEdgeBro: 'Edge-B.R.O.',
  tabVsm2Flasher: 'VSM2 Прошивальник',

  // Russian (line 250):
  tabEdgeBro: 'Edge-B.R.O.',
  tabVsm2Flasher: 'VSM2 Прошивальщик',
  ```

- [ ] **Step 3: Verify the translation changes**
  Open files and run check to verify no syntax errors exist in translations.

- [ ] **Step 4: Commit**
  ```bash
  git add frontend/src/components/Header.tsx frontend/src/i18n/translations.ts
  git commit -m "refactor: rename Edge B.R.O. to Edge-B.R.O. and add flasher keys"
  ```

---

### Task 5: Frontend React Tab UI Implementation

**Files:**
- Create: `frontend/src/components/Vsm2FlasherTab.tsx`
- Modify: `frontend/src/App.tsx:12`, `104-108`, `115-120`
- Modify: `frontend/src/components/Header.tsx:115-120`

**Interfaces:**
- Consumes: `/api/vsm2-flasher` router.
- Produces: UI component for flasher settings, target entry, console, REPL, and logs stream.

- [ ] **Step 1: Create `frontend/src/components/Vsm2FlasherTab.tsx`**
  Build the complete UI component:
  ```tsx
  import React, { useState, useEffect, useRef } from 'react';
  import { useTranslation } from '../context/TranslationContext';
  import { Play, Terminal, Database, Sliders, RefreshCw, AlertCircle, Trash2, CheckCircle } from 'lucide-react';

  interface RepoInfo {
    exists: boolean;
    commit?: string;
    author?: string;
    date?: string;
    message?: string;
    branch?: string;
    last_synced?: string;
  }

  interface CommandItem {
    value: string;
    label: string;
    desc: string;
  }

  export default function Vsm2FlasherTab() {
    const { t } = useTranslation();
    const [subTab, setSubTab] = useState<'console' | 'logs'>('console');
    const [ips, setIps] = useState('');
    const [sshUser, setSshUser] = useState('user');
    const [sshPass, setSshPass] = useState('admin');
    const [sshPort, setSshPort] = useState(2222);
    const [advertisedIp, setAdvertisedIp] = useState('');
    const [availableIps, setAvailableIps] = useState<string[]>([]);
    const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
    const [syncingRepo, setSyncingRepo] = useState(false);
    
    // Console states
    const [targetConsoleIp, setTargetConsoleIp] = useState('');
    const [consolePort, setConsolePort] = useState('/dev/ttyUSB0');
    const [consolePortsList, setConsolePortsList] = useState<string[]>([]);
    const [consoleCommands, setConsoleCommands] = useState<CommandItem[]>([]);
    const [consoleConnected, setConsoleConnected] = useState(false);
    const [consoleBanner, setConsoleBanner] = useState('');
    const [consoleInput, setConsoleInput] = useState('');
    const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
    
    // Logs state
    const [liveLogs, setLiveLogs] = useState<string[]>([]);

    useEffect(() => {
      fetchRepoStatus();
      fetchConsolePorts();
      fetchConsoleCommands();
      detectHostIps();
      
      const sse = new EventSource('/api/vsm2-flasher/stream');
      sse.onmessage = (e) => {
        setLiveLogs(prev => [...prev, e.data].slice(-500));
      };
      return () => sse.close();
    }, []);

    const detectHostIps = async () => {
      // Setup Host auto detect logic
      setAdvertisedIp('192.168.222.2'); // default fallback
    };

    const fetchRepoStatus = async () => {
      try {
        const res = await fetch('/api/vsm2-flasher/repo-status');
        if (res.ok) setRepoInfo(await res.json());
      } catch (err) { console.error(err); }
    };

    const fetchConsolePorts = async () => {
      try {
        const res = await fetch('/api/vsm2-flasher/console/ports');
        if (res.ok) setConsolePortsList(await res.json());
      } catch (err) { console.error(err); }
    };

    const fetchConsoleCommands = async () => {
      try {
        const res = await fetch('/api/vsm2-flasher/console/commands');
        if (res.ok) setConsoleCommands(await res.json());
      } catch (err) { console.error(err); }
    };

    const handleSyncRepo = async () => {
      setSyncingRepo(true);
      try {
        const res = await fetch('/api/vsm2-flasher/repo-sync', { method: 'POST' });
        if (res.ok) fetchRepoStatus();
      } catch (err) { console.error(err); }
      setSyncingRepo(false);
    };

    const handleStartFlash = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const res = await fetch('/api/vsm2-flasher/flash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ips, username: sshUser, password: sshPass, port: sshPort, advertised_ip: advertisedIp })
        });
        if (res.ok) {
          alert('Flasher threads spawned! View progress in Live Logs tab.');
          setSubTab('logs');
        } else {
          const err = await res.json();
          alert(`Flasher failed: ${err.detail}`);
        }
      } catch (err) { console.error(err); }
    };

    const handleConsoleConnect = async () => {
      try {
        const res = await fetch('/api/vsm2-flasher/console/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: targetConsoleIp, ssh_port: sshPort, username: sshUser, password: sshPass, port: consolePort })
        });
        if (res.ok) {
          const data = await res.json();
          setConsoleBanner(data.banner);
          setConsoleConnected(true);
        }
      } catch (err) { console.error(err); }
    };

    const handleConsoleSend = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const res = await fetch('/api/vsm2-flasher/console/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: consoleInput })
        });
        if (res.ok) {
          const data = await res.json();
          setConsoleOutput(prev => [...prev, `> ${consoleInput}`, data.output]);
          setConsoleInput('');
        }
      } catch (err) { console.error(err); }
    };

    const handleConsoleDisconnect = async () => {
      try {
        await fetch('/api/vsm2-flasher/console/disconnect', { method: 'POST' });
        setConsoleConnected(false);
        setConsoleOutput([]);
      } catch (err) { console.error(err); }
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">VSM2 Controller Flasher</h2>
            <p className="text-zinc-400 text-xs mt-1">Deploy, flash, and debug VSM2 devices via serial over SSH tunnels.</p>
          </div>
          <div className="flex gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800/60">
            <button onClick={() => setSubTab('console')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${subTab === 'console' ? 'bg-zinc-900 text-zinc-100 border border-zinc-800' : 'text-zinc-400 hover:text-zinc-100'}`}>Console Control</button>
            <button onClick={() => setSubTab('logs')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${subTab === 'logs' ? 'bg-zinc-900 text-zinc-100 border border-zinc-800' : 'text-zinc-400 hover:text-zinc-100'}`}>Live Logs</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <form onSubmit={handleStartFlash} className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-6 rounded-xl space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Flasher Target Configuration</h3>
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Target Device IPs / Ranges</label>
                <textarea value={ips} onChange={(e) => setIps(e.target.value)} required className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg font-mono min-h-[80px] outline-none" placeholder="192.168.1.10, 192.168.1.20-30" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">SSH User</label>
                  <input type="text" value={sshUser} onChange={(e) => setSshUser(e.target.value)} required className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">SSH Password</label>
                  <input type="password" value={sshPass} onChange={(e) => setSshPass(e.target.value)} required className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">SSH Port</label>
                  <input type="number" value={sshPort} onChange={(e) => setSshPort(parseInt(e.target.value) || 22)} required className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Flasher IP</label>
                  <input type="text" value={advertisedIp} onChange={(e) => setAdvertisedIp(e.target.value)} required className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none" />
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2">
                <Play size={14} /> Start Mass Flash & Reboot
              </button>
            </form>

            <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-6 rounded-xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Repository Status</h3>
                <button onClick={handleSyncRepo} disabled={syncingRepo} className="p-1 text-zinc-400 hover:text-zinc-200">
                  <RefreshCw size={14} className={syncingRepo ? 'animate-spin' : ''} />
                </button>
              </div>
              {repoInfo?.exists ? (
                <div className="space-y-2 text-xs font-mono">
                  <p><span className="text-zinc-500">Branch:</span> {repoInfo.branch}</p>
                  <p><span className="text-zinc-500">Commit:</span> {repoInfo.commit}</p>
                  <p><span className="text-zinc-500">Last Synced:</span> {repoInfo.last_synced}</p>
                </div>
              ) : (
                <p className="text-zinc-500 italic text-xs">Repo not synced yet.</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-8">
            {subTab === 'console' && (
              <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-6 rounded-xl space-y-4 min-h-[450px] flex flex-col">
                <div className="flex flex-wrap items-center gap-3">
                  <input type="text" value={targetConsoleIp} onChange={(e) => setTargetConsoleIp(e.target.value)} className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2 rounded-lg outline-none max-w-[150px]" placeholder="Target IP" />
                  <select value={consolePort} onChange={(e) => setConsolePort(e.target.value)} className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2 rounded-lg outline-none cursor-pointer">
                    {consolePortsList.map(p => <option key={p} value={p.split(' ')[0]}>{p}</option>)}
                  </select>
                  {!consoleConnected ? (
                    <button onClick={handleConsoleConnect} className="px-4 py-2 bg-indigo-650 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold">Connect</button>
                  ) : (
                    <button onClick={handleConsoleDisconnect} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold">Disconnect</button>
                  )}
                </div>
                {consoleConnected && (
                  <div className="flex-1 flex flex-col border border-zinc-800 rounded-lg overflow-hidden mt-4">
                    <div className="flex-1 bg-black p-4 font-mono text-xs overflow-y-auto min-h-[250px] space-y-1">
                      <div className="text-indigo-400 font-bold">{consoleBanner}</div>
                      {consoleOutput.map((l, i) => <div key={i} className="text-zinc-300">{l}</div>)}
                    </div>
                    <form onSubmit={handleConsoleSend} className="flex border-t border-zinc-800">
                      <input type="text" list="console-commands" value={consoleInput} onChange={(e) => setConsoleInput(e.target.value)} className="flex-1 bg-zinc-950 text-xs text-zinc-200 p-3 outline-none" placeholder="Enter console command (e.g. read temp)..." />
                      <datalist id="console-commands">
                        {consoleCommands.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </datalist>
                      <button type="submit" className="px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">Send</button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {subTab === 'logs' && (
              <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 p-6 rounded-xl space-y-4 min-h-[450px] flex flex-col">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">Live Flasher Operations Logs</h3>
                  <button onClick={async () => { await fetch('/api/vsm2-flasher/logs/clear', { method: 'POST' }); setLiveLogs([]); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-800 text-zinc-400 rounded-lg text-xs font-bold">
                    <Trash2 size={13} /> Clear Logs
                  </button>
                </div>
                <div className="flex-1 bg-black border border-zinc-800 p-4 rounded-lg font-mono text-xs overflow-y-auto min-h-[300px] whitespace-pre-wrap text-zinc-300">
                  {liveLogs.map((log, i) => <div key={i}>{log}</div>)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Add VSM2 Flasher to React navigation and imports**
  Modify `/home/masse/projects/overwatch/frontend/src/App.tsx`:
  - Import `Vsm2FlasherTab`.
  - Add case `vsm2flasher` to switch statement.
  - Insert `Vsm2FlasherTab` rendering.
  ```tsx
  // Imports
  import Vsm2FlasherTab from './components/Vsm2FlasherTab';

  // Inside Switch
  case 'vsm2flasher':
    return <Vsm2FlasherTab />;
  ```

  Modify `/home/masse/projects/overwatch/frontend/src/components/Header.tsx`:
  - Insert `vsm2flasher` tab in `navItems` array between `settings` and `edgebro`:
  ```tsx
  { id: 'settings', label: t('tabSettings'), icon: <Settings size={14} /> },
  { id: 'vsm2flasher', label: t('tabVsm2Flasher'), icon: <Terminal size={14} /> },
  { 
    id: 'edgebro', 
    label: t('tabEdgeBro'), 
    icon: (
      // ...
    )
  }
  ```

- [ ] **Step 3: Verify the whole system build**
  Run: `npm run build` inside `frontend/` directory to ensure Typescript compiled successfully without errors.

- [ ] **Step 4: Commit**
  ```bash
  git add frontend/src/components/Vsm2FlasherTab.tsx frontend/src/App.tsx frontend/src/components/Header.tsx
  git commit -m "feat: complete VSM2 Flasher React interface integration"
  ```
