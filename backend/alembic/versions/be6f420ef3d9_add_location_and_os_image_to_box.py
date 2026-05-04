"""Add location and os_image to Box

Revision ID: be6f420ef3d9
Revises: 7a75643bca2f
Create Date: 2026-05-04 10:19:53.078617

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'be6f420ef3d9'
down_revision: Union[str, None] = '7a75643bca2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if column exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('boxes')]
    
    # Get existing foreign keys
    fks = inspector.get_foreign_keys('boxes')
    fk_names = [fk['name'] for fk in fks]
    
    if 'os_image_id' not in columns:
        op.add_column('boxes', sa.Column('os_image_id', sa.UUID(), nullable=True))
    
    # Update foreign keys with ON DELETE SET NULL
    # We drop and recreate them to ensure they have the correct ondelete property
    if 'boxes_location_id_fkey' in fk_names:
        op.drop_constraint('boxes_location_id_fkey', 'boxes', type_='foreignkey')
    op.create_foreign_key('boxes_location_id_fkey', 'boxes', 'locations', ['location_id'], ['id'], ondelete='SET NULL')
    
    if 'boxes_os_image_id_fkey' in fk_names:
        op.drop_constraint('boxes_os_image_id_fkey', 'boxes', type_='foreignkey')
    op.create_foreign_key('boxes_os_image_id_fkey', 'boxes', 'os_images', ['os_image_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('boxes_os_image_id_fkey', 'boxes', type_='foreignkey')
    op.drop_constraint('boxes_location_id_fkey', 'boxes', type_='foreignkey')
    op.create_foreign_key('boxes_location_id_fkey', 'boxes', 'locations', ['location_id'], ['id'])
    op.drop_column('boxes', 'os_image_id')
