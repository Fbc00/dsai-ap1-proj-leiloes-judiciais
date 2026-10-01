from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "envios_marketing",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "leilao_id", sa.Uuid(), sa.ForeignKey("leiloes.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("destinatarios", postgresql.JSONB(), nullable=False),
        sa.Column("enviado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("erro", sa.Text()),
    )
    op.create_index("ix_envios_marketing_leilao_id", "envios_marketing", ["leilao_id"])


def downgrade() -> None:
    op.drop_index("ix_envios_marketing_leilao_id", table_name="envios_marketing")
    op.drop_table("envios_marketing")
