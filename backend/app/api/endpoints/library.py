import os
import shutil
import subprocess
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List
from uuid import UUID

from app.db.session import get_db
from app.models.os_image import OsImage as OsImageModel, ImageStatus
from app.models.system_settings import SystemSettings as SystemSettingsModel
from app.models.init_script import InitScript as InitScriptModel
from app.models.component_definition import ComponentDefinition as ComponentDefinitionModel
from app.schemas.library import (
    OsImage, OsImageCreate, SystemSetting, SystemSettingCreate, OsType, 
    InitScript, InitScriptCreate,
    ComponentDefinition, ComponentDefinitionCreate, ComponentDefinitionUpdate
)

router = APIRouter()

# Constants
INFRA_CONFIG_DIR = "/mnt/infra_config"
ISO_DIR = os.path.join(INFRA_CONFIG_DIR, "isos")
SCRIPTS_DIR = os.path.join(INFRA_CONFIG_DIR, "scripts")

# Ensure dirs exist
os.makedirs(ISO_DIR, exist_ok=True)
os.makedirs(SCRIPTS_DIR, exist_ok=True)

# --- OS IMAGES ---

@router.get("/images", response_model=List[OsImage])
async def read_images(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OsImageModel))
    return result.scalars().all()

@router.post("/images", response_model=OsImage)
async def upload_image(
    file: UploadFile = File(...),
    os_type: OsType = Form(OsType.DEBIAN),
    is_active: bool = Form(False),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db)
):
    # Save file to disk
    file_location = os.path.join(ISO_DIR, file.filename)
    
    try:
        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
    except Exception as e:
        # Cleanup partial file
        if os.path.exists(file_location):
            os.remove(file_location)
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    # Save to DB
    db_image = OsImageModel(
        filename=file.filename,
        os_type=os_type,
        is_active=is_active,
        status=ImageStatus.PROCESSING
    )
    
    db.add(db_image)
    try:
        await db.commit()
    except Exception as e:
         # Cleanup file if DB commit fails
        if os.path.exists(file_location):
            os.remove(file_location)
        raise HTTPException(status_code=500, detail=f"Database commit failed: {e}")
        
    await db.refresh(db_image)
    
    # Extract assets in background
    background_tasks.add_task(_extract_iso_assets, file_location, db_image.id, db_image.filename)
    
    return db_image

