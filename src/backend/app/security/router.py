import secrets
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.security.auth import (
    atualizar_usuario,
    autenticar,
    criar_sessao,
    criar_usuario,
    encerrar_sessao,
    listar_usuarios,
    trocar_propria_senha,
)
from app.security.csrf import COOKIE_CSRF
from app.security.deps import COOKIE_SESSAO, Admin, UsuarioAtual, exige_admin
from app.security.ratelimit import (
    ip_cliente,
    limpar_tentativas,
    registrar_falha,
    segundos_bloqueado,
)
from app.security.schemas import LoginIn, SenhaIn, UsuarioCreate, UsuarioOut, UsuarioUpdate

router = APIRouter(prefix="/api/auth", tags=["auth"])
usuarios_router = APIRouter(
    prefix="/api/usuarios", tags=["usuarios"], dependencies=[Depends(exige_admin)]
)

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.post("/login", response_model=UsuarioOut)
async def login(
    dados: LoginIn, request: Request, response: Response, session: SessionDep, settings: SettingsDep
) -> UsuarioOut:
    agora = datetime.now(UTC)
    chaves = [f"user:{dados.username}", f"ip:{ip_cliente(request, settings.TRUST_PROXY)}"]
    espera = await segundos_bloqueado(session, chaves, settings, agora)
    if espera:
        raise HTTPException(
            status_code=429,
            detail=f"Muitas tentativas. Tente novamente em {espera} segundos",
            headers={"Retry-After": str(espera)},
        )
    usuario = await autenticar(session, dados.username, dados.password)
    if usuario is None:
        await registrar_falha(session, chaves, agora)
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    await limpar_tentativas(session, chaves[0])
    token, _ = await criar_sessao(session, usuario, settings.SESSION_TTL_HOURS)
    max_age = settings.SESSION_TTL_HOURS * 3600
    response.set_cookie(
        COOKIE_SESSAO,
        token,
        max_age=max_age,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    response.set_cookie(
        COOKIE_CSRF,
        secrets.token_urlsafe(32),
        max_age=max_age,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        path="/",
    )
    return UsuarioOut.model_validate(usuario)


@router.post("/logout", status_code=204)
async def logout(request: Request, session: SessionDep, _: UsuarioAtual) -> Response:
    await encerrar_sessao(session, request.cookies.get(COOKIE_SESSAO, ""))
    response = Response(status_code=204)
    response.delete_cookie(COOKIE_SESSAO, path="/")
    response.delete_cookie(COOKIE_CSRF, path="/")
    return response


@router.get("/me", response_model=UsuarioOut)
async def me(usuario: UsuarioAtual) -> UsuarioOut:
    return UsuarioOut.model_validate(usuario)


@router.put("/senha", status_code=204)
async def trocar_senha(
    dados: SenhaIn, request: Request, session: SessionDep, usuario: UsuarioAtual
) -> Response:
    await trocar_propria_senha(session, usuario, dados, request.cookies.get(COOKIE_SESSAO, ""))
    return Response(status_code=204)


@usuarios_router.get("", response_model=list[UsuarioOut])
async def listar(session: SessionDep) -> list[UsuarioOut]:
    return [UsuarioOut.model_validate(u) for u in await listar_usuarios(session)]


@usuarios_router.post("", status_code=201, response_model=UsuarioOut)
async def criar(dados: UsuarioCreate, session: SessionDep) -> UsuarioOut:
    usuario = await criar_usuario(session, dados.username, dados.nome, dados.senha, dados.perfil)
    return UsuarioOut.model_validate(usuario)


@usuarios_router.patch("/{usuario_id}", response_model=UsuarioOut)
async def atualizar(
    usuario_id: UUID, dados: UsuarioUpdate, session: SessionDep, ator: Admin
) -> UsuarioOut:
    return UsuarioOut.model_validate(await atualizar_usuario(session, ator, usuario_id, dados))
