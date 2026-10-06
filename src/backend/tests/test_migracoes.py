import importlib.util
import os
import subprocess
import sys
from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path
from types import ModuleType

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from app.config import Settings

RAIZ_BACKEND: Path = Path(__file__).resolve().parents[1]
MIGRACAO_0007: Path = RAIZ_BACKEND / "alembic" / "versions" / "0007_rls_e_roles_supabase.py"
BANCO_MIGRACOES: str = "leiloes_migracoes"
ROLES_API: tuple[str, ...] = ("anon", "authenticated", "service_role")

SQL_GARANTE_LEILOES_APP: str = """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'leiloes_app') THEN
    CREATE ROLE leiloes_app NOLOGIN;
  END IF;
END
$$;
"""
SQL_SIMULA_SUPABASE: tuple[str, ...] = (
    "CREATE ROLE anon NOLOGIN",
    "CREATE ROLE authenticated NOLOGIN",
    "CREATE ROLE service_role NOLOGIN",
    "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
    "GRANT ALL ON TABLES TO anon, authenticated, service_role",
)
SQL_TEM_SELECT: str = (
    "SELECT has_table_privilege(CAST(:role AS name), CAST(:tabela AS text), 'SELECT')"
)
SQL_TABELAS_SEM_RLS: str = (
    "SELECT tablename FROM pg_tables "
    "WHERE schemaname = 'public' AND NOT rowsecurity ORDER BY tablename"
)
SQL_TABELAS_SEM_POLICY: str = """
SELECT t.tablename FROM pg_tables t
WHERE t.schemaname = 'public' AND t.tablename <> 'alembic_version'
AND NOT EXISTS (
  SELECT 1 FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.tablename = t.tablename
  AND p.policyname = 'acesso_app' AND CAST('leiloes_app' AS name) = ANY (p.roles)
  AND p.cmd = 'ALL' AND p.permissive = 'PERMISSIVE'
)
ORDER BY t.tablename
"""
SQL_POLICIES_ALEMBIC: str = (
    "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'alembic_version'"
)
SQL_DROP_BANCO: str = "DROP DATABASE IF EXISTS leiloes_migracoes WITH (FORCE)"
SQL_CREATE_BANCO: str = "CREATE DATABASE leiloes_migracoes"


def carregar_migracao() -> ModuleType:
    spec = importlib.util.spec_from_file_location("migracao_0007", MIGRACAO_0007)
    assert spec is not None and spec.loader is not None
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


async def tem_select(conn: AsyncConnection, role: str, tabela: str) -> bool:
    return bool(await conn.scalar(text(SQL_TEM_SELECT), {"role": role, "tabela": tabela}))


@pytest.fixture(scope="module")
async def engine_migrado(settings_teste: Settings) -> AsyncIterator[AsyncEngine]:
    admin = create_async_engine(settings_teste.DATABASE_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text(SQL_DROP_BANCO))
        await conn.execute(text(SQL_CREATE_BANCO))
        await conn.execute(text(SQL_GARANTE_LEILOES_APP))
    url = (
        make_url(settings_teste.DATABASE_URL)
        .set(database=BANCO_MIGRACOES)
        .render_as_string(hide_password=False)
    )
    resultado = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=RAIZ_BACKEND,
        env={**os.environ, "DATABASE_URL": url, "DATABASE_URL_MIGRATOR": url},
        capture_output=True,
        text=True,
        check=False,
    )
    assert resultado.returncode == 0, resultado.stderr
    engine = create_async_engine(url)
    yield engine
    await engine.dispose()
    async with admin.connect() as conn:
        await conn.execute(text(SQL_DROP_BANCO))
    await admin.dispose()


async def test_toda_tabela_tem_rls(engine_migrado: AsyncEngine) -> None:
    async with engine_migrado.connect() as conn:
        sem_rls = (await conn.scalars(text(SQL_TABELAS_SEM_RLS))).all()
    assert sem_rls == []


