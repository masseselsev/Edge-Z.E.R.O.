# Installation Progress & Real-Time Logs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time installation progress tracker so admins can see a live console log stream when a box is being provisioned, triggered by clicking the "Installing" status badge in Fleet.

**Architecture:** A new `ProvisioningLog` model stores timestamped log lines keyed to a Box. The Debian `preseed.j2` and Ubuntu `user-data.j2` templates are updated to `curl`-report milestone phases to a new `POST /api/provision/{mac}/report` endpoint. The frontend Fleet table shows an animated progress badge for `INSTALLING` boxes, and a click opens a `ConsoleDrawer` component that polls `GET /api/boxes/{box_id}/provisioning-logs` every 2 s.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), Alembic (migrations), React + TypeScript + TailwindCSS (frontend), Jinja2 templates (preseed/user-data).

## Global Constraints

- NO file may exceed 500–600 lines (project rule — split if needed).
- Python async only (`async def`, `AsyncSession`). No sync SQLAlchemy.
- All new DB models must live in `backend/app/models/`. All new endpoints in `backend/app/api/endpoints/`.
- New Alembic migration required for every schema change.
- Frontend components live in `frontend/src/components/`.
- Authentication token attached to all authenticated fetch calls via `localStorage.getItem('token')` header.
- Box API prefix is `/api/boxes`, provision prefix is `/api/provision`.

---

## Task 1: ProvisioningLog DB Model & Alembic Migration

**Files:**
- Create: `backend/app/models/provisioning_log.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/<hash>_add_provisioning_logs_and_progress.py`
- Modify: `backend/app/models/box.py`

**Interfaces:**
- Produces: `ProvisioningLog` model with fields `id (UUID PK)`, `box_id (UUID FK→boxes.id CASCADE)`, `message (Text)`, `created_at (DateTime)`
- Produces: `Box.installation_progress` integer column (0–100)

---

- [ ] **Step 1: Create `provisioning_log.py`**

```python
# backend/app/models/provisioning_log.py
import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.db.base_class import Base

class ProvisioningLog(Base):
    __tablename__ = "provisioning_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    box_id = Column(
        UUID(as_uuid=True),
        ForeignKey("boxes.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
```

- [ ] **Step 2: Register model in `__init__.py`**

Open `backend/app/models/__init__.py`. Add:
```python
from app.models.provisioning_log import ProvisioningLog  # noqa: F401
```
This ensures Alembic autogenerate detects the table.

- [ ] **Step 3: Add `installation_progress` to `Box`**

In `backend/app/models/box.py`, after the `notes` column line, add:
```python
    installation_progress = Column(Integer, default=0, nullable=False)
```

- [ ] **Step 4: Generate the Alembic migration**

```bash
docker compose exec overwatch-core alembic revision --autogenerate \
  -m "add_provisioning_logs_and_installation_progress"
```

Expected: new file created in `backend/alembic/versions/`.
Verify the file contains `op.create_table("provisioning_logs", ...)` and `op.add_column("boxes", sa.Column("installation_progress", ...))`.

- [ ] **Step 5: Apply migration**

```bash
docker compose exec overwatch-core alembic upgrade head
```

Expected output ends with: `Running upgrade ... -> ..., add_provisioning_logs_and_installation_progress`

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/provisioning_log.py \
        backend/app/models/__init__.py \
        backend/app/models/box.py \
        backend/alembic/versions/
git commit -m "feat: add ProvisioningLog model and installation_progress column"
```

---

## Task 2: Backend Report & Logs Endpoints

**Files:**
- Modify: `backend/app/api/endpoints/provision.py` (add `POST /{mac}/report`)
- Create: `backend/app/api/endpoints/boxes.py` (add `GET /{box_id}/provisioning-logs`) — or modify if it already exists
- Verify routing in: `backend/app/main.py`

**Interfaces:**
- Consumes: `ProvisioningLog` model from Task 1, `Box.installation_progress` from Task 1
- Produces:
  - `POST /api/provision/{mac}/report` — accepts `{"message": str, "progress": int | None}`, returns `{"status": "ok"}`
  - `GET /api/boxes/{box_id}/provisioning-logs` — returns `[{"id": str, "message": str, "created_at": str}, ...]` sorted ASC

---

- [ ] **Step 1: Add `POST /{mac}/report` to `provision.py`**

At the end of `backend/app/api/endpoints/provision.py`, append (after the existing imports at the top are already there — add any missing ones):

```python
from pydantic import BaseModel
from typing import Optional
from app.models.provisioning_log import ProvisioningLog

