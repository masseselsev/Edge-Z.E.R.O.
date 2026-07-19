from pydantic import BaseModel
from uuid import UUID
from typing import Optional

class LocationBase(BaseModel):
    name: str
    description: Optional[str] = None
    timezone: str = "UTC"
    locale: str = "en_US.UTF-8"
    keyboard: str = "us"
    gateway: Optional[str] = None
    netmask: Optional[str] = None
    dns_server: Optional[str] = None
    ntp_server: Optional[str] = None
    package_mirror: Optional[str] = None
    ssh_public_key: Optional[str] = None

class LocationCreate(LocationBase):
    pass

class LocationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    timezone: Optional[str] = None
    locale: Optional[str] = None
    keyboard: Optional[str] = None
    gateway: Optional[str] = None
    netmask: Optional[str] = None
    dns_server: Optional[str] = None
    ntp_server: Optional[str] = None
    package_mirror: Optional[str] = None
    ssh_public_key: Optional[str] = None

class Location(LocationBase):
    id: UUID

    class Config:
        from_attributes = True
