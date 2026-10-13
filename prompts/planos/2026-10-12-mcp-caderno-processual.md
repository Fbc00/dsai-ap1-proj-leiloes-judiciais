# Servidor MCP do caderno processual (pré-leilão) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor o caderno processual do pré-leilão (checklist + relatório + leilão agendado + pendências que travam o leilão) para clientes MCP (Claude Desktop/Code, agentes internos), via servidor MCP em `src/backend/app/mcp_server.py`, montado no FastAPI em `/mcp` (transporte Streamable HTTP), **somente leitura** no v1.

**Architecture:** `app/mcp_server.py` cria um `MCPServer` (SDK oficial `mcp` 2.x — `FastMCP` foi renomeado) com tools finas que só abrem sessão de banco e chamam funções **já existentes** de `processos/service.py` e `agenda/service.py`; a única regra nova (`pendencias_pre_leilao`) é função pura em `processos/service.py`, testada isolada. `app/main.py` monta `mcp.streamable_http_app(...)` em `/mcp` atrás de um wrapper ASGI de Bearer token (`MCP_TOKEN`), e roda `mcp.session_manager.run()` no `lifespan` do FastAPI (sub-app montada não tem lifespan próprio). Modo `stateless_http=True` + `json_response=True`: sem sessão em memória, funciona com a instância única do container Cloudflare e com reload do uvicorn. nginx e Worker passam a encaminhar `/mcp` pro backend.

**Tech Stack:** Python 3.12 · FastAPI · `mcp>=2.3,<3` (**dependência nova, precisa de aprovação**) · SQLAlchemy async · pytest + httpx · nginx · Cloudflare Worker (TS/vitest).

**Spec:** `SPEC/2026-10-01-backend.md` (§3 API, §6 segurança, §7 envs, §9 deps) — **atualizada primeiro (Task 1)**. Modelo do caderno: `SPEC/referencias/DOC 1 modelo checklist - imoveis.md`. Convenções: `src/backend/CLAUDE.md`. Etapa: **BACKEND** (toca `src/backend/**`, `src/nginx/`, `src/worker/`, `src/.env.example`, `SPEC/`).

## Premissas (declaradas, não perguntadas)

1. **"Caderno processual do pré-leilão" = `Checklist` + `Relatorio` + `LeilaoOut` ativo do processo**, mais uma lista derivada de pendências. Nada de edital/marketing no MCP v1.
2. **Somente leitura no v1.** Nenhuma tool muta (sem `editar_checklist`, `analisar`, `criar_leilao`). Motivo: MCP não tem CSRF nem perfil de usuário; escrita pede auditoria por usuário. Fica como próximo passo.
3. **Auth por token estático** `MCP_TOKEN` (`SecretStr`, mín. 32 chars). Vazio ⇒ `/mcp` **não é montado** (404). Não usamos o OAuth do SDK (`AuthSettings`/`TokenVerifier`) — exige authorization server, desproporcional pra ferramenta interna de 2 perfis.

## Pontos que precisam de OK antes de codar

- **Dependência `mcp`** não está na lista aprovada (spec backend §9). Traz transitivas: `httpx2`, `pyjwt[crypto]`, `sse-starlette`, `opentelemetry-api`, `jsonschema`, e exige `pydantic>=2.12`. Alternativa sem dep: JSON-RPC Streamable HTTP na mão (~300 linhas, reimplementar `initialize`/`tools/list`/`tools/call` e versão de protocolo) — **não recomendado**.
- **Escopo das pendências** (Task 3): regras abaixo saem do modelo de checklist; confirmar se a equipe quer exatamente essas.

## Global Constraints

- Tudo via Docker de `src/`: `B="docker compose exec backend"`; `$B uv run pytest tests/test_mcp.py -v`; `$B uv run ruff check . && $B uv run ruff format --check .`.
- Worker: `cd src/worker && pnpm test` (vitest) e `pnpm exec tsc --noEmit`.
- Sem comentários novos. Tipagem completa. Domínio em português, técnico em inglês.
- Tools do MCP **não** reimplementam regra: chamam `service`. Erro de domínio (`ErroDominio` 404) vira erro de tool com a mesma mensagem (`"Processo não encontrado"`), nunca stacktrace.
- Nada de PDF, `texto_extraido`, token ou corpo de request em log. Log do wrapper: só `mcp acesso negado` + IP.
- Token comparado com `hmac.compare_digest`. Nunca logado.
- **Git:** agente não comita. Último step de cada task = `git add` + mensagem sugerida (Conventional Commits, sem `Co-Authored-By`).

## Review Focus

