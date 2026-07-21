import os
import aiofiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.box import Box, BoxStatus
from app.core.config import settings

INFRA_CONFIG_DIR = "/mnt/infra_config"
DNSMASQ_ETHERS_FILE = os.path.join(INFRA_CONFIG_DIR, "dnsmasq.ethers")
TFTP_ROOT = os.path.join(INFRA_CONFIG_DIR, "tftp")
PXE_CFG_DIR = os.path.join(TFTP_ROOT, "pxelinux.cfg")
GRUB_CFG_DIR = os.path.join(TFTP_ROOT, "boot/grub")

async def generate_pxe_config(db: AsyncSession):
    """
    Generates dnsmasq.ethers and pxelinux.cfg files based on active boxes.
    """
    # Ensure directories exist
    os.makedirs(PXE_CFG_DIR, exist_ok=True)
    os.makedirs(GRUB_CFG_DIR, exist_ok=True)
    
    # Query all boxes with MAC addresses and eagerly load OS Image
    result = await db.execute(
        select(Box)
        .options(selectinload(Box.os_image))
        .where(Box.mac_address.is_not(None))
    )
    boxes = result.scalars().all()

    # 1. Generate dnsmasq.ethers
    ethers_content = []
    for box in boxes:
        # Format: MAC,IP
        if box.mac_address and box.ip_address:
            ethers_content.append(f"{box.mac_address},{box.ip_address}")
    
    async with aiofiles.open(DNSMASQ_ETHERS_FILE, "w") as f:
        await f.write("\n".join(ethers_content))

    # 2. Generate pxelinux.cfg files for each box
    for box in boxes:
        await generate_box_pxe_config(box)
    
    # 3. Generate default config (Local Boot)
    default_filepath = os.path.join(PXE_CFG_DIR, "default")
    default_content = """
DEFAULT local
LABEL local
    LOCALBOOT 0
"""
    async with aiofiles.open(default_filepath, "w") as f:
        await f.write(default_content)

    # 4. Generate main GRUB config (UEFI)
    # It will try to load a mac-specific config
    main_grub_path = os.path.join(GRUB_CFG_DIR, "grub.cfg")
    main_grub_content = """
set timeout=1
set default=0

# GRUB's net_default_mac is colon-separated (aa:bb:cc:dd:ee:ff)
# We need to convert it to dash-separated to match our generated files (01-aa-bb-cc-dd-ee-ff)
regexp --set=m1 --set=m2 --set=m3 --set=m4 --set=m5 --set=m6 '^([0-9a-f]+):([0-9a-f]+):([0-9a-f]+):([0-9a-f]+):([0-9a-f]+):([0-9a-f]+)$' "$net_default_mac"
set mac_dash="${m1}-${m2}-${m3}-${m4}-${m5}-${m6}"

# Try to load from /boot/grub/ folder
configfile /boot/grub/grub.cfg-01-${mac_dash}

# Fallback: Try root just in case
configfile /grub.cfg-01-${mac_dash}
"""
    async with aiofiles.open(main_grub_path, "w") as f:
        await f.write(main_grub_content)

    # Also write grub.cfg to TFTP_ROOT to catch GRUB binaries that look in root
    root_grub_path = os.path.join(TFTP_ROOT, "grub.cfg")
    async with aiofiles.open(root_grub_path, "w") as f:
        await f.write(main_grub_content)

    # 5. Generate iPXE boot script (The most reliable way)
    ipxe_path = os.path.join(TFTP_ROOT, "boot.ipxe")
    ipxe_content = f"""#!ipxe
# Try to fetch specific config from API by MAC
chain http://{settings.API_HOST}:{settings.API_PORT}/api/provision/${{mac:hexhyp}}/boot.ipxe || shell
"""
    async with aiofiles.open(ipxe_path, "w") as f:
        await f.write(ipxe_content)


async def generate_box_pxe_config(box: Box):
    """
    Generates a specific pxelinux config file for a box.
    Filename should be 01-mac-address-lowercase-dash-separated.
    """
    if not box.mac_address:
        return

    # MAC to pxe config filename: 01-aa-bb-cc-dd-ee-ff
    mac_str = str(box.mac_address).lower().replace(":", "-")
    filename = f"01-{mac_str}"
    filepath = os.path.join(PXE_CFG_DIR, filename)

    config_content = ""
    
    if box.status == BoxStatus.INSTALLING:
        # PXE Boot for Installation
        preseed_url = f"http://{settings.API_HOST}:{settings.API_PORT}/api/provision/{box.mac_address}/preseed.cfg"
        
        image_dir = "debian-installer"
        if box.os_image:
            image_dir = box.os_image.filename.replace(".iso", "").replace(".ISO", "")
        
        base_img_path = os.path.join(TFTP_ROOT, "images")
        img_path = os.path.join(base_img_path, image_dir)
        if not os.path.exists(img_path) and os.path.exists(base_img_path):
            available_dirs = [d for d in os.listdir(base_img_path) if os.path.isdir(os.path.join(base_img_path, d))]
            if available_dirs:
                image_dir = available_dirs[0]

        kernel = f"images/{image_dir}/vmlinuz"
        initrd = f"images/{image_dir}/initrd.gz"

        config_content = f"""
DEFAULT install
LABEL install
    KERNEL {kernel}
    APPEND initrd={initrd} auto=true priority=critical preseed/url={preseed_url} netcfg/choose_interface=auto netcfg/dhcp_timeout=60 netcfg/link_wait_timeout=15 netcfg/dhcpv6_timeout=1
"""
    else:
        # Boot from local disk
        config_content = """
DEFAULT local
LABEL local
    LOCALBOOT 0
"""

    async with aiofiles.open(filepath, "w") as f:
        await f.write(config_content)
    
    # --- Generate GRUB (UEFI) counterpart ---
    grub_filename = f"grub.cfg-{filename}" # grub.cfg-01-aa-bb-cc-dd-ee-ff
    grub_filepath = os.path.join(GRUB_CFG_DIR, grub_filename)
    
    grub_content = ""
    if box.status == BoxStatus.INSTALLING:
        preseed_url = f"http://{settings.API_HOST}:{settings.API_PORT}/api/provision/{box.mac_address}/preseed.cfg"
        
        image_dir = "debian-installer"
        if box.os_image:
            image_dir = box.os_image.filename.replace(".iso", "").replace(".ISO", "")
        
        base_img_path = os.path.join(TFTP_ROOT, "images")
        img_path = os.path.join(base_img_path, image_dir)
        if not os.path.exists(img_path) and os.path.exists(base_img_path):
            available_dirs = [d for d in os.listdir(base_img_path) if os.path.isdir(os.path.join(base_img_path, d))]
            if available_dirs:
                image_dir = available_dirs[0]

        kernel = f"/images/{image_dir}/vmlinuz"
        initrd = f"/images/{image_dir}/initrd.gz"
        
        grub_content = f"""
menuentry 'Install OS' {{
    linux {kernel} initrd={initrd} auto=true priority=critical preseed/url={preseed_url} netcfg/choose_interface=auto netcfg/dhcp_timeout=60 netcfg/link_wait_timeout=15 netcfg/dhcpv6_timeout=1
    initrd {initrd}
}}
"""
    else:
        grub_content = """
menuentry 'Local Boot' {
    exit
}
"""
    async with aiofiles.open(grub_filepath, "w") as f:
        await f.write(grub_content)
