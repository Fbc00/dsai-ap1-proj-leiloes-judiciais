from collections.abc import AsyncIterator, Awaitable, Callable

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

import app.models  # noqa: F401
from app.agenda.models import Leilao
from app.config import Settings, get_settings
from app.db import Base, get_session
from app.main import app
from app.processos.models import Processo


@pytest.fixture(scope="session")
def settings_teste(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    base = get_settings()
    if not base.DATABASE_URL_TEST:
        pytest.exit(
            "Defina DATABASE_URL_TEST, ex: "
            "postgresql+asyncpg://leiloes_owner:senha@localhost:5432/leiloes_test"
        )
    return base.model_copy(
        update={
            "APP_ENV": "test",
            "DATABASE_URL": base.DATABASE_URL_TEST,
            "MEDIA_ROOT": tmp_path_factory.mktemp("media"),
            "LLM_PROVIDER": "fake",
            "EMAIL_BACKEND": "file",
            "COOKIE_SECURE": False,
            "TRUST_PROXY": True,
        }
    )


@pytest.fixture(scope="session")
async def engine(settings_teste: Settings) -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(settings_teste.DATABASE_URL)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with engine.connect() as conn:
        transacao = await conn.begin()
        sess = AsyncSession(
            bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        try:
            yield sess
        finally:
            await sess.close()
            await transacao.rollback()


@pytest.fixture
async def transport(
    session: AsyncSession, settings_teste: Settings
) -> AsyncIterator[ASGITransport]:
    async def _get_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_session] = _get_session
    app.dependency_overrides[get_settings] = lambda: settings_teste
    yield ASGITransport(app=app, raise_app_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
async def cliente(transport: ASGITransport) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


USUARIO_TESTE: dict[str, str] = {
    "username": "admin",
    "nome": "Admin",
    "senha": "senha-de-teste-123",
}
OPERADOR_TESTE: dict[str, str] = {
    "username": "operador",
    "nome": "Operador",
    "senha": "senha-operador-123",
}


async def logar(cliente: AsyncClient, username: str, senha: str) -> AsyncClient:
    resposta = await cliente.post("/api/auth/login", json={"username": username, "password": senha})
    assert resposta.status_code == 200, resposta.text
    cliente.headers["X-CSRF-Token"] = cliente.cookies["csrf_token"]
    return cliente


@pytest.fixture
async def cliente_logado(cliente: AsyncClient, session: AsyncSession) -> AsyncClient:
    from app.security.auth import criar_usuario

    await criar_usuario(
        session, USUARIO_TESTE["username"], USUARIO_TESTE["nome"], USUARIO_TESTE["senha"], "admin"
    )
    return await logar(cliente, USUARIO_TESTE["username"], USUARIO_TESTE["senha"])


@pytest.fixture
async def cliente_operador(
    transport: ASGITransport, session: AsyncSession
) -> AsyncIterator[AsyncClient]:
    from app.security.auth import criar_usuario

    await criar_usuario(
        session,
        OPERADOR_TESTE["username"],
        OPERADOR_TESTE["nome"],
        OPERADOR_TESTE["senha"],
        "operador",
    )
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield await logar(c, OPERADOR_TESTE["username"], OPERADOR_TESTE["senha"])


@pytest.fixture
def criar_processo_analisado(
    session: AsyncSession, settings_teste: Settings
) -> Callable[[], Awaitable[Processo]]:
    from app.llm.fake import FakeLLMClient
    from app.processos import service as processos_service
    from tests.fixtures import TEXTO_PROCESSO, make_pdf

    async def _criar() -> Processo:
        processo = await processos_service.salvar_upload(
            session, settings_teste, "processo.pdf", "application/pdf", make_pdf(TEXTO_PROCESSO)
        )
        return await processos_service.analisar(
            session, settings_teste, FakeLLMClient(), processo.id
        )

    return _criar


@pytest.fixture
async def processo_analisado(
    criar_processo_analisado: Callable[[], Awaitable[Processo]],
) -> Processo:
    return await criar_processo_analisado()


@pytest.fixture
async def leilao_agendado(
    session: AsyncSession, settings_teste: Settings, processo_analisado: Processo
) -> Leilao:
    from app.agenda import service as agenda_service
    from app.agenda.schemas import LeilaoCreate

    return await agenda_service.criar_leilao(
        session,
        settings_teste,
        LeilaoCreate(processo_id=processo_analisado.id),
        agenda_service.hoje_local(settings_teste),
    )


@pytest.fixture(scope="session", autouse=True)
def rota_boom() -> None:
    from fastapi import APIRouter

    router = APIRouter()

    @router.get("/api/_boom")
    async def boom() -> None:
        raise RuntimeError("segredo-interno")

    app.include_router(router)
