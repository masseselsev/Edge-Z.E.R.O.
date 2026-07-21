from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi.templating import Jinja2Templates
from fastapi.responses import Response

from app.db.session import get_db
from app.models.box import Box
from app.models.vpn_credential import VpnCredential
from app.models.provisioning_log import ProvisioningLog
from app.models.system_settings import SystemSettings

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

from app.services.pxe_gen import generate_pxe_config
from pydantic import BaseModel
from typing import Optional

# Subiquity phase-to-progress mapping (applied on "finish" events only)
SUBIQUITY_PHASE_PROGRESS: dict[str, int] = {
    "apply_autoinstall_config": 5,
    "install": 10,
    "install/partitioning": 20,
    "install/partitioning/gpt": 22,
    "install/filesystem_setup": 30,
    "install/mount": 35,
    "install/extract": 50,
    "install/curthooks": 60,
    "install/postinstall": 75,
    "install/finish": 90,
    "finish": 95,
}

class ReportPayload(BaseModel):
    # Our own curl format fields
    message: Optional[str] = None
    progress: Optional[int] = None
    # Ubuntu Subiquity reporting format fields
    event_type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    result: Optional[str] = None

    model_config = {"extra": "allow"}

@router.post("/{mac}/report")
async def provision_report(
    mac: str,
    payload: ReportPayload,
    db: AsyncSession = Depends(get_db)
):
    """
    Receives installation progress from the box installer.
    Accepts both our curl format {message, progress} and Ubuntu Subiquity
    HTTP reporting format {event_type, name, description, result}.
    """
    from sqlalchemy import cast as sa_cast
    result = await db.execute(
        select(Box).where(Box.mac_address == sa_cast(mac, MACADDR))
    )
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")

    # Resolve message and progress from whichever format was sent
    if payload.message:
        # Our own curl format
        message = payload.message
        progress = payload.progress
    elif payload.event_type:
        # Ubuntu Subiquity format
        phase = payload.name or ""
        event = payload.event_type or ""
        desc = payload.description or ""
        result_str = payload.result or ""
        message = f"[Subiquity] {event.upper()} {phase}"
        if desc:
            message += f": {desc}"
        if result_str:
            message += f" [{result_str}]"
        # Only update progress on finish events
        progress = SUBIQUITY_PHASE_PROGRESS.get(phase) if event == "finish" else None
    else:
        message = str(payload.model_dump(exclude_none=True))
        progress = None

    # Persist log line
    log_entry = ProvisioningLog(box_id=box.id, message=message)
    db.add(log_entry)

    # Update progress if supplied
    if progress is not None:
        box.installation_progress = max(0, min(100, progress))

    await db.commit()
    return {"status": "ok"}

@router.post("/sync")
async def sync_pxe_config(db: AsyncSession = Depends(get_db)):
    """
    Force regeneration of PXE/DNSMasq configs.
    """
    await generate_pxe_config(db)
    return {"status": "synced"}

from sqlalchemy import select, cast
from sqlalchemy.dialects.postgresql import MACADDR
from sqlalchemy.orm import joinedload

async def get_system_setting(db: AsyncSession, key: str, default: str) -> str:
    res = await db.execute(select(SystemSettings).where(SystemSettings.key == key))
    obj = res.scalars().first()
    return obj.value if obj and obj.value else default

