# Visão geral — ferramenta de apoio a leilões judiciais

Data: 2026-10-01. Esta spec dá o contexto comum; as partes do sistema têm spec própria:

| Parte | Spec | Etapa de implementação |
|---|---|---|
| Backend (API, banco, LLM, segurança) | [`2026-10-01-backend.md`](2026-10-01-backend.md) | BACKEND |
| Frontend (UI, mock, testes) | [`2026-10-01-frontend.md`](2026-10-01-frontend.md) | FRONTEND |
| Infra (Docker, nginx, CI/CD) | [`2026-10-01-infra.md`](2026-10-01-infra.md) | BACKEND |

Documentos de referência do domínio em [`referencias/`](referencias/): brief do produto, modelo de checklist processual (imóveis) e minuta de edital de leilão.

## 1. Produto

Ferramenta interna da equipe de leilões (Norte Leilões). Recebe processo judicial em PDF e:

1. Preenche checklist processual (modelo em `referencias/DOC 1 modelo checklist - imoveis.md`).
2. Sintetiza etapas do processo em relatório breve.
3. Gerencia agenda de leilões (datas/horários previstos + bloqueios).
4. Sugere data livre entre 30 e 45 dias pro 1º leilão; 2º leilão = 1º + 7 dias.
5. Gera edital de leilão e intimação (modelo em `referencias/MINUTA DE EDITAL DE LEILÃO - ESTADUAL.md`) com checklist + datas.
6. Atualiza planilha `.xlsx` com dados dos leilões agendados.
7. Envia planilha por e-mail pra equipe de marketing.

Fluxo na UI: Login → Processos (upload) → Detalhe do processo (analisar → checklist/relatório → agendar leilão → gerar edital → enviar pra marketing) → Agenda → Marketing (envios + download planilha).

## 2. Decisões e premissas

