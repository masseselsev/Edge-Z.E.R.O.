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

@app.on_event("startup")
async def startup_event():
    import asyncio
    import threading
    from app.services.syslog_listener import start_syslog_listener
    from app.services.vsm2_repo import sync_repo
    asyncio.create_task(monitor_heartbeats())
    asyncio.create_task(start_syslog_listener())
    threading.Thread(target=sync_repo, daemon=True).start()
