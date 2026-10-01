import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
usuario_id_var: ContextVar[str | None] = ContextVar("usuario_id", default=None)
HEADER_REQUEST_ID: str = "X-Request-ID"
CAMPOS_REQUEST: tuple[str, ...] = ("method", "path", "status", "duration_ms")

_logger_request = logging.getLogger("app.request")
_handler_json: logging.Handler | None = None


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        linha: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", request_id_var.get()),
            "usuario_id": getattr(record, "usuario_id", usuario_id_var.get()),
        }
        for campo in CAMPOS_REQUEST:
            linha[campo] = getattr(record, campo, None)
        if record.exc_info:
            linha["exc"] = self.formatException(record.exc_info)
        return json.dumps(linha, ensure_ascii=False, default=str)


def configurar_logging(level: str) -> None:
    global _handler_json
    raiz = logging.getLogger()
    if _handler_json is not None:
        raiz.removeHandler(_handler_json)
    _handler_json = logging.StreamHandler(sys.stdout)
    _handler_json.setFormatter(JsonFormatter())
    raiz.addHandler(_handler_json)
    raiz.setLevel(level.upper())


def _request_id_de(scope: Scope) -> str:
    for nome, valor in scope.get("headers", []):
        if nome == b"x-request-id" and valor:
            return valor.decode("latin-1")
    return str(uuid.uuid4())


class RequestLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = _request_id_de(scope)
        token_request = request_id_var.set(request_id)
        token_usuario = usuario_id_var.set(None)
        inicio = time.perf_counter()
        status = 500

        async def send_com_header(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = [
                    *message.get("headers", []),
                    (b"x-request-id", request_id.encode("latin-1")),
                ]
            await send(message)

        try:
            await self.app(scope, receive, send_com_header)
        finally:
            duracao_ms = round((time.perf_counter() - inicio) * 1000, 1)
            _logger_request.info(
                "request",
                extra={
                    "request_id": request_id,
                    "usuario_id": scope.get("state", {}).get("usuario_id") or usuario_id_var.get(),
                    "method": scope["method"],
                    "path": scope["path"],
                    "status": status,
                    "duration_ms": duracao_ms,
                },
            )
            usuario_id_var.reset(token_usuario)
            request_id_var.reset(token_request)
