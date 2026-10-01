from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.agenda.models import Leilao

LeilaoStatus = Literal["agendado", "cancelado"]


class LeilaoOut(BaseModel):
    id: UUID
    processo_id: UUID
    numero_processo: str | None
    primeiro_leilao_em: datetime
    segundo_leilao_em: datetime
    status: LeilaoStatus
    edital_id: UUID | None = None
    criado_em: datetime


class LeilaoCreate(BaseModel):
    processo_id: UUID
    primeiro_leilao_data: date | None = None


class SugestaoOut(BaseModel):
    primeiro_leilao_em: datetime
    segundo_leilao_em: datetime


class BloqueioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    data: date
    motivo: str


class BloqueioCreate(BaseModel):
    data: date
    motivo: str = Field(min_length=1, max_length=200)


class FeriadoOut(BaseModel):
    data: date
    motivo: str


def leilao_out(leilao: Leilao) -> LeilaoOut:
    return LeilaoOut(
        id=leilao.id,
        processo_id=leilao.processo_id,
        numero_processo=leilao.processo.numero_processo,
        primeiro_leilao_em=leilao.primeiro_leilao_em,
        segundo_leilao_em=leilao.segundo_leilao_em,
        status=leilao.status,  # type: ignore[arg-type]
        edital_id=leilao.editais[0].id if leilao.editais else None,
        criado_em=leilao.criado_em,
    )
