from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.marketing import service
from app.marketing.schemas import EnvioCreate, EnvioOut, envio_out
from app.security.deps import usuario_atual

router = APIRouter(
    prefix="/api/marketing", tags=["marketing"], dependencies=[Depends(usuario_atual)]
)

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

TIPO_XLSX: str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/planilha")
async def planilha(session: SessionDep, settings: SettingsDep) -> Response:
    conteudo = await service.gerar_planilha(session, settings)
    return Response(
        content=conteudo,
        media_type=TIPO_XLSX,
        headers={"Content-Disposition": f'attachment; filename="{service.NOME_PLANILHA}"'},
    )


@router.post("/envios", status_code=201, response_model=EnvioOut)
async def enviar(dados: EnvioCreate, session: SessionDep, settings: SettingsDep) -> EnvioOut:
    return envio_out(await service.enviar(session, settings, dados.leilao_id))


@router.get("/envios", response_model=list[EnvioOut])
async def listar(session: SessionDep) -> list[EnvioOut]:
    return [envio_out(e) for e in await service.listar_envios(session)]
