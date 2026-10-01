from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "processos",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("nome_arquivo", sa.String(255), nullable=False),
        sa.Column("caminho_pdf", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), server_default="recebido", nullable=False),
        sa.Column("numero_processo", sa.String(50)),
        sa.Column("vara", sa.Text()),
        sa.Column("erro", sa.Text()),
        sa.Column("texto_extraido", sa.Text()),
        sa.Column("analisado_em", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "checklists",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "processo_id",
            sa.Uuid(),
            sa.ForeignKey("processos.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("dados", postgresql.JSONB(), nullable=False),
        sa.Column(
            "atualizado_em",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_table(
        "relatorios",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "processo_id",
            sa.Uuid(),
            sa.ForeignKey("processos.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("dados", postgresql.JSONB(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("relatorios")
    op.drop_table("checklists")
    op.drop_table("processos")
