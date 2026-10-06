from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import OperationalError

from app.db import get_session
from app.main import app


async def test_health_responde_ok(cliente: AsyncClient) -> None:
    resposta = await cliente.get("/api/health")
    assert resposta.status_code == 200
    assert resposta.json() == {"status": "ok"}


async def test_erro_nao_tratado_vira_500_sem_stack(cliente: AsyncClient) -> None:
    resposta = await cliente.get("/api/_boom")
    assert resposta.status_code == 500
    assert resposta.json() == {"detail": "Erro interno"}
    assert "segredo-interno" not in resposta.text


class SessaoSemBanco:
    def __init__(self, erro: Exception) -> None:
        self.erro = erro

    async def execute(self, *_: object) -> None:
        raise self.erro


@pytest.mark.parametrize(
    "erro",
    [
        ConnectionRefusedError("conexao recusada"),
        OperationalError("SELECT 1", {}, Exception("senha invalida")),
    ],
)
async def test_health_sem_banco_responde_503(cliente: AsyncClient, erro: Exception) -> None:
    async def _sessao() -> AsyncIterator[SessaoSemBanco]:
        yield SessaoSemBanco(erro)

    app.dependency_overrides[get_session] = _sessao
    resposta = await cliente.get("/api/health")
    assert resposta.status_code == 503
    assert resposta.json() == {"detail": "Banco indisponível"}
    assert "senha invalida" not in resposta.text
