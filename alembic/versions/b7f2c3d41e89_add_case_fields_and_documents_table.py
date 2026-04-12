"""add case fields and documents table

Revision ID: b7f2c3d41e89
Revises: a432ee313540
Create Date: 2026-04-11 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7f2c3d41e89'
down_revision: Union[str, Sequence[str], None] = 'a432ee313540'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add new columns to patient_cases
    op.add_column('patient_cases', sa.Column('age', sa.Integer(), nullable=True))
    op.add_column('patient_cases', sa.Column('source_hospital', sa.String(length=200), nullable=True))
    op.add_column('patient_cases', sa.Column('discharge_date', sa.Date(), nullable=True))
    op.add_column('patient_cases', sa.Column('extraction_data', sa.JSON(), nullable=True))
    op.add_column('patient_cases', sa.Column('review_data', sa.JSON(), nullable=True))
    op.add_column('patient_cases', sa.Column('care_plan_data', sa.JSON(), nullable=True))

    # Create documents table
    op.create_table('documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('case_id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(length=500), nullable=False),
        sa.Column('file_path', sa.String(length=1000), nullable=False),
        sa.Column('document_type', sa.String(length=100), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['case_id'], ['patient_cases.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_documents_id'), 'documents', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_documents_id'), table_name='documents')
    op.drop_table('documents')

    op.drop_column('patient_cases', 'care_plan_data')
    op.drop_column('patient_cases', 'review_data')
    op.drop_column('patient_cases', 'extraction_data')
    op.drop_column('patient_cases', 'discharge_date')
    op.drop_column('patient_cases', 'source_hospital')
    op.drop_column('patient_cases', 'age')