async def _extract_iso_assets(iso_path: str, image_id: UUID, filename: str):
    """
    Extracts vmlinuz and initrd from ISO using 7z and updates DB status.
    """
    from app.db.session import AsyncSessionLocal
    import asyncio
    
    async with AsyncSessionLocal() as db:
        try:
            image_dir_name = filename.replace(".iso", "").replace(".ISO", "")
            target_dir = os.path.join(INFRA_CONFIG_DIR, "tftp", "images", image_dir_name)
            os.makedirs(target_dir, exist_ok=True)
            
            # 1. Fast single-pass listing of ISO contents to auto-detect OS Type
            detected_os_type = OsType.DEBIAN
            fn_lower = filename.lower()
            if "ubuntu" in fn_lower:
                detected_os_type = OsType.UBUNTU

            try:
                l_proc = await asyncio.create_subprocess_exec(
                    "7z", "l", iso_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, _ = await l_proc.communicate()
                file_list_str = stdout.decode("utf-8", errors="replace").lower()
                if "casper" in file_list_str or "subiquity" in file_list_str or "ubuntu" in file_list_str or "nocloud" in file_list_str:
                    detected_os_type = OsType.UBUNTU
                elif "debian" in file_list_str or "preseed" in file_list_str or "simple-cdd" in file_list_str:
                    detected_os_type = OsType.DEBIAN
            except Exception as exc:
                print(f"OS auto-detect error for {filename}: {exc}")

            # 2. Extract kernel, initrd, and preseed files in ONE single 7z pass (takes 2-4s)
            found_any = False
            try:
                process = await asyncio.create_subprocess_exec(
                    "7z", "e", iso_path, "vmlinuz*", "initrd*", "linux", "initrd.img", "preseed.cfg", "*.preseed", "isolinux.cfg", "txt.cfg", "-r", "-y", f"-o{target_dir}",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await process.communicate()
                if process.returncode == 0 or os.path.exists(os.path.join(target_dir, "vmlinuz")) or os.path.exists(os.path.join(target_dir, "initrd.gz")):
                    found_any = True
            except Exception as e:
                print(f"Subprocess 7z extraction error: {e}")

            # Combine extracted preseed directives into target_dir/iso_preseed.cfg
            combined_content = ""
            for fname in os.listdir(target_dir):
                if (fname.endswith(".preseed") or fname == "preseed.cfg") and fname != "iso_preseed.cfg":
                    fpath = os.path.join(target_dir, fname)
                    try:
                        with open(fpath, "r", errors="replace") as pf:
                            content = pf.read()
                            cleaned_lines = []
                            skip_multiline = False
                            for line in content.splitlines():
                                stripped = line.strip()
                                if "preseed/late_command" in line or skip_multiline:
                                    cleaned_lines.append(f"# [Netboot Overridden] {line}")
                                    skip_multiline = stripped.endswith("\\")
                                else:
                                    cleaned_lines.append(line)
                            combined_content += f"\n# --- Extracted from ISO: {fname} ---\n" + "\n".join(cleaned_lines) + "\n"
                    except Exception:
                        pass
            
            if combined_content.strip():
                with open(os.path.join(target_dir, "iso_preseed.cfg"), "w") as out_pf:
                    out_pf.write(combined_content)
                print(f"Extracted embedded ISO preseed config to {image_dir_name}/iso_preseed.cfg")

            # 3. Extract simple-cdd directory and collect extra package lists
            try:
                scdd_proc = await asyncio.create_subprocess_exec(
                    "7z", "x", iso_path, "simple-cdd/*", "-y", f"-o{target_dir}",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                await scdd_proc.communicate()
            except Exception as e:
                print(f"Subprocess 7z simple-cdd extraction error: {e}")

            collected_packages = set()
            search_dirs = [target_dir, os.path.join(target_dir, "simple-cdd")]
            for sdir in search_dirs:
                if os.path.exists(sdir):
                    for pf in os.listdir(sdir):
                        if pf.endswith(".packages"):
                            try:
                                with open(os.path.join(sdir, pf), "r", errors="replace") as f:
                                    for line in f:
                                        line = line.strip()
                                        if line and not line.startswith("#"):
                                            collected_packages.add(line)
                            except Exception:
                                pass
            if collected_packages:
                with open(os.path.join(target_dir, "iso_packages.txt"), "w") as pkg_out:
                    pkg_out.write(" ".join(sorted(collected_packages)))
                print(f"Extracted ISO package list ({len(collected_packages)} packages) to {image_dir_name}/iso_packages.txt")

            status = ImageStatus.READY if found_any else ImageStatus.ERROR
            
            # Update DB with status and auto-detected OS type
            await db.execute(
                update(OsImageModel)
                .where(OsImageModel.id == image_id)
                .values(status=status, os_type=detected_os_type)
            )
            await db.commit()
            print(f"Extraction completed for {filename} with status {status}, auto-detected OS: {detected_os_type}")

        except Exception as e:
            print(f"Failed to extract assets from {filename}: {e}")
            await db.execute(
                update(OsImageModel)
                .where(OsImageModel.id == image_id)
                .values(status=ImageStatus.ERROR)
            )
            await db.commit()

@router.delete("/images/{image_id}")
async def delete_image(image_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OsImageModel).where(OsImageModel.id == image_id))
    image = result.scalars().first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Remove from disk (ISO)
    file_path = os.path.join(ISO_DIR, image.filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # Remove extracted assets
    image_dir_name = image.filename.replace(".iso", "").replace(".ISO", "")
    target_dir = os.path.join(INFRA_CONFIG_DIR, "tftp", "images", image_dir_name)
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)
    
    # Remove from DB
    await db.delete(image)
    await db.commit()
    return {"status": "deleted"}

# --- INIT SCRIPTS ---

@router.get("/scripts", response_model=List[InitScript])
async def read_scripts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InitScriptModel))
    return result.scalars().all()

@router.post("/scripts", response_model=InitScript)
async def upload_script(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    # Save file to disk
    file_location = os.path.join(SCRIPTS_DIR, file.filename)
    
    try:
        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
    except Exception as e:
        if os.path.exists(file_location):
            os.remove(file_location)
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    # Save to DB
    db_script = InitScriptModel(filename=file.filename)
    db.add(db_script)
    try:
        await db.commit()
    except Exception as e:
        if os.path.exists(file_location):
            os.remove(file_location)
        raise HTTPException(status_code=500, detail=f"Database commit failed: {e}")

    await db.refresh(db_script)
    return db_script

@router.delete("/scripts/{script_id}")
async def delete_script(script_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InitScriptModel).where(InitScriptModel.id == script_id))
    script = result.scalars().first()
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    
    # Remove from disk
    file_path = os.path.join(SCRIPTS_DIR, script.filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # Remove from DB
    await db.delete(script)
    await db.commit()
    return {"status": "deleted"}

# --- SYSTEM SETTINGS ---

@router.get("/settings", response_model=List[SystemSetting])
async def read_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemSettingsModel))
    return result.scalars().all()

