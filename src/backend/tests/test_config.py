import pytest
from pydantic import ValidationError
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import Settings

URL_LOCAL: str = "postgresql+asyncpg://leiloes_app:senha@postgres:5432/leiloes"
URL_SUPABASE: str = (
    "postgresql+asyncpg://leiloes_app.abcdefghijklmnop:senha"
    "@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?ssl=require"
)
URL_SUPABASE_SEM_SSL: str = URL_SUPABASE.removesuffix("?ssl=require")
URL_SUPABASE_SSLMODE: str = URL_SUPABASE.replace("?ssl=require", "?sslmode=require")


def montar(app_env: str, database_url: str, migrator_url: str, test_url: str = "") -> Settings:
    return Settings(
        _env_file=None,
        APP_ENV=app_env,
        DATABASE_URL=database_url,
        DATABASE_URL_MIGRATOR=migrator_url,
        DATABASE_URL_TEST=test_url,
    )


@pytest.mark.parametrize("app_env", ["dev", "prod", "test"])
def test_supabase_com_ssl_require_passa(app_env: str) -> None:
    assert montar(app_env, URL_SUPABASE, URL_SUPABASE).DATABASE_URL == URL_SUPABASE


def test_supabase_aceita_verify_full() -> None:
    url = URL_SUPABASE.replace("ssl=require", "ssl=verify-full")
    assert montar("dev", url, url).DATABASE_URL == url


def test_dev_apontando_pro_supabase_sem_ssl_falha() -> None:
    with pytest.raises(
        ValidationError, match=r"DATABASE_URL precisa de \?ssl=require fora do Postgres local"
    ):
        montar("dev", URL_SUPABASE_SEM_SSL, URL_LOCAL)


def test_migrator_sem_ssl_falha() -> None:
    with pytest.raises(
        ValidationError,
        match=r"DATABASE_URL_MIGRATOR precisa de \?ssl=require fora do Postgres local",
    ):
        montar("prod", URL_SUPABASE, URL_SUPABASE_SEM_SSL)


def test_url_de_teste_remota_sem_ssl_falha() -> None:
    with pytest.raises(
        ValidationError,
        match=r"DATABASE_URL_TEST precisa de \?ssl=require fora do Postgres local",
    ):
        montar("dev", URL_LOCAL, URL_LOCAL, URL_SUPABASE_SEM_SSL)


def test_supabase_com_ssl_prefer_falha() -> None:
    url = URL_SUPABASE.replace("ssl=require", "ssl=prefer")
    with pytest.raises(
        ValidationError, match=r"DATABASE_URL precisa de \?ssl=require fora do Postgres local"
    ):
        montar("dev", url, URL_LOCAL)


def test_supabase_com_sslmode_falha_com_dica() -> None:
    with pytest.raises(
        ValidationError, match=r"DATABASE_URL: use \?ssl=require \(asyncpg\), não sslmode"
    ):
        montar("dev", URL_SUPABASE_SSLMODE, URL_LOCAL)


@pytest.mark.parametrize("host", ["postgres", "localhost", "127.0.0.1"])
def test_hosts_locais_dispensam_ssl(host: str) -> None:
    url = f"postgresql+asyncpg://leiloes_owner:ci@{host}:5432/leiloes_test"
    assert montar("prod", url, url, url).DATABASE_URL == url


def test_url_com_senha_codificada_preserva_host_e_senha() -> None:
    url = make_url(
        "postgresql+asyncpg://leiloes_app.abcdefghijklmnop:p%40ss%2Fw%23rd"
        "@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?ssl=require"
    )
    assert url.host == "aws-0-sa-east-1.pooler.supabase.com"
    assert url.username == "leiloes_app.abcdefghijklmnop"
    assert url.password == "p@ss/w#rd"


async def test_ssl_require_da_url_chega_no_asyncpg() -> None:
    engine = create_async_engine(URL_SUPABASE)
    try:
        _, kwargs = engine.dialect.create_connect_args(engine.url)
        assert kwargs["ssl"] == "require"
        assert kwargs["user"] == "leiloes_app.abcdefghijklmnop"
        assert "sslmode" not in kwargs
    finally:
        await engine.dispose()


def test_erro_de_ssl_nao_expoe_input_com_segredos() -> None:
    with pytest.raises(ValidationError) as erro:
        montar("dev", URL_SUPABASE_SEM_SSL, URL_LOCAL)
    assert "input_value" not in str(erro.value)
    assert "senha" not in str(erro.value)
