import asyncio
import logging
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agenda import service as agenda_service
from app.agenda.models import Leilao
from app.agenda.schemas import leilao_out
from app.config import Settings
from app.errors import ErroDominio
from app.llm.base import LLMClient
from app.pdf.extract import extract_text
from app.processos.models import ChecklistDB, Processo, RelatorioDB
from app.processos.prompts import SYSTEM_CHECKLIST, SYSTEM_RELATORIO, user_prompt
from app.processos.schemas import Checklist, ProcessoDetalheOut, Relatorio

logger = logging.getLogger("app.processos")

MAGIC_PDF: bytes = b"%PDF-"
NOME_PADRAO: str = "processo.pdf"


def _nome_seguro(nome_arquivo: str) -> str:
    nome = Path(nome_arquivo.replace("\\", "/")).name.strip()
    return (nome or NOME_PADRAO)[:255]


def _caminho_pdf(settings: Settings, processo_id: UUID) -> Path:
    return settings.MEDIA_ROOT / "processos" / f"{processo_id}.pdf"


async def salvar_upload(
    session: AsyncSession, settings: Settings, nome_arquivo: str, content_type: str, conteudo: bytes
) -> Processo:
    if content_type != "application/pdf" or not conteudo.startswith(MAGIC_PDF):
        raise ErroDominio(415, "Arquivo precisa ser PDF")
    if len(conteudo) > settings.max_upload_bytes:
        raise ErroDominio(413, f"Arquivo acima de {settings.MAX_UPLOAD_MB} MB")
    processo = Processo(
        nome_arquivo=_nome_seguro(nome_arquivo),
        caminho_pdf="",
        status="recebido",
        criado_em=datetime.now(UTC),
    )
    session.add(processo)
    await session.flush()
    destino = _caminho_pdf(settings, processo.id)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(conteudo)
    processo.caminho_pdf = str(destino)
    await session.commit()
    await session.refresh(processo)
    return processo


async def listar(session: AsyncSession) -> list[Processo]:
    stmt = select(Processo).order_by(Processo.criado_em.desc())
    return list((await session.execute(stmt)).scalars().all())


async def obter(session: AsyncSession, processo_id: UUID) -> Processo:
    processo = await session.get(Processo, processo_id)
    if processo is None:
        raise ErroDominio(404, "Processo não encontrado")
    return processo


def checklist_de(processo: Processo) -> Checklist | None:
    return Checklist.model_validate(processo.checklist.dados) if processo.checklist else None


def relatorio_de(processo: Processo) -> Relatorio | None:
    return Relatorio.model_validate(processo.relatorio.dados) if processo.relatorio else None


def detalhe_out(processo: Processo, leilao: Leilao | None = None) -> ProcessoDetalheOut:
    return ProcessoDetalheOut(
        id=processo.id,
        nome_arquivo=processo.nome_arquivo,
        status=processo.status,  # type: ignore[arg-type]
        numero_processo=processo.numero_processo,
        vara=processo.vara,
        erro=processo.erro,
        criado_em=processo.criado_em,
        analisado_em=processo.analisado_em,
        checklist=checklist_de(processo),
        relatorio=relatorio_de(processo),
        leilao=leilao_out(leilao) if leilao is not None else None,
    )


async def detalhe(session: AsyncSession, processo_id: UUID) -> ProcessoDetalheOut:
    processo = await obter(session, processo_id)
    leilao = await agenda_service.leilao_ativo(session, processo.id)
    return detalhe_out(processo, leilao)


async def _marcar_erro(session: AsyncSession, processo: Processo, mensagem: str) -> None:
    processo.status = "erro"
    processo.erro = mensagem
    await session.commit()


async def _gravar_checklist(
    session: AsyncSession, processo: Processo, checklist: Checklist
) -> None:
    dados = checklist.model_dump(mode="json")
    if processo.checklist is None:
        processo.checklist = ChecklistDB(dados=dados)
    else:
        processo.checklist.dados = dados
    processo.numero_processo = checklist.numero_processo
    processo.vara = checklist.vara


async def _gravar_relatorio(
    session: AsyncSession, processo: Processo, relatorio: Relatorio
) -> None:
    dados = relatorio.model_dump(mode="json")
    if processo.relatorio is None:
        processo.relatorio = RelatorioDB(dados=dados)
    else:
        processo.relatorio.dados = dados


async def analisar(
    session: AsyncSession, settings: Settings, llm: LLMClient, processo_id: UUID
) -> Processo:
    processo = await obter(session, processo_id)
    processo.status = "analisando"
    processo.erro = None
    await session.commit()

    try:
        texto = await asyncio.to_thread(extract_text, Path(processo.caminho_pdf))
    except Exception:
        logger.exception("falha ao ler PDF do processo %s", processo.id)
        await _marcar_erro(session, processo, "Não foi possível ler o PDF")
        raise ErroDominio(422, "Não foi possível ler o PDF") from None
    if not texto:
        await _marcar_erro(session, processo, "PDF sem camada de texto")
        raise ErroDominio(422, "PDF sem camada de texto")
    processo.texto_extraido = texto
    recorte = texto[: settings.LLM_MAX_CHARS]

    try:
        checklist = await llm.structured(
            system=SYSTEM_CHECKLIST, user=user_prompt(recorte), schema=Checklist
        )
        relatorio = await llm.structured(
            system=SYSTEM_RELATORIO, user=user_prompt(recorte), schema=Relatorio
        )
    except Exception:
        logger.exception("falha do LLM ao analisar processo %s", processo.id)
        await _marcar_erro(session, processo, "Falha ao analisar processo")
        raise ErroDominio(502, "Falha ao analisar processo") from None

    await _gravar_checklist(session, processo, checklist)
    await _gravar_relatorio(session, processo, relatorio)
    processo.status = "analisado"
    processo.analisado_em = datetime.now(UTC)
    await session.commit()
    await session.refresh(processo)
    return processo


async def editar_checklist(
    session: AsyncSession, processo_id: UUID, checklist: Checklist
) -> Checklist:
    processo = await obter(session, processo_id)
    await _gravar_checklist(session, processo, checklist)
    await session.commit()
    await session.refresh(processo)
    return checklist


async def excluir(session: AsyncSession, processo_id: UUID) -> None:
    processo = await obter(session, processo_id)
    if await agenda_service.leilao_ativo(session, processo.id) is not None:
        raise ErroDominio(409, "Processo tem leilão agendado")
    caminho = Path(processo.caminho_pdf)
    await session.delete(processo)
    await session.commit()
    caminho.unlink(missing_ok=True)
