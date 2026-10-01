from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "processos",
        "numero_processo",
        existing_type=sa.String(50),
        type_=sa.Text(),
        existing_nullable=True,
    )
    op.create_index(
        "uq_leiloes_processo_agendado",
        "leiloes",
        ["processo_id"],
        unique=True,
        postgresql_where=sa.text("status = 'agendado'"),
    )


def downgrade() -> None:
    op.drop_index("uq_leiloes_processo_agendado", table_name="leiloes")
    op.alter_column(
        "processos",
        "numero_processo",
        existing_type=sa.Text(),
        type_=sa.String(50),
        existing_nullable=True,
    )
