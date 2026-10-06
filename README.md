# Leilões Judiciais — ferramenta de apoio

Recebe um processo judicial em PDF e automatiza o caminho até o leilão: preenche o checklist processual, resume as etapas do processo, agenda o 1º e o 2º leilão numa agenda com bloqueios, gera o edital de leilão e intimação, atualiza a planilha de leilões e envia por e-mail pra equipe de marketing.

## URL

- Repositório: `<URL do repositório no GitHub>`
- Aplicação: `<URL do deploy>`

## Dupla

- Fabricio Assunção
- Andrey Amaral

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.12 · FastAPI (ASGI/uvicorn) · SQLAlchemy 2.0 async · Alembic · PostgreSQL 16 (local) ou Supabase · `uv` · Ruff |
| Frontend | React 19 · TypeScript · Vite · React Router · TanStack Query · Tailwind CSS v4 · MSW · Vitest · `pnpm` · Biome |
| LLM | Interface com driver trocável: `fake` (fixtures, usado na entrega) e `anthropic` (Claude, opcional) |
| Infra | Docker Compose + nginx (dev) · Cloudflare Workers Static Assets + Containers (prod) · GitHub Actions (CI + e2e Playwright + CD) |

Detalhes e decisões: [`SPEC/`](SPEC/).

## Como rodar

Tudo roda via Docker. Pré-requisito: Docker com Compose v2.

```bash
cd src
cp .env.example .env            # preencha as senhas; .env nunca é commitado
docker compose up --build       # http://localhost
docker compose exec backend uv run alembic upgrade head
docker compose exec backend uv run python -m app.cli criar-usuario admin --nome "Admin" --perfil admin
```

Entre com o usuário criado. Admin gerencia os demais usuários (perfis `admin` e `operador`) pela tela **Usuários**.

Só o frontend, sem backend (API mockada com MSW; usuários `admin`/`admin` e `operador`/`operador`):

```bash
cd src && VITE_API_MOCK=true docker compose up frontend nginx
```

Testes:

```bash
cd src
docker compose exec backend uv run pytest            # API + Postgres real
docker compose exec frontend pnpm test               # UI + MSW
cd e2e && pnpm install && pnpm exec playwright install chromium && pnpm test   # fluxo completo contra o compose
```

## Produção (Cloudflare)

Um Worker (`src/worker/`) serve o build do frontend e encaminha `/api/*` pro container do backend (`src/backend/Dockerfile`), tudo na mesma origem. Banco no Supabase (seção abaixo). Exige plano Workers Paid. Detalhes: [`SPEC/2026-10-01-infra.md` §10](SPEC/2026-10-01-infra.md).

Deploy automático no push pra `main` (`.github/workflows/deploy.yml`: CI → migrations → `wrangler deploy` → `/api/health`). Configuração única:

1. Secrets do repositório no GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL`, `DATABASE_URL_MIGRATOR`. Variable: `APP_URL`.
2. Secrets do Worker (o valor é digitado no prompt):

   ```bash
   cd src/worker && pnpm install
   for s in DATABASE_URL ANTHROPIC_API_KEY SMTP_HOST SMTP_USER SMTP_PASSWORD EMAIL_FROM MARKETING_EMAILS; do pnpm exec wrangler secret put "$s"; done
   ```

3. Primeiro usuário: `criar-usuario` com o `src/.env` apontando pro Supabase (passo 4 da seção do Supabase).

Rodar o Worker local (Docker ligado, frontend buildado em `src/frontend/dist`, secrets em `src/worker/.dev.vars`):

```bash
cd src/worker && pnpm install && pnpm test && pnpm dev     # http://localhost:8787
cd ../e2e && E2E_BASE_URL=http://localhost:8787 pnpm test
```

Os PDFs ficam no disco do container, que é efêmero: somem quando ele dorme (2h sem uso) ou a versão muda.

Previews de branch (`wrangler preview`) usam LLM `fake` e e-mail em arquivo. Configure o banco de staging uma vez: `cd src/worker && pnpm exec wrangler preview base-config secret put DATABASE_URL`.

Rollback: `cd src/worker && pnpm exec wrangler rollback`.

Alternativa self-hosted (um servidor com Docker Compose):

```bash
cd src && docker compose -f docker-compose.prod.yml up -d --build
```

## Banco no Supabase

O Supabase é usado só como Postgres (sem Auth, Storage ou Data API). Basta trocar as URLs no `src/.env`. Testes e CI continuam no Postgres local.

1. No dashboard do projeto:
   - Em **Integrations → Data API**, desligue **Enable Data API**.
   - Em **Database → Settings**, ligue **Enforce SSL**.
   - Em **Connect → Session pooler**, anote o host (`aws-<n>-<regiao>.pooler.supabase.com`), a porta `5432` e o *project ref*.
   - Rode `SHOW server_version;` no SQL Editor e use a imagem `postgres:<major>-alpine` correspondente nos comandos abaixo.
2. Crie as roles (do seu shell; senhas não vão pro repositório):

   ```bash
   read -rs SENHA_POSTGRES; read -rs SENHA_OWNER; read -rs SENHA_APP
   docker run --rm -i -e PGPASSWORD="$SENHA_POSTGRES" postgres:17-alpine \
     psql "host=aws-<n>-<regiao>.pooler.supabase.com port=5432 dbname=postgres user=postgres.<ref> sslmode=require" \
     -v ON_ERROR_STOP=1 -v senha_owner="$SENHA_OWNER" -v senha_app="$SENHA_APP" < src/docker/supabase/01-roles.sql
   ```

   Confira no SQL Editor: `SELECT has_schema_privilege('leiloes_owner', 'public', 'CREATE'), has_schema_privilege('leiloes_app', 'public', 'CREATE');` → `true | false`.

3. No `src/.env`:

   ```
   DATABASE_URL=postgresql+asyncpg://leiloes_app.<ref>:<SENHA_APP>@aws-<n>-<regiao>.pooler.supabase.com:5432/postgres?ssl=require
   DATABASE_URL_MIGRATOR=postgresql+asyncpg://leiloes_owner.<ref>:<SENHA_OWNER>@aws-<n>-<regiao>.pooler.supabase.com:5432/postgres?ssl=require
   ```

   - **Use `ssl=require` e nunca `sslmode`.** A API não sobe se a URL apontar pra fora do Postgres local sem `ssl=require`.
   - **Senha com caractere especial** vai percent-encoded: `@` → `%40`, `/` → `%2F`, `#` → `%23`, `%` → `%25`, `:` → `%3A`, `$` → `%24`. O `$` cru é interpolado pelo compose e corta a senha. Pra codificar a senha inteira: `python3 -c 'import urllib.parse, getpass; print(urllib.parse.quote(getpass.getpass(""), safe=""))'`.
   - **Deixe `DATABASE_URL_TEST` no Postgres local.**