@router.get("/{mac}/preseed.cfg")
async def get_preseed(mac: str, request: Request, db: AsyncSession = Depends(get_db)):
    # Query Box (cast input string to MACADDR)
    result = await db.execute(
        select(Box)
        .options(joinedload(Box.location))
        .where(Box.mac_address == cast(mac, MACADDR))
    )
    box = result.scalars().first()
    
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")

    # Get VPN Creds
    result_vpn = await db.execute(select(VpnCredential).where(VpnCredential.box_id == box.id))
    vpn = result_vpn.scalars().first()

    # Load defaults from SystemSettings table
    default_ssh_key = await get_system_setting(db, "DEFAULT_SSH_PUBLIC_KEY", "ssh-rsa AAAAB3N...")
    default_gateway = await get_system_setting(db, "DEFAULT_GATEWAY", "192.168.1.1")
    default_dns = await get_system_setting(db, "DEFAULT_DNS", "8.8.8.8")
    default_ntp = await get_system_setting(db, "DEFAULT_NTP", "pool.ntp.org")
    default_tz = await get_system_setting(db, "DEFAULT_TIMEZONE", "UTC")
    default_locale = await get_system_setting(db, "DEFAULT_LOCALE", "en_US.UTF-8")
    default_keyboard = await get_system_setting(db, "DEFAULT_KEYBOARD", "us")
    default_mirror = await get_system_setting(db, "DEFAULT_PACKAGE_MIRROR", "deb.debian.org")
    default_root_pwd_hash = await get_system_setting(db, "DEFAULT_ROOT_PASSWORD_HASH", "$6$rounds=4096$salt$placeholder")
    default_username = await get_system_setting(db, "DEFAULT_USER_USERNAME", "")
    default_fullname = await get_system_setting(db, "DEFAULT_USER_FULLNAME", "Default User")
    default_user_pwd_hash = await get_system_setting(db, "DEFAULT_USER_PASSWORD_HASH", "$6$rounds=4096$salt$placeholder")

    loc = box.location

    # Define variables for template
    context = {
        "request": request,
        "mac_address": mac,
        "api_host": settings.API_HOST,
        "api_port": settings.API_PORT,
        "ip_address": box.ip_address,
        "gateway": loc.gateway if loc and loc.gateway else default_gateway,
        "netmask": loc.netmask if loc and loc.netmask else "255.255.255.0",
        "dns": loc.dns_server if loc and loc.dns_server else default_dns,
        "ntp_server": loc.ntp_server if loc and loc.ntp_server else default_ntp,
        "timezone": loc.timezone if loc and loc.timezone else default_tz,
        "locale": loc.locale if loc and loc.locale else default_locale,
        "keyboard": loc.keyboard if loc and loc.keyboard else default_keyboard,
        "mirror_host": loc.package_mirror if loc and loc.package_mirror else default_mirror,
        "ssh_public_key": loc.ssh_public_key if loc and loc.ssh_public_key else default_ssh_key,
        "root_password_hash": default_root_pwd_hash,
        "create_default_user": bool(default_username),
        "default_username": default_username,
        "default_user_fullname": default_fullname,
        "default_user_password_hash": default_user_pwd_hash,
        "ca_cert": vpn.ca_cert if vpn else "",
        "client_cert": vpn.client_cert if vpn else "",
        "client_key": vpn.client_key if vpn else ""
    }
    
    if vpn:
        # Escape newlines for echo commands in preseed
        context["ca_cert"] = context["ca_cert"].replace("\n", "\\n")
        context["client_cert"] = context["client_cert"].replace("\n", "\\n")
        context["client_key"] = context["client_key"].replace("\n", "\\n")

    return templates.TemplateResponse(
        "preseed.j2", 
        context,
        media_type="text/plain"
    )