1. **CSRF vs. MCP:** `CsrfMiddleware` envolve o app inteiro e bloquearia todo `POST /mcp` (403). `/mcp` é isento **porque** não aceita cookie como credencial — só Bearer. Teste: `POST /mcp` com cookie de sessão válido e sem Bearer → 401 (cookie não autentica). *Task 4 `test_mcp_cookie_de_sessao_nao_autentica`.*
2. **DNS-rebinding do SDK:** com `host` default `127.0.0.1` o SDK liga proteção com `allowed_hosts=["127.0.0.1:*","localhost:*"]` → atrás do Worker (Host = domínio de prod) daria 421. Passamos `TransportSecuritySettings(enable_dns_rebinding_protection=False)` explicitamente: o ataque depende de credencial ambiente (cookie) e aqui a credencial é Bearer. *Task 4 `test_mcp_aceita_host_de_producao`.*
3. **`/mcp` vs `/mcp/`:** `Mount("/mcp")` + `streamable_http_path="/"` responde em `/mcp/` e redireciona `/mcp` (307) — alguns clientes não seguem 307 em POST. Teste cobre `POST /mcp` direto devolvendo 200. Se falhar, trocar o mount por rota exata (ver Task 4 step 5).
4. **Processo sem checklist** (`status="recebido"`/`"erro"`): `obter_caderno` devolve `checklist: null` e `pendencias_pre_leilao` devolve uma única pendência `"Processo ainda não analisado"`, sem exceção. *Task 3 e Task 5.*
5. **Token curto/vazio em prod:** `MCP_TOKEN` com <32 chars e `APP_ENV=prod` → `Settings` falha no boot. *Task 2 `test_mcp_token_curto_em_prod_falha`.*

---

### Task 1: Spec backend primeiro

**Files:**
- Modify: `SPEC/2026-10-01-backend.md` (§3 nova subseção "MCP", §6 linha de auth MCP, §7 `MCP_TOKEN`, §9 dep `mcp`)
- Modify: `src/backend/CLAUDE.md` (layout: `mcp_server.py`; deps aprovadas: `mcp`)

- [ ] **Step 1:** Em §3, adicionar subseção `### MCP (/mcp, Streamable HTTP, Bearer MCP_TOKEN)` com a tabela de tools:

| Tool | Entrada | Saída | Service usado |
|---|---|---|---|
| `listar_processos` | `status: ProcessoStatus \| None = None` | `list[ProcessoOut]` | `processos.service.listar` (+ filtro) |
| `obter_caderno` | `processo_id: UUID` | `ProcessoDetalheOut` (checklist, relatorio, leilao) | `processos.service.detalhe` |
| `pendencias_pre_leilao` | `processo_id: UUID` | `list[Pendencia]` | `processos.service.obter` + `pendencias` (pura, nova) |

E o schema novo `Pendencia { gravidade: "bloqueia" \| "atencao"; campo: str; mensagem: str; ref: str \| null }`.
- [ ] **Step 2:** §6: "`/mcp`: só leitura, Bearer `MCP_TOKEN` (compare_digest), isento de CSRF por não aceitar cookie; `MCP_TOKEN` vazio ⇒ rota desligada."
- [ ] **Step 3:** §7: `MCP_TOKEN=` (placeholder vazio). §9: `mcp>=2.3,<3`.
- [ ] **Step 4:** `git add SPEC/2026-10-01-backend.md src/backend/CLAUDE.md` — sugerir `docs(spec): servidor MCP do caderno processual`.

### Task 2: `MCP_TOKEN` em Settings + dependência

**Files:**
- Modify: `src/backend/app/config.py`, `src/.env.example`
- Modify: `src/backend/pyproject.toml`, `src/backend/uv.lock` (via `uv add`)
- Test: `src/backend/tests/test_config.py`

**Interfaces:**
- Produces: `Settings.MCP_TOKEN: SecretStr = SecretStr("")`; `Settings.mcp_habilitado: bool` (property: token não vazio).

- [ ] **Step 1 (teste falhando):** `test_mcp_desabilitado_por_padrao` (`mcp_habilitado is False`), `test_mcp_token_curto_em_prod_falha` (`APP_ENV=prod`, `MCP_TOKEN="x"*10` → `ValidationError`), `test_mcp_token_valido_habilita`.
- [ ] **Step 2:** Rodar `$B uv run pytest tests/test_config.py -v` → vermelho.
- [ ] **Step 3:** Campo + property + checagem no `model_validator` já existente (só quando token não vazio e `len < 32`, em qualquer env; `prod` não exige token).
- [ ] **Step 4:** Verde. `$B uv add "mcp>=2.3,<3"` (**só após aprovação**). Conferir `uv.lock` e que `pydantic` resolvido ≥2.12 não quebra a suíte de schemas: `$B uv run pytest tests/test_processos.py tests/test_config.py -v`.
- [ ] **Step 5:** `.env.example`: `MCP_TOKEN=` (vazio). `git add` — sugerir `feat(backend): MCP_TOKEN e dependencia mcp`.

