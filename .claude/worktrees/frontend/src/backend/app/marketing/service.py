from datetime import UTC, datetime
from io import BytesIO
from uuid import UUID

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agenda import service as agenda_service
from app.agenda.models import Leilao
from app.config import Settings
from app.editais.service import lance_segundo, ultima_avaliacao
from app.email.sender import EnvioEmailFalhou, send_email
from app.errors import ErroDominio
from app.marketing.models import EnvioMarketing
from app.processos.service import checklist_de

COLUNAS: list[str] = [
    "Nº Processo",
    "Vara",
    "Executado(s)",
    "Bem",
    "Matrícula",
    "Avaliação (R$)",
    "Lance 1º (R$)",
    "Lance 2º (R$)",
    "1º Leilão",
    "2º Leilão",
    "Edital",
]
NOME_PLANILHA: str = "leiloes.xlsx"
FORMATO_MOEDA: str = "#,##0.00"
COLUNAS_MOEDA: tuple[int, ...] = (6, 7, 8)
STATUS_ENVIADO: str = "enviado"
STATUS_ERRO: str = "erro"


def _data_hora(dt: datetime, settings: Settings) -> str:
    return dt.astimezone(settings.tz).strftime("%d/%m/%Y %H:%M")


async def linhas_planilha(session: AsyncSession, settings: Settings) -> list[list[object]]:
    stmt = (
        select(Leilao)
        .where(Leilao.status == agenda_service.STATUS_AGENDADO)
        .order_by(Leilao.primeiro_leilao_em.asc())
    )
    linhas: list[list[object]] = []
    for leilao in (await session.execute(stmt)).scalars().all():
        checklist = checklist_de(leilao.processo)
        if checklist is None:
            continue
        executados = "; ".join(e.nome for e in checklist.executados) or ""
        edital = "Sim" if leilao.editais else "Não"
        for bem in checklist.bens:
            avaliacao = ultima_avaliacao(bem)
            linhas.append(
                [
                    checklist.numero_processo or "",
                    checklist.vara or "",
                    executados,
                    bem.descricao,
                    bem.matricula or "",
                    float(avaliacao) if avaliacao is not None else None,
                    float(avaliacao) if avaliacao is not None else None,
                    float(lance_segundo(avaliacao)) if avaliacao is not None else None,
                    _data_hora(leilao.primeiro_leilao_em, settings),
                    _data_hora(leilao.segundo_leilao_em, settings),
                    edital,
                ]
            )
    return linhas


def montar_planilha(linhas: list[list[object]]) -> bytes:
    workbook = Workbook()
    aba = workbook.active
    aba.title = "Leilões"
    aba.append(COLUNAS)
    for celula in aba[1]:
        celula.font = Font(bold=True)
    for linha in linhas:
        aba.append(linha)
    for coluna in COLUNAS_MOEDA:
        for celula in aba.iter_rows(min_row=2, min_col=coluna, max_col=coluna):
            celula[0].number_format = FORMATO_MOEDA
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


async def gerar_planilha(session: AsyncSession, settings: Settings) -> bytes:
    return montar_planilha(await linhas_planilha(session, settings))


def _corpo_email(leilao: Leilao, settings: Settings) -> str:
    checklist = checklist_de(leilao.processo)
    bens = "\n".join(f"- {b.descricao}" for b in checklist.bens) if checklist else ""
    numero = leilao.processo.numero_processo or str(leilao.id)
    return (
        f"Leilão agendado para o processo {numero}.\n\n"
        f"1º leilão: {_data_hora(leilao.primeiro_leilao_em, settings)}\n"
        f"2º leilão: {_data_hora(leilao.segundo_leilao_em, settings)}\n\n"
        f"Bens:\n{bens}\n\n"
        f"Planilha atualizada em anexo ({NOME_PLANILHA})."
    )


async def enviar(session: AsyncSession, settings: Settings, leilao_id: UUID) -> EnvioMarketing:
    leilao = await agenda_service.obter_leilao(session, leilao_id)
    if leilao.status == agenda_service.STATUS_CANCELADO:
        raise ErroDominio(409, "Leilão cancelado não é enviado ao marketing")
    if not leilao.editais:
        raise ErroDominio(409, "Gere o edital antes de enviar")
    planilha = await gerar_planilha(session, settings)
    numero = leilao.processo.numero_processo or str(leilao.id)
    envio = EnvioMarketing(
        leilao_id=leilao.id,
        destinatarios=settings.marketing_emails,
        enviado_em=datetime.now(UTC),
        status=STATUS_ENVIADO,
    )
    try:
        await send_email(
            settings,
            to=settings.marketing_emails,
            subject=f"Leilão agendado – processo {numero}",
            body=_corpo_email(leilao, settings),
            attachment=(NOME_PLANILHA, planilha),
        )
    except EnvioEmailFalhou as exc:
        envio.status = STATUS_ERRO
        envio.erro = str(exc)
        session.add(envio)
        await session.commit()
        raise ErroDominio(502, "Falha ao enviar e-mail") from exc
    session.add(envio)
    await session.commit()
    await session.refresh(envio)
    return envio


async def listar_envios(session: AsyncSession) -> list[EnvioMarketing]:
    stmt = select(EnvioMarketing).order_by(EnvioMarketing.enviado_em.desc())
    return list((await session.execute(stmt)).scalars().all())
