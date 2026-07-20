import time
import socket
import re
import threading
import queue
import httpx
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

def parse_ip_ranges(input_str):
    ips = set()
    parts = [p.strip() for p in re.split(r'[,\s\n]+', input_str) if p.strip()]
    for part in parts:
        match = re.match(r'^(\d+\.\d+\.\d+\.)(\d+)-(\d+)$', part)
        if match:
            prefix = match.group(1)
            start = int(match.group(2))
            end = int(match.group(3))
            if start <= end:
                for i in range(start, end + 1):
                    ips.add(f"{prefix}{i}")
            continue
        if re.match(r'^\d+\.\d+\.\d+\.\d+$', part):
            ips.add(part)
    valid_ips = []
    for ip in ips:
        try:
            socket.inet_aton(ip)
            valid_ips.append(ip)
        except OSError:
            pass
    return sorted(valid_ips, key=lambda ip: socket.inet_aton(ip))

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
        httpx.post(url, json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"}, timeout=5)
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
            tz = ZoneInfo(self.timezone) if self.timezone else None
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
