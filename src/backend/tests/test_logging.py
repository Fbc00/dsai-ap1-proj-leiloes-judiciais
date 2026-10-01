import json
import logging
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_engine
from app.logging import JsonFormatter, configurar_logging
from app.security.auth import criar_usuario

SENHA_SECRETA = "segredo-nao-logue-123"


def _linhas(caplog: pytest.LogCaptureFixture) -> list[dict[str, object]]:
    formatter = JsonFormatter()
    return [json.loads(formatter.format(r)) for r in caplog.records if r.name == "app.request"]


def _tudo_formatado(caplog: pytest.LogCaptureFixture) -> str:
    formatter = JsonFormatter()
    return "\n".join(formatter.format(r) for r in caplog.records)


async def test_request_gera_linha_json_com_request_id_do_header(
    cliente: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    resposta = await cliente.get("/api/health", headers={"X-Request-ID": "req-abc-123"})
    assert resposta.status_code == 200
    assert resposta.headers["x-request-id"] == "req-abc-123"
    linha = _linhas(caplog)[-1]
    assert linha["request_id"] == "req-abc-123"
    assert linha["method"] == "GET"
    assert linha["path"] == "/api/health"
    assert linha["status"] == 200
    assert linha["level"] == "INFO"
    assert linha["logger"] == "app.request"
    assert linha["msg"] == "request"
    assert isinstance(linha["duration_ms"], (int, float)) and linha["duration_ms"] >= 0
    assert isinstance(linha["ts"], str) and linha["ts"].endswith("+00:00")
    assert linha["usuario_id"] is None


async def test_request_sem_header_gera_uuid_e_devolve_no_header(
    cliente: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    resposta = await cliente.get("/api/health")
    linha = _linhas(caplog)[-1]
    gerado = str(linha["request_id"])
    assert uuid.UUID(gerado)
    assert resposta.headers["x-request-id"] == gerado


async def test_log_nao_contem_senha_nem_cookie(
    cliente: AsyncClient, session: AsyncSession, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    await criar_usuario(session, "ana", "Ana Lima", SENHA_SECRETA)
    resposta = await cliente.post(
        "/api/auth/login", json={"username": "ana", "password": SENHA_SECRETA}
    )
    assert resposta.status_code == 200
    texto = _tudo_formatado(caplog)
    assert SENHA_SECRETA not in texto
    assert resposta.cookies["session"] not in texto
    assert resposta.cookies["csrf_token"] not in texto
    linha = _linhas(caplog)[-1]
    assert linha["path"] == "/api/auth/login"
    assert linha["status"] == 200


async def test_log_inclui_usuario_id_quando_autenticado(
    cliente_logado: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    resposta = await cliente_logado.get("/api/auth/me")
    linha = _linhas(caplog)[-1]
    assert linha["usuario_id"] == resposta.json()["id"]


async def test_erro_500_tambem_e_logado_com_status(
    cliente: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    resposta = await cliente.get("/api/_boom", headers={"X-Request-ID": "req-boom"})
    assert resposta.status_code == 500
    linha = next(linha for linha in _linhas(caplog) if linha["request_id"] == "req-boom")
    assert linha["status"] == 500
    assert "segredo-interno" not in _tudo_formatado(caplog).split('"exc"')[0]


def test_configurar_logging_instala_formatter_json_e_nivel() -> None:
    configurar_logging("DEBUG")
    raiz = logging.getLogger()
    assert raiz.level == logging.DEBUG
    assert any(isinstance(h.formatter, JsonFormatter) for h in raiz.handlers)
    configurar_logging("INFO")
    assert raiz.level == logging.INFO
    assert sum(isinstance(h.formatter, JsonFormatter) for h in raiz.handlers) == 1


def test_engine_esconde_parametros_sql_em_erros() -> None:
    assert get_engine().sync_engine.hide_parameters is True
