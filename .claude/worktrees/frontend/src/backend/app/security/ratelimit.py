from datetime import datetime, timedelta

from fastapi import Request
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.security.models import TentativaLogin


def ip_cliente(request: Request, trust_proxy: bool) -> str:
    if trust_proxy:
        encaminhado = request.headers.get("x-forwarded-for", "")
        primeiro = encaminhado.split(",")[0].strip()
        if primeiro:
            return primeiro
    return request.client.host if request.client else "desconhecido"


async def segundos_bloqueado(
    session: AsyncSession, chaves: list[str], settings: Settings, agora: datetime
) -> int:
    inicio_janela = agora - timedelta(minutes=settings.LOGIN_JANELA_MIN)
    for chave in chaves:
        stmt = select(func.count(), func.min(TentativaLogin.em)).where(
            TentativaLogin.chave == chave, TentativaLogin.em >= inicio_janela
        )
        total, primeira = (await session.execute(stmt)).one()
        if total >= settings.LOGIN_MAX_TENTATIVAS and primeira is not None:
            libera_em = primeira + timedelta(minutes=settings.LOGIN_JANELA_MIN)
            return max(1, int((libera_em - agora).total_seconds()))
    return 0


async def registrar_falha(session: AsyncSession, chaves: list[str], agora: datetime) -> None:
    session.add_all([TentativaLogin(chave=chave, em=agora) for chave in chaves])
    await session.commit()


async def limpar_tentativas(session: AsyncSession, chave: str) -> None:
    await session.execute(delete(TentativaLogin).where(TentativaLogin.chave == chave))
    await session.commit()
