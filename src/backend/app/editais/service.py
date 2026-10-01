import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from uuid import UUID

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from num2words import num2words
from sqlalchemy.ext.asyncio import AsyncSession

from app.agenda import service as agenda_service
from app.agenda.models import Leilao
from app.config import Settings
from app.editais.models import Edital
from app.errors import ErroDominio
from app.processos.schemas import BemPenhorado, Checklist, Parte
from app.processos.service import checklist_de

TEMPLATES_DIR: Path = Path(__file__).parent / "templates"
VAZIO: str = "______"
PERCENTUAL_SEGUNDO: Decimal = Decimal("0.70")
CENTAVOS: Decimal = Decimal("0.01")
TIPO_DOCX: str = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TIPO_MARKDOWN: str = "text/markdown; charset=utf-8"

_env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=False,
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=True,
)


@dataclass(frozen=True)
class BemView:
    numero: int
    matricula: str
    descricao: str
    onus: str
    localizacao: str
    fiel_depositario: str
    avaliacao: str


def formatar_moeda(valor: Decimal) -> str:
    inteiro, _, centavos = f"{valor.quantize(CENTAVOS, rounding=ROUND_HALF_UP):.2f}".partition(".")
    inteiro_formatado = f"{int(inteiro):,}".replace(",", ".")
    return f"R$ {inteiro_formatado},{centavos}"


def por_extenso(valor: Decimal) -> str:
    texto = num2words(valor.quantize(CENTAVOS, rounding=ROUND_HALF_UP), lang="pt_BR", to="currency")
    return texto.replace(",", "")


def moeda_com_extenso(valor: str | None) -> str:
    if not valor:
        return VAZIO
    decimal = Decimal(valor)
    return f"{formatar_moeda(decimal)} ({por_extenso(decimal)})"


def lance_segundo(valor: Decimal) -> Decimal:
    return (valor * PERCENTUAL_SEGUNDO).quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def formatar_data(dt: datetime, settings: Settings) -> str:
    return dt.astimezone(settings.tz).strftime("%d/%m/%Y")


def formatar_hora(dt: datetime, settings: Settings) -> str:
    return dt.astimezone(settings.tz).strftime("%H:%M")


def ou_vazio(valor: str | None) -> str:
    return valor if valor else VAZIO


def ultima_avaliacao(bem: BemPenhorado) -> Decimal | None:
    valor = bem.valor_reavaliacao or bem.valor_avaliacao
    return Decimal(valor) if valor else None


def total_avaliacao(bens: list[BemPenhorado]) -> Decimal | None:
    valores = [v for v in (ultima_avaliacao(b) for b in bens) if v is not None]
    return sum(valores, Decimal("0")) if valores else None


def _parte_texto(parte: Parte) -> str:
    texto = f"{ou_vazio(parte.nome)} – CPF/CNPJ: {ou_vazio(parte.cpf_cnpj)}"
    if parte.advogados:
        advogado = parte.advogados[0]
        oab = f" ({advogado.oab})" if advogado.oab else ""
        texto += f", representado(a) por {advogado.nome}{oab}"
    return texto


def _onus(bem: BemPenhorado, hoje: date) -> str:
    partes = [p for p in (bem.hipoteca, bem.outras_penhoras, bem.enfiteuse) if p]
    if partes:
        return "; ".join(partes)
    return (
        f"Conforme consulta à certidão atualizada do Registro de Imóveis na data {hoje:%d/%m/%Y}, "
        "não há registro ou certificação de ônus, recursos ou processos pendentes "
        "incidentes sobre o bem"
    )


def _bem_view(numero: int, bem: BemPenhorado, hoje: date) -> BemView:
    avaliacao = ultima_avaliacao(bem)
    return BemView(
        numero=numero,
        matricula=ou_vazio(bem.matricula),
        descricao=ou_vazio(bem.descricao),
        onus=_onus(bem, hoje),
        localizacao=ou_vazio(bem.localizacao),
        fiel_depositario=ou_vazio(bem.fiel_depositario),
        avaliacao=moeda_com_extenso(str(avaliacao)) if avaliacao is not None else VAZIO,
    )


def montar_contexto(
    checklist: Checklist, leilao: Leilao, settings: Settings, hoje: date
) -> dict[str, object]:
    total = total_avaliacao(checklist.bens)
    return {
        "vara": ou_vazio(checklist.vara),
        "juiz": ou_vazio(checklist.juiz),
        "numero_processo": ou_vazio(checklist.numero_processo),
        "valor_execucao": moeda_com_extenso(checklist.execucao.valor_divida),
        "exequente": _parte_texto(checklist.exequente),
        "executados": [_parte_texto(e) for e in checklist.executados] or [VAZIO],
        "primeiro_data": formatar_data(leilao.primeiro_leilao_em, settings),
        "primeiro_hora": formatar_hora(leilao.primeiro_leilao_em, settings),
        "segundo_data": formatar_data(leilao.segundo_leilao_em, settings),
        "segundo_hora": formatar_hora(leilao.segundo_leilao_em, settings),
        "leiloeiro_site": settings.LEILOEIRO_SITE,
        "leiloeiro_nome": settings.LEILOEIRO_NOME,
        "leiloeiro_jucepa": settings.LEILOEIRO_JUCEPA,
        "leiloeiro_telefone": settings.LEILOEIRO_TELEFONE,
        "bens": [_bem_view(i, b, hoje) for i, b in enumerate(checklist.bens, start=1)],
        "lance_primeiro": moeda_com_extenso(str(total)) if total is not None else VAZIO,
        "lance_segundo": moeda_com_extenso(str(lance_segundo(total)))
        if total is not None
        else VAZIO,
        "observacoes": checklist.observacoes_leilao,
    }


def renderizar_edital(checklist: Checklist, leilao: Leilao, settings: Settings, hoje: date) -> str:
    template = _env.get_template("edital.md.j2")
    return template.render(**montar_contexto(checklist, leilao, settings, hoje))


async def criar_edital(session: AsyncSession, settings: Settings, leilao_id: UUID) -> Edital:
    leilao = await agenda_service.obter_leilao(session, leilao_id)
    if leilao.status == agenda_service.STATUS_CANCELADO:
        raise ErroDominio(409, "Leilão cancelado não gera edital")
    checklist = checklist_de(leilao.processo)
    if checklist is None:
        raise ErroDominio(409, "Processo sem checklist")
    conteudo = renderizar_edital(checklist, leilao, settings, agenda_service.hoje_local(settings))
    edital = Edital(leilao_id=leilao.id, conteudo_markdown=conteudo, criado_em=datetime.now(UTC))
    session.add(edital)
    await session.commit()
    await session.refresh(edital)
    await session.refresh(leilao)
    return edital


async def obter(session: AsyncSession, edital_id: UUID) -> Edital:
    edital = await session.get(Edital, edital_id)
    if edital is None:
        raise ErroDominio(404, "Edital não encontrado")
    return edital


async def atualizar(session: AsyncSession, edital_id: UUID, conteudo: str) -> Edital:
    edital = await obter(session, edital_id)
    edital.conteudo_markdown = conteudo
    edital.atualizado_em = datetime.now(UTC)
    await session.commit()
    await session.refresh(edital)
    return edital


def nome_download(edital: Edital, formato: str) -> str:
    identificador = edital.leilao.processo.numero_processo or str(edital.id)
    identificador = re.sub(r"[^A-Za-z0-9.-]+", "_", identificador)
    return f"edital-{identificador}.{formato}"