4. Migrations e primeiro usuário:

   ```bash
   cd src
   docker compose up --build
   docker compose exec backend uv run alembic upgrade head
   docker compose exec backend uv run python -m app.cli criar-usuario admin --nome "Admin" --perfil admin
   curl -fsS http://localhost/api/health
   ```

   O `/api/health` responde `503 {"detail":"Banco indisponível"}` se o banco não responder.

**Plano Free:**
- **Pausa por inatividade:** o projeto pausa depois de 7 dias de baixa atividade e é reativado pelo dashboard.
- **Sem backup automático.** Backup manual:

```bash
docker run --rm -e PGPASSWORD="$SENHA_OWNER" postgres:17-alpine \
  pg_dump "host=aws-<n>-<regiao>.pooler.supabase.com port=5432 dbname=postgres user=leiloes_owner.<ref> sslmode=require" \
  -Fc --data-only -n public --exclude-table=public.alembic_version > leiloes-$(date +%F).dump
```

Restaurar num projeto com as roles criadas, as migrations na mesma revisão do dump e as tabelas vazias:

```bash
docker run --rm -i -e PGPASSWORD="$SENHA_OWNER" postgres:17-alpine \
  pg_restore --data-only --no-owner --single-transaction \
  -d "host=aws-<n>-<regiao>.pooler.supabase.com port=5432 dbname=postgres user=leiloes_owner.<ref> sslmode=require" < leiloes-<data>.dump
```

## Backup e restore (self-hosted)

O serviço `backup` do `src/docker-compose.prod.yml` grava diariamente em um volume `backups`:
`pg-<data>.dump` (`pg_dump -Fc`) e `media-<data>.tgz` (PDFs e e-mails), retenção `BACKUP_RETENCAO_DIAS` (default 7).

Copiar os backups pra fora do host:

```bash
cd src && docker compose -f docker-compose.prod.yml cp backup:/backups ./backups-copia
```

Restaurar o banco (apaga e recria os objetos):

```bash
cd src && docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < pg-<data>.dump
```

Restaurar a mídia:

```bash
cd src && docker compose -f docker-compose.prod.yml run --rm --no-deps --entrypoint tar -v "$PWD/media-<data>.tgz:/b.tgz:ro" backend xzf /b.tgz -C /data
```

Rollback de versão: `git checkout <commit anterior>` e `cd src && docker compose -f docker-compose.prod.yml up -d --build`.

## Ferramentas

- **Claude Code** com o plugin **superpowers** (brainstorming → spec → planos → execução com TDD e revisão por subagentes). Sessões exportadas automaticamente pra [`prompts/sessoes/claude-code/`](prompts/sessoes/claude-code/) por hook (`.claude/settings.json`): só prompts do usuário e respostas do Claude, em Markdown, com dados sensíveis mascarados.
- Planos de implementação em [`prompts/planos/`](prompts/planos/); specs em [`SPEC/`](SPEC/).
- `uv` (Python), `pnpm` (Node), Ruff e Biome (lint/format), MSW (mock de API), Vitest/pytest, Docker Compose, Wrangler (Cloudflare), GitHub Actions, Dependabot.

## Modelos

| Uso | Modelo |
|---|---|
| Planejamento, spec e geração de código (Claude Code) | Claude Fable 5.1 (`claude-fable-5-1`) e Claude Opus 5.5 (`claude-opus-5-5`) |
| Extração do checklist e relatório na aplicação (driver `anthropic`) | Claude Opus 5.5 (`claude-opus-5-5`), configurável por `ANTHROPIC_MODEL` |
| Dev e testes | driver `fake` (fixtures, sem chamada externa) |

## Saída do cloc

Gerar ao final da implementação, da raiz do repositório:

```bash
cloc src --exclude-dir=node_modules,.venv,dist,__pycache__ --not-match-f='pnpm-lock.yaml|uv.lock|mockServiceWorker.js'
```

```
<colar saída aqui>
```