class ReportPayload(BaseModel):
    message: str
    progress: Optional[int] = None

@router.post("/{mac}/report")
async def provision_report(
    mac: str,
    payload: ReportPayload,
    db: AsyncSession = Depends(get_db)
):
    """Receives installation progress reports from the box installer."""
    result = await db.execute(select(Box).where(Box.mac_address == cast(mac, MACADDR)))
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")

    # Append log line
    log_entry = ProvisioningLog(box_id=box.id, message=payload.message)
    db.add(log_entry)

    # Update progress if supplied
    if payload.progress is not None:
        box.installation_progress = max(0, min(100, payload.progress))

    await db.commit()
    return {"status": "ok"}
```

- [ ] **Step 2: Add `GET /{box_id}/provisioning-logs` to boxes endpoint**

Check if `backend/app/api/endpoints/boxes.py` exists. If not, check `system.py` or `inventory.py` for where box CRUD lives. Find the router that handles `/api/boxes/`. Add at the end of that file:

```python
from app.models.provisioning_log import ProvisioningLog
from sqlalchemy import asc

@router.get("/{box_id}/provisioning-logs")
async def get_provisioning_logs(
    box_id: str,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(deps.get_current_user)
):
    """Returns all provisioning log entries for a box, ordered by time."""
    try:
        box_uuid = uuid.UUID(box_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid box ID")

    result = await db.execute(
        select(ProvisioningLog)
        .where(ProvisioningLog.box_id == box_uuid)
        .order_by(asc(ProvisioningLog.created_at))
    )
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "message": log.message,
            "created_at": log.created_at.isoformat()
        }
        for log in logs
    ]
```

- [ ] **Step 3: Verify routes are registered**

Run:
```bash
docker compose exec overwatch-core python -c "
from app.main import app
routes = [r.path for r in app.routes]
assert any('/report' in r for r in routes), 'report route missing'
assert any('provisioning-logs' in r for r in routes), 'logs route missing'
print('Routes OK:', [r for r in routes if 'report' in r or 'provisioning' in r])
"
```

Expected: prints two matching routes.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/endpoints/provision.py backend/app/api/endpoints/
git commit -m "feat: add provision report endpoint and provisioning-logs GET endpoint"
```

---

## Task 3: Update Installer Templates with Progress Reports

**Files:**
- Modify: `backend/app/templates/preseed.j2`
- Modify: `backend/app/templates/user-data.j2`

**Interfaces:**
- Consumes: `POST /api/provision/{mac}/report` from Task 2
- Template variables already available: `api_host`, `api_port`, `mac_address`

**Debian Preseed milestone phases and progress values:**

| Phase | progress |
|---|---|
| Starting late_command | 60 |
| SSH key injected | 65 |
| VPN credentials injected | 70 |
| init.sh downloaded | 80 |
| init.sh executing | 85 |
| init.sh complete | 95 |
| Callback sent | 100 |

**Ubuntu Subiquity uses the native `reporting:` block** — it sends detailed JSON payloads automatically, but we add late-command curl hooks for our custom milestones too.

---

- [ ] **Step 1: Rewrite `preseed.j2` to inject curl progress hooks**

Replace entire file content of `backend/app/templates/preseed.j2`:

