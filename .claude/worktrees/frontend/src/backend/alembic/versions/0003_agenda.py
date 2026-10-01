from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bloqueios_agenda",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("data", sa.Date(), nullable=False, unique=True),
        sa.Column("motivo", sa.Text(), nullable=False),
    )
    op.create_table(
        "leiloes",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "processo_id",
            sa.Uuid(),
            sa.ForeignKey("processos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("primeiro_leilao_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("segundo_leilao_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), server_default="agendado", nullable=False),
    )
    op.create_index("ix_leiloes_primeiro_leilao_em", "leiloes", ["primeiro_leilao_em"])
    op.create_index("ix_leiloes_segundo_leilao_em", "leiloes", ["segundo_leilao_em"])


def downgrade() -> None:
    op.drop_index("ix_leiloes_segundo_leilao_em", table_name="leiloes")
    op.drop_index("ix_leiloes_primeiro_leilao_em", table_name="leiloes")
    op.drop_table("leiloes")
    op.drop_table("bloqueios_agenda")
