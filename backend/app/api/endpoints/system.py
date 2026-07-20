import os
import time
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from typing import List, Optional
from pydantic import BaseModel

from app.db.session import get_db, log_user_action
from app.models.system_settings import SystemSettings
from app.models.system_log import SystemLog
from app.models.audit_log import AuditLog
from app.schemas.log import SystemLogSchema, AuditLogSchema
from app.models.user import User
from app.api import deps
from app.core import security

router = APIRouter()

class SettingItem(BaseModel):
    key: str
    value: str

class BandwidthResponse(BaseModel):
    cpu_utilization: float
    ram_utilization: float
    rx_speed: float
    tx_speed: float
    rx_percent: float
    tx_percent: float

_fallback_traffic_cache = {}
BANDWIDTH_CACHE_KEY = "orch_net_traffic"
BANDWIDTH_MIN_INTERVAL = 0.5

def get_cpu_times() -> tuple[float, float]:
    base_dir = "/proc"
    for p in ["/host/proc", "/proc"]:
        if os.path.exists(f"{p}/stat"):
            base_dir = p
            break
    try:
        with open(f"{base_dir}/stat", "r") as f:
            for line in f:
                if line.startswith("cpu "):
                    parts = line.split()
                    times = [float(x) for x in parts[1:9]]
                    total = sum(times)
                    idle = float(parts[4]) + float(parts[5])
                    return total, idle
    except Exception:
        pass
    return 0.0, 0.0

def get_ram_usage() -> float:
    base_dir = "/proc"
    for p in ["/host/proc", "/proc"]:
        if os.path.exists(f"{p}/meminfo"):
            base_dir = p
            break
    try:
        mem_total = 0.0
        mem_avail = 0.0
        with open(f"{base_dir}/meminfo", "r") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    mem_total = float(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    mem_avail = float(line.split()[1])
        if mem_total > 0:
            return 100.0 * (mem_total - mem_avail) / mem_total
    except Exception:
        pass
    return 0.0

def get_network_bytes() -> tuple[float, int, int]:
    rx_total = 0
    tx_total = 0
    base_dir = "/proc"
    for p in ["/host/proc/1", "/host/proc", "/proc"]:
        if os.path.exists(f"{p}/net/dev"):
            base_dir = p
            break
    dev_path = f"{base_dir}/net/dev"
    physical_prefixes = ("eth", "en", "wl", "ib", "ppp")
    try:
        with open(dev_path, "r") as f:
            lines = f.readlines()
        for line in lines[2:]:
            parts = line.split(":")
            if len(parts) < 2:
                continue
            iface = parts[0].strip()
            if not iface.startswith(physical_prefixes):
                continue
            stats = parts[1].split()
            if len(stats) >= 9:
                rx_total += int(stats[0])
                tx_total += int(stats[8])
    except Exception:
        pass
    return time.monotonic(), rx_total, tx_total

@router.get("/status")
async def get_system_status(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "online", "database": "connected"}
    except Exception as e:
        return {"status": "offline", "database": "disconnected", "detail": str(e)}

async def regenerate_dnsmasq_conf(db: AsyncSession):
    import aiofiles
    from sqlalchemy import select
    from app.models.system_settings import SystemSettings
    
    async def get_system_setting(key: str, default: str) -> str:
        res = await db.execute(select(SystemSettings).where(SystemSettings.key == key))
        obj = res.scalars().first()
        return obj.value if obj and obj.value else default

    mode = await get_system_setting("DHCP_MODE", "full")
    interface = await get_system_setting("DHCP_INTERFACE", "enp88s0")
    range_start = await get_system_setting("DHCP_RANGE_START", "192.168.222.100")
    range_end = await get_system_setting("DHCP_RANGE_END", "192.168.222.200")
    netmask = await get_system_setting("DHCP_NETMASK", "255.255.255.0")
    gateway = await get_system_setting("DEFAULT_GATEWAY", "192.168.222.1")
    dns = await get_system_setting("DEFAULT_DNS", "192.168.222.1")
    api_host = await get_system_setting("API_HOST", "192.168.222.2")
    api_port = await get_system_setting("API_PORT", "7000")

    lines = [
        "# Disable DNS",
        "port=0",
        "",
        "# TFTP Server",
        "enable-tftp",
        "tftp-root=/mnt/infra_config/tftp",
        "tftp-lowercase",
        "",
        "# DHCP Settings",
        f"interface={interface}",
        "bind-dynamic",
    ]

    if mode == "proxy":
        subnet = ".".join(range_start.split(".")[:-1]) + ".0"
        lines.append(f"dhcp-range={subnet},proxy")
    else:
        lines.append(f"dhcp-range={range_start},{range_end},{netmask},12h")
        lines.append(f"dhcp-option=option:router,{gateway}")
        lines.append(f"dhcp-option=option:dns-server,{dns}")

    lines.extend([
        "",
        "# iPXE Chainloading",
        "dhcp-match=set:ipxe,175",
        f"dhcp-boot=tag:ipxe,http://{api_host}:{api_port}/api/provision/boot.ipxe",
        "dhcp-boot=tag:!ipxe,ipxe.efi",
        "",
        "# Logging",
        "log-dhcp",
        "log-queries",
        "log-facility=/mnt/infra_config/dnsmasq.log"
    ])

    conf_path = "/mnt/infra_config/dnsmasq.conf"
    try:
        async with aiofiles.open(conf_path, "w") as f:
            await f.write("\n".join(lines))
    except Exception as e:
        import sys
        print(f"Failed to generate dnsmasq.conf: {e}", file=sys.stderr)

@router.get("/settings", response_model=List[SettingItem])
async def get_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemSettings))
    return result.scalars().all()