async def test_toda_tabela_da_app_tem_policy_acesso_app(engine_migrado: AsyncEngine) -> None:
    async with engine_migrado.connect() as conn:
        sem_policy = (await conn.scalars(text(SQL_TABELAS_SEM_POLICY))).all()
    assert sem_policy == []


async def test_alembic_version_fica_sem_policy(engine_migrado: AsyncEngine) -> None:
    async with engine_migrado.connect() as conn:
        assert await conn.scalar(text(SQL_POLICIES_ALEMBIC)) == 0


async def test_leiloes_app_le_e_grava_com_rls(engine_migrado: AsyncEngine) -> None:
    async with engine_migrado.connect() as conn:
        transacao = await conn.begin()
        try:
            await conn.execute(text("SET LOCAL ROLE leiloes_app"))
            await conn.execute(
                text("INSERT INTO bloqueios_agenda (data, motivo) VALUES (:data, :motivo)"),
                {"data": date(2030, 1, 2), "motivo": "teste rls"},
            )
            total = await conn.scalar(
                text("SELECT count(*) FROM bloqueios_agenda WHERE motivo = :motivo"),
                {"motivo": "teste rls"},
            )
            assert total == 1
        finally:
            await transacao.rollback()


async def test_role_sem_policy_nao_ve_linhas(engine_migrado: AsyncEngine) -> None:
    async with engine_migrado.connect() as conn:
        transacao = await conn.begin()
        try:
            await conn.execute(
                text("INSERT INTO bloqueios_agenda (data, motivo) VALUES (:data, :motivo)"),
                {"data": date(2030, 1, 3), "motivo": "invisivel"},
            )
            await conn.execute(text("CREATE ROLE sem_policy_teste NOLOGIN"))
            await conn.execute(text("GRANT SELECT ON bloqueios_agenda TO sem_policy_teste"))
            await conn.execute(text("SET LOCAL ROLE sem_policy_teste"))
            assert await conn.scalar(text("SELECT count(*) FROM bloqueios_agenda")) == 0
        finally:
            await transacao.rollback()


async def test_revoga_roles_da_api_inclusive_em_tabela_nova(engine: AsyncEngine) -> None:
    migracao = carregar_migracao()
    async with engine.connect() as conn:
        transacao = await conn.begin()
        try:
            for sql in SQL_SIMULA_SUPABASE:
                await conn.execute(text(sql))
            assert await tem_select(conn, "anon", "public.usuarios")
            await conn.execute(text(migracao.SQL_REVOGA_ROLES_API))
            await conn.execute(text("CREATE TABLE public.tabela_nova_teste (id int)"))
            for tabela in ("public.usuarios", "public.processos", "public.tabela_nova_teste"):
                for role in ROLES_API:
                    assert not await tem_select(conn, role, tabela), (role, tabela)
        finally:
            await transacao.rollback()


async def test_revogacao_sem_roles_da_api_e_no_op(engine: AsyncEngine) -> None:
    migracao = carregar_migracao()
    async with engine.connect() as conn:
        transacao = await conn.begin()
        try:
            await conn.execute(text(migracao.SQL_REVOGA_ROLES_API))
        finally:
            await transacao.rollback()


async def test_policy_so_de_select_nao_conta_como_acesso_app(engine_migrado: AsyncEngine) -> None:
    async with engine_migrado.connect() as conn:
        transacao = await conn.begin()
        try:
            await conn.execute(text("DROP POLICY acesso_app ON bloqueios_agenda"))
            await conn.execute(
                text(
                    "CREATE POLICY acesso_app ON bloqueios_agenda "
                    "FOR SELECT TO leiloes_app USING (true)"
                )
            )
            sem_policy = (await conn.scalars(text(SQL_TABELAS_SEM_POLICY))).all()
            assert sem_policy == ["bloqueios_agenda"]
        finally:
            await transacao.rollback()