```jinja2
# Localization
d-i debian-installer/locale string {{ locale | default('en_US.UTF-8') }}
d-i keyboard-configuration/xkb-keymap select {{ keyboard | default('us') }}

# Network configuration
d-i netcfg/choose_interface select auto
d-i netcfg/disable_dhcp boolean true
d-i netcfg/get_ipaddress string {{ ip_address }}
d-i netcfg/get_netmask string {{ netmask | default('255.255.255.0') }}
d-i netcfg/get_gateway string {{ gateway }}
d-i netcfg/get_nameservers string {{ dns }}
d-i netcfg/confirm_static boolean true

# Mirror settings
d-i mirror/country string manual
d-i mirror/http/hostname string {{ mirror_host | default('deb.debian.org') }}
d-i mirror/http/directory string /debian

# Account setup
d-i passwd/root-login boolean true
d-i passwd/root-password-crypted password {{ root_password_hash | default('$6$rounds=4096$salt$placeholder') }}
d-i passwd/make-user boolean false

# Clock and time zone
d-i clock-setup/utc boolean true
d-i time/zone string {{ timezone | default('UTC') }}

# NTP
d-i clock-setup/ntp boolean true
d-i clock-setup/ntp-server string {{ ntp_server | default('pool.ntp.org') }}

# Partitioning
d-i partman-auto/method string regular
d-i partman-auto/choose_recipe select atomic
d-i partman/confirm_write_new_label boolean true
d-i partman/choose_partition select finish
d-i partman/confirm boolean true
d-i partman/confirm_nooverwrite boolean true

# Package selection
tasksel tasksel/first multiselect standard, ssh-server

# Additional packages
d-i pkgsel/include string curl wget

# Boot loader
d-i grub-installer/only_debian boolean true
d-i grub-installer/bootdev string default

# Late Command — milestone reports sent to orchestrator at each phase
d-i preseed/late_command string \
    in-target /bin/sh -c "curl -s -X POST http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report -H 'Content-Type: application/json' -d '{\"message\":\"[Debian] late_command started — OS base installed\",\"progress\":60}'"; \
    in-target mkdir -p /root/.ssh; \
    in-target /bin/sh -c "echo '{{ ssh_public_key }}' >> /root/.ssh/authorized_keys"; \
    in-target chmod 600 /root/.ssh/authorized_keys; \
    in-target /bin/sh -c "curl -s -X POST http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report -H 'Content-Type: application/json' -d '{\"message\":\"[Debian] SSH key injected\",\"progress\":65}'"; \
    in-target mkdir -p /etc/openvpn; \
    in-target /bin/sh -c "printf '%b' '{{ ca_cert }}' > /etc/openvpn/ca.crt"; \
    in-target /bin/sh -c "printf '%b' '{{ client_cert }}' > /etc/openvpn/client.crt"; \
    in-target /bin/sh -c "printf '%b' '{{ client_key }}' > /etc/openvpn/client.key"; \
    in-target chmod 600 /etc/openvpn/client.key; \
    in-target /bin/sh -c "curl -s -X POST http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report -H 'Content-Type: application/json' -d '{\"message\":\"[Debian] VPN credentials written\",\"progress\":70}'"; \
    in-target /bin/sh -c "curl -s -X POST http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report -H 'Content-Type: application/json' -d '{\"message\":\"[Debian] Downloading init.sh...\",\"progress\":80}'"; \
    in-target /bin/sh -c "wget -O /tmp/init.sh http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/init.sh && chmod +x /tmp/init.sh"; \
    in-target /bin/sh -c "curl -s -X POST http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report -H 'Content-Type: application/json' -d '{\"message\":\"[Debian] Running init.sh...\",\"progress\":85}'"; \
    in-target /bin/sh -c "/tmp/init.sh >> /tmp/init.log 2>&1"; \
    in-target /bin/sh -c "curl -s -X POST http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report -H 'Content-Type: application/json' -d '{\"message\":\"[Debian] init.sh complete. Sending final callback.\",\"progress\":95}'"; \
    in-target /bin/sh -c "wget -qO- http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/callback";
```

- [ ] **Step 2: Rewrite `user-data.j2` to add Subiquity reporting and late-command hooks**

Replace entire file content of `backend/app/templates/user-data.j2`:

```jinja2
#cloud-config
autoinstall:
  version: 1
  locale: {{ locale | default('en_US.UTF-8') }}
  keyboard:
    layout: {{ keyboard | default('us') }}
  timezone: {{ timezone | default('UTC') }}
  ntp:
    servers:
      - {{ ntp_server | default('pool.ntp.org') }}
  network:
    network:
      version: 2
      ethernets:
        interface0:
          match:
            macaddress: {{ mac_address }}
          addresses:
            - {{ ip_address }}/{{ prefix_length | default(24) }}
          routes:
            - to: default
              via: {{ gateway }}
          nameservers:
            addresses:
              - {{ dns }}
          set-name: eth0
  ssh:
    install-server: true
    authorized-keys:
      - {{ ssh_public_key }}
    allow-pw: true
  storage:
    layout:
      name: direct
  packages:
    - curl
    - wget
  user-data:
    disable_root: false
  reporting:
    orchestrator:
      type: http
      endpoint: http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report
  late-commands:
    - curtin in-target -- mkdir -p /root/.ssh
    - curtin in-target -- sh -c "echo '{{ ssh_public_key }}' >> /root/.ssh/authorized_keys"
    - curtin in-target -- sh -c "curl -s -X POST http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report -H 'Content-Type: application/json' -d '{\"message\":\"[Ubuntu] SSH key injected\",\"progress\":65}'"
    - curtin in-target -- mkdir -p /etc/openvpn
    - curtin in-target -- sh -c "printf '%b' '{{ ca_cert }}' > /etc/openvpn/ca.crt"
    - curtin in-target -- sh -c "printf '%b' '{{ client_cert }}' > /etc/openvpn/client.crt"
    - curtin in-target -- sh -c "printf '%b' '{{ client_key }}' > /etc/openvpn/client.key"
    - curtin in-target -- sh -c "curl -s -X POST http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report -H 'Content-Type: application/json' -d '{\"message\":\"[Ubuntu] VPN credentials written\",\"progress\":70}'"
    - curtin in-target -- sh -c "wget -O /tmp/init.sh http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/init.sh && chmod +x /tmp/init.sh"
    - curtin in-target -- sh -c "curl -s -X POST http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report -H 'Content-Type: application/json' -d '{\"message\":\"[Ubuntu] Running init.sh...\",\"progress\":85}'"
    - curtin in-target -- sh -c "/tmp/init.sh >> /tmp/init.log 2>&1"
    - curtin in-target -- sh -c "curl -s -X POST http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/report -H 'Content-Type: application/json' -d '{\"message\":\"[Ubuntu] init.sh complete. Sending final callback.\",\"progress\":95}'"
    - curtin in-target -- wget -qO- http://{{ api_host }}:{{ api_port }}/api/provision/{{ mac_address }}/callback
```

> **Note on `reporting:` block:** Ubuntu Subiquity's HTTP reporter sends JSON with `{"event_type": "start"|"finish"|"progress", "name": "...", "description": "..."}`. Our `/api/provision/{mac}/report` endpoint already accepts `{"message": str, "progress": int}`. We need to make the endpoint tolerant of Subiquity's format too (next task handles this).

- [ ] **Step 3: Commit**

```bash
git add backend/app/templates/preseed.j2 backend/app/templates/user-data.j2
git commit -m "feat: inject curl progress milestones into preseed and user-data templates"
```

---

## Task 4: Make Report Endpoint Accept Subiquity JSON Format

Ubuntu Subiquity sends JSON like:
```json
{"event_type": "finish", "name": "install/partitioning", "description": "...", "result": "SUCCESS"}
```

Our endpoint must accept both our own `{"message", "progress"}` format AND Subiquity's format.

**Files:**
- Modify: `backend/app/api/endpoints/provision.py` — update `ReportPayload` and handler

---

- [ ] **Step 1: Replace `ReportPayload` and handler with a flexible version**

In `provision.py`, replace the `ReportPayload` class and `provision_report` function with:

```python
from pydantic import BaseModel
from typing import Optional, Any
from app.models.provisioning_log import ProvisioningLog

# Subiquity progress-to-percent map (approximate phase ordering)
SUBIQUITY_PROGRESS_MAP = {
    "start": None,  # no progress update on start events
    "finish": None,
}
SUBIQUITY_PHASE_PROGRESS = {
    "install": 10,
    "install/partitioning": 20,
    "install/partitioning/gpt": 22,
    "install/filesystem_setup": 30,
    "install/mount": 35,
    "install/extract": 50,
    "install/curthooks": 60,
    "install/postinstall": 75,
    "install/finish": 90,
    "apply_autoinstall_config": 5,
    "finish": 95,
}

class ReportPayload(BaseModel):
    # Our own fields
    message: Optional[str] = None
    progress: Optional[int] = None
    # Subiquity fields
    event_type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    result: Optional[str] = None
    # Accept any extra fields Subiquity sends
    model_config = {"extra": "allow"}

@router.post("/{mac}/report")
async def provision_report(
    mac: str,
    payload: ReportPayload,
    db: AsyncSession = Depends(get_db)
):
    """Receives installation progress reports from the box installer (our format or Subiquity format)."""
    result = await db.execute(select(Box).where(Box.mac_address == cast(mac, MACADDR)))
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")

    # Resolve message and progress from either format
    if payload.message:
        # Our own curl format
        message = payload.message
        progress = payload.progress
    elif payload.event_type:
        # Subiquity format
        phase = payload.name or ""
        event = payload.event_type or ""
        desc = payload.description or ""
        result_str = payload.result or ""
        message = f"[Subiquity] {event.upper()} {phase}" + (f": {desc}" if desc else "") + (f" [{result_str}]" if result_str else "")
        # Map phase to progress (only on finish events)
        progress = None
        if event == "finish":
            progress = SUBIQUITY_PHASE_PROGRESS.get(phase)
    else:
        message = str(payload.model_dump(exclude_none=True))
        progress = None

    # Save log entry
    log_entry = ProvisioningLog(box_id=box.id, message=message)
    db.add(log_entry)

    # Update progress
    if progress is not None:
        box.installation_progress = max(0, min(100, progress))

    await db.commit()
    return {"status": "ok"}
```

