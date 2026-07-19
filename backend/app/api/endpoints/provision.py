from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi.templating import Jinja2Templates
from fastapi.responses import Response

from app.db.session import get_db
from app.models.box import Box
from app.models.vpn_credential import VpnCredential
from app.models.provisioning_log import ProvisioningLog

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

# ...

@router.get("/{mac}/preseed.cfg")
async def get_preseed(mac: str, request: Request, db: AsyncSession = Depends(get_db)):
    # Standardize MAC format if needed. Assuming formatted as in DB or handled.
    # The prompt generator logic uses colon-separated? PXE asks for dash-separated usually, 
    # but the URL in PXE config uses `{mac}/preseed.cfg`.
    # Let's handle generic mac matching.
    
    # Query Box (cast input string to MACADDR)
    # Note: If mac string is invalid, this might raise DB error. 
    # Ideally validate before query. But for now, we rely on basic catch or 500.
    result = await db.execute(select(Box).where(Box.mac_address == cast(mac, MACADDR)))
    box = result.scalars().first()
    
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")

    # Get VPN Creds
    result_vpn = await db.execute(select(VpnCredential).where(VpnCredential.box_id == box.id))
    vpn = result_vpn.scalars().first()

    # Define variables for template
    context = {
        "request": request,
        "mac_address": mac,
        "api_host": settings.API_HOST if hasattr(settings, 'API_HOST') else "192.168.1.100", # Fallback or dynamic
        "api_port": settings.API_PORT if hasattr(settings, 'API_PORT') else "7000",
        "ip_address": box.ip_address,
        "gateway": "192.168.1.1", # Hardcoded for now, should be in SystemSettings or Subnet logic
        "dns": "8.8.8.8",
        "ssh_public_key": "ssh-rsa AAAA...", # Should come from SystemSettings
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
    result = await db.execute(select(Box).where(Box.mac_address == cast(mac, MACADDR)))
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
    result_vpn = await db.execute(select(VpnCredential).where(VpnCredential.box_id == box.id))
    vpn = result_vpn.scalars().first()

    context = {
        "request": request,
        "mac_address": mac,
        "api_host": settings.API_HOST,
        "api_port": settings.API_PORT,
        "ip_address": box.ip_address,
        "gateway": "192.168.188.1", 
        "dns": "8.8.8.8",
        "ssh_public_key": "ssh-rsa AAAA...", 
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
    return Response(content="instance-id: overwatch-box\n", media_type="text/plain")

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
    return Response(content=script_content, media_type="text/x-shellscript")

from app.models.box import BoxStatus
@router.get("/{mac}/callback")
async def provision_callback(mac: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Box).where(Box.mac_address == cast(mac, MACADDR)))
    box = result.scalars().first()
    
    if box:
        box.status = BoxStatus.ACTIVE
        await db.commit()
        await send_telegram_message(db, f"✅ <b>Box Provisioned Successfully</b>\n\nMAC: {mac}\nSN: {box.internal_sn}\nIP: {box.ip_address}")
        
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
        return Response(content="#!ipxe\necho Box not found\nshell", media_type="text/plain")

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
        iso_url = f"http://{settings.API_HOST}:{settings.API_PORT}/isos/{box.os_image.filename}"
        
        # Build kernel command line based on OS type
        # os_type is usually an Enum, let's check its value
        from app.models.os_image import OsType
        
        if box.os_image.os_type == OsType.UBUNTU:
            cmdline = f"initrd={initrd_file} ip=dhcp url={iso_url} autoinstall ds=nocloud-net;s=http://{settings.API_HOST}:{settings.API_PORT}/api/provision/{mac}/"
        else:
            # Debian / Other
            cmdline = f"initrd={initrd_file} auto=true priority=critical preseed/url=http://{settings.API_HOST}:{settings.API_PORT}/api/provision/{mac}/preseed.cfg netcfg/choose_interface=auto"

        script = f"""#!ipxe
echo Starting Overwatch Network Installer for MAC {mac}
echo Using image: {image_dir} (Type: {box.os_image.os_type})
kernel {kernel} {cmdline}
initrd {initrd}
boot
"""
        return Response(content=script, media_type="text/plain")
    else:
        return Response(content="#!ipxe\nexit", media_type="text/plain")
