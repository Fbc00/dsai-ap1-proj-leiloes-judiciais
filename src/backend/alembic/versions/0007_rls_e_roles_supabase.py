from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SQL_REVOGA_ROLES_API: str = """
DO $$
BEGIN
  IF (
    SELECT count(*) FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
  ) = 3 THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
  END IF;
END
$$;
"""

SQL_LIGA_RLS: tuple[str, ...] = (
    "ALTER TABLE alembic_version ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE tentativas_login ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE processos ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE checklists ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE relatorios ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE bloqueios_agenda ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE leiloes ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE editais ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE envios_marketing ENABLE ROW LEVEL SECURITY",
    "CREATE POLICY acesso_app ON usuarios FOR ALL TO leiloes_app USING (true) WITH CHECK (true)",
    "CREATE POLICY acesso_app ON sessoes FOR ALL TO leiloes_app USING (true) WITH CHECK (true)",
    "CREATE POLICY acesso_app ON tentativas_login "
    "FOR ALL TO leiloes_app USING (true) WITH CHECK (true)",
    "CREATE POLICY acesso_app ON processos FOR ALL TO leiloes_app USING (true) WITH CHECK (true)",
    "CREATE POLICY acesso_app ON checklists FOR ALL TO leiloes_app USING (true) WITH CHECK (true)",
    "CREATE POLICY acesso_app ON relatorios FOR ALL TO leiloes_app USING (true) WITH CHECK (true)",
    "CREATE POLICY acesso_app ON bloqueios_agenda "
    "FOR ALL TO leiloes_app USING (true) WITH CHECK (true)",
    "CREATE POLICY acesso_app ON leiloes FOR ALL TO leiloes_app USING (true) WITH CHECK (true)",
    "CREATE POLICY acesso_app ON editais FOR ALL TO leiloes_app USING (true) WITH CHECK (true)",
    "CREATE POLICY acesso_app ON envios_marketing "
    "FOR ALL TO leiloes_app USING (true) WITH CHECK (true)",
)

SQL_DESLIGA_RLS: tuple[str, ...] = (
    "DROP POLICY IF EXISTS acesso_app ON usuarios",
    "DROP POLICY IF EXISTS acesso_app ON sessoes",
    "DROP POLICY IF EXISTS acesso_app ON tentativas_login",
    "DROP POLICY IF EXISTS acesso_app ON processos",
    "DROP POLICY IF EXISTS acesso_app ON checklists",
    "DROP POLICY IF EXISTS acesso_app ON relatorios",
    "DROP POLICY IF EXISTS acesso_app ON bloqueios_agenda",
    "DROP POLICY IF EXISTS acesso_app ON leiloes",
    "DROP POLICY IF EXISTS acesso_app ON editais",
    "DROP POLICY IF EXISTS acesso_app ON envios_marketing",
    "ALTER TABLE alembic_version DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE sessoes DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE tentativas_login DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE processos DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE checklists DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE relatorios DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE bloqueios_agenda DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE leiloes DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE editais DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE envios_marketing DISABLE ROW LEVEL SECURITY",
)


def upgrade() -> None:
    op.execute(SQL_REVOGA_ROLES_API)
    for sql in SQL_LIGA_RLS:
        op.execute(sql)


def downgrade() -> None:
    for sql in SQL_DESLIGA_RLS:
        op.execute(sql)