@router.post("/settings")
async def update_settings(
    settings_list: List[SettingItem],
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    updates = []
    
    # Check if a new root password is provided
    root_pwd_item = next((item for item in settings_list if item.key == "DEFAULT_ROOT_PASSWORD"), None)
    if root_pwd_item and root_pwd_item.value:
        import crypt
        hashed_val = crypt.crypt(root_pwd_item.value, crypt.mksalt(crypt.METHOD_SHA512))
        
        res_hash = await db.execute(select(SystemSettings).where(SystemSettings.key == "DEFAULT_ROOT_PASSWORD_HASH"))
        setting_hash = res_hash.scalars().first()
        if setting_hash:
            setting_hash.value = hashed_val
        else:
            new_hash = SystemSettings(key="DEFAULT_ROOT_PASSWORD_HASH", value=hashed_val)
            db.add(new_hash)
        updates.append("DEFAULT_ROOT_PASSWORD_HASH=[UPDATED]")

    # Check if a new default user password is provided
    user_pwd_item = next((item for item in settings_list if item.key == "DEFAULT_USER_PASSWORD"), None)
    if user_pwd_item and user_pwd_item.value:
        import crypt
        hashed_val = crypt.crypt(user_pwd_item.value, crypt.mksalt(crypt.METHOD_SHA512))
        
        res_hash = await db.execute(select(SystemSettings).where(SystemSettings.key == "DEFAULT_USER_PASSWORD_HASH"))
        setting_hash = res_hash.scalars().first()
        if setting_hash:
            setting_hash.value = hashed_val
        else:
            new_hash = SystemSettings(key="DEFAULT_USER_PASSWORD_HASH", value=hashed_val)
            db.add(new_hash)
        updates.append("DEFAULT_USER_PASSWORD_HASH=[UPDATED]")
        
    # Filter out plain-text passwords from db writes
    filtered_list = [item for item in settings_list if item.key not in ("DEFAULT_ROOT_PASSWORD", "DEFAULT_USER_PASSWORD")]
    
    for item in filtered_list:
        result = await db.execute(select(SystemSettings).where(SystemSettings.key == item.key))
        setting = result.scalars().first()
        if setting:
            setting.value = item.value
        else:
            new_setting = SystemSettings(key=item.key, value=item.value)
            db.add(new_setting)
        updates.append(f"{item.key}={item.value}")
    
    await db.commit()
    await regenerate_dnsmasq_conf(db)
    await log_user_action(db, current_user.username, "Update Settings", f"Updated preferences: {', '.join(updates)}", request)
    return {"status": "success"}

@router.get("/bandwidth", response_model=BandwidthResponse)
def get_bandwidth() -> BandwidthResponse:
    capacity_mbps = 1000
    limit_bytes = capacity_mbps * 125000
    current_time, current_rx, current_tx = get_network_bytes()
    cpu_total, cpu_idle = get_cpu_times()
    ram_usage = get_ram_usage()

    prev = _fallback_traffic_cache.get(BANDWIDTH_CACHE_KEY)

    if prev is None:
        snapshot = {
            "timestamp": current_time,
            "rx_bytes": current_rx,
            "tx_bytes": current_tx,
            "rx_speed": 0.0,
            "tx_speed": 0.0,
            "cpu_total": cpu_total,
            "cpu_idle": cpu_idle,
            "cpu_usage": 0.0,
        }
        _fallback_traffic_cache[BANDWIDTH_CACHE_KEY] = snapshot
        return BandwidthResponse(
            rx_speed=0.0,
            tx_speed=0.0,
            rx_percent=0.0,
            tx_percent=0.0,
            cpu_utilization=0.0,
            ram_utilization=ram_usage,
        )

    delta_time = current_time - prev["timestamp"]

    if delta_time < BANDWIDTH_MIN_INTERVAL:
        rx_speed = float(prev.get("rx_speed", 0.0))
        tx_speed = float(prev.get("tx_speed", 0.0))
        rx_percent = min(100.0, 100.0 * rx_speed / limit_bytes) if limit_bytes > 0 else 0.0
        tx_percent = min(100.0, 100.0 * tx_speed / limit_bytes) if limit_bytes > 0 else 0.0
        return BandwidthResponse(
            rx_speed=rx_speed,
            tx_speed=tx_speed,
            rx_percent=rx_percent,
            tx_percent=tx_percent,
            cpu_utilization=float(prev.get("cpu_usage", 0.0)),
            ram_utilization=ram_usage,
        )

    rx_speed = max(0.0, (current_rx - prev["rx_bytes"]) / delta_time)
    tx_speed = max(0.0, (current_tx - prev["tx_bytes"]) / delta_time)
    rx_percent = min(100.0, 100.0 * rx_speed / limit_bytes) if limit_bytes > 0 else 0.0
    tx_percent = min(100.0, 100.0 * tx_speed / limit_bytes) if limit_bytes > 0 else 0.0

    delta_cpu_total = cpu_total - prev.get("cpu_total", 0.0)
    delta_cpu_idle = cpu_idle - prev.get("cpu_idle", 0.0)
    if delta_cpu_total > 0:
        cpu_usage = max(0.0, min(100.0, 100.0 * (1.0 - (delta_cpu_idle / delta_cpu_total))))
    else:
        cpu_usage = prev.get("cpu_usage", 0.0)

    snapshot = {
        "timestamp": current_time,
        "rx_bytes": current_rx,
        "tx_bytes": current_tx,
        "rx_speed": rx_speed,
        "tx_speed": tx_speed,
        "cpu_total": cpu_total,
        "cpu_idle": cpu_idle,
        "cpu_usage": cpu_usage,
    }
    _fallback_traffic_cache[BANDWIDTH_CACHE_KEY] = snapshot

    return BandwidthResponse(
        rx_speed=rx_speed,
        tx_speed=tx_speed,
        rx_percent=rx_percent,
        tx_percent=tx_percent,
        cpu_utilization=cpu_usage,
        ram_utilization=ram_usage,
    )

@router.get("/debug-logs", response_model=List[SystemLogSchema])
async def get_debug_logs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemLog).order_by(SystemLog.created_at.desc()).limit(500))
    return result.scalars().all()