### Task 3: Regra pura de pendências do pré-leilão

**Files:**
- Modify: `src/backend/app/processos/schemas.py` (add `Pendencia`, `Gravidade`)
- Modify: `src/backend/app/processos/service.py` (add `pendencias(checklist: Checklist | None) -> list[Pendencia]`)
- Test: `src/backend/tests/test_processos.py`

**Regras** (do modelo `DOC 1 modelo checklist - imoveis.md`; `campo` = caminho no checklist, `ref` = referência dos autos quando houver):

| Condição | Gravidade | Mensagem |
|---|---|---|
| `checklist is None` | bloqueia | Processo ainda não analisado |
| `executados` vazio | bloqueia | Nenhum executado identificado |
| `executados[i].citado is not True` | bloqueia | Citação de {nome} não comprovada |
| `bens` vazio | bloqueia | Nenhum bem penhorado |
| `bens[i].executado_intimado is not True` | bloqueia | Intimação da penhora do bem {i+1} não comprovada |
| `bens[i]` sem `valor_avaliacao` e sem `valor_reavaliacao` | bloqueia | Bem {i+1} sem avaliação |
| `bens[i].certidao_matricula_ref is None` | atencao | Certidão de matrícula do bem {i+1} sem referência nos autos |
| `bens[i].hipoteca` / `enfiteuse` / `outras_penhoras` preenchidos | atencao | Bem {i+1}: {campo} — intimar credor/senhorio |
| cada item de `observacoes_leilao` | atencao | (texto do item) |

- [ ] **Step 1 (testes falhando):** um teste por linha da tabela, ex.: `test_pendencias_sem_checklist_bloqueia`, `test_pendencias_executado_nao_citado_bloqueia`, `test_pendencias_bem_com_hipoteca_gera_atencao`, `test_pendencias_checklist_completo_vazio` (checklist da fixture `app/llm/fixtures/Checklist.json` ajustado → `[]`).
- [ ] **Step 2:** Vermelho. **Step 3:** Implementar função pura (sem banco, sem `hoje`). **Step 4:** Verde + ruff.
- [ ] **Step 5:** `git add` — sugerir `feat(backend): pendencias do pre-leilao a partir do checklist`.

### Task 4: `mcp_server.py` + montagem em `/mcp` com Bearer

**Files:**
- Create: `src/backend/app/mcp_server.py`
- Modify: `src/backend/app/main.py` (lifespan + mount condicional)
- Modify: `src/backend/app/security/csrf.py` (isentar prefixo `/mcp`)
- Test: `src/backend/tests/test_mcp.py`

**Interfaces:**
- Produces:
  - `app.mcp_server.criar_servidor() -> MCPServer` — registra as 3 tools (`annotations=ToolAnnotations(...)` com o hint read-only — nome exato do campo conferir no pacote `mcp-types` instalado), `instructions` curto em PT explicando o caderno e o aviso "Gerado por IA a partir do PDF — revise antes de usar."
  - `app.mcp_server.abrir_sessao() -> AbstractAsyncContextManager[AsyncSession]` — usa `get_session_factory()`; ponto único que os testes fazem `monkeypatch` pra sessão transacional.
  - `app.mcp_server.ExigeBearer(app: ASGIApp, token: SecretStr)` — ASGI puro: `Authorization: Bearer <t>` com `compare_digest`, senão `401 {"detail": "Não autenticado"}` + `WWW-Authenticate: Bearer`.
  - Em `create_app()`: se `settings.mcp_habilitado`, `servidor = criar_servidor()`, `app.mount("/mcp", ExigeBearer(servidor.streamable_http_app(streamable_http_path="/", stateless_http=True, json_response=True, transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False)), settings.MCP_TOKEN))` e `lifespan` que faz `async with servidor.session_manager.run(): yield`.
  - `csrf.ROTAS_ISENTAS` permanece; adicionar `PREFIXOS_ISENTOS: tuple[str, ...] = ("/mcp",)`.

- [ ] **Step 1 (testes falhando)** em `tests/test_mcp.py`. Fixture `cliente_mcp`: `create_app()` novo com `settings_teste` + `MCP_TOKEN`, `monkeypatch` de `abrir_sessao` pra sessão do teste, e `async with app.router.lifespan_context(app)` (ASGITransport não roda lifespan; `session_manager.run()` só pode rodar uma vez por instância → app novo por teste). Testes:
  - `test_mcp_sem_token_401`, `test_mcp_token_errado_401`, `test_mcp_cookie_de_sessao_nao_autentica`
  - `test_mcp_desligado_sem_token_configurado_404`
  - `test_mcp_initialize_e_tools_list` — JSON-RPC `initialize` → `tools/list` contém exatamente `listar_processos`, `obter_caderno`, `pendencias_pre_leilao`
  - `test_mcp_post_sem_barra_final_200` (Review Focus 3), `test_mcp_aceita_host_de_producao` (header `Host: leiloes.exemplo`)
  - `test_mcp_nao_exige_csrf`
