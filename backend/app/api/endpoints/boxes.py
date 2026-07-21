from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, cast, delete, update, asc
from sqlalchemy.dialects.postgresql import MACADDR
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel
import csv
import io

from app.db.session import get_db, log_user_action
from app.api import deps
from app.models.user import User
from app.models.box import Box as BoxModel
from app.models.box import BoxStatus
from app.schemas.box import Box, BoxCreate, BoxUpdate
from typing import List
from fastapi import Body

router = APIRouter()

from app.models.component import Component as ComponentModel
from app.schemas.box import ComponentCreate, Component as ComponentSchema
from sqlalchemy.orm import joinedload, selectinload
from app.services.pxe_gen import generate_pxe_config

# ...

@router.post("/{box_id}/components", response_model=ComponentSchema)
async def create_component_instance(box_id: UUID, comp: ComponentCreate, db: AsyncSession = Depends(get_db)):
    # Verify box exists
    result = await db.execute(select(BoxModel).where(BoxModel.id == box_id))
    box = result.scalars().first()
    if not box:
         raise HTTPException(status_code=404, detail="Box not found")

    db_comp = ComponentModel(box_id=box_id, **comp.model_dump())
    db.add(db_comp)
    await db.commit()
    # Refresh with eager load
    result = await db.execute(
        select(ComponentModel)
        .options(joinedload(ComponentModel.definition))
        .where(ComponentModel.id == db_comp.id)
    )
    db_comp = result.scalars().first()
    
    return db_comp

@router.delete("/components/{comp_id}")
async def delete_component_instance(comp_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ComponentModel).where(ComponentModel.id == comp_id))
    comp = result.scalars().first()
    if not comp:
        raise HTTPException(status_code=404, detail="Component instance not found")
    
    await db.delete(comp)
    await db.commit()
    return {"status": "deleted"}

from app.models.component_group import ComponentGroup as ComponentGroupModel

@router.post("/{box_id}/apply-group/{group_id}")
async def apply_group_to_box(box_id: UUID, group_id: UUID, db: AsyncSession = Depends(get_db)):
    # Verify box
    result = await db.execute(select(BoxModel).where(BoxModel.id == box_id))
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")

    await _apply_group_logic(box_id, group_id, db)
    return {"status": "success"}

async def _apply_group_logic(box_id: UUID, group_id: UUID, db: AsyncSession):
    # Verify group
    result = await db.execute(
        select(ComponentGroupModel)
        .options(selectinload(ComponentGroupModel.items))
        .where(ComponentGroupModel.id == group_id)
    )
    group = result.scalars().first()
    if not group:
        # If called from create_box, this might raise 404 which is fine, or we could handle gracefully.
        # Ideally schema validation ensures it exists, but here we just check DB.
        raise HTTPException(status_code=404, detail="Template/Group not found")
        
    # Apply items
    count_added = 0
    for item in group.items:
        for _ in range(item.count):
            comp = ComponentModel(
                box_id=box_id,
                definition_id=item.definition_id,
                serial_number=f"GRP-{item.definition_id.hex[:4].upper()}-{count_added}" # Temp SN generation
            )
            db.add(comp)
            count_added += 1
            
    return count_added

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    # Total boxes
    result_total = await db.execute(select(BoxModel))
    total_boxes = len(result_total.scalars().all())

    # Pending Provision (NEW or STAGING)
    result_pending = await db.execute(select(BoxModel).where(BoxModel.status.in_(["NEW", "STAGING"])))
    pending_provision = len(result_pending.scalars().all())

    # Active Alerts (Dummy for now, maybe maintenance)
    result_alerts = await db.execute(select(BoxModel).where(BoxModel.status == "MAINTENANCE"))
    active_alerts = len(result_alerts.scalars().all())

    return {
        "total_boxes": total_boxes,
        "pending_provision": pending_provision,
        "active_alerts": active_alerts
    }

@router.get("/", response_model=List[Box])
async def read_boxes(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BoxModel)
        .options(
            selectinload(BoxModel.components).selectinload(ComponentModel.definition),
            selectinload(BoxModel.device_groups),
            selectinload(BoxModel.location),
            selectinload(BoxModel.os_image)
        )
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()

