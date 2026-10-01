from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, IdCriadoEmMixin


class Processo(IdCriadoEmMixin, Base):
    __tablename__ = "processos"

    nome_arquivo: Mapped[str] = mapped_column(String(255), nullable=False)
    caminho_pdf: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="recebido", server_default="recebido"
    )
    numero_processo: Mapped[str | None] = mapped_column(Text)
    vara: Mapped[str | None] = mapped_column(Text)
    erro: Mapped[str | None] = mapped_column(Text)
    texto_extraido: Mapped[str | None] = mapped_column(Text)
    analisado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    checklist: Mapped["ChecklistDB | None"] = relationship(
        back_populates="processo", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )
    relatorio: Mapped["RelatorioDB | None"] = relationship(
        back_populates="processo", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )


class ChecklistDB(IdCriadoEmMixin, Base):
    __tablename__ = "checklists"

    processo_id: Mapped[UUID] = mapped_column(
        ForeignKey("processos.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    dados: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    processo: Mapped[Processo] = relationship(back_populates="checklist")


class RelatorioDB(IdCriadoEmMixin, Base):
    __tablename__ = "relatorios"

    processo_id: Mapped[UUID] = mapped_column(
        ForeignKey("processos.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    dados: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    processo: Mapped[Processo] = relationship(back_populates="relatorio")
