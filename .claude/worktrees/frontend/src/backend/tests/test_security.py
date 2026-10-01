from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.security.auth import criar_sessao, criar_usuario, usuario_por_token
from app.security.models import Sessao, TentativaLogin, Usuario
from app.security.ratelimit import ip_cliente
from tests.conftest import USUARIO_TESTE, logar

SENHA = "senha-forte-123"


@pytest.fixture
async def usuario(session: AsyncSession) -> Usuario:
    return await criar_usuario(session, "ana", "Ana Lima", SENHA)


async def login(cliente: AsyncClient, username: str = "ana", password: str = SENHA) -> Response:
    return await cliente.post("/api/auth/login", json={"username": username, "password": password})


async def test_login_ok_seta_cookies_de_sessao_e_csrf(
    cliente: AsyncClient, usuario: Usuario
) -> None:
    resposta = await login(cliente)
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["username"] == "ana"
    assert corpo["nome"] == "Ana Lima"
    assert corpo["perfil"] == "admin"
    assert corpo["ativo"] is True
    assert "session" in resposta.cookies
    assert "csrf_token" in resposta.cookies
    set_cookie = "\n".join(resposta.headers.get_list("set-cookie")).lower()
    assert "httponly" in set_cookie
    assert set_cookie.count("samesite=strict") == 2


async def test_senha_errada_401_generico(cliente: AsyncClient, usuario: Usuario) -> None:
    resposta = await login(cliente, password="errada")
    assert resposta.status_code == 401
    assert resposta.json() == {"detail": "Credenciais inválidas"}


async def test_usuario_inexistente_401_identico(cliente: AsyncClient, usuario: Usuario) -> None:
    resposta = await login(cliente, username="ninguem")
    assert resposta.status_code == 401
    assert resposta.json() == {"detail": "Credenciais inválidas"}


async def test_usuario_inativo_nao_loga_401_identico(
    cliente: AsyncClient, usuario: Usuario, session: AsyncSession
) -> None:
    usuario.ativo = False
    await session.commit()
    resposta = await login(cliente)
    assert resposta.status_code == 401
    assert resposta.json() == {"detail": "Credenciais inválidas"}


async def test_login_com_sql_injection_nao_autentica(
    cliente: AsyncClient, usuario: Usuario
) -> None:
    resposta = await login(cliente, username="ana' OR 1=1 --", password="' OR '1'='1")
    assert resposta.status_code == 401
    assert resposta.json() == {"detail": "Credenciais inválidas"}
    assert (await cliente.get("/api/auth/me")).status_code == 401


async def test_sexta_tentativa_bloqueia_com_retry_after(
    cliente: AsyncClient, usuario: Usuario
) -> None:
    for _ in range(5):
        assert (await login(cliente, password="errada")).status_code == 401
    resposta = await login(cliente, password="errada")
    assert resposta.status_code == 429
    assert int(resposta.headers["Retry-After"]) > 0
    assert resposta.json()["detail"].startswith("Muitas tentativas. Tente novamente em ")


async def test_bloqueio_vale_mesmo_com_senha_certa(cliente: AsyncClient, usuario: Usuario) -> None:
    for _ in range(5):
        await login(cliente, password="errada")
    assert (await login(cliente)).status_code == 429


async def test_bloqueio_por_ip_atinge_outro_usuario(
    cliente: AsyncClient, usuario: Usuario, session: AsyncSession
) -> None:
    await criar_usuario(session, "bia", "Bia Souza", SENHA)
    for _ in range(5):
        await login(cliente, password="errada")
    assert (await login(cliente, username="bia")).status_code == 429


async def test_sucesso_limpa_tentativas_do_usuario(
    cliente: AsyncClient, usuario: Usuario, session: AsyncSession
) -> None:
    for _ in range(3):
        await login(cliente, password="errada")
    assert (await login(cliente)).status_code == 200
    restantes = (
        (await session.execute(select(TentativaLogin).where(TentativaLogin.chave == "user:ana")))
        .scalars()
        .all()
    )
    assert restantes == []


async def test_rota_protegida_sem_cookie_401(cliente: AsyncClient) -> None:
    resposta = await cliente.get("/api/auth/me")
    assert resposta.status_code == 401
    assert resposta.json() == {"detail": "Não autenticado"}


