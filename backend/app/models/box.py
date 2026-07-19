import uuid
from sqlalchemy import Column, String, Enum, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, INET, MACADDR
from sqlalchemy.orm import relationship
from app.db.base_class import Base
import enum

class BoxStatus(str, enum.Enum):
    NEW = "NEW"
    STAGING = "STAGING"
    INSTALLING = "INSTALLING"
    ACTIVE = "ACTIVE"
    MAINTENANCE = "MAINTENANCE"

class Box(Base):
    __tablename__ = "boxes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    internal_sn = Column(String, unique=True, nullable=False)
    mac_address = Column(MACADDR, unique=True, nullable=False)
    ip_address = Column(INET, nullable=True) # Check if static IP is mandatory initially or assigned later. Prompt says "Static IP assigned by us"
    status = Column(Enum(BoxStatus, name="box_status"), default=BoxStatus.NEW)
    location_id = Column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    os_image_id = Column(UUID(as_uuid=True), ForeignKey("os_images.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    installation_progress = Column(Integer, default=0, nullable=False)

    location = relationship("Location", back_populates="boxes")
    os_image = relationship("app.models.os_image.OsImage")

    # SSH Configuration
    ssh_port = Column(Integer, default=2222)
    ssh_username = Column(String, default="user")
    ssh_password = Column(String, default="admin")

    components = relationship("Component", back_populates="box", cascade="all, delete-orphan")
    port_mappings = relationship("PortMapping", back_populates="box", cascade="all, delete-orphan")
    vpn_credential = relationship("VpnCredential", back_populates="box", uselist=False, cascade="all, delete-orphan")
    
    device_groups = relationship("app.models.device_group.DeviceGroup", secondary="box_device_groups", back_populates="boxes")