| Tema | Decisão |
|---|---|
| Backend | Python 3.12, FastAPI (ASGI, uvicorn), SQLAlchemy 2.0 async + asyncpg, Alembic, pydantic-settings. Gerenciado com `uv`. Lint + format: **Ruff** (`[tool.ruff]` no `pyproject.toml`, `line-length = 100`, `select = ["E","F","I","UP","B"]`; `ruff check .` e `ruff format --check .` limpos). |
| Frontend | React 19 + **TypeScript obrigatório** (`strict: true`, `noUncheckedIndexedAccess`, `any` proibido, nenhum `.js/.jsx` em `src/`) + Vite, `pnpm`. React Router, TanStack Query, Tailwind CSS v4. Mock de API com MSW (mesmos handlers em browser e Vitest). Lint + format: **Biome** (`biome.json` com `linter.rules.recommended`, indent 2 espaços, aspas simples, `organizeImports`; scripts `lint` = `biome check .`, `lint:fix` = `biome check --write .`). Sem ESLint/Prettier. |
| Execução | **Sempre via Docker.** `docker compose` em `src/` pra dev e prod. Comandos de uv/pnpm rodam dentro dos containers (`docker compose exec backend uv run ...`, `docker compose exec frontend pnpm ...`). CI é a única exceção (roda uv/pnpm direto no runner, por cache e velocidade). |
| Etapas | **Duas etapas independentes, em qualquer ordem.** FRONTEND: só `src/frontend/**`, roda 100% em mock. BACKEND: `src/backend/**` + `src/e2e/**` + toda a infra (`src/docker-compose*.yml`, `src/nginx/`, `src/docker/`, `src/.env.example`, `.github/`, `.gitignore`). Nenhum arquivo é tocado pelas duas etapas. |
| Banco | PostgreSQL 16 local (dev/CI); Supabase (Postgres gerenciado, plano Free) apontado por env. Duas roles: `leiloes_owner` (migrations) e `leiloes_app` (DML only). RLS em todas as tabelas. |
| LLM | Interface `app/llm/base.py` com driver escolhido por `LLM_PROVIDER`: `fake` (fixtures, dev/testes) e `anthropic` (SDK `anthropic`, `messages.parse` com schema Pydantic, modelo `ANTHROPIC_MODEL`, default `claude-opus-5-5`). **A entrega roda com `fake`**; `anthropic` é opcional, ativado por env. Driver Ollama fica pra depois pela mesma interface. |
| Bens | **Só imóveis** no v1 (schema `BemPenhorado` é o do checklist de imóveis). Veículos = outro schema, depois. |
| PDF | `pypdf`. Premissa: PDF do PJe tem camada de texto. Sem texto → processo em `erro`. Texto cortado em `LLM_MAX_CHARS` (default 600000). |
| Edital | Jinja2 → Markdown, **editável** depois de gerado (`PUT /editais/{id}`). Download `.md` e `.docx` (conversor simples Markdown→DOCX com `python-docx`). Só a minuta **estadual**; `Checklist.tipo_justica` registra estadual/federal pra v2 trocar template. PDF fora do v1. |
| Revisão humana | Sem gate. Aviso visual fixo no checklist e no edital: "Gerado por IA a partir do PDF — revise antes de usar." |
| Planilha | `openpyxl`, colunas nossas, regenerada do banco a cada download/envio (idempotente). |
| Envio | SMTP via `smtplib` em `asyncio.to_thread`. **A entrega usa `EMAIL_BACKEND=file`** (`.eml` em `MEDIA_ROOT/outbox/`); SMTP opcional por env. Destinatários em `MARKETING_EMAILS`. |
| Análise | `POST /processos/{id}/analisar` é síncrono (aguarda LLM). nginx `proxy_read_timeout 300s`. |
| Auth | Login usuário/senha, sessão em cookie HttpOnly. **Dois perfis**: `admin` (tudo + apagar processo, cancelar leilão, gerir bloqueios, gerir usuários) e `operador` (upload, analisar, editar checklist, agendar, gerar/editar edital, enviar marketing, trocar a própria senha). Usuários geridos por admin na UI; primeiro admin via CLI. |
| Agenda | Dia "livre" = dia útil (seg–sex) **e** não feriado (lib `holidays`, `BR` + `subdiv="PA"`) **e** não bloqueado manualmente. **Sem limite de leilões por dia.** Janela 30–45 dias **corridos** a partir de hoje; 2º leilão = 1º + 7 dias; se D+7 não é livre, descarta D. Hora única `HORARIO_LEILAO`; data manual manda só a data. |
| Dados | Retenção manual: dado fica até admin apagar o processo (apaga PDF, texto, checklist). Backup diário de `pgdata` + `media` no compose prod, retenção 7 dias. |
| Logs | JSON em stdout com `request_id` (nginx `X-Request-ID`), nível por `LOG_LEVEL`. Nunca corpo de request, PDF, texto extraído ou segredo. |
| Paginação | Nenhuma no v1 (listas pequenas). |
| TLS | Terminado fora do nginx deste compose (LB/proxy externo). `COOKIE_SECURE` por env: `true` só atrás de HTTPS. |
| Timezone | `TIMEZONE=America/Belem`. Banco guarda UTC (`timestamptz`); API devolve ISO 8601 com offset. |
| CI/CD | GitHub Actions. CI em PR (lint, testes, build de imagem, audit, **e2e Playwright contra o compose**). CD em `main`: publica imagens no GHCR e faz deploy por SSH num servidor com Docker Compose, com aprovação manual (environment `production`). Alvo do deploy ainda não decidido — job fica pronto, só roda com os secrets. |
| Sessões de IA | Hook `Stop` do Claude Code (`.claude/settings.json` → `.claude/hooks/exportar-sessao.py`) extrai do transcript só os prompts do usuário e as respostas em texto do Claude (sem thinking, tool calls, tool results, anexos nem mensagens de sistema) e grava em `prompts/sessoes/claude-code/<data>-<session_id>.md` a cada turno. Antes de gravar, mascara dados sensíveis: senhas/tokens/chaves (`chave=valor`, `senha \`x\``, pares usuário/senha), JWT, chaves privadas, credenciais em URL, e-mail, CPF, CNPJ, nº de processo CNJ, telefone, IP, host de túnel e `/home/<usuário>`. Transcript bruto (`.jsonl`) nunca vai pro repo. Exportações de outras ferramentas vão manualmente pra `prompts/sessoes/<ferramenta>/`. |

## 3. Estrutura do repositório

```
.
├── README.md                     URL, dupla, stack, como rodar, ferramentas, modelos, saída do cloc
├── CLAUDE.md                     policies + índice pra agents de IA
├── .claude/                      settings.json (hook Stop) · hooks/exportar-sessao.py
├── .github/                      workflows/ci.yml · workflows/deploy.yml · dependabot.yml
├── .gitignore
├── SPEC/                         uma spec por parte, datada · referencias/ (docs do domínio)
├── prompts/
│   ├── planos/                   planos de implementação (superpowers)
│   └── sessoes/claude-code/      prompts e respostas das sessões, mascarados (hook automático)
└── src/                          aplicação
    ├── docker-compose.yml        dev
    ├── docker-compose.prod.yml   prod
    ├── .env.example
    ├── docker/postgres/init/01-roles.sh
    ├── docker/supabase/01-roles.sql
    ├── nginx/dev.conf  nginx/prod.conf
    ├── backend/                  FastAPI (ver spec backend §Layout)
    ├── frontend/                 React + Vite (ver spec frontend §Layout)
    └── e2e/                      Playwright, um cenário feliz contra o compose (ver spec infra §8)
```

Não existe `tests/` na raiz: testes do backend ficam em `src/backend/tests/`, do frontend em `src/frontend/src/**/*.test.tsx`, e2e em `src/e2e/`.

## 4. Fora do escopo v1

PDF escaneado/OCR, PDF do edital, minuta federal, bens que não sejam imóveis, Google Sheets/Calendar, paginação, perfis além de admin/operador, retenção automática por prazo, TLS no compose, driver Ollama, Sentry/APM, processamento assíncrono com fila.