- [ ] **Step 2:** Vermelho. **Step 3:** Implementar `mcp_server.py`, mount, lifespan, isenção CSRF.
- [ ] **Step 4:** Verde: `$B uv run pytest tests/test_mcp.py tests/test_security.py tests/test_health.py -v` (garante que CSRF e app existente não regrediram).
- [ ] **Step 5 (só se Step 4 falhar no `/mcp` sem barra):** trocar o mount por `app.router.routes.append(Route("/mcp", endpoint=<asgi>, methods=["GET","POST","DELETE"]))` com o handler ASGI do SDK; re-rodar.
- [ ] **Step 6:** ruff. `git add` — sugerir `feat(backend): servidor MCP do caderno processual em /mcp`.

### Task 5: Tools com dados reais (integração)

**Files:**
- Modify: `src/backend/app/mcp_server.py`
- Test: `src/backend/tests/test_mcp.py`

- [ ] **Step 1 (testes falhando)**, via `tools/call` pelo HTTP, usando fixtures existentes de processo analisado (`LLM_PROVIDER=fake`):
  - `test_mcp_listar_processos_filtra_status`
  - `test_mcp_obter_caderno_traz_checklist_relatorio_e_leilao` (processo com leilão agendado via `agenda.service.criar_leilao`)
  - `test_mcp_obter_caderno_processo_recebido_checklist_null`
  - `test_mcp_obter_caderno_inexistente_erro_de_tool` (`isError: true`, texto `"Processo não encontrado"`, sem stacktrace)
  - `test_mcp_pendencias_processo_analisado`
  - `test_mcp_nao_expoe_texto_extraido` (nenhuma resposta contém `texto_extraido` nem trecho de `TEXTO_PROCESSO`)
- [ ] **Step 2:** Vermelho. **Step 3:** Tools retornam modelos Pydantic (saída estruturada automática pelo tipo de retorno); `ErroDominio` capturado e relançado como `ToolError` do SDK com `exc.detail`.
- [ ] **Step 4:** Verde + ruff. `git add` — sugerir `test(backend): tools do MCP contra Postgres real`.

### Task 6: nginx e Worker encaminham `/mcp`

**Files:**
- Modify: `src/nginx/dev.conf` (`location /mcp { proxy_pass` backend; `proxy_buffering off;` `limit_req` igual ao de `/api/` }`)
- Modify: `src/worker/src/proxy.ts` (`ehApi` → também `/mcp` e `/mcp/*`; renomear pra `ehBackend` se a Regra do Três justificar, senão só estender)
- Test: `src/worker/test/proxy.test.ts`

- [ ] **Step 1 (teste falhando):** `reconhece /mcp e subrotas` / `nao confunde /mcpx`; `encaminha /mcp para o container`.
- [ ] **Step 2:** Vermelho (`pnpm test`). **Step 3:** Implementar. **Step 4:** Verde + `tsc --noEmit` + Biome do worker se houver.
- [ ] **Step 5:** nginx: `docker compose up -d --build nginx backend` e smoke manual:
  `curl -s -X POST http://localhost/mcp -H "Authorization: Bearer $MCP_TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` (dev exporta `MCP_TOKEN` no shell; agente não lê `.env`).
- [ ] **Step 6:** `git add` — sugerir `chore(infra): encaminha /mcp no nginx e no worker`.

### Task 7: Self-verify e docs de uso

- [ ] **Step 1:** Cliente real: dev roda `claude mcp add --transport http leiloes http://localhost/mcp --header "Authorization: Bearer $MCP_TOKEN"` e pede "liste os processos analisados e as pendências do primeiro". Conferir as 3 tools.
- [ ] **Step 2:** README: seção curta "MCP" (URL, header, tools). `deploy-prod.yml`/wrangler: registrar `MCP_TOKEN` como secret (dev executa `wrangler secret put MCP_TOKEN`).
- [ ] **Step 3:** `$B uv run ruff check . && $B uv run ruff format --check .`; `$B uv run pytest tests/test_mcp.py tests/test_processos.py tests/test_config.py -v`. Nada vermelho.
- [ ] **Step 4:** `git status` / `git diff --stat`; sugerir mensagem final. Dev comita.

## Fora do escopo (v2)

- Tools de escrita (`editar_checklist`, `analisar`, `agendar_leilao`) — exigem token por usuário + auditoria + perfil.
- Resources MCP (`caderno://{id}`) e prompts — só se algum cliente precisar; tools cobrem.
- OAuth do SDK (`AuthSettings`) / token por usuário com expiração.
- Edital, intimação, planilha e marketing via MCP.