- [ ] **Step 2: Restart backend and verify no import errors**

```bash
docker compose restart overwatch-core
docker compose logs overwatch-core --tail=10
```

Expected: `Application startup complete.` — no tracebacks.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/endpoints/provision.py
git commit -m "feat: make provision report endpoint accept both our format and Ubuntu Subiquity JSON"
```

---

## Task 5: Box API — Expose `installation_progress` in Response

The `GET /api/boxes/` response must include `installation_progress` so the frontend can show the percentage.

**Files:**
- Find and modify box list/detail response schema (search for `BoxResponse` or `box` schema)

---

- [ ] **Step 1: Locate the boxes response schema**

```bash
grep -rn "BoxResponse\|class Box" backend/app/api/ backend/app/schemas/ --include="*.py"
```

Find the Pydantic response model used by `GET /api/boxes/`. Add `installation_progress: int = 0` to it.

Example (exact class name may differ):
```python
class BoxResponse(BaseModel):
    id: str
    internal_sn: str
    mac_address: str
    ip_address: Optional[str]
    status: str
    location: Optional[LocationResponse]
    installation_progress: int = 0  # ADD THIS

    class Config:
        from_attributes = True
```

- [ ] **Step 2: Verify by running the API and checking the response**

```bash
# After restarting backend, check a box response includes installation_progress
docker compose exec overwatch-core python -c "
import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import select, text

async def check():
    async with AsyncSessionLocal() as db:
        result = await db.execute(text('SELECT installation_progress FROM boxes LIMIT 1'))
        rows = result.fetchall()
        print('DB check OK, rows:', rows)

asyncio.run(check())
"
```

Expected: prints rows without error.

- [ ] **Step 3: Commit**

```bash
git add backend/app/
git commit -m "feat: include installation_progress in box API response"
```

---

## Task 6: Frontend — ConsoleDrawer Component

**Files:**
- Create: `frontend/src/components/ConsoleDrawer.tsx`

**Interface:**
- Props: `boxId: string`, `boxSn: string`, `onClose: () => void`
- Polls `GET /api/boxes/{boxId}/provisioning-logs` every 2 s while mounted
- Auto-scrolls to bottom on new log lines
- Dark terminal aesthetic (black bg, `font-mono`, green text for normal, red for errors, amber for warnings)

---

- [ ] **Step 1: Create `ConsoleDrawer.tsx`**

```tsx
// frontend/src/components/ConsoleDrawer.tsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Terminal, Loader2 } from 'lucide-react';

interface LogEntry {
  id: string;
  message: string;
  created_at: string;
}

interface ConsoleDrawerProps {
  boxId: string;
  boxSn: string;
  onClose: () => void;
}