@router.get("/audit-logs", response_model=List[AuditLogSchema])
async def get_audit_logs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(1000))
    return result.scalars().all()

# User management schemas
class UserCreateSchema(BaseModel):
    username: str
    password: str
    role: str = "administrator"
    telegram_id: Optional[str] = None

class UserResponseSchema(BaseModel):
    id: uuid.UUID
    username: str
    role: str
    telegram_id: Optional[str] = None
    class Config:
        from_attributes = True

# User management endpoints
@router.get("/users", response_model=List[UserResponseSchema])
async def get_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    result = await db.execute(select(User).order_by(User.username))
    return result.scalars().all()

@router.post("/users", response_model=UserResponseSchema)
async def create_user(
    user_in: UserCreateSchema,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    result = await db.execute(select(User).where(User.username == user_in.username))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Username already exists")
    
    new_user = User(
        username=user_in.username,
        hashed_password=security.get_password_hash(user_in.password),
        role=user_in.role,
        telegram_id=user_in.telegram_id
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    await log_user_action(
        db, 
        current_user.username, 
        "Create User", 
        f"Created administrator user '{new_user.username}' (role={new_user.role}, telegram_id={new_user.telegram_id})", 
        request
    )
    return new_user

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    if current_user.id == user_uuid:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    deleted_username = user.username
    await db.delete(user)
    await db.commit()
    await log_user_action(db, current_user.username, "Delete User", f"Deleted administrator user '{deleted_username}'", request)
    return {"status": "success"}

# User update schema for admin editing other users
class UserAdminUpdateSchema(BaseModel):
    role: Optional[str] = None
    telegram_id: Optional[str] = None
    password: Optional[str] = None

@router.put("/users/{user_id}", response_model=UserResponseSchema)
async def admin_update_user(
    user_id: str,
    payload: UserAdminUpdateSchema,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    details_list = []
    if payload.role is not None:
        user.role = payload.role
        details_list.append(f"role={payload.role}")
    if payload.telegram_id is not None:
        user.telegram_id = payload.telegram_id
        details_list.append(f"telegram_id={payload.telegram_id}")
    if payload.password is not None and payload.password:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
        user.hashed_password = security.get_password_hash(payload.password)
        details_list.append("password updated")
        
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await log_user_action(db, current_user.username, "Update User Account", f"Updated user '{user.username}': {', '.join(details_list)}", request)
    return user

# Profile update schemas
class UserProfileUpdateSchema(BaseModel):
    password: Optional[str] = None
    telegram_id: Optional[str] = None

# Profile update endpoint
@router.put("/users/profile", response_model=UserResponseSchema)
async def update_profile(
    payload: UserProfileUpdateSchema,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    details_list = []
    if payload.telegram_id is not None:
        current_user.telegram_id = payload.telegram_id
        details_list.append(f"telegram_id={payload.telegram_id}")
    if payload.password is not None:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
        current_user.hashed_password = security.get_password_hash(payload.password)
        details_list.append("password updated")
    
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    await log_user_action(db, current_user.username, "Update Profile", f"Updated profile details: {', '.join(details_list)}", request)
    return current_user

import httpx
from pydantic import BaseModel

class EdgeBroSyncRequest(BaseModel):
    box_ids: List[str]

async def get_edge_bro_client(db: AsyncSession):
    """Helper to fetch settings and log in to Edge B.R.O., returning AsyncClient with Auth token."""
    from app.api.endpoints.provision import get_system_setting
    url = await get_system_setting(db, "EDGE_BRO_URL", "http://localhost:8000")
    user = await get_system_setting(db, "EDGE_BRO_USER", "admin")
    password = await get_system_setting(db, "EDGE_BRO_PASSWORD", "admin")

    client = httpx.AsyncClient(base_url=url, timeout=10.0)
    try:
        resp = await client.post("/api/auth/login", json={"username": user, "password": password})
        if resp.status_code == 200:
            token = resp.json().get("access_token")
            client.headers.update({"Authorization": f"Bearer {token}"})
            return client, url, None
        else:
            return None, url, f"Login failed: {resp.status_code} {resp.text}"
    except Exception as e:
        return None, url, str(e)

@router.get("/edge-bro/status")
async def get_edge_bro_status(db: AsyncSession = Depends(get_db)):
    """Checks connection status and queries matched nodes from Edge B.R.O."""
    from app.models.box import Box, BoxStatus
    from sqlalchemy import or_
    
    client, url, err = await get_edge_bro_client(db)
    if err:
        return {"status": "error", "message": err, "url": url, "nodes": []}

    try:
        resp = await client.get("/api/nodes?limit=1000")
        if resp.status_code != 200:
            await client.aclose()
            return {"status": "error", "message": f"Fetch nodes failed: {resp.status_code}", "url": url, "nodes": []}
        
        bro_nodes = resp.json().get("nodes", [])
        bro_map = {node["hostname"].upper(): node for node in bro_nodes}
    except Exception as e:
        await client.aclose()
        return {"status": "error", "message": str(e), "url": url, "nodes": []}
    finally:
        if client:
            await client.aclose()

    # Query Overwatch boxes
    result = await db.execute(
        select(Box).where(
            or_(Box.status == BoxStatus.ACTIVE, Box.status == BoxStatus.MAINTENANCE)
        )
    )
    boxes = result.scalars().all()

    nodes_list = []
    for box in boxes:
        bro_node = bro_map.get(box.internal_sn.upper())
        nodes_list.append({
            "id": str(box.id),
            "internal_sn": box.internal_sn,
            "mac_address": box.mac_address,
            "ip_address": box.ip_address,
            "overwatch_status": box.status,
            "edge_bro_status": bro_node["status"] if bro_node else "NOT_REGISTERED",
            "edge_bro_id": bro_node["id"] if bro_node else None,
            "last_backup": bro_node["last_backup"] if bro_node else None
        })

    return {"status": "connected", "url": url, "nodes": nodes_list}

@router.post("/edge-bro/sync")
async def sync_edge_bro_nodes(payload: EdgeBroSyncRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(deps.get_current_user)):
    """Registers requested Overwatch boxes to Edge B.R.O."""
    from app.models.box import Box
    
    client, url, err = await get_edge_bro_client(db)
    if err:
        raise HTTPException(status_code=500, detail=f"Failed to reach Edge B.R.O.: {err}")

    results = []
    try:
        for bid in payload.box_ids:
            try:
                # Convert ID to UUID
                bid_uuid = uuid.UUID(bid)
            except ValueError:
                results.append({"box_id": bid, "status": "error", "detail": "Invalid box ID format"})
                continue
                
            result = await db.execute(select(Box).where(Box.id == bid_uuid))
            box = result.scalars().first()
            if not box:
                results.append({"box_id": bid, "status": "error", "detail": "Box not found"})
                continue

            node_payload = {
                "hostname": box.internal_sn,
                "ip_address": box.ip_address,
                "ssh_port": box.ssh_port or 2222,
                "bootstrap_user": box.ssh_username or "user",
                "bootstrap_password": box.ssh_password or "admin",
                "auto_detect_hostname": False
            }
            resp = await client.post("/api/nodes", json=node_payload)
            if resp.status_code in (200, 201):
                results.append({"box_id": bid, "status": "success"})
            else:
                results.append({"box_id": bid, "status": "error", "detail": f"B.R.O. API returned {resp.status_code}: {resp.text}"})
    finally:
        await client.aclose()

    return {"status": "complete", "results": results}
