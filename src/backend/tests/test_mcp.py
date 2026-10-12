from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession

from app import main, mcp_server
from app.agenda.models import Leilao
from app.config import Settings
from app.processos import service as processos_service
from app.processos.models import Processo
from tests.fixtures import TEXTO_PROCESSO, make_pdf

TOKEN_MCP: str = "t" * 32
VERSAO_PROTOCOLO: str = "2025-06-18"
CABECALHOS_MCP: dict[str, str] = {
    "Authorization": f"Bearer {TOKEN_MCP}",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": VERSAO_PROTOCOLO,
}
TOOLS_ESPERADAS: set[str] = {"listar_processos", "obter_caderno", "pendencias_pre_leilao"}


@asynccontextmanager
async def app_mcp(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[AsyncClient]:
    monkeypatch.setattr(main, "get_settings", lambda: settings)
    app = main.create_app()
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://leiloes.exemplo",
        ) as cliente:
            yield cliente


@pytest.fixture
async def cliente_mcp(
    session: AsyncSession, settings_teste: Settings, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[AsyncClient]:
    @asynccontextmanager
    async def _sessao() -> AsyncIterator[AsyncSession]:
        yield session

    monkeypatch.setattr(mcp_server, "abrir_sessao", _sessao)
    settings = settings_teste.model_copy(update={"MCP_TOKEN": SecretStr(TOKEN_MCP)})
    async with app_mcp(settings, monkeypatch) as cliente:
        yield cliente


def mensagem(metodo: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": 1, "method": metodo, "params": params or {}}


async def rpc(
    cliente: AsyncClient, metodo: str, params: dict[str, Any] | None = None
) -> dict[str, Any]:
    resposta = await cliente.post("/mcp", json=mensagem(metodo, params), headers=CABECALHOS_MCP)
    assert resposta.status_code == 200, resposta.text
    corpo: dict[str, Any] = resposta.json()
    assert "error" not in corpo, corpo
    return corpo["result"]


async def chamar(cliente: AsyncClient, tool: str, argumentos: dict[str, Any]) -> dict[str, Any]:
    return await rpc(cliente, "tools/call", {"name": tool, "arguments": argumentos})


async def test_mcp_sem_token_401(cliente_mcp: AsyncClient) -> None:
    resposta = await cliente_mcp.post("/mcp", json=mensagem("tools/list"))
    assert resposta.status_code == 401
    assert resposta.json() == {"detail": "Não autenticado"}
    assert resposta.headers["www-authenticate"] == "Bearer"


async def test_mcp_token_errado_401(cliente_mcp: AsyncClient) -> None:
    resposta = await cliente_mcp.post(
        "/mcp",
        json=mensagem("tools/list"),
        headers={**CABECALHOS_MCP, "Authorization": f"Bearer {'x' * 32}"},
    )
    assert resposta.status_code == 401


async def test_mcp_cookie_de_sessao_nao_autentica(
    cliente_mcp: AsyncClient, cliente_logado: AsyncClient
) -> None:
    sem_bearer = {k: v for k, v in CABECALHOS_MCP.items() if k != "Authorization"}
    cliente_mcp.cookies.update(cliente_logado.cookies)
    resposta = await cliente_mcp.post(
        "/mcp",
        json=mensagem("tools/list"),
        headers={**sem_bearer, "X-CSRF-Token": cliente_logado.headers["X-CSRF-Token"]},
    )
    assert resposta.status_code == 401


async def test_mcp_desligado_sem_token_configurado_404(
    settings_teste: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = settings_teste.model_copy(update={"MCP_TOKEN": SecretStr("")})
    async with app_mcp(settings, monkeypatch) as cliente:
        resposta = await cliente.post("/mcp", json=mensagem("tools/list"), headers=CABECALHOS_MCP)
    assert resposta.status_code == 404


async def test_mcp_initialize_e_tools_list(cliente_mcp: AsyncClient) -> None:
    inicio = await rpc(
        cliente_mcp,
        "initialize",
        {
            "protocolVersion": VERSAO_PROTOCOLO,
            "capabilities": {},
            "clientInfo": {"name": "teste", "version": "1"},
        },
    )
    assert "revise antes de usar" in inicio["instructions"]
    tools = (await rpc(cliente_mcp, "tools/list"))["tools"]
    assert {t["name"] for t in tools} == TOOLS_ESPERADAS
    assert all(t["annotations"]["readOnlyHint"] is True for t in tools)


async def test_mcp_post_sem_barra_final_200(cliente_mcp: AsyncClient) -> None:
    resposta = await cliente_mcp.post("/mcp", json=mensagem("tools/list"), headers=CABECALHOS_MCP)
    assert resposta.status_code == 200
    assert resposta.headers["content-type"].startswith("application/json")


async def test_mcp_aceita_host_de_producao(cliente_mcp: AsyncClient) -> None:
    resposta = await cliente_mcp.post(
        "/mcp",
        json=mensagem("tools/list"),
        headers={**CABECALHOS_MCP, "Host": "leiloes.norteleiloes.com.br"},
    )
    assert resposta.status_code == 200


async def test_mcp_nao_exige_csrf(cliente_mcp: AsyncClient) -> None:
    resposta = await cliente_mcp.post("/mcp", json=mensagem("tools/list"), headers=CABECALHOS_MCP)
    assert resposta.status_code == 200
    assert "X-CSRF-Token" not in CABECALHOS_MCP


async def test_mcp_nao_afeta_404_da_api(cliente_mcp: AsyncClient) -> None:
    resposta = await cliente_mcp.get("/api/nao-existe")
    assert resposta.status_code == 404
    assert resposta.json() == {"detail": "Not Found"}


async def test_mcp_listar_processos_filtra_status(
    cliente_mcp: AsyncClient,
    session: AsyncSession,
    settings_teste: Settings,
    processo_analisado: Processo,
) -> None:
    recebido = await processos_service.salvar_upload(
        session, settings_teste, "outro.pdf", "application/pdf", make_pdf(TEXTO_PROCESSO)
    )
    todos = await chamar(cliente_mcp, "listar_processos", {})
    assert [p["id"] for p in todos["structuredContent"]["result"]] == [
        str(recebido.id),
        str(processo_analisado.id),
    ]
    analisados = await chamar(cliente_mcp, "listar_processos", {"status": "analisado"})
    assert [p["id"] for p in analisados["structuredContent"]["result"]] == [
        str(processo_analisado.id)
    ]


async def test_mcp_obter_caderno_traz_checklist_relatorio_e_leilao(
    cliente_mcp: AsyncClient, processo_analisado: Processo, leilao_agendado: Leilao
) -> None:
    resultado = await chamar(
        cliente_mcp, "obter_caderno", {"processo_id": str(processo_analisado.id)}
    )
    caderno = resultado["structuredContent"]
    assert resultado.get("isError") is not True
    assert caderno["checklist"]["numero_processo"] == "1003966-15.2022.4.01.4301"
    assert caderno["relatorio"]["resumo"]
    assert caderno["leilao"]["id"] == str(leilao_agendado.id)


async def test_mcp_obter_caderno_processo_recebido_checklist_null(
    cliente_mcp: AsyncClient, session: AsyncSession, settings_teste: Settings
) -> None:
    processo = await processos_service.salvar_upload(
        session, settings_teste, "novo.pdf", "application/pdf", make_pdf(TEXTO_PROCESSO)
    )
    caderno = (await chamar(cliente_mcp, "obter_caderno", {"processo_id": str(processo.id)}))[
        "structuredContent"
    ]
    assert caderno["status"] == "recebido"
    assert caderno["checklist"] is None
    assert caderno["relatorio"] is None
    assert caderno["leilao"] is None


async def test_mcp_obter_caderno_inexistente_erro_de_tool(cliente_mcp: AsyncClient) -> None:
    resultado = await chamar(cliente_mcp, "obter_caderno", {"processo_id": str(uuid4())})
    assert resultado["isError"] is True
    texto = resultado["content"][0]["text"]
    assert "Processo não encontrado" in texto
    assert "Traceback" not in texto


async def test_mcp_pendencias_processo_analisado(
    cliente_mcp: AsyncClient, processo_analisado: Processo
) -> None:
    resultado = await chamar(
        cliente_mcp, "pendencias_pre_leilao", {"processo_id": str(processo_analisado.id)}
    )
    pendencias = resultado["structuredContent"]["result"]
    assert all(p["gravidade"] == "atencao" for p in pendencias)
    assert {p["campo"] for p in pendencias} >= {
        "bens[0].certidao_matricula_ref",
        "bens[1].certidao_matricula_ref",
        "observacoes_leilao[0]",
    }


async def test_mcp_pendencias_processo_nao_analisado(
    cliente_mcp: AsyncClient, session: AsyncSession, settings_teste: Settings
) -> None:
    processo = await processos_service.salvar_upload(
        session, settings_teste, "novo.pdf", "application/pdf", make_pdf(TEXTO_PROCESSO)
    )
    resultado = await chamar(
        cliente_mcp, "pendencias_pre_leilao", {"processo_id": str(processo.id)}
    )
    assert resultado["structuredContent"]["result"] == [
        {
            "gravidade": "bloqueia",
            "campo": "checklist",
            "mensagem": "Processo ainda não analisado",
            "ref": None,
        }
    ]


async def test_mcp_nao_expoe_texto_extraido(
    cliente_mcp: AsyncClient, processo_analisado: Processo
) -> None:
    processo_id = str(processo_analisado.id)
    respostas = [
        await chamar(cliente_mcp, "listar_processos", {}),
        await chamar(cliente_mcp, "obter_caderno", {"processo_id": processo_id}),
        await chamar(cliente_mcp, "pendencias_pre_leilao", {"processo_id": processo_id}),
    ]
    trecho = TEXTO_PROCESSO.splitlines()[-1]
    for resposta in respostas:
        texto = str(resposta)
        assert "texto_extraido" not in texto
        assert trecho not in texto
