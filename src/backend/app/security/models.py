from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, IdCriadoEmMixin


class Usuario(IdCriadoEmMixin, Base):
    __tablename__ = "usuarios"

    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    senha_hash: Mapped[str] = mapped_column(Text, nullable=False)
    perfil: Mapped[str] = mapped_column(String(20), nullable=False)
    ativo: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )


class Sessao(IdCriadoEmMixin, Base):
    __tablename__ = "sessoes"

    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    usuario_id: Mapped[UUID] = mapped_column(
        ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False
    )
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    usuario: Mapped[Usuario] = relationship(lazy="selectin")


class TentativaLogin(IdCriadoEmMixin, Base):
    __tablename__ = "tentativas_login"
    __table_args__ = (Index("ix_tentativas_login_chave_em", "chave", "em"),)

    chave: Mapped[str] = mapped_column(String(200), nullable=False)
    em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
