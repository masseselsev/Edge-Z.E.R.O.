import os
import time
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from typing import List, Optional
from pydantic import BaseModel

from app.db.session import get_db
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

@router.get("/settings", response_model=List[SettingItem])
async def get_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemSettings))
    return result.scalars().all()

@router.post("/settings")
async def update_settings(settings_list: List[SettingItem], db: AsyncSession = Depends(get_db)):
    for item in settings_list:
        result = await db.execute(select(SystemSettings).where(SystemSettings.key == item.key))
        setting = result.scalars().first()
        if setting:
            setting.value = item.value
        else:
            new_setting = SystemSettings(key=item.key, value=item.value)
            db.add(new_setting)
    await db.commit()
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
    return new_user

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
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
    
    await db.delete(user)
    await db.commit()
    return {"status": "success"}

# Profile update schemas
class UserProfileUpdateSchema(BaseModel):
    password: Optional[str] = None
    telegram_id: Optional[str] = None

# Profile update endpoint
@router.put("/users/profile", response_model=UserResponseSchema)
async def update_profile(
    payload: UserProfileUpdateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if payload.telegram_id is not None:
        current_user.telegram_id = payload.telegram_id
    if payload.password is not None:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
        current_user.hashed_password = security.get_password_hash(payload.password)
    
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user
