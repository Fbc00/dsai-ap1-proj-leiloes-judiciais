from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.editais import service
from app.editais.docx import markdown_para_docx
from app.editais.schemas import EditalCreate, EditalOut, EditalUpdate, edital_out
from app.security.deps import usuario_atual

router = APIRouter(prefix="/api/editais", tags=["editais"], dependencies=[Depends(usuario_atual)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
Formato = Literal["md", "docx"]


@router.post("", status_code=201, response_model=EditalOut)
async def criar(dados: EditalCreate, session: SessionDep, settings: SettingsDep) -> EditalOut:
    return edital_out(await service.criar_edital(session, settings, dados.leilao_id))


@router.get("/{edital_id}", response_model=EditalOut)
async def obter(edital_id: UUID, session: SessionDep) -> EditalOut:
    return edital_out(await service.obter(session, edital_id))


@router.put("/{edital_id}", response_model=EditalOut)
async def atualizar(edital_id: UUID, dados: EditalUpdate, session: SessionDep) -> EditalOut:
    return edital_out(await service.atualizar(session, edital_id, dados.conteudo_markdown))


@router.get("/{edital_id}/download")
async def download(edital_id: UUID, session: SessionDep, formato: Formato = "md") -> Response:
    edital = await service.obter(session, edital_id)
    disposicao = f'attachment; filename="{service.nome_download(edital, formato)}"'
    if formato == "docx":
        return Response(
            content=markdown_para_docx(edital.conteudo_markdown),
            media_type=service.TIPO_DOCX,
            headers={"Content-Disposition": disposicao},
        )
    return Response(
        content=edital.conteudo_markdown,
        media_type=service.TIPO_MARKDOWN,
        headers={"Content-Disposition": disposicao},
    )
