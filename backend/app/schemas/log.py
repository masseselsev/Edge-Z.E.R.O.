from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class SystemLogSchema(BaseModel):
    id: int
    level: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True

class AuditLogSchema(BaseModel):
    id: int
    username: str
    action: str
    details: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
