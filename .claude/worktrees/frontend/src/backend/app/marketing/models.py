from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.agenda.models import Leilao
from app.db import Base, IdCriadoEmMixin


class EnvioMarketing(IdCriadoEmMixin, Base):
    __tablename__ = "envios_marketing"

    leilao_id: Mapped[UUID] = mapped_column(
        ForeignKey("leiloes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    destinatarios: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    enviado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    erro: Mapped[str | None] = mapped_column(Text)

    leilao: Mapped[Leilao] = relationship(lazy="selectin")
