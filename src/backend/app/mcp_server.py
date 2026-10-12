import hmac
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import Field, SecretStr
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.applications import Starlette
from starlette.types import ASGIApp, Receive, Scope, Send

from app.db import get_session_factory
from app.errors import ErroDominio
from app.processos import service
from app.processos.schemas import Pendencia, ProcessoDetalheOut, ProcessoOut, ProcessoStatus

logger = logging.getLogger("app.mcp")

ROTA_MCP: str = "/mcp"
AVISO_IA: str = "Gerado por IA a partir do PDF — revise antes de usar."
INSTRUCOES: str = (
    "Consulta ao caderno processual do pré-leilão da Norte Leilões: checklist processual, "
    "relatório, leilão agendado e pendências que impedem ou pedem atenção antes do leilão. "
    f"Somente leitura. {AVISO_IA}"
)
SOMENTE_LEITURA: ToolAnnotations = ToolAnnotations(
    read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False
)
ProcessoId = Annotated[UUID, Field(description="ID do processo (UUID)")]


@asynccontextmanager
async def abrir_sessao() -> AsyncIterator[AsyncSession]:
    async with get_session_factory()() as session:
        yield session


async def listar_processos(
    status: Annotated[
        ProcessoStatus | None, Field(description="Filtra pelo status do processo")
    ] = None,
) -> list[ProcessoOut]:
    async with abrir_sessao() as session:
        processos = await service.listar(session)
    return [
        ProcessoOut.model_validate(p) for p in processos if status is None or p.status == status
    ]


async def obter_caderno(processo_id: ProcessoId) -> ProcessoDetalheOut:
    try:
        async with abrir_sessao() as session:
            return await service.detalhe(session, processo_id)
    except ErroDominio as exc:
        raise ToolError(exc.detail) from exc


async def pendencias_pre_leilao(processo_id: ProcessoId) -> list[Pendencia]:
    try:
        async with abrir_sessao() as session:
            processo = await service.obter(session, processo_id)
            checklist = service.checklist_de(processo)
    except ErroDominio as exc:
        raise ToolError(exc.detail) from exc
    return service.pendencias(checklist)


def criar_servidor() -> MCPServer:
    servidor = MCPServer(name="leiloes-caderno-processual", instructions=INSTRUCOES)
    servidor.tool(
        description="Lista os processos, mais recentes primeiro, opcionalmente por status.",
        annotations=SOMENTE_LEITURA,
    )(listar_processos)
    servidor.tool(
        description=(
            f"Caderno processual do pré-leilão: checklist, relatório e leilão agendado. {AVISO_IA}"
        ),
        annotations=SOMENTE_LEITURA,
    )(obter_caderno)
    servidor.tool(
        description="Pendências do checklist que bloqueiam ou pedem atenção antes do leilão.",
        annotations=SOMENTE_LEITURA,
    )(pendencias_pre_leilao)
    return servidor


def criar_app_http(servidor: MCPServer) -> Starlette:
    return servidor.streamable_http_app(
        streamable_http_path=ROTA_MCP,
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )


class ExigeBearer:
    def __init__(self, app: ASGIApp, token: SecretStr) -> None:
        self.app = app
        self.esperado = f"Bearer {token.get_secret_value()}".encode()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and not self._autorizado(scope):
            cliente = scope.get("client")
            logger.warning("mcp acesso negado ip=%s", cliente[0] if cliente else "-")
            corpo = json.dumps({"detail": "Não autenticado"}).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 401,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(corpo)).encode()),
                        (b"www-authenticate", b"Bearer"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": corpo})
            return
        await self.app(scope, receive, send)

    def _autorizado(self, scope: Scope) -> bool:
        recebido = b""
        for nome, valor in scope["headers"]:
            if nome == b"authorization":
                recebido = valor
                break
        return hmac.compare_digest(recebido, self.esperado)
