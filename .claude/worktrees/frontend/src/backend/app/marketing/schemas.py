from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.marketing.models import EnvioMarketing

EnvioStatus = Literal["enviado", "erro"]


class EnvioOut(BaseModel):
    id: UUID
    leilao_id: UUID
    numero_processo: str | None
    destinatarios: list[str]
    enviado_em: datetime
    status: EnvioStatus
    erro: str | None


class EnvioCreate(BaseModel):
    leilao_id: UUID


def envio_out(envio: EnvioMarketing) -> EnvioOut:
    return EnvioOut(
        id=envio.id,
        leilao_id=envio.leilao_id,
        numero_processo=envio.leilao.processo.numero_processo,
        destinatarios=envio.destinatarios,
        enviado_em=envio.enviado_em,
        status=envio.status,  # type: ignore[arg-type]
        erro=envio.erro,
    )
