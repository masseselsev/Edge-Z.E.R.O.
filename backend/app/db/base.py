# Import all the models, so that Base has them before being
# imported by Alembic
from app.db.base_class import Base  # noqa
from app.models.box import Box  # noqa
from app.models.component import Component  # noqa
from app.models.port_mapping import PortMapping  # noqa
from app.models.os_image import OsImage  # noqa
from app.models.system_settings import SystemSettings  # noqa
from app.models.vpn_credential import VpnCredential  # noqa
from app.models.init_script import InitScript  # noqa
from app.models.component_definition import ComponentDefinition  # noqa
from app.models.location import Location  # noqa
from app.models.system_log import SystemLog  # noqa
from app.models.audit_log import AuditLog  # noqa

