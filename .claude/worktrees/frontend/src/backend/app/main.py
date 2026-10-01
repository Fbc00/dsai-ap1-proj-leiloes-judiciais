import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import errors
from app.agenda.router import router as agenda_router
from app.config import get_settings
from app.editais.router import router as editais_router
from app.logging import RequestLogMiddleware, configurar_logging
from app.marketing.router import router as marketing_router
from app.processos.router import router as processos_router
from app.security.csrf import CsrfMiddleware
from app.security.router import router as auth_router
from app.security.router import usuarios_router

logger = logging.getLogger("app")


async def erro_generico(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("erro nao tratado em %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Erro interno"})


def create_app() -> FastAPI:
    settings = get_settings()
    configurar_logging(settings.LOG_LEVEL)
    expor_docs = settings.APP_ENV != "prod"
    app = FastAPI(
        title="Leilões Judiciais",
        debug=False,
        docs_url="/api/docs" if expor_docs else None,
        openapi_url="/api/openapi.json" if expor_docs else None,
    )
    app.add_middleware(CsrfMiddleware)
    app.add_middleware(RequestLogMiddleware)
    app.add_exception_handler(Exception, erro_generico)
    errors.registrar(app)
    app.include_router(auth_router)
    app.include_router(usuarios_router)
    app.include_router(processos_router)
    app.include_router(agenda_router)
    app.include_router(editais_router)
    app.include_router(marketing_router)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
