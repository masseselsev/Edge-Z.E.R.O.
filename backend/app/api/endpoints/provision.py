from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi.templating import Jinja2Templates
from fastapi.responses import Response

from app.db.session import get_db
from app.models.box import Box
from app.models.vpn_credential import VpnCredential

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

from app.services.pxe_gen import generate_pxe_config

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
        "api_port": settings.API_PORT if hasattr(settings, 'API_PORT') else "8000",
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

@router.get("/{mac}/boot.ipxe")
async def get_boot_ipxe(mac: str, db: AsyncSession = Depends(get_db)):
    """
    Returns a dynamic iPXE script for the box.
    """
    result = await db.execute(select(Box).where(Box.mac_address == cast(mac, MACADDR)))
    box = result.scalars().first()
    
    if not box:
        return Response(content="#!ipxe\necho Box not found\nshell", media_type="text/plain")

    if box.status == BoxStatus.INSTALLING:
        preseed_url = f"http://{settings.API_HOST}:{settings.API_PORT}/api/provision/{mac}/preseed.cfg"
        image_dir = "debian-installer"
        
        # If box has a specific OS image, use it
        # We need to eagerly load os_image or use a separate query
        # For now, let's keep it simple or assume default
        
        kernel = f"tftp://${{next-server}}/images/{image_dir}/vmlinuz"
        initrd = f"tftp://${{next-server}}/images/{image_dir}/initrd.gz"
        
        script = f"""#!ipxe
echo Starting Overwatch Network Installer for MAC {mac}
kernel {kernel} auto=true priority=critical url={preseed_url} interface=auto
initrd {initrd}
boot
"""
        return Response(content=script, media_type="text/plain")
    else:
        return Response(content="#!ipxe\nexit", media_type="text/plain")