@router.post("/", response_model=Box)
async def create_box(
    box: BoxCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    box_data = box.model_dump()
    template_id = box_data.pop("template_id", None)
    
    db_box = BoxModel(**box_data)
    db.add(db_box)
    await db.commit()
    await db.refresh(db_box)
    
    await log_user_action(db, current_user.username, "Register Box", f"Registered node SN: '{db_box.internal_sn}', MAC: '{db_box.mac_address}', IP: '{db_box.ip_address}'", request)
    
    if template_id:
        try:
            await _apply_group_logic(db_box.id, template_id, db)
            # await db.refresh(db_box) # Refresh to load components? Not strictly needed for response unless eagerly loaded.
        except Exception as e:
            print(f"Failed to apply template {template_id} to box {db_box.id}: {e}")
            # Non-blocking error for box creation, but user should know? 
            # For now just log it.

    
    # Reload with relationships to avoid MissingGreenlet
    result = await db.execute(
        select(BoxModel)
        .options(
            selectinload(BoxModel.components).selectinload(ComponentModel.definition),
            selectinload(BoxModel.device_groups),
            selectinload(BoxModel.location),
            selectinload(BoxModel.os_image)
        )
        .where(BoxModel.id == db_box.id)
    )
    db_box = result.scalars().first()

    return db_box

class UnregisteredDevice(BaseModel):
    mac: str
    ip: str = ""

@router.get("/unregistered", response_model=List[UnregisteredDevice])
async def get_unregistered_devices(db: AsyncSession = Depends(get_db)):
    import os
    import re
    
    log_path = "/mnt/infra_config/dnsmasq.log"
    if not os.path.exists(log_path):
        return []
        
    mac_to_ip = {}
    try:
        with open(log_path, "r") as f:
            lines = f.readlines()
    except Exception:
        return []
        
    mac_regex = re.compile(r"([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})")
    ip_regex = re.compile(r"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})")
    
    # Pre-parse TFTP lines to extract recent client IP addresses
    tftp_ips = []
    for line in reversed(lines):
        if "dnsmasq-tftp" in line and "sent" in line:
            m_ip = ip_regex.search(line)
            if m_ip:
                tftp_ips.append(m_ip.group(1))
    
    latest_tftp_ip = tftp_ips[0] if tftp_ips else ""

    for line in reversed(lines):
        if "dnsmasq-dhcp" in line and ("DHCPDISCOVER" in line or "DHCPREQUEST" in line or "DHCPINFORM" in line or "PXE" in line):
            m_mac = mac_regex.search(line)
            if m_mac:
                mac = m_mac.group(1).upper()
                if mac not in mac_to_ip:
                    m_ip = ip_regex.search(line)
                    ip = m_ip.group(1) if m_ip else latest_tftp_ip
                    mac_to_ip[mac] = ip
                if len(mac_to_ip) >= 20:
                    break
                    
    if not mac_to_ip:
        return []
        
    result = await db.execute(select(BoxModel.mac_address))
    registered_macs = set(str(m[0]).upper() for m in result.all() if m[0])
    
    unregistered = [
        {"mac": mac, "ip": ip}
        for mac, ip in mac_to_ip.items()
        if mac not in registered_macs
    ]
    return unregistered

@router.get("/{box_id}", response_model=Box)
async def read_box(box_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BoxModel)
        .options(
            selectinload(BoxModel.components).selectinload(ComponentModel.definition),
            selectinload(BoxModel.device_groups),
            selectinload(BoxModel.location),
            selectinload(BoxModel.os_image)
        )
        .where(BoxModel.id == box_id)
    )
    box = result.scalars().first()
    if box is None:
        raise HTTPException(status_code=404, detail="Box not found")
    return box

@router.put("/{box_id}", response_model=Box)
async def update_box(box_id: UUID, box_in: BoxUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BoxModel).where(BoxModel.id == box_id))
    box = result.scalars().first()
    if box is None:
        raise HTTPException(status_code=404, detail="Box not found")
    
    update_data = box_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(box, field, value)
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(BoxModel)
        .options(
            selectinload(BoxModel.components).selectinload(ComponentModel.definition),
            selectinload(BoxModel.device_groups),
            selectinload(BoxModel.location),
            selectinload(BoxModel.os_image)
        )
        .where(BoxModel.id == box_id)
    )
    box = result.scalars().first()
    return box

