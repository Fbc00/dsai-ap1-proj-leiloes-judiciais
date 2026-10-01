from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.logging import usuario_id_var
from app.security.auth import usuario_por_token
from app.security.models import Usuario

COOKIE_SESSAO: str = "session"


async def usuario_atual(
    request: Request, session: Annotated[AsyncSession, Depends(get_session)]
) -> Usuario:
    token = request.cookies.get(COOKIE_SESSAO)
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    usuario = await usuario_por_token(session, token, datetime.now(UTC))
    if usuario is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    usuario_id_var.set(str(usuario.id))
    request.state.usuario_id = str(usuario.id)
    return usuario


UsuarioAtual = Annotated[Usuario, Depends(usuario_atual)]


async def exige_admin(usuario: UsuarioAtual) -> Usuario:
    if usuario.perfil != "admin":
        raise HTTPException(status_code=403, detail="Sem permissão")
    return usuario


Admin = Annotated[Usuario, Depends(exige_admin)]