async def test_me_retorna_usuario_logado(cliente_logado: AsyncClient) -> None:
    resposta = await cliente_logado.get("/api/auth/me")
    assert resposta.status_code == 200
    assert resposta.json()["username"] == "admin"
    assert resposta.json()["perfil"] == "admin"


async def test_post_sem_csrf_header_403(cliente_logado: AsyncClient) -> None:
    del cliente_logado.headers["X-CSRF-Token"]
    resposta = await cliente_logado.post("/api/auth/logout")
    assert resposta.status_code == 403
    assert resposta.json() == {"detail": "CSRF inválido"}


async def test_post_com_csrf_errado_403(cliente_logado: AsyncClient) -> None:
    cliente_logado.headers["X-CSRF-Token"] = "x" * 43
    resposta = await cliente_logado.post("/api/auth/logout")
    assert resposta.status_code == 403


async def test_logout_apaga_cookies_e_invalida_sessao(cliente_logado: AsyncClient) -> None:
    token = cliente_logado.cookies["session"]
    resposta = await cliente_logado.post("/api/auth/logout")
    assert resposta.status_code == 204
    assert "session" not in cliente_logado.cookies
    cliente_logado.cookies.set("session", token, domain="test")
    assert (await cliente_logado.get("/api/auth/me")).status_code == 401


async def test_sessao_expirada_401(cliente_logado: AsyncClient, session: AsyncSession) -> None:
    await session.execute(update(Sessao).values(expira_em=datetime.now(UTC) - timedelta(seconds=1)))
    await session.commit()
    assert (await cliente_logado.get("/api/auth/me")).status_code == 401


async def test_sessao_no_limite_exato_ja_expirou(session: AsyncSession, usuario: Usuario) -> None:
    token, sessao = await criar_sessao(session, usuario, ttl_horas=1)
    assert await usuario_por_token(session, token, agora=sessao.expira_em) is None
    assert (
        await usuario_por_token(session, token, agora=sessao.expira_em - timedelta(seconds=1))
        is not None
    )


async def test_trocar_senha_invalida_outras_sessoes_e_mantem_a_atual(
    cliente_logado: AsyncClient, transport: ASGITransport
) -> None:
    async with AsyncClient(transport=transport, base_url="http://test") as outro:
        await logar(outro, USUARIO_TESTE["username"], USUARIO_TESTE["senha"])
        assert (await outro.get("/api/auth/me")).status_code == 200

        resposta = await cliente_logado.put(
            "/api/auth/senha",
            json={"senha_atual": USUARIO_TESTE["senha"], "nova_senha": "nova-senha-forte-456"},
        )
        assert resposta.status_code == 204
        assert (await cliente_logado.get("/api/auth/me")).status_code == 200
        assert (await outro.get("/api/auth/me")).status_code == 401

        outro.cookies.clear()
        velha = await outro.post(
            "/api/auth/login",
            json={"username": USUARIO_TESTE["username"], "password": USUARIO_TESTE["senha"]},
        )
        assert velha.status_code == 401
        nova = await outro.post(
            "/api/auth/login",
            json={"username": USUARIO_TESTE["username"], "password": "nova-senha-forte-456"},
        )
        assert nova.status_code == 200


async def test_trocar_senha_atual_errada_400(cliente_logado: AsyncClient) -> None:
    resposta = await cliente_logado.put(
        "/api/auth/senha", json={"senha_atual": "errada", "nova_senha": "nova-senha-forte-456"}
    )
    assert resposta.status_code == 400
    assert resposta.json() == {"detail": "Senha atual incorreta"}
    assert (await cliente_logado.get("/api/auth/me")).status_code == 200


async def test_trocar_senha_nova_curta_422(cliente_logado: AsyncClient) -> None:
    resposta = await cliente_logado.put(
        "/api/auth/senha", json={"senha_atual": USUARIO_TESTE["senha"], "nova_senha": "curta"}
    )
    assert resposta.status_code == 422


def _request_com_xff(valor: str) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "query_string": b"",
        "scheme": "http",
        "server": ("test", 80),
        "client": ("10.0.0.1", 1234),
        "headers": [(b"x-forwarded-for", valor.encode())],
    }
    return Request(scope)


def test_ip_cliente_usa_primeiro_x_forwarded_for() -> None:
    request = _request_com_xff("203.0.113.9, 10.0.0.1")
    assert ip_cliente(request, trust_proxy=True) == "203.0.113.9"
    assert ip_cliente(request, trust_proxy=False) == "10.0.0.1"