@router.get("/{mac}/user-data")
async def get_user_data(mac: str, request: Request, db: AsyncSession = Depends(get_db)):
    # Same logic as preseed but for Ubuntu
    result = await db.execute(
        select(Box)
        .options(joinedload(Box.location))
        .where(Box.mac_address == cast(mac, MACADDR))
    )
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
    result_vpn = await db.execute(select(VpnCredential).where(VpnCredential.box_id == box.id))
    vpn = result_vpn.scalars().first()

    # Load defaults from SystemSettings table
    default_ssh_key = await get_system_setting(db, "DEFAULT_SSH_PUBLIC_KEY", "ssh-rsa AAAAB3N...")
    default_gateway = await get_system_setting(db, "DEFAULT_GATEWAY", "192.168.1.1")
    default_dns = await get_system_setting(db, "DEFAULT_DNS", "8.8.8.8")
    default_ntp = await get_system_setting(db, "DEFAULT_NTP", "pool.ntp.org")
    default_tz = await get_system_setting(db, "DEFAULT_TIMEZONE", "UTC")
    default_locale = await get_system_setting(db, "DEFAULT_LOCALE", "en_US.UTF-8")
    default_keyboard = await get_system_setting(db, "DEFAULT_KEYBOARD", "us")
    default_mirror = await get_system_setting(db, "DEFAULT_PACKAGE_MIRROR", "deb.debian.org")

    loc = box.location

    context = {
        "request": request,
        "mac_address": mac,
        "api_host": settings.API_HOST,
        "api_port": settings.API_PORT,
        "ip_address": box.ip_address,
        "gateway": loc.gateway if loc and loc.gateway else default_gateway,
        "netmask": loc.netmask if loc and loc.netmask else "255.255.255.0",
        "dns": loc.dns_server if loc and loc.dns_server else default_dns,
        "ntp_server": loc.ntp_server if loc and loc.ntp_server else default_ntp,
        "timezone": loc.timezone if loc and loc.timezone else default_tz,
        "locale": loc.locale if loc and loc.locale else default_locale,
        "keyboard": loc.keyboard if loc and loc.keyboard else default_keyboard,
        "mirror_host": loc.package_mirror if loc and loc.package_mirror else default_mirror,
        "ssh_public_key": loc.ssh_public_key if loc and loc.ssh_public_key else default_ssh_key,
        "ca_cert": vpn.ca_cert if vpn else "",
        "client_cert": vpn.client_cert if vpn else "",
        "client_key": vpn.client_key if vpn else ""
    }
    
    return templates.TemplateResponse(
        "user-data.j2", 
        context,
        media_type="text/plain"
    )

@router.get("/{mac}/meta-data")
async def get_meta_data(mac: str):
    return Response(content="instance-id: edge-zero-box\n", media_type="text/plain")

class HardwareReport(BaseModel):
    cpu: Optional[str] = None
    memory: Optional[str] = None
    disk: Optional[str] = None
    interfaces: Optional[str] = None
    usb_devices: Optional[str] = None
    pci_devices: Optional[str] = None
    serial_ports: Optional[str] = None

