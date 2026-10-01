from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.agenda.models import Leilao
from app.db import Base, IdCriadoEmMixin


class Edital(IdCriadoEmMixin, Base):
    __tablename__ = "editais"

    leilao_id: Mapped[UUID] = mapped_column(
        ForeignKey("leiloes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conteudo_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    atualizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    leilao: Mapped[Leilao] = relationship(back_populates="editais", lazy="selectin")
