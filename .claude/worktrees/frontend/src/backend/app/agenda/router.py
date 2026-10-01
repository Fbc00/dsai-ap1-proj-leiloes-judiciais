from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.agenda import service
from app.agenda.schemas import (
    BloqueioCreate,
    BloqueioOut,
    FeriadoOut,
    LeilaoCreate,
    LeilaoOut,
    SugestaoOut,
    leilao_out,
)
from app.config import Settings, get_settings
from app.db import get_session
from app.security.deps import exige_admin, usuario_atual

router = APIRouter(prefix="/api/agenda", tags=["agenda"], dependencies=[Depends(usuario_atual)])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
SO_ADMIN = [Depends(exige_admin)]


@router.get("/leiloes", response_model=list[LeilaoOut])
async def listar_leiloes(
    session: SessionDep, settings: SettingsDep, inicio: date | None = None, fim: date | None = None
) -> list[LeilaoOut]:
    leiloes = await service.listar_leiloes(session, settings, inicio, fim)
    return [leilao_out(leilao) for leilao in leiloes]


@router.get("/sugestao", response_model=SugestaoOut)
async def sugestao(session: SessionDep, settings: SettingsDep) -> SugestaoOut:
    return await service.sugerir_datas(session, settings, service.hoje_local(settings))


@router.get("/feriados", response_model=list[FeriadoOut])
async def feriados(settings: SettingsDep, ano: int | None = None) -> list[FeriadoOut]:
    return service.listar_feriados(ano or service.hoje_local(settings).year)


@router.post("/leiloes", status_code=201, response_model=LeilaoOut)
async def criar_leilao(
    dados: LeilaoCreate, session: SessionDep, settings: SettingsDep
) -> LeilaoOut:
    leilao = await service.criar_leilao(session, settings, dados, service.hoje_local(settings))
    return leilao_out(leilao)


@router.delete("/leiloes/{leilao_id}", status_code=204, dependencies=SO_ADMIN)
async def cancelar(leilao_id: UUID, session: SessionDep) -> Response:
    await service.cancelar(session, leilao_id)
    return Response(status_code=204)


@router.get("/bloqueios", response_model=list[BloqueioOut])
async def listar_bloqueios(session: SessionDep) -> list[BloqueioOut]:
    return [BloqueioOut.model_validate(b) for b in await service.listar_bloqueios(session)]


@router.post("/bloqueios", status_code=201, response_model=BloqueioOut, dependencies=SO_ADMIN)
async def criar_bloqueio(dados: BloqueioCreate, session: SessionDep) -> BloqueioOut:
    return BloqueioOut.model_validate(await service.criar_bloqueio(session, dados))


@router.delete("/bloqueios/{bloqueio_id}", status_code=204, dependencies=SO_ADMIN)
async def excluir_bloqueio(bloqueio_id: UUID, session: SessionDep) -> Response:
    await service.excluir_bloqueio(session, bloqueio_id)
    return Response(status_code=204)