def check_hardware_discrepancies(baseline: dict, current: dict) -> list[str]:
    import re
    discrepancies = []
    
    # 1. PCI Devices
    baseline_pci = set(p.strip() for p in baseline.get("pci_devices", "").split(";") if p.strip())
    current_pci = set(p.strip() for p in current.get("pci_devices", "").split(";") if p.strip())
    missing_pci = baseline_pci - current_pci
    for p in missing_pci:
        discrepancies.append(f"Missing PCI Device: {p}")
        
    # 2. USB Devices
    baseline_usb = set(u.strip() for u in baseline.get("usb_devices", "").split(",") if u.strip())
    current_usb = set(u.strip() for u in current.get("usb_devices", "").split(",") if u.strip())
    missing_usb = baseline_usb - current_usb
    for u in missing_usb:
        discrepancies.append(f"Missing USB Device: {u}")
        
    # 3. Serial Ports
    baseline_serial = set(s.strip() for s in baseline.get("serial_ports", "").split(",") if s.strip())
    current_serial = set(s.strip() for s in current.get("serial_ports", "").split(",") if s.strip())
    missing_serial = baseline_serial - current_serial
    for s in missing_serial:
        discrepancies.append(f"Missing Serial Port: {s}")
        
    # 4. Network Interfaces
    baseline_ifs = set(i.split("(")[0].strip() for i in baseline.get("interfaces", "").split(",") if i.strip())
    current_ifs = set(i.split("(")[0].strip() for i in current.get("interfaces", "").split(",") if i.strip())
    missing_ifs = baseline_ifs - current_ifs
    for i in missing_ifs:
        discrepancies.append(f"Missing Network Interface: {i}")

    # 5. CPU Model
    base_cpu = baseline.get("cpu", "").strip()
    curr_cpu = current.get("cpu", "").strip()
    if base_cpu and curr_cpu and base_cpu != curr_cpu:
        discrepancies.append(f"CPU model changed: {curr_cpu} (Baseline: {base_cpu})")

    # 6. Disk capacity
    base_disk = baseline.get("disk", "").strip()
    curr_disk = current.get("disk", "").strip()
    if base_disk and curr_disk and base_disk != curr_disk:
        discrepancies.append(f"Storage changed: {curr_disk} (Baseline: {base_disk})")

    # 7. Memory Capacity with tolerance (> 1.0 GiB)
    base_mem_str = baseline.get("memory", "").strip()
    curr_mem_str = current.get("memory", "").strip()
    
    def parse_memory_gb(m_str: str) -> float:
        match = re.search(r"([\d\.]+)\s*([a-zA-Z]*)", m_str)
        if not match:
            return 0.0
        val = float(match.group(1))
        unit = match.group(2).lower()
        if "m" in unit:
            return val / 1024.0
        if "t" in unit:
            return val * 1024.0
        return val

    if base_mem_str and curr_mem_str:
        base_gb = parse_memory_gb(base_mem_str)
        curr_gb = parse_memory_gb(curr_mem_str)
        if base_gb > 0 and curr_gb > 0 and abs(base_gb - curr_gb) > 1.0:
            discrepancies.append(f"Memory size changed: {curr_mem_str} (Baseline: {base_mem_str})")

    return discrepancies

@router.post("/{mac}/hardware-inventory")
async def report_hardware_inventory(
    mac: str,
    payload: HardwareReport,
    db: AsyncSession = Depends(get_db)
):
    """Stores the hardware diagnostic report sent by the box custom script and verifies baseline status."""
    from app.models.box import BoxStatus
    from app.services.telegram import send_telegram_message
    
    result = await db.execute(select(Box).where(Box.mac_address == cast(mac, MACADDR)))
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")

    current_inv = payload.model_dump(exclude_none=True)
    box.hardware_inventory = current_inv
    
    if not box.hardware_baseline:
        box.hardware_baseline = current_inv
    else:
        mismatches = check_hardware_discrepancies(box.hardware_baseline, current_inv)
        if mismatches:
            box.status = BoxStatus.MAINTENANCE
            mismatch_text = "\n".join(f"• {m}" for m in mismatches)
            msg = f"⚠️ <b>Hardware Discrepancy Alert for Box {box.internal_sn}</b>\n\nThe following items are missing:\n{mismatch_text}"
            await send_telegram_message(db, msg)

    await db.commit()
    return {"status": "ok"}

from app.models.init_script import InitScript
from app.services.telegram import send_telegram_message
import os

