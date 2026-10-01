# backend/CLAUDE.md

FastAPI (ASGI) · Python 3.12 · `uv` · SQLAlchemy 2.0 async + asyncpg · Alembic · Postgres 16 · pytest.
Spec desta parte: `SPEC/2026-10-01-backend.md` (modelo §1, schemas §2, API §3, LLM §4, seguranca §6, envs §7, testes §9). Infra: `SPEC/2026-10-01-infra.md`. Le antes de mexer em router/schema.
Esta pasta e a etapa BACKEND: toca `src/backend/**` + toda a infra (`src/docker-compose*.yml`, `src/nginx/`, `src/docker/`, `.github/`, `.gitignore`). Nunca `src/frontend/**`.

## Layout

```
app/
  main.py        create_app(): lifespan, middlewares (sessao, CSRF, erro generico), include_router por dominio
  config.py      Settings (pydantic-settings). Unica fonte de env. SecretStr pra senha/chave.
  db.py          engine, async_session_factory, Base, get_session (Depends)
  cli.py         criar-usuario, limpar-sessoes
  security/      auth (login/logout/me), csrf, ratelimit (tentativas_login), passwords (argon2), deps (usuario_atual)
  llm/           base.py (Protocol LLMClient.structured) · fake.py · anthropic.py · get_llm_client()
  pdf/           extract.py: extract_text(path) -> str
  email/         sender.py: send_email(...) backend smtp | file
  <dominio>/     models.py  schemas.py  service.py  router.py   (processos, agenda, editais, marketing)
alembic/         migrations. Primeira migration cria tabelas + GRANTs pra leiloes_app.
tests/           conftest.py (db transacional, cliente_logado), fixtures.py (PDF via reportlab), test_<dominio>.py
```

Regras de camada: `router.py` so valida entrada/saida e chama `service.py`. `service.py` tem regra de negocio
e fala com o banco. `models.py` = tabelas. `schemas.py` = Pydantic (espelha spec §5, nomes identicos ao TS).

## Comandos

Tudo via Docker, de `src/` (`B="docker compose exec backend"`):

```bash
cd src && docker compose up --build -d                     # sobe postgres + backend (reload) + frontend + nginx
$B uv run alembic revision --autogenerate -m "x"           # nova migration (usa DATABASE_URL_MIGRATOR)
$B uv run alembic upgrade head
$B uv run pytest tests/test_agenda.py -v                   # so o teste da feature
$B uv run python -m app.cli criar-usuario admin --nome "Admin"
$B uv run ruff check . && $B uv run ruff format --check .
$B uv add <pacote>                                         # dependencia nova (so com aprovacao) — atualiza uv.lock no volume
```

Banco de teste `leiloes_test` e criado pelo `src/docker/postgres/init/01-roles.sh`; `DATABASE_URL_TEST` ja aponta pra ele.

## Banco

- Duas roles. **App** = `leiloes_app` (SELECT/INSERT/UPDATE/DELETE, zero DDL) via `DATABASE_URL`.
  **Migrations** = `leiloes_owner` via `DATABASE_URL_MIGRATOR`. Nova tabela em migration → GRANT ja cobre
  (`ALTER DEFAULT PRIVILEGES`), mas confira no `\dp`.
- Timestamps `timestamptz`, sempre UTC no banco. Converte pra `settings.TIMEZONE` so na borda (edital, planilha).
- Dinheiro = `Decimal`, serializado como string `"1234.56"`. Nunca float.
- JSONB (`checklists.dados`, `relatorios.dados`) sempre validado por schema Pydantic na entrada e na saida.
- SQL: ORM ou `text()` com `:param`. **f-string/concatenacao em SQL = bug.**

## Seguranca (spec backend §6)

- Toda rota fora de `/auth/login` passa por `Depends(usuario_atual)` → 401.
- Mutacao exige `X-CSRF-Token == cookie csrf_token` (middleware) → 403.
- Login: lockout por `user:` e `ip:` em `tentativas_login`; resposta de falha e sempre `401 Credenciais invalidas`.
- Upload: content-type **e** `%PDF-`; limite `MAX_UPLOAD_MB`; salva como `<uuid>.pdf` em `MEDIA_ROOT`.
- Nenhum segredo, PDF ou texto extraido vai pra log.

## LLM

- Codigo de dominio depende so de `LLMClient` (Protocol). Driver vem de `get_llm_client()` por `LLM_PROVIDER`.
- `fake` devolve fixtures em `app/llm/fixtures/<Schema>.json` — e o default em dev e **unico** em teste.
- `anthropic`: `AsyncAnthropic().messages.parse(model=..., max_tokens=16000, messages=[...], output_format=Schema)`
  → `response.parsed_output`. Modelo em `ANTHROPIC_MODEL`. Chave em `ANTHROPIC_API_KEY` (nunca lida pelo agent).
- Texto do PDF cortado em `LLM_MAX_CHARS` antes do prompt. Campo que o modelo nao achou = `null`, nunca inventado.

## Testes

- Postgres real, transacao por teste com savepoint (rollback no fim). Sem mock de banco.
- `cliente_logado` ja tem cookies de sessao + header CSRF. Teste de 401/403 usa `cliente` cru.
- Teste de dominio nunca chama LLM real nem SMTP real (`LLM_PROVIDER=fake`, `EMAIL_BACKEND=file`).
- Nome: `test_<comportamento>` em portugues, ex: `test_sugestao_pula_fim_de_semana`.

## Convencoes

- Sem comentarios novos. Tipagem completa. Dominio em portugues, tecnico em ingles.
- `ruff` (lint + format) limpo antes de entregar.
- Deps aprovadas: fastapi, uvicorn[standard], sqlalchemy[asyncio], asyncpg, alembic, pydantic-settings,
  python-multipart, pypdf, jinja2, openpyxl, num2words, pwdlib[argon2], anthropic, holidays, python-docx.
  Dev: pytest, pytest-asyncio, httpx, reportlab, ruff. Logs JSON com `logging` da stdlib. Outra → pergunta.
- Rota so de admin: `Depends(exige_admin)`. Toda rota admin tem teste com `cliente_operador` esperando 403.
- Regras de agenda sao funcoes puras em `agenda/service.py` (`candidatos`, `motivo_indisponivel`); `hoje` e parametro.
