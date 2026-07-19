import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.db.base_class import Base


class ProvisioningLog(Base):
    __tablename__ = "provisioning_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    box_id = Column(
        UUID(as_uuid=True),
        ForeignKey("boxes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
