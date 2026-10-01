from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ErroDominio(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


async def erro_dominio_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ErroDominio)
    return JSONResponse(status_code=exc.status, content={"detail": exc.detail})


def registrar(app: FastAPI) -> None:
    app.add_exception_handler(ErroDominio, erro_dominio_handler)
