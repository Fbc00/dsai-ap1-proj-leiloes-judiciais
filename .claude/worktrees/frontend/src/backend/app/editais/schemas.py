from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.editais.models import Edital


class EditalOut(BaseModel):
    id: UUID
    leilao_id: UUID
    processo_id: UUID
    conteudo_markdown: str
    criado_em: datetime
    atualizado_em: datetime | None


class EditalCreate(BaseModel):
    leilao_id: UUID


class EditalUpdate(BaseModel):
    conteudo_markdown: str

    @field_validator("conteudo_markdown")
    @classmethod
    def _nao_vazio(cls, valor: str) -> str:
        if not valor.strip():
            raise ValueError("conteúdo do edital não pode ser vazio")
        return valor


def edital_out(edital: Edital) -> EditalOut:
    return EditalOut(
        id=edital.id,
        leilao_id=edital.leilao_id,
        processo_id=edital.leilao.processo_id,
        conteudo_markdown=edital.conteudo_markdown,
        criado_em=edital.criado_em,
        atualizado_em=edital.atualizado_em,
    )
