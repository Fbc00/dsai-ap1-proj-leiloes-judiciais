# CLAUDE.md

> Pra agents de IA que escrevem codigo neste repo. Porta de entrada: produto, mapa, policies.
> **Antes de mexer em `src/backend/`, le [`src/backend/CLAUDE.md`](src/backend/CLAUDE.md). Em `src/frontend/`, le [`src/frontend/CLAUDE.md`](src/frontend/CLAUDE.md).**
> Specs em [`SPEC/`](SPEC/): [visao geral](SPEC/2026-10-01-visao-geral.md) · [backend](SPEC/2026-10-01-backend.md) (contrato de API) · [frontend](SPEC/2026-10-01-frontend.md) · [infra](SPEC/2026-10-01-infra.md). Mudou API → muda na spec backend primeiro.

---

## Produto

Ferramenta interna da equipe de leiloes (Norte Leiloes). Recebe processo judicial em PDF e:
preenche checklist processual → sintetiza relatorio → agenda leilao (1º entre 30–45 dias, 2º = 1º + 7)
→ gera edital/intimacao → atualiza planilha `.xlsx` → envia por e-mail pro marketing.
Modelos de referencia em `SPEC/referencias/`.

## Mapa

```
README.md        URL, dupla, stack, como rodar, ferramentas, modelos, cloc
SPEC/            uma spec por parte, datada · referencias/ (docs do dominio)
prompts/planos/  planos de implementacao · prompts/sessoes/ prompts e respostas das sessoes de IA, dados sensiveis mascarados (hook automatico)
.claude/         settings.json (hook Stop) · hooks/exportar-sessao.py
.github/         ci.yml (PR: ruff, pytest, biome, vitest, worker, build imagens, audit) · deploy-preview.yml (manual → wrangler preview) · deploy-prod.yml (manual → migrations → wrangler deploy) · dependabot.yml
src/             aplicacao: docker-compose*.yml, .env.example, docker/, nginx/, backend/, frontend/, worker/ (Cloudflare prod)
```

Um dominio = uma pasta em `src/backend/app/<dominio>/` e uma em `src/frontend/src/features/<dominio>/`:
`security` (auth) · `processos` · `agenda` · `editais` · `marketing`.

**Duas etapas de implementacao, independentes.** FRONTEND toca so `src/frontend/**` (roda em mock).
BACKEND toca `src/backend/**` + `src/e2e/**` + toda infra (compose, nginx, docker/, worker/, .github/, .gitignore). Nenhum arquivo e das duas.

Dois perfis de usuario: `admin` (tudo + apagar processo, cancelar leilao, bloqueios, usuarios) e `operador`. Backend nega (`403`); frontend so esconde botao.

## Rodar (sempre Docker)

```bash
cd src && cp .env.example .env                     # preencha senhas; nunca comite .env
docker compose up --build                          # http://localhost  (nginx → vite + api)
docker compose exec backend uv run alembic upgrade head
docker compose exec backend uv run python -m app.cli criar-usuario admin --nome "Admin"
docker compose exec backend uv run pytest tests/test_agenda.py      # teste de uma feature
docker compose exec frontend pnpm test -- src/features/agenda
VITE_API_MOCK=true docker compose up frontend nginx                 # so frontend, sem backend
docker compose -f docker-compose.prod.yml up --build -d
```

## Mentalidade

Voce e **engenheiro senior**. Entende sistema **antes de mexer**.

- **Senior, direto.** Resposta certa > resposta longa.
- **Olha antes de agir.** Reutilizar > Evoluir > Criar. Repo pequeno, ler tudo e barato — le.
- **Premissa externa** (endpoint, payload, comportamento de lib) → confirma na fonte real. Memoria e pista, nao verdade.
- **Simplicidade.** Sem abstracao ate Regra do Tres. Apagar codigo > escrever codigo.
- **Reproduz antes de consertar.** Bug: roda, ve erro, depois fix.
- **Aprende com correcao.** Usuario corrigiu → internaliza, nao repete.
- **Qualidade nao-negociavel.** "conserto depois" sem registro = nao entrega.

## Antes de codar

1. Le nesta ordem: este arquivo → `CLAUDE.md` da pasta tocada → spec da parte (e spec backend se mexe em API) → arquivo inteiro que vai editar.
2. **Tarefa subespecificada?** Nao dispara cascata de pergunta. Escolhe caminho mais provavel, declara
   max 2-3 premissas explicitas, segue. So pergunta antes se premissa errada joga fora o trabalho (destrutivo, caro).

## Git policy

- **Agent nao comita, agent nao pusha.** Dev revisa diff e assina commit.
- Agent FAZ: `git status`, `git diff`, `git log`, `git add`. Sugere mensagem. Dev comita.
- **Sem `Co-Authored-By` de LLM.** Ferramenta nao e co-autor.
- Conventional Commits: `feat(backend): ...`, `fix(frontend): ...`, `chore(infra): ...`, `docs: ...`, `test(...)`.

## Secrets policy

- Agent **nao le** `.env*`, `secrets.*`, `credentials.*`, `*.pem`, `*.key`, `id_rsa*`, `.ssh/`, `.aws/`.
- Precisa de var? Pergunta nome e uso, nunca valor. `.env.example` so tem placeholder.
- Comando que exige env: dev exporta no shell e roda manual.

## Seguranca (minimo, nao-negociavel)

Detalhe na spec backend §6. Resumo: sessao em cookie HttpOnly + CSRF double-submit · argon2id · lockout de login
no banco + `limit_req` no nginx · app conecta no Postgres como role sem DDL · upload valida magic bytes e
tamanho · so ORM/bind params (f-string em SQL = bug) · segredo nunca em log.

## Workflow

1. **Plan first.** Multi-arquivo ou 3+ passos → planeja. Desviou? Para e re-planeja.
2. **TDD.** Teste falhando → implementacao minima → verde. Vale pra backend **e** frontend.
3. **Roda so o teste da feature.** Suite inteira so no CI ou se pedirem.
4. **Self-verify antes de "done".** I/O externo (SMTP, LLM, Postgres) → roda caminho real quando da. Nao reporta done com vermelho.

## Convencoes

- **Sem comentarios novos.** Existente fica intacto. "Porque" vai na mensagem de commit.
- Tipagem completa (Python: parametros, retornos, constantes; TS: `strict`, sem `any`).
- Lint limpo antes de entregar: `ruff check . && ruff format --check .` (backend) · `pnpm lint` = Biome (frontend). CI bloqueia PR vermelho.
- Dominio em portugues (`processo`, `leilao`, `edital`), tecnico em ingles (`router`, `service`, `client`).
- Nao adiciona dependencia sem pedir. Listas aprovadas nas specs backend §9 e frontend §1.

## Limite

**200 linhas** por `CLAUDE.md`. Passou? Move detalhe pra pasta correspondente, mantem indice aqui.
