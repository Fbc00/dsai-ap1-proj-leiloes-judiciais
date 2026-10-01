from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, IdCriadoEmMixin
from app.processos.models import Processo

if TYPE_CHECKING:
    from app.editais.models import Edital


class BloqueioAgenda(IdCriadoEmMixin, Base):
    __tablename__ = "bloqueios_agenda"

    data: Mapped[date] = mapped_column(Date, unique=True, nullable=False)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)


class Leilao(IdCriadoEmMixin, Base):
    __tablename__ = "leiloes"
    __table_args__ = (
        Index(
            "uq_leiloes_processo_agendado",
            "processo_id",
            unique=True,
            postgresql_where=text("status = 'agendado'"),
        ),
    )

    processo_id: Mapped[UUID] = mapped_column(
        ForeignKey("processos.id", ondelete="CASCADE"), nullable=False
    )
    primeiro_leilao_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    segundo_leilao_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="agendado", server_default="agendado"
    )

    processo: Mapped[Processo] = relationship(lazy="selectin")
    editais: Mapped[list["Edital"]] = relationship(
        back_populates="leilao", lazy="selectin", order_by="desc(Edital.criado_em)"
    )
