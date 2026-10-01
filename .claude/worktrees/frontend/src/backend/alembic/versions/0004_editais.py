from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "editais",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "leilao_id", sa.Uuid(), sa.ForeignKey("leiloes.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("conteudo_markdown", sa.Text(), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_editais_leilao_id", "editais", ["leilao_id"])


def downgrade() -> None:
    op.drop_index("ix_editais_leilao_id", table_name="editais")
    op.drop_table("editais")
