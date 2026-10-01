import re
from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.agenda.schemas import LeilaoOut

_PADRAO_DINHEIRO = re.compile(r"^\d+\.\d{2}$")


def _validar_dinheiro(valor: str) -> str:
    if not _PADRAO_DINHEIRO.match(valor):
        raise ValueError("use decimal com ponto e duas casas, ex: 1234.56")
    return valor


Dinheiro = Annotated[
    str,
    AfterValidator(_validar_dinheiro),
    Field(description="Valor em reais como string decimal com ponto e duas casas, ex: 150000.00"),
]
ProcessoStatus = Literal["recebido", "analisando", "analisado", "erro"]
TipoJustica = Literal["estadual", "federal"]
Ref = Annotated[
    str | None,
    Field(
        default=None,
        description="Identificador do documento nos autos, ex: 'Id 1308225768' ou 'fl. 284'",
    ),
]


class Advogado(BaseModel):
    nome: str
    oab: str | None = None
    ref: Ref


class Parte(BaseModel):
    nome: str
    cpf_cnpj: str | None = None
    advogados: list[Advogado] = Field(default_factory=list)


class Executado(Parte):
    citado: bool | None = None
    citacao_forma: str | None = None
    citacao_ref: Ref


class Execucao(BaseModel):
    cda: str | None = None
    natureza_divida: str | None = None
    classe: str | None = None
    valor_divida: Dinheiro | None = None
    data_divida: date | None = None


class BemPenhorado(BaseModel):
    descricao: str
    matricula: str | None = None
    localizacao: str | None = None
    data_penhora: date | None = None
    penhora_ref: Ref
    fiel_depositario: str | None = None
    executado_intimado: bool | None = None
    data_intimacao: date | None = None
    intimacao_ref: Ref
    propriedade: str | None = None
    valor_avaliacao: Dinheiro | None = None
    data_avaliacao: date | None = None
    oficial_avaliacao: str | None = None
    valor_reavaliacao: Dinheiro | None = None
    data_reavaliacao: date | None = None
    certidao_matricula_ref: Ref
    averbacao_penhora: str | None = None
    hipoteca: str | None = None
    enfiteuse: str | None = None
    outras_penhoras: str | None = None


class Checklist(BaseModel):
    vara: str | None = None
    numero_processo: str | None = None
    juiz: str | None = None
    tipo_justica: TipoJustica | None = None
    exequente: Parte
    executados: list[Executado] = Field(default_factory=list)
    execucao: Execucao = Field(default_factory=Execucao)
    bens: list[BemPenhorado] = Field(default_factory=list)
    recursos: str | None = None
    observacoes_leilao: list[str] = Field(default_factory=list)


class Etapa(BaseModel):
    data: date | None = None
    descricao: str
    ref: Ref


class Relatorio(BaseModel):
    resumo: str
    etapas: list[Etapa] = Field(default_factory=list)


class ProcessoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome_arquivo: str
    status: ProcessoStatus
    numero_processo: str | None
    vara: str | None
    erro: str | None
    criado_em: datetime
    analisado_em: datetime | None


class ProcessoDetalheOut(ProcessoOut):
    checklist: Checklist | None
    relatorio: Relatorio | None
    leilao: LeilaoOut | None = None