@router.get("/{mac}/init.sh")
async def get_init_script(mac: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InitScript))
    scripts = result.scalars().all()
    
    script_content = "#!/bin/bash\n"
    for s in scripts:
        filepath = os.path.join("/mnt/infra_config/scripts", s.filename)
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                script_content += f"\n# --- {s.filename} ---\n"
                script_content += f.read()
                script_content += "\n"

    # Append dynamic hardware auto-inspector reporting script
    api_host = settings.API_HOST
    api_port = settings.API_PORT
    script_content += f"""
# --- Auto-generated Hardware Inventory Report ---
echo "[Info] Gathering hardware diagnostics..."
CPU=\$(lscpu | grep 'Model name' | cut -d: -f2 | xargs || true)
MEM=\$(free -h | grep Mem | awk '{{print \$2}}' || true)
DISK=\$(lsblk -d -o NAME,SIZE,MODEL | grep -v 'NAME' | xargs || true)
NET_IF=\$(ip -br link show | awk '{{print \$1 " (" \$2 ")"}}' | paste -sd ", " - || true)
USB=\$(lsusb | cut -d' ' -f7- | paste -sd ", " - || true)
PCI=\$(lspci | cut -d' ' -f2- | paste -sd "; " - || true)
SERIAL=\$(ls /dev/ttyS* /dev/ttyUSB* /dev/ttyACM* 2>/dev/null | paste -sd ", " - || true)

CPU_ESC=\$(echo "\$CPU" | sed 's/\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g')
MEM_ESC=\$(echo "\$MEM" | sed 's/\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g')
DISK_ESC=\$(echo "\$DISK" | sed 's/\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g')
NET_IF_ESC=\$(echo "\$NET_IF" | sed 's/\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g')
USB_ESC=\$(echo "\$USB" | sed 's/\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g')
PCI_ESC=\$(echo "\$PCI" | sed 's/\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g')
SERIAL_ESC=\$(echo "\$SERIAL" | sed 's/\\\\/\\\\\\\\/g' | sed 's/"/\\\\"/g')

JSON_PAYLOAD=\$(cat <<EOF
{{
  "cpu": "\${{CPU_ESC}}",
  "memory": "\${{MEM_ESC}}",
  "disk": "\${{DISK_ESC}}",
  "interfaces": "\${{NET_IF_ESC}}",
  "usb_devices": "\${{USB_ESC}}",
  "pci_devices": "\${{PCI_ESC}}",
  "serial_ports": "\${{SERIAL_ESC}}"
}}
EOF
)

curl -sf -X POST -H "Content-Type: application/json" -d "\$JSON_PAYLOAD" http://{api_host}:{api_port}/api/provision/{mac}/hardware-inventory || true
echo "[Success] Hardware diagnostic report sent to orchestrator."

# --- Setup cron watchdog heartbeat ---
echo "[Info] Setting up heartbeat cron job..."
(crontab -l 2>/dev/null; echo "* * * * * curl -sf -X POST http://{api_host}:{api_port}/api/provision/{mac}/heartbeat || true") | sort -u | crontab -
"""
    return Response(content=script_content, media_type="text/x-shellscript")

from app.models.box import BoxStatus
from app.models.user import User

@router.get("/{mac}/callback")
async def provision_callback(mac: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Box).where(Box.mac_address == cast(mac, MACADDR)))
    box = result.scalars().first()
    
    if box:
        box.status = BoxStatus.ACTIVE
        box.installation_progress = 100
        await db.commit()

        message = f"✅ <b>Box Provisioned Successfully</b>\n\nMAC: {mac}\nSN: {box.internal_sn}\nIP: {box.ip_address}"

        # 1. Global notification
        await send_telegram_message(db, message)

        # 2. Per-user Telegram alerts for users with registered telegram IDs
        user_res = await db.execute(select(User).where(User.telegram_id.isnot(None)))
        users_with_tg = user_res.scalars().all()
        for u in users_with_tg:
            if u.telegram_id:
                await send_telegram_message(db, message, chat_id=u.telegram_id)
        
    return {"status": "success"}

from app.core.config import settings

@router.get("/boot.ipxe")
async def get_generic_boot_script():
    """
    Generic iPXE boot script that chains to the MAC-specific one.
    """
    script = [
        "#!ipxe",
        f"chain http://{settings.API_HOST}:{settings.API_PORT}/api/provision/${{mac:hexhyp}}/boot.ipxe || shell"
    ]
    return Response(content="\n".join(script), media_type="text/plain")