@router.post("/{box_id}/accept-baseline", response_model=Box)
async def accept_hardware_baseline(
    box_id: UUID, 
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    result = await db.execute(select(BoxModel).where(BoxModel.id == box_id))
    box = result.scalars().first()
    if box is None:
        raise HTTPException(status_code=404, detail="Box not found")
        
    if not box.hardware_inventory:
        raise HTTPException(status_code=400, detail="No hardware inventory reported yet")
        
    box.hardware_baseline = box.hardware_inventory
    box.status = BoxStatus.ACTIVE
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(BoxModel)
        .options(
            selectinload(BoxModel.components).selectinload(ComponentModel.definition),
            selectinload(BoxModel.device_groups),
            selectinload(BoxModel.location),
            selectinload(BoxModel.os_image)
        )
        .where(BoxModel.id == box_id)
    )
    box = result.scalars().first()
    
    # Audit log
    await log_user_action(db, current_user.username, "UPDATE_BASELINE", f"Accepted hardware baseline for box {box.internal_sn}", request=request)
    
    return box

@router.delete("/{box_id}")
async def delete_box(
    box_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    result = await db.execute(select(BoxModel).where(BoxModel.id == box_id))
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
    
    deleted_sn = box.internal_sn
    deleted_mac = box.mac_address
    await db.delete(box)
    await db.commit()
    await log_user_action(db, current_user.username, "Delete Box", f"Deleted node SN: '{deleted_sn}', MAC: '{deleted_mac}'", request)
    return {"status": "success", "id": box_id}

@router.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    content = await file.read()
    # Handle potential encoding issues
    try:
        decoded = content.decode('utf-8')
    except UnicodeDecodeError:
        decoded = content.decode('latin-1')
        
    csv_reader = csv.DictReader(io.StringIO(decoded))
    
    # Clean keys just in case
    # We expect: internal_sn, mac_address, ip_address, location, notes
    
    count_created = 0
    count_updated = 0
    
    for row in csv_reader:
        # Strip specific usage
        # We need flexible handling if CSV has spaces in headers? 
        # DictReader uses headers from first line.
        # Let's hope headers are clean: internal_sn,mac_address,...
        
        if not row: 
            continue
            
        # Helper to get value case-insensitive or just standard? 
        # Let's assume standard headers as per plan.
        
        mac = row.get("mac_address")
        if not mac:
            # Skip rows without mac
            continue
            
        mac = mac.strip()
        
        # Check existence
        stmt = select(BoxModel).where(BoxModel.mac_address == cast(mac, MACADDR))
        try:
            result = await db.execute(stmt)
            existing_box = result.scalars().first()
        except Exception as e:
            # If invalid mac format, this might raise. 
            # For now log and skip? Or fail? 
            # Let's invalid mac cause 500 for now or improved later?
            # Actually, let's catch and skip to be robust.
            print(f"Skipping invalid MAC {mac}: {e}")
            continue
        
        ip_val = row.get("ip_address", "").strip()
        if not ip_val: 
            ip_val = None
            
        if existing_box:
            # Update
            existing_box.internal_sn = row.get("internal_sn", existing_box.internal_sn).strip()
            existing_box.ip_address = ip_val
            # existing_box.location = row.get("location", "").strip() # Remove non-existent field
            existing_box.notes = row.get("notes", "").strip()
            count_updated += 1
        else:
            # Create
            new_box = BoxModel(
                internal_sn=row.get("internal_sn", "UNKNOWN").strip(),
                mac_address=mac,
                ip_address=ip_val,
                # location=row.get("location", "").strip(), # Remove non-existent field
                notes=row.get("notes", "").strip(),
                status=BoxStatus.NEW
            )
            db.add(new_box)
            count_created += 1
            
    await db.commit()
    return {"created": count_created, "updated": count_updated}

# --- DEVICE GROUPS ---
from app.models.device_group import DeviceGroup as DeviceGroupModel

@router.post("/{box_id}/groups/{group_id}")
async def add_box_to_group(box_id: UUID, group_id: UUID, db: AsyncSession = Depends(get_db)):
    # Get Box
    result = await db.execute(select(BoxModel).where(BoxModel.id == box_id))
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
        
    # Get Group
    result = await db.execute(select(DeviceGroupModel).where(DeviceGroupModel.id == group_id))
    group = result.scalars().first()
    if not group:
         raise HTTPException(status_code=404, detail="Device Group not found")
         
    # Add if not exists
    # Check if already associated? SQLAlchemy collection handling might handle duplicates or errors? 
    # Better to check. The relationship is loaded? No.
    # We can just append and handle standard association.
    
    # Reload box with groups
    result = await db.execute(
        select(BoxModel).options(selectinload(BoxModel.device_groups)).where(BoxModel.id == box_id)
    )
    box = result.scalars().first()
    
    if group not in box.device_groups:
        box.device_groups.append(group)
        await db.commit()
        
    return {"status": "added"}

@router.delete("/{box_id}/groups/{group_id}")
async def remove_box_from_group(box_id: UUID, group_id: UUID, db: AsyncSession = Depends(get_db)):
    # Get Box
    result = await db.execute(
        select(BoxModel).options(selectinload(BoxModel.device_groups)).where(BoxModel.id == box_id)
    )
    box = result.scalars().first()
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
        
    # Find group in list and remove
    group_to_remove = next((g for g in box.device_groups if g.id == group_id), None)
    if group_to_remove:
        box.device_groups.remove(group_to_remove)
        await db.commit()
        
    return {"status": "removed"}

# --- BATCH ACTIONS ---

@router.post("/batch/delete")
async def batch_delete_boxes(box_ids: List[UUID] = Body(...), db: AsyncSession = Depends(get_db)):
    if not box_ids:
        return {"deleted": 0}
        
    stmt = select(BoxModel).where(BoxModel.id.in_(box_ids))
    result = await db.execute(stmt)
    boxes = result.scalars().all()
    
    for box in boxes:
        await db.delete(box)
        
    await db.commit()
    
    return {"status": "success", "deleted": len(boxes)}

@router.post("/batch/apply-tag/{group_id}")
async def batch_apply_tag(group_id: UUID, box_ids: List[UUID] = Body(...), db: AsyncSession = Depends(get_db)):
    # Verify group
    result = await db.execute(select(DeviceGroupModel).where(DeviceGroupModel.id == group_id))
    group = result.scalars().first()
    if not group:
         raise HTTPException(status_code=404, detail="Device Group not found")

    count_applied = 0
    
    # Fetch all target boxes with their groups loaded
    result = await db.execute(
        select(BoxModel)
        .options(selectinload(BoxModel.device_groups))
        .where(BoxModel.id.in_(box_ids))
    )
    boxes = result.scalars().all()
    
    for box in boxes:
        if group not in box.device_groups:
            box.device_groups.append(group)
            count_applied += 1
            
    await db.commit()
    return {"status": "success", "applied": count_applied}

@router.post("/batch/apply-template/{template_id}")
async def batch_apply_template(template_id: UUID, box_ids: List[UUID] = Body(...), db: AsyncSession = Depends(get_db)):
    count_success = 0
    errors = []
    
    for box_id in box_ids:
        try:
            await _apply_group_logic(box_id, template_id, db)
            count_success += 1
        except Exception as e:
            errors.append(f"Box {box_id}: {str(e)}")
    
    return {
        "status": "partial_success" if errors else "success", 
        "applied": count_success, 
        "errors": errors
    }

@router.post("/batch/provision")
async def batch_provision(
    request: Request,
    box_ids: List[UUID] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if not box_ids:
        return {"count": 0}
        
    # Get box names/MACs for audit logging
    result_boxes = await db.execute(select(BoxModel).where(BoxModel.id.in_(box_ids)))
    affected_boxes = result_boxes.scalars().all()
    affected_details = [f"SN:{b.internal_sn} (MAC:{b.mac_address})" for b in affected_boxes]

    # Update status to INSTALLING for all selected boxes
    stmt = (
        update(BoxModel)
        .where(BoxModel.id.in_(box_ids))
        .values(status=BoxStatus.INSTALLING)
    )
    await db.execute(stmt)
    await db.commit()
    
    # Regenerate PXE configs
    await generate_pxe_config(db)
    
    await log_user_action(
        db, 
        current_user.username, 
        "Trigger Provisioning", 
        f"Issued PXE install commands for {len(box_ids)} device(s): {', '.join(affected_details)}", 
        request
    )
    return {"status": "success", "count": len(box_ids)}


from app.models.provisioning_log import ProvisioningLog

@router.get("/{box_id}/provisioning-logs")
async def get_provisioning_logs(
    box_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Returns all provisioning log entries for a box, ordered by time."""
    result = await db.execute(
        select(ProvisioningLog)
        .where(ProvisioningLog.box_id == box_id)
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
