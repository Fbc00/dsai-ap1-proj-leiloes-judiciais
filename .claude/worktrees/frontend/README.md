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
| Backend | Python 3.12 · FastAPI (ASGI/uvicorn) · SQLAlchemy 2.0 async · Alembic · PostgreSQL 16 · `uv` · Ruff |
| Frontend | React 19 · TypeScript · Vite · React Router · TanStack Query · Tailwind CSS v4 · MSW · Vitest · `pnpm` · Biome |
| LLM | Interface com driver trocável: `fake` (fixtures, usado na entrega) e `anthropic` (Claude, opcional) |
| Infra | Docker Compose (dev e prod) · nginx (proxy + estático) · backup diário · GitHub Actions (CI + e2e Playwright + CD) · GHCR |

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

Produção (um servidor, imagens do GHCR):

```bash
cd src && docker compose -f docker-compose.prod.yml up -d
```

## Backup e restore (produção)

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

Rollback de versão: `cd src && IMAGE_TAG=sha-<anterior> docker compose -f docker-compose.prod.yml up -d`.

## Ferramentas

- **Claude Code** com o plugin **superpowers** (brainstorming → spec → planos → execução com TDD e revisão por subagentes). Sessões exportadas automaticamente pra [`prompts/sessoes/claude-code/`](prompts/sessoes/claude-code/) por hook (`.claude/settings.json`).
- Planos de implementação em [`prompts/planos/`](prompts/planos/); specs em [`SPEC/`](SPEC/).
- `uv` (Python), `pnpm` (Node), Ruff e Biome (lint/format), MSW (mock de API), Vitest/pytest, Docker Compose, GitHub Actions, Dependabot.

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