@router.get("/{mac}/boot.ipxe")
async def get_boot_ipxe(mac: str, db: AsyncSession = Depends(get_db)):
    """
    Returns a dynamic iPXE script for the box.
    """
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Box)
        .options(selectinload(Box.os_image))
        .where(Box.mac_address == cast(mac, MACADDR))
    )
    box = result.scalars().first()
    
    if not box:
        script = [
            "#!ipxe",
            "echo =============================================================",
            "echo UNREGISTERED DEVICE DETECTED",
            f"echo MAC Address: {mac.upper()}",
            "echo Please register this device in the Edge-Z.E.R.O. dashboard.",
            "echo =============================================================",
            "sleep 10",
            f"chain http://{settings.API_HOST}:{settings.API_PORT}/api/provision/{mac}/boot.ipxe"
        ]
        return Response(content="\n".join(script), media_type="text/plain")

    if box.status == BoxStatus.INSTALLING:
        preseed_url = f"http://{settings.API_HOST}:{settings.API_PORT}/api/provision/{mac}/preseed.cfg"
        
        # Determine image directory from os_image filename
        image_dir = "debian-installer"
        if box.os_image:
            image_dir = box.os_image.filename.replace(".iso", "").replace(".ISO", "")
        
        # Auto-detect kernel and initrd filenames in the directory
        # We check the directory on the filesystem
        img_path = os.path.join("/mnt/infra_config/tftp/images", image_dir)
        kernel_file = "vmlinuz"
        initrd_file = "initrd.gz"
        
        if os.path.exists(img_path):
            files = os.listdir(img_path)
            # Find kernel (vmlinuz or linux)
            for f in ["vmlinuz", "linux"]:
                if f in files:
                    kernel_file = f
                    break
            # Find initrd (initrd, initrd.gz, initrd.lz)
            for f in ["initrd", "initrd.gz", "initrd.lz"]:
                if f in files:
                    initrd_file = f
                    break

        kernel = f"tftp://${{next-server}}/images/{image_dir}/{kernel_file}"
        initrd = f"tftp://${{next-server}}/images/{image_dir}/{initrd_file}"
        iso_filename = box.os_image.filename if box.os_image else "debian.iso"
        iso_url = f"http://{settings.API_HOST}:{settings.API_PORT}/isos/{iso_filename}"
        
        from app.models.os_image import OsType
        os_type_val = box.os_image.os_type if box.os_image else OsType.DEBIAN
        
        if os_type_val == OsType.UBUNTU:
            cmdline = f"initrd={initrd_file} ip=dhcp url={iso_url} autoinstall ds=nocloud-net;s=http://{settings.API_HOST}:{settings.API_PORT}/api/provision/{mac}/"
        else:
            # Debian / Other
            cmdline = f"initrd={initrd_file} auto=true priority=critical preseed/url=http://{settings.API_HOST}:{settings.API_PORT}/api/provision/{mac}/preseed.cfg netcfg/choose_interface=auto"

        script = f"""#!ipxe
echo Starting Edge-Z.E.R.O. Network Installer for MAC {mac}
echo Using image: {image_dir}
kernel {kernel} {cmdline}
initrd {initrd}
boot
"""
        return Response(content=script, media_type="text/plain")
    elif box.status in [BoxStatus.NEW, BoxStatus.STAGING]:
        script = [
            "#!ipxe",
            "echo =============================================================",
            f"echo REGISTERED DEVICE: {box.internal_sn} ({mac.upper()})",
            f"echo Status: {box.status.value}",
            "echo Waiting for 'Start Provisioning' command from dashboard...",
            "echo =============================================================",
            "sleep 10",
            f"chain http://{settings.API_HOST}:{settings.API_PORT}/api/provision/{mac}/boot.ipxe"
        ]
        return Response(content="\n".join(script), media_type="text/plain")
    else:
        return Response(content="#!ipxe\nexit", media_type="text/plain")

@router.post("/{mac}/heartbeat")
async def box_heartbeat(mac: str, db: AsyncSession = Depends(get_db)):
    """Receive heartbeat tick from active boxes."""
    from sqlalchemy import cast
    from sqlalchemy.sql import func
    from sqlalchemy.dialects.postgresql import MACADDR
    result = await db.execute(select(Box).where(Box.mac_address == cast(mac, MACADDR)))
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
    
    box.last_seen = func.now()
    await db.commit()
    return {"status": "ok"}
