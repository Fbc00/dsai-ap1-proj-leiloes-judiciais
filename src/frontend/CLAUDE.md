# frontend/CLAUDE.md

React 19 · **TypeScript obrigatorio** · Vite · `pnpm` · React Router · TanStack Query · Tailwind v4 · MSW · Vitest + Testing Library · **Biome** (lint + format).
Esta pasta e a etapa FRONTEND, isolada: so toca `src/frontend/**`. Compose, nginx e `.github/` sao da etapa backend.
Spec desta parte: `SPEC/2026-10-01-frontend.md`. Contrato de tipos e rotas: `SPEC/2026-10-01-backend.md` §2–§3 — `src/api/types.ts` espelha §2 com nomes identicos; handlers MSW espelham §3.

## Layout

```
src/
  main.tsx            inicia MSW se VITE_API_MOCK=true, depois monta <App/>
  app/                rotas.tsx (RouteObject[] + RotaProtegida/RotaAdmin), router.ts (createBrowserRouter), providers.tsx, Layout.tsx
  api/
    client.ts         fetch wrapper: base /api, credentials same-origin, X-CSRF-Token em mutacao, 401 → /login, erro → ApiError
    types.ts          tipos da spec backend §2 (unica fonte; sem redefinir em feature)
    <recurso>.ts      funcoes puras por endpoint (auth, usuarios, processos, agenda, editais, marketing) + query keys
    mocks/            handlers.ts (todas as rotas), db.ts (estado + fixtures), regrasAgenda.ts, feriados.ts, browser.ts, server.ts
  lib/                formatar.ts (moeda, data), datas.ts (helpers puros de calendario)
  features/<dominio>/ pagina + componentes + hooks (useQuery/useMutation) + *.test.tsx do dominio
  components/         UI compartilhada (Botao, Card, Field, Alerta, StatusBadge, Dialog, AvisoIA, ErrorBoundary)
  test/               setup.ts (jest-dom + MSW server + db.reset), render.tsx (renderComApp, renderComRouter)
```

Um dominio por pasta: `auth` · `usuarios` · `processos` · `agenda` · `editais` · `marketing`. Componente de dominio nao importa de outro dominio; o que e comum sobe pra `components/`. Excecao: `ProcessoDetalhePage` compoe os cards de agenda/editais/marketing.
Acao so de admin: `useUsuario().ehAdmin` esconde o botao; backend e quem nega. Toda acao admin tem dois testes (admin ve e usa; operador nao ve).

## Comandos

Tudo via Docker, de `src/` (`F="docker compose exec frontend"`):

```bash
cd src && docker compose up --build -d frontend nginx       # vite atras do nginx em http://localhost
VITE_API_MOCK=true docker compose up frontend nginx         # modo mock — funciona sem backend
$F pnpm test -- src/features/agenda                         # so o teste da feature
$F pnpm typecheck                                           # tsc --noEmit -p tsconfig.app.json
$F pnpm lint                                                # biome check .   (lint + format + imports, so reporta)
$F pnpm lint:fix                                            # biome check --write .
$F pnpm build
$F pnpm add <pacote>                                        # dependencia nova (so com aprovacao)
```

Sem o compose (etapa frontend antes da backend): `docker run --rm -it -v "$PWD/frontend:/app" -w /app -p 5173:5173 node:22-alpine sh -c "corepack enable && pnpm install && pnpm dev:mock --host"`.

## Mock da API (MSW)

- Handlers em `src/api/mocks/handlers.ts` cobrem **todas** as rotas da spec §6, com os mesmos status/erros.
- Estado em `db.ts` (arrays em memoria + `reset()`); fixtures incluem usuario `admin`/`admin`, processos, leilao, bloqueio.
- Mesmos handlers rodam no browser (`browser.ts`, `setupWorker`) e no Vitest (`server.ts`, `setupServer`).
- Nova rota no backend → novo handler aqui no mesmo PR. Mock desatualizado = bug.

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`. **`any` proibido** — use `unknown` + narrowing.
- Nenhum `.js`/`.jsx` em `src/`. Tipos de API so em `api/types.ts`.
- Dinheiro chega como string (`"1234.56"`); formata com `Intl.NumberFormat('pt-BR', { currency: 'BRL' })`. Datas ISO → `Intl.DateTimeFormat('pt-BR')`.

## Seguranca (spec backend §6, spec frontend §6)

- `client.ts` le cookie `csrf_token` e manda `X-CSRF-Token` em POST/PUT/PATCH/DELETE. Sem isso backend devolve 403.
- 401 em qualquer chamada → limpa cache do QueryClient e redireciona `/login`.
- Markdown do edital renderiza com `react-markdown` **sem** `rehype-raw`. Nunca `dangerouslySetInnerHTML`.
- Nenhum segredo em `VITE_*` (tudo que comeca com `VITE_` vai pro bundle).

## Testes (obrigatorios)

- Toda pagina/feature tem `*.test.tsx`: renderiza com providers de teste (`src/test/render.tsx`), interage com `userEvent`, afirma no DOM.
- Rede sempre via MSW `server` (setup global). Para cenario de erro, `server.use(...)` sobrescreve o handler no teste.
- Sem snapshot test. Sem testar implementacao (estado interno, chamadas de hook) — testa o que o usuario ve.
- Nome descreve comportamento: `it('mostra erro de credenciais invalidas')`.

## Convencoes

- Sem comentarios novos. Componentes funcionais, props tipadas por `type`. Nomes de dominio em portugues.
- Estado de servidor = TanStack Query. Estado local = `useState`. Sem Redux/Zustand.
- `pnpm lint` (Biome 2.x) + `pnpm typecheck` limpos antes de entregar. Config em `biome.json`: `recommended`, indent 2, `lineWidth` 100, aspas simples, `semicolons: asNeeded`, `organizeImports`. Sem ESLint, sem Prettier.
- Deps aprovadas: react, react-dom, react-router, @tanstack/react-query, react-markdown, tailwindcss, @tailwindcss/vite.
  Dev: typescript, vite, @vitejs/plugin-react, vitest, jsdom, @testing-library/{react,user-event,jest-dom}, msw, @biomejs/biome. Outra → pergunta.
