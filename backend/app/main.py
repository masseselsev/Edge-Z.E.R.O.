from fastapi import FastAPI
from app.core.config import settings

from app.api.endpoints import provision, boxes, library, device_groups, system, locations, auth, recovery, init_scripts, ssh_proxy, vsm2_flasher
from app.db.session import setup_db_logging

setup_db_logging()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

from fastapi.staticfiles import StaticFiles
import os

app.mount("/isos", StaticFiles(directory="/mnt/infra_config/isos"), name="isos")
app.mount("/images", StaticFiles(directory="/mnt/infra_config/tftp/images"), name="images")

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(recovery.router, prefix="/api/recovery", tags=["recovery"])
app.include_router(init_scripts.router, prefix="/api/init-scripts", tags=["init-scripts"])
app.include_router(provision.router, prefix="/api/provision", tags=["provision"])
app.include_router(boxes.router, prefix="/api/boxes", tags=["boxes"])
app.include_router(library.router, prefix="/api/library", tags=["library"])
app.include_router(device_groups.router, prefix="/api/device-groups", tags=["device-groups"])
app.include_router(locations.router, prefix="/api/locations", tags=["locations"])
app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(ssh_proxy.router, prefix="/api/ssh", tags=["ssh"])
app.include_router(vsm2_flasher.router, prefix="/api/vsm2-flasher", tags=["vsm2-flasher"])

@app.get("/")
def root():
    return {"message": "Welcome to Edge-Z.E.R.O. API"}

async def monitor_heartbeats():
    import asyncio
    from datetime import datetime, timedelta
    from sqlalchemy import select
    from app.db.session import AsyncSessionLocal
    from app.models.box import Box, BoxStatus
    from app.services.telegram import send_telegram_message

    while True:
        await asyncio.sleep(60)
        try:
            async with AsyncSessionLocal() as db:
                threshold = datetime.utcnow() - timedelta(minutes=5)
                result = await db.execute(
                    select(Box).where(
                        Box.status == BoxStatus.ACTIVE,
                        Box.last_seen < threshold
                    )
                )
                offline_boxes = result.scalars().all()
                for box in offline_boxes:
                    box.status = BoxStatus.MAINTENANCE
                    db.add(box)
                    msg = f"⚠️ <b>Box Connection Alert</b>\n\nBox {box.internal_sn} ({box.mac_address}) went offline!\nLast seen: {box.last_seen}"
                    await send_telegram_message(db, msg)
                if offline_boxes:
                    await db.commit()
        except Exception as e:
            import sys
            print(f"Error in monitor_heartbeats: {e}", file=sys.stderr)

async def sync_iso_preseeds():
    """
    Scans /mnt/infra_config/isos and extracts embedded preseed files for any un-extracted ISOs.
    """
    import os, asyncio
    iso_dir = "/mnt/infra_config/isos"
    tftp_img_dir = "/mnt/infra_config/tftp/images"
    if not os.path.exists(iso_dir):
        return
    for fname in os.listdir(iso_dir):
        if fname.lower().endswith(".iso"):
            image_dir_name = fname.replace(".iso", "").replace(".ISO", "")
            target_dir = os.path.join(tftp_img_dir, image_dir_name)
            os.makedirs(target_dir, exist_ok=True)
            iso_path = os.path.join(iso_dir, fname)
            iso_preseed_file = os.path.join(target_dir, "iso_preseed.cfg")
            if not os.path.exists(iso_preseed_file):
                print(f"[Startup] Extracting embedded preseed files from {fname}...")
                preseed_patterns = ["preseed.cfg", "*.preseed", "simple-cdd/*.preseed", "isolinux/*.cfg", "txt.cfg"]
                for p_pattern in preseed_patterns:
                    try:
                        p_proc = await asyncio.create_subprocess_exec(
                            "7z", "e", iso_path, p_pattern, "-r", "-y", f"-o{target_dir}",
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE
                        )
                        await p_proc.communicate()
                    except Exception:
                        pass
                combined_content = ""
                for ext_name in os.listdir(target_dir):
                    if (ext_name.endswith(".preseed") or (ext_name.endswith(".cfg") and ext_name != "iso_preseed.cfg")) and ext_name not in ["vmlinuz", "initrd.gz"]:
                        fpath = os.path.join(target_dir, ext_name)
                        try:
                            with open(fpath, "r", errors="replace") as pf:
                                combined_content += f"\n# --- Extracted from ISO: {ext_name} ---\n" + pf.read() + "\n"
                        except Exception:
                            pass
                if combined_content.strip():
                    with open(iso_preseed_file, "w") as out_pf:
                        out_pf.write(combined_content)
                    print(f"[Startup] Extracted embedded ISO preseed config for {fname} -> {iso_preseed_file}")

@app.on_event("startup")
async def startup_event():
    import asyncio
    import threading
    from app.db.session import AsyncSessionLocal
    from app.api.endpoints.system import regenerate_dnsmasq_conf
    from app.services.pxe_gen import generate_pxe_config
    from app.services.syslog_listener import start_syslog_listener
    from app.services.vsm2_repo import sync_repo
    
    # Auto-regenerate PXE and dnsmasq configurations from database on startup
    try:
        async with AsyncSessionLocal() as db:
            await regenerate_dnsmasq_conf(db)
            await generate_pxe_config(db)
            await sync_iso_preseeds()
            print("Successfully synchronized PXE/DNSMasq configurations and ISO preseeds.")
    except Exception as e:
        import sys
        print(f"Error regenerating PXE configs on startup: {e}", file=sys.stderr)

    asyncio.create_task(monitor_heartbeats())
    asyncio.create_task(start_syslog_listener())
    threading.Thread(target=sync_repo, daemon=True).start()