export default function ConsoleDrawer({ boxId, boxSn, onClose }: ConsoleDrawerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/boxes/${boxId}/provisioning-logs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch provisioning logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [boxId]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLineClass = (message: string): string => {
    const lower = message.toLowerCase();
    if (lower.includes('error') || lower.includes('fail') || lower.includes('failed')) {
      return 'text-rose-400';
    }
    if (lower.includes('warn')) {
      return 'text-amber-400';
    }
    if (lower.includes('complete') || lower.includes('success') || lower.includes('callback')) {
      return 'text-emerald-400';
    }
    return 'text-green-300';
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour12: false });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-3xl h-[70vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Terminal size={14} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-zinc-100 leading-none">Installation Console</h3>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{boxSn}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin text-indigo-400" />}
            <span className="text-[10px] text-zinc-500 font-mono">{logs.length} lines</span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Log Body */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed bg-zinc-950 space-y-0.5">
          {logs.length === 0 && !loading && (
            <p className="text-zinc-600 italic">Waiting for installer reports...</p>
          )}
          {logs.map((log) => (
            <div key={log.id} className="flex gap-3 group">
              <span className="text-zinc-600 shrink-0 group-hover:text-zinc-500 transition-colors">
                {formatTime(log.created_at)}
              </span>
              <span className={`${getLineClass(log.message)} break-all`}>
                {log.message}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Footer status bar */}
        <div className="px-5 py-2 border-t border-zinc-800 bg-zinc-900/60 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="text-[10px] text-zinc-500 font-mono">Live — polling every 2s</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ConsoleDrawer.tsx
git commit -m "feat: add ConsoleDrawer component with auto-scroll log viewer"
```

---

## Task 7: Frontend — Wire Progress Badge & ConsoleDrawer into InventoryTab

**Files:**
- Modify: `frontend/src/components/InventoryTab.tsx`

**Changes:**
1. Extend `Box` interface to include `installation_progress: number`.
2. Replace the static `INSTALLING` badge with a clickable animated progress badge.
3. Add `ConsoleDrawer` state and rendering at the bottom of the component.

---

- [ ] **Step 1: Extend `Box` interface and import `ConsoleDrawer`**

At the top of `InventoryTab.tsx`, update the import and `Box` interface:

```tsx
import ConsoleDrawer from './ConsoleDrawer';

// In the Box interface, add:
interface Box {
  id: string;
  internal_sn: string;
  mac_address: string;
  ip_address: string | null;
  status: 'NEW' | 'STAGING' | 'INSTALLING' | 'ACTIVE' | 'MAINTENANCE';
  location: Location | null;
  installation_progress: number;  // ADD
}
```

- [ ] **Step 2: Add console drawer state**

Inside `InventoryTab()` function, after the existing state declarations, add:

```tsx
const [consoleBox, setConsoleBox] = useState<{ id: string; sn: string } | null>(null);
```

- [ ] **Step 3: Replace `getStatusBadge` to make INSTALLING clickable with progress**

Replace the existing `getStatusBadge` function with:

```tsx
const getStatusBadge = (box: Box) => {
  if (box.status === 'INSTALLING') {
    return (
      <button
        onClick={() => setConsoleBox({ id: box.id, sn: box.internal_sn })}
        className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer"
        title="Click to open installation console"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
        Installing {box.installation_progress > 0 ? `(${box.installation_progress}%)` : '...'}
      </button>
    );
  }
  const badges: Record<string, string> = {
    NEW: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    STAGING: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    MAINTENANCE: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badges[box.status] || badges.NEW}`}>
      {box.status}
    </span>
  );
};
```

- [ ] **Step 4: Update the table row to pass the full box to `getStatusBadge`**

In the `filteredBoxes.map()` section, change the status cell:

```tsx
// Find this line:
<td className="px-6 py-4">{getStatusBadge(box.status)}</td>
// Change to:
<td className="px-6 py-4">{getStatusBadge(box)}</td>
```

- [ ] **Step 5: Add `ConsoleDrawer` rendering at the bottom of the return**

Before the closing `</div>` of the main return, add:

```tsx
{consoleBox && (
  <ConsoleDrawer
    boxId={consoleBox.id}
    boxSn={consoleBox.sn}
    onClose={() => setConsoleBox(null)}
  />
)}
```

- [ ] **Step 6: Add interval refresh for installing boxes**

The table currently only fetches once. When any box is `INSTALLING`, we should poll every 5 s. Replace the `useEffect` that calls `fetchData()`:

```tsx
useEffect(() => {
  fetchData();
  // Poll every 5 s while any box is installing
  const interval = setInterval(() => {
    if (boxes.some(b => b.status === 'INSTALLING')) {
      fetchData();
    }
  }, 5000);
  return () => clearInterval(interval);
}, [boxes]);
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
docker compose exec overwatch-web npm run build
```

Expected: `✓ built in ...ms` with no TS errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/InventoryTab.tsx
git commit -m "feat: add interactive INSTALLING progress badge and ConsoleDrawer to Fleet"
```

---

## Task 8: Cleanup — Ensure Callback Resets Progress Correctly

When the callback is received, the box transitions to `ACTIVE` with `installation_progress = 100`. Currently `provision_callback` sets status but not progress.

**Files:**
- Modify: `backend/app/api/endpoints/provision.py`

---

- [ ] **Step 1: Update the callback handler to also set progress to 100**

Find the `provision_callback` function in `provision.py` and replace it:

```python
@router.get("/{mac}/callback")
async def provision_callback(mac: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Box).where(Box.mac_address == cast(mac, MACADDR)))
    box = result.scalars().first()

    if box:
        box.status = BoxStatus.ACTIVE
        box.installation_progress = 100
        await db.commit()
        await send_telegram_message(
            db,
            f"✅ <b>Box Provisioned Successfully</b>\n\nMAC: {mac}\nSN: {box.internal_sn}\nIP: {box.ip_address}"
        )

    return {"status": "success"}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/api/endpoints/provision.py
git commit -m "fix: set installation_progress=100 when provision callback received"
```

---

## Task 9: End-to-End Smoke Test

This is a manual verification step — no actual hardware needed. We simulate what the installer would do.

---

- [ ] **Step 1: Create a test box via the Fleet UI or API, set it to INSTALLING status**

```bash
# Find any existing box ID
docker compose exec overwatch-core python -c "
import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import select, text

async def run():
    async with AsyncSessionLocal() as db:
        r = await db.execute(text('SELECT id, internal_sn, mac_address FROM boxes LIMIT 1'))
        rows = r.fetchall()
        print(rows)

asyncio.run(run())
"
```

Note the `mac_address` and `id`.

- [ ] **Step 2: Manually set that box to INSTALLING status via DB**

```bash
docker compose exec overwatch-core python -c "
import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import text

async def run():
    async with AsyncSessionLocal() as db:
        await db.execute(text(\"UPDATE boxes SET status='INSTALLING', installation_progress=0 WHERE mac_address='<YOUR_MAC_HERE>'\"))
        await db.commit()
        print('Done')

asyncio.run(run())
"
```

- [ ] **Step 3: Simulate installer reports via curl**

```bash
MAC="<YOUR_MAC_HERE_dash_separated>"  # e.g. 00-11-22-33-44-55
BASE="http://localhost:7000"

curl -s -X POST "$BASE/api/provision/$MAC/report" \
  -H "Content-Type: application/json" \
  -d '{"message": "[Debian] late_command started", "progress": 60}'

curl -s -X POST "$BASE/api/provision/$MAC/report" \
  -H "Content-Type: application/json" \
  -d '{"message": "[Debian] SSH key injected", "progress": 65}'

curl -s -X POST "$BASE/api/provision/$MAC/report" \
  -H "Content-Type: application/json" \
  -d '{"message": "[Debian] Running init.sh...", "progress": 85}'
```

- [ ] **Step 4: Open the Fleet UI and verify**

- The box status badge shows "Installing (85%)"
- Clicking the badge opens the ConsoleDrawer
- The ConsoleDrawer shows all 3 log lines with timestamps
- New lines appear without page refresh

- [ ] **Step 5: Send the callback to complete provisioning**

```bash
curl -s "$BASE/api/provision/$MAC/callback"
```

- Verify the box status changes to `ACTIVE` and progress shows `100%`.

- [ ] **Step 6: Final commit and push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Real-time log streaming from installer → `POST /api/provision/{mac}/report`
- ✅ Debian preseed milestone curls injected
- ✅ Ubuntu Subiquity `reporting:` block + late-command curls
- ✅ `ProvisioningLog` model persists logs
- ✅ `installation_progress` field on Box
- ✅ `GET /api/boxes/{box_id}/provisioning-logs` endpoint
- ✅ Frontend `ConsoleDrawer` with auto-scroll and 2s polling
- ✅ Clickable animated `Installing (X%)` badge in Fleet table
- ✅ Auto-refresh of Fleet table while any box is installing
- ✅ Callback handler sets progress=100 and status=ACTIVE

**Subiquity note:** Ubuntu's `reporting.endpoint` receives a POST but **without** `message`/`progress` keys — it uses `event_type`, `name`, `description`. Task 4 handles this dual-format acceptance.

**Type consistency:** `getStatusBadge(box)` receives a full `Box` object in Task 7, consistent with the extended interface definition in the same task.
