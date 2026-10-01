import hmac

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

METODOS_SEGUROS: frozenset[str] = frozenset({"GET", "HEAD", "OPTIONS"})
ROTAS_ISENTAS: frozenset[str] = frozenset({"/api/auth/login"})
COOKIE_CSRF: str = "csrf_token"
HEADER_CSRF: str = "X-CSRF-Token"


class CsrfMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in METODOS_SEGUROS or request.url.path in ROTAS_ISENTAS:
            return await call_next(request)
        cookie = request.cookies.get(COOKIE_CSRF, "")
        header = request.headers.get(HEADER_CSRF, "")
        if not cookie or not header or not hmac.compare_digest(cookie, header):
            return JSONResponse(status_code=403, content={"detail": "CSRF inválido"})
        return await call_next(request)
