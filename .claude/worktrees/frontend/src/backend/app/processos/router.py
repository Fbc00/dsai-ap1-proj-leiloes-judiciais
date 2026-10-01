from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.llm import LLMDep
from app.processos import service
from app.processos.schemas import Checklist, ProcessoDetalheOut, ProcessoOut
from app.security.deps import exige_admin, usuario_atual

router = APIRouter(
    prefix="/api/processos", tags=["processos"], dependencies=[Depends(usuario_atual)]
)

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.post("", status_code=201, response_model=ProcessoOut)
async def upload(arquivo: UploadFile, session: SessionDep, settings: SettingsDep) -> ProcessoOut:
    conteudo = await arquivo.read()
    processo = await service.salvar_upload(
        session,
        settings,
        arquivo.filename or service.NOME_PADRAO,
        arquivo.content_type or "",
        conteudo,
    )
    return ProcessoOut.model_validate(processo)


@router.get("", response_model=list[ProcessoOut])
async def listar(session: SessionDep) -> list[ProcessoOut]:
    return [ProcessoOut.model_validate(p) for p in await service.listar(session)]


@router.get("/{processo_id}", response_model=ProcessoDetalheOut)
async def detalhe(processo_id: UUID, session: SessionDep) -> ProcessoDetalheOut:
    return await service.detalhe(session, processo_id)


@router.post("/{processo_id}/analisar", response_model=ProcessoDetalheOut)
async def analisar(
    processo_id: UUID, session: SessionDep, settings: SettingsDep, llm: LLMDep
) -> ProcessoDetalheOut:
    processo = await service.analisar(session, settings, llm, processo_id)
    return await service.detalhe(session, processo.id)


@router.put("/{processo_id}/checklist", response_model=Checklist)
async def editar_checklist(
    processo_id: UUID, checklist: Checklist, session: SessionDep
) -> Checklist:
    return await service.editar_checklist(session, processo_id, checklist)


@router.delete("/{processo_id}", status_code=204, dependencies=[Depends(exige_admin)])
async def excluir(processo_id: UUID, session: SessionDep) -> Response:
    await service.excluir(session, processo_id)
    return Response(status_code=204)