@router.post("/settings", response_model=SystemSetting)
async def create_or_update_setting(setting: SystemSettingCreate, db: AsyncSession = Depends(get_db)):
    # Check if exists
    result = await db.execute(select(SystemSettingsModel).where(SystemSettingsModel.key == setting.key))
    existing = result.scalars().first()
    
    if existing:
        existing.value = setting.value
        await db.commit()
        await db.refresh(existing)
        return existing
    else:
        new_setting = SystemSettingsModel(key=setting.key, value=setting.value)
        db.add(new_setting)
        await db.commit()
        await db.refresh(new_setting)
        return new_setting

# --- COMPONENTS DEFINITIONS ---

@router.get("/components", response_model=List[ComponentDefinition])
async def read_components(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ComponentDefinitionModel))
    return result.scalars().all()

@router.post("/components", response_model=ComponentDefinition)
async def create_component(comp: ComponentDefinitionCreate, db: AsyncSession = Depends(get_db)):
    # Check if exists by name
    result = await db.execute(select(ComponentDefinitionModel).where(ComponentDefinitionModel.name == comp.name))
    if result.scalars().first():
         raise HTTPException(status_code=400, detail="Component definition with this name already exists")

    db_comp = ComponentDefinitionModel(**comp.model_dump())
    db.add(db_comp)
    await db.commit()
    await db.refresh(db_comp)
    return db_comp

    return db_comp

@router.put("/components/{comp_id}", response_model=ComponentDefinition)
async def update_component(comp_id: UUID, comp_in: ComponentDefinitionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ComponentDefinitionModel).where(ComponentDefinitionModel.id == comp_id))
    db_comp = result.scalars().first()
    if not db_comp:
        raise HTTPException(status_code=404, detail="Component definition not found")
    
    update_data = comp_in.model_dump(exclude_unset=True)
    
    # If name is being updated, check uniqueness
    if "name" in update_data and update_data["name"] != db_comp.name:
         result = await db.execute(select(ComponentDefinitionModel).where(ComponentDefinitionModel.name == update_data["name"]))
         if result.scalars().first():
             raise HTTPException(status_code=400, detail="Component with this name already exists")

    for field, value in update_data.items():
        setattr(db_comp, field, value)

    db.add(db_comp)
    await db.commit()
    await db.refresh(db_comp)
    return db_comp

@router.delete("/components/{comp_id}")
async def delete_component(comp_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ComponentDefinitionModel).where(ComponentDefinitionModel.id == comp_id))
    comp = result.scalars().first()
    if not comp:
        raise HTTPException(status_code=404, detail="Component definition not found")
    
    await db.delete(comp)
    await db.commit()
    return {"status": "deleted"}

# --- COMPONENT GROUPS ---

from app.models.component_group import ComponentGroup as ComponentGroupModel, ComponentGroupItem as ComponentGroupItemModel
from app.schemas.group import ComponentGroup, ComponentGroupCreate
from sqlalchemy.orm import selectinload

@router.get("/groups", response_model=List[ComponentGroup])
async def read_groups(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ComponentGroupModel)
        .options(selectinload(ComponentGroupModel.items))
    )
    return result.scalars().all()

@router.post("/groups", response_model=ComponentGroup)
async def create_group(group: ComponentGroupCreate, db: AsyncSession = Depends(get_db)):
    # Check if exists
    result = await db.execute(select(ComponentGroupModel).where(ComponentGroupModel.name == group.name))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Group with this name already exists")
    
    # Create group
    db_group = ComponentGroupModel(name=group.name, description=group.description)
    db.add(db_group)
    
    # Add items
    for item in group.items:
        db_item = ComponentGroupItemModel(
            group=db_group, # Will be handled by session flush usually, but relationship works
            definition_id=item.definition_id,
            count=item.count
        )
        db_group.items.append(db_item)
    
    db.add(db_group)
    await db.commit()
    await db.refresh(db_group)
    
    # Reload for response
    result = await db.execute(
        select(ComponentGroupModel)
        .options(selectinload(ComponentGroupModel.items))
        .where(ComponentGroupModel.id == db_group.id)
    )
    return result.scalars().first()

@router.delete("/groups/{group_id}")
async def delete_group(group_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ComponentGroupModel).where(ComponentGroupModel.id == group_id))
    group = result.scalars().first()
    if not group:
         raise HTTPException(status_code=404, detail="Group not found")
    
    await db.delete(group) # Cascade should handle items
    await db.commit()
    return {"status": "deleted"}
