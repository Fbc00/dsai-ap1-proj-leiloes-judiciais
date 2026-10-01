# Frontend — Leilões Judiciais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SPA React + TypeScript que cobre o fluxo completo login → upload de processo → análise → checklist/relatório → agendamento de leilão → edital (editar, baixar .md/.docx) → envio pro marketing, com dois perfis (`admin`/`operador`) e gestão de usuários, funcionando 100% em modo mock (MSW) sem backend e trocando pro `/api` real só por variável de ambiente.

**Architecture:** Vite + React 19 com React Router (rotas protegidas por sessão e por perfil), TanStack Query pra estado de servidor, um `client.ts` único que injeta CSRF e trata 401, e uma camada `src/api/<recurso>.ts` por domínio. MSW provê os mesmos handlers pro browser (`VITE_API_MOCK=true`) e pro Vitest; o estado mock vive em `src/api/mocks/db.ts` e implementa as regras reais da spec (dia útil, feriado BR+PA, bloqueio, janela 30–45, D+7, 403 por perfil), então toda tela é testável de ponta a ponta sem backend.

**Tech Stack:** React 19, TypeScript (strict), Vite, pnpm, react-router v7, @tanstack/react-query v5, react-markdown, Tailwind CSS v4 (`@tailwindcss/vite`), MSW v2, Vitest + jsdom + Testing Library (react, user-event, jest-dom), Biome 2.x (lint + format + organize imports). Tudo roda via Docker.

**Spec:** `SPEC/2026-10-01-frontend.md` (etapa frontend: stack §1, scripts §2, layout §3, páginas §4, client §5, segurança §6, mock §7, testes §8, Vite §9, Dockerfile §10). Contrato de tipos e rotas: `SPEC/2026-10-01-backend.md` §2 (schemas) e §3 (API). Contexto: `SPEC/2026-10-01-visao-geral.md`. Guia da pasta: `src/frontend/CLAUDE.md`.

## Global Constraints

- **Etapa isolada** (visão geral §2 "Etapas"): este plano só toca `src/frontend/**`. `src/docker-compose*.yml`, `src/nginx/`, `src/docker/`, `.github/`, `src/.env.example`, `.gitignore` da raiz são da etapa backend. O serviço `frontend` do compose dev e o job `frontend` do CI são da etapa backend e só dependem dos scripts `pnpm` fixados na spec frontend §2.
- **Execução sempre via Docker** (visão geral §2 "Execução"), de `src/`. Primário: `rtk docker compose exec frontend pnpm <...>`. Se o compose ainda não existe (etapa frontend antes da backend), o equivalente é `rtk docker run --rm -v "$PWD/frontend:/app" -w /app node:22-alpine sh -c "corepack enable && pnpm <...>"` (acrescente `-it` pra sessão interativa e `-p 5173:5173` pro dev server). Todo `Run:` deste plano está na forma primária; a troca é mecânica.
- **TypeScript obrigatório** (spec frontend §1): `strict: true`, `noUncheckedIndexedAccess: true`. `any` proibido (use `unknown` + narrowing). Nenhum `.js`/`.jsx` em `src/`.
- Tipos de API só em `src/api/types.ts`, nomes **idênticos** à spec backend §2 (`numero_processo`, `primeiro_leilao_data`, `tipo_justica`, …). Nenhuma feature redefine tipo de API.
- Dinheiro chega e sai como string decimal `"1234.56"`; formata com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`. Datas ISO → `Intl.DateTimeFormat('pt-BR')` no fuso local, sem deslocar o dia. Nunca `parseFloat` pra guardar valor.
- Deps aprovadas (spec frontend §1): `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `react-markdown`, `tailwindcss`, `@tailwindcss/vite`. Dev: `typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `msw`, `@biomejs/biome`, mais os pacotes de tipos que o TypeScript exige pra React (`@types/react`, `@types/react-dom`). Qualquer outra → perguntar. **Sem ESLint, sem Prettier, sem `create-vite`** (todos os arquivos vêm deste plano).
- Scripts do `package.json` são contrato com o CI (spec frontend §2): `dev`, `dev:mock`, `build`, `preview`, `test`, `test:watch`, `typecheck`, `lint`, `lint:fix` — nomes e comandos exatos da tabela.
- **Biome 2.x** (spec frontend §2) é lint + format + organize imports. Depois de colar código deste plano, rode `pnpm lint:fix` — o formatter normaliza quebra de linha e ordem de import; a semântica é a do plano. Verificação em toda task antes do stage: `pnpm lint:fix && pnpm lint && pnpm typecheck`.
- **Sem comentários novos** em nenhum arquivo (TS, TSX, CSS, JSON, Dockerfile). Comentário existente fica.
- **Teste obrigatório por feature** (spec frontend §8): toda página/card tem `*.test.tsx` que renderiza, interage com `userEvent` e afirma no DOM. Rede sempre via MSW. Sem snapshot, sem testar estado interno. **Toda ação [admin] tem dois testes**: visível e funcional como `admin`; ausente como `operador`.
- Mutação (POST/PUT/PATCH/DELETE) manda `X-CSRF-Token` lido do cookie `csrf_token`. `401` fora do login → redireciona `/login`. `403 Sem permissão` é `ApiError` normal exibido pelo componente (spec frontend §5). Markdown renderiza com `react-markdown` **sem** `rehype-raw`; nunca `dangerouslySetInnerHTML`.
- Handlers mock cobrem **todas** as rotas da spec backend §3 com os mesmos status e `detail` (spec frontend §7). Autorização no mock é por `db.sessao` em memória; header `X-CSRF-Token` não é validado no mock. Rotas **[admin]** devolvem `403 Sem permissão` quando a sessão é de operador.
- Todo comando shell prefixado com `rtk`. Agente **não comita**: último step de cada task é `rtk git add` + mensagem sugerida; dev revisa e comita. Nunca `Co-Authored-By`.
- Roda só o teste da feature tocada: `pnpm test -- src/features/<area>`. Suíte inteira só na última task ou se pedirem.

## Review Focus

1. **Resposta de erro sem JSON** (nginx 502 em HTML, 500 sem corpo): `client.ts` não pode lançar `SyntaxError` — vira `ApiError` com `detail: "Erro inesperado"` (spec frontend §5). Teste em Task 1 (`client.test.ts`).
2. **`403 Sem permissão`** recebido por um operador que chegou numa ação admin por URL/estado antigo: a tela mostra a mensagem e **não** redireciona pro login (spec frontend §5). Teste em Task 1 (`client.test.ts`: 403 não dispara `onNaoAutenticado`).
3. **Checklist com `bens: []`** (processo sem penhora identificada): `ChecklistView` renderiza o resto e mostra "Nenhum bem penhorado identificado", sem crash. Teste em Task 5.
4. **Datetime ISO com offset** (`2026-11-05T10:00:00-03:00`) deve mostrar `05/11/2026, 10:00` no fuso `America/Belem` — nunca deslocar dia por conversão errada. Teste em Task 1 (`formatar.test.ts`).
5. **`numero_processo: null`** (processo só recebido) aparece como `—` na lista e no cabeçalho, nunca `null`/vazio. Teste em Task 4.

---

### Task 1: Scaffold, tipos, client HTTP, infraestrutura de teste e mock

**Files:**
- Create: `src/frontend/package.json`, `src/frontend/.gitignore`, `src/frontend/index.html`, `src/frontend/tsconfig.json`, `src/frontend/tsconfig.app.json`, `src/frontend/tsconfig.node.json`, `src/frontend/vite.config.ts`, `src/frontend/vitest.config.ts`, `src/frontend/biome.json`, `src/frontend/src/vite-env.d.ts`, `src/frontend/src/index.css`, `src/frontend/src/main.tsx`, `src/frontend/src/app/App.tsx` (provisório), `src/frontend/src/api/types.ts`, `src/frontend/src/api/client.ts`, `src/frontend/src/lib/formatar.ts`, `src/frontend/src/api/mocks/db.ts`, `src/frontend/src/api/mocks/fixtures.ts`, `src/frontend/src/api/mocks/feriados.ts`, `src/frontend/src/api/mocks/http.ts`, `src/frontend/src/api/mocks/handlers.ts`, `src/frontend/src/api/mocks/browser.ts`, `src/frontend/src/api/mocks/server.ts`, `src/frontend/src/test/setup.ts`, `src/frontend/src/test/render.tsx`, `src/frontend/public/mockServiceWorker.js` (gerado), `src/frontend/Dockerfile`
- Modify: `src/frontend/CLAUDE.md` (bloco `## Layout`)
- Test: `src/frontend/src/api/client.test.ts`, `src/frontend/src/lib/formatar.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces:
  - `src/api/types.ts`: todos os tipos da spec backend §2 (listados abaixo) + `FeriadoOut = { data: string; motivo: string }` (forma de `GET /agenda/feriados`, spec backend §3).
  - `src/api/client.ts`: `class ApiError extends Error { readonly status: number; readonly detail: string }`, `registrarNaoAutenticado(cb: (() => void) | null): void`, `lerCookie(nome: string): string | null`, `mensagemErro(erro: unknown): string`, `const api: { get<T>(path): Promise<T>; post<T>(path, body?): Promise<T>; put<T>(path, body?): Promise<T>; patch<T>(path, body?): Promise<T>; del(path): Promise<void> }`.
  - `src/lib/formatar.ts`: `formatarDinheiro(valor: string | null): string`, `formatarData(iso: string | null): string`, `formatarDataHora(iso: string | null): string`, `ouTraco(valor: string | null | undefined): string`.
  - `src/api/mocks/db.ts`: tipos `UsuarioMock`, `ProcessoMock`, `LeilaoMock`, `EnvioMock`, `Db`; `const db: Db`; `reset(): void`; `novoId(prefixo: string): string`; `logar(username?: 'admin' | 'operador'): void`; `usuarioLogado(): UsuarioMock | null`; `registrarFalhaLogin(username)`, `limparFalhasLogin(username)`, `segundosBloqueio(username): number`; `leilaoAtivo(processoId): LeilaoMock | null`; `toUsuarioOut(u)`, `toProcessoOut(p)`, `toDetalhe(p)`, `toLeilaoOut(l)`, `toEnvioOut(e)`; constantes `LOGIN_MAX_TENTATIVAS`, `LOGIN_JANELA_MS`, `MARKETING_EMAILS`.
  - `src/api/mocks/fixtures.ts`: `CHECKLIST_EXEMPLO: Checklist` (com `tipo_justica: 'federal'`), `RELATORIO_EXEMPLO: Relatorio`.
  - `src/api/mocks/feriados.ts`: `type Feriado = { data: string; motivo: string }`, `const FERIADOS: readonly Feriado[]` (BR + PA, 2026 e 2027), `feriadosDoAno(ano: number): Feriado[]`.
  - `src/api/mocks/http.ts`: `erro(status, detail): HttpResponse`, `exigirSessao(): HttpResponse | null`, `exigirAdmin(): HttpResponse | null`.
  - `src/api/mocks/handlers.ts`: `const handlers: HttpHandler[]` (começa só com `GET /api/health`; cresce por task).
  - `src/test/render.tsx`: `criarQueryClientDeTeste(): QueryClient`, `renderComApp(ui, { rota? })`.

- [ ] **Step 1: Arquivos base do projeto (sem `create-vite`)**

`src/frontend/` já existe só com `CLAUDE.md`. Crie os arquivos abaixo.

`src/frontend/package.json` (deps entram no Step 2 via `pnpm add`, que também grava `pnpm-lock.yaml`):

```json
{
  "name": "leiloes-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@12.8.1",
  "scripts": {
    "dev": "vite",
    "dev:mock": "VITE_API_MOCK=true vite",
    "build": "tsc --noEmit -p tsconfig.app.json && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.app.json",
    "lint": "biome check .",
    "lint:fix": "biome check --write ."
  }
}
```

`src/frontend/.gitignore`:

```
node_modules
dist
coverage
*.local
.vite
```

`src/frontend/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Leilões Judiciais</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/frontend/tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`src/frontend/tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"]
}
```

`src/frontend/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 2: Instalar dependências aprovadas e gerar o worker do MSW**

Se o compose da etapa backend já existe, suba o serviço antes (`cd src && rtk docker compose up -d frontend`; ele roda `pnpm install && pnpm dev` e não reclama de `package.json` sem deps). Depois:

```bash
cd src
rtk docker compose exec frontend pnpm add react react-dom react-router @tanstack/react-query react-markdown tailwindcss @tailwindcss/vite
rtk docker compose exec frontend pnpm add -D typescript vite @vitejs/plugin-react @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom msw @biomejs/biome
rtk docker compose exec frontend pnpm msw init public --save
```

Sem compose: troque `rtk docker compose exec frontend` por `rtk docker run --rm -v "$PWD/frontend:/app" -w /app node:22-alpine sh -c "corepack enable && pnpm <...>"` em cada linha. Arquivos criados pelo container ficam como `root`; uma vez: `sudo chown -R "$(id -u):$(id -g)" frontend`.

Esperado: `pnpm-lock.yaml` criado, `public/mockServiceWorker.js` criado e `package.json` ganha `"msw": { "workerDirectory": ["public"] }`.

- [ ] **Step 3: `biome.json`, `vite.config.ts`, `vitest.config.ts`**

`src/frontend/biome.json` (spec frontend §2; schema 2.x — ajuste o número do `$schema` pra versão instalada, veja `node_modules/@biomejs/biome/package.json`):

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": ["**", "!dist", "!public/mockServiceWorker.js"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "jsxQuoteStyle": "double",
      "semicolons": "asNeeded",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "assist": {
    "actions": { "source": { "organizeImports": "on" } }
  }
}
```

`src/frontend/vite.config.ts` (spec frontend §9; `loadEnv` lê `VITE_*` do ambiente e de `.env*`, sem precisar de `@types/node`):

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT ? Number(env.VITE_HMR_CLIENT_PORT) : undefined
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': '/src' },
    },
    server: {
      host: true,
      port: 5173,
      proxy: { '/api': 'http://localhost:8000' },
      hmr: hmrClientPort ? { clientPort: hmrClientPort } : undefined,
    },
  }
})
```

`src/frontend/vitest.config.ts`:

```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({
      test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['src/test/setup.ts'],
        css: false,
        env: { TZ: 'America/Belem' },
      },
    }),
  ),
)
```

- [ ] **Step 4: `vite-env.d.ts`, `index.css`, `main.tsx`, `App.tsx` provisório**

`src/frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MOCK?: string
  readonly VITE_HMR_CLIENT_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

`src/frontend/src/index.css`:

```css
@import "tailwindcss";
```

`src/frontend/src/app/App.tsx` (substituído na Task 2):

```tsx
export function App() {
  return <h1 className="p-6 text-2xl font-semibold">Leilões Judiciais</h1>
}
```

`src/frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'

async function iniciarMocks(): Promise<void> {
  if (import.meta.env.VITE_API_MOCK !== 'true') return
  const { worker } = await import('./api/mocks/browser')
  await worker.start({ onUnhandledRequest: 'bypass' })
}

function raiz(): HTMLElement {
  const el = document.getElementById('root')
  if (!el) throw new Error('Elemento #root não encontrado')
  return el
}

void iniciarMocks().then(() => {
  createRoot(raiz()).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
```

- [ ] **Step 5: `src/api/types.ts` completo (spec backend §2)**

```ts
export type ErroOut = { detail: string }

export type Perfil = 'admin' | 'operador'

export type UsuarioOut = {
  id: string
  username: string
  nome: string
  perfil: Perfil
  ativo: boolean
}
export type LoginIn = { username: string; password: string }
export type SenhaIn = { senha_atual: string; nova_senha: string }
export type UsuarioCreate = { username: string; nome: string; perfil: Perfil; senha: string }
export type UsuarioUpdate = {
  nome?: string
  perfil?: Perfil
  ativo?: boolean
  nova_senha?: string
}

export type ProcessoStatus = 'recebido' | 'analisando' | 'analisado' | 'erro'

export type ProcessoOut = {
  id: string
  nome_arquivo: string
  status: ProcessoStatus
  numero_processo: string | null
  vara: string | null
  erro: string | null
  criado_em: string
  analisado_em: string | null
}

export type Advogado = { nome: string; oab: string | null; ref: string | null }

export type Parte = { nome: string; cpf_cnpj: string | null; advogados: Advogado[] }

export type Executado = Parte & {
  citado: boolean | null
  citacao_forma: string | null
  citacao_ref: string | null
}

export type Execucao = {
  cda: string | null
  natureza_divida: string | null
  classe: string | null
  valor_divida: string | null
  data_divida: string | null
}

export type BemPenhorado = {
  descricao: string
  matricula: string | null
  localizacao: string | null
  data_penhora: string | null
  penhora_ref: string | null
  fiel_depositario: string | null
  executado_intimado: boolean | null
  data_intimacao: string | null
  intimacao_ref: string | null
  propriedade: string | null
  valor_avaliacao: string | null
  data_avaliacao: string | null
  oficial_avaliacao: string | null
  valor_reavaliacao: string | null
  data_reavaliacao: string | null
  certidao_matricula_ref: string | null
  averbacao_penhora: string | null
  hipoteca: string | null
  enfiteuse: string | null
  outras_penhoras: string | null
}

export type TipoJustica = 'estadual' | 'federal'

export type Checklist = {
  vara: string | null
  numero_processo: string | null
  juiz: string | null
  tipo_justica: TipoJustica | null
  exequente: Parte
  executados: Executado[]
  execucao: Execucao
  bens: BemPenhorado[]
  recursos: string | null
  observacoes_leilao: string[]
}

export type Etapa = { data: string | null; descricao: string; ref: string | null }
export type Relatorio = { resumo: string; etapas: Etapa[] }

export type LeilaoStatus = 'agendado' | 'cancelado'

export type LeilaoOut = {
  id: string
  processo_id: string
  numero_processo: string | null
  primeiro_leilao_em: string
  segundo_leilao_em: string
  status: LeilaoStatus
  edital_id: string | null
  criado_em: string
}

export type LeilaoCreate = { processo_id: string; primeiro_leilao_data?: string }
export type SugestaoOut = { primeiro_leilao_em: string; segundo_leilao_em: string }
export type BloqueioOut = { id: string; data: string; motivo: string }
export type BloqueioCreate = { data: string; motivo: string }
export type FeriadoOut = { data: string; motivo: string }

export type ProcessoDetalheOut = ProcessoOut & {
  checklist: Checklist | null
  relatorio: Relatorio | null
  leilao: LeilaoOut | null
}

export type EditalOut = {
  id: string
  leilao_id: string
  processo_id: string
  conteudo_markdown: string
  criado_em: string
  atualizado_em: string | null
}
export type EditalCreate = { leilao_id: string }
export type EditalUpdate = { conteudo_markdown: string }

export type EnvioStatus = 'enviado' | 'erro'

export type EnvioOut = {
  id: string
  leilao_id: string
  numero_processo: string | null
  destinatarios: string[]
  enviado_em: string
  status: EnvioStatus
  erro: string | null
}
export type EnvioCreate = { leilao_id: string }
```

- [ ] **Step 6: Infra de teste — `setup.ts`, `render.tsx`, `mocks/server.ts`, `mocks/browser.ts`, `handlers.ts` mínimo**

`src/frontend/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { reset } from '@/api/mocks/db'
import { server } from '@/api/mocks/server'

process.env.TZ = 'America/Belem'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  reset()
  document.cookie = 'csrf_token=; Max-Age=0; Path=/'
})
afterEach(() => {
  server.resetHandlers()
  cleanup()
})
afterAll(() => server.close())
```

`src/frontend/src/test/render.tsx` (ganha `renderComRouter` na Task 2):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'

export function criarQueryClientDeTeste(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

type Opcoes = { rota?: string }

export function renderComApp(ui: ReactElement, { rota = '/' }: Opcoes = {}) {
  const queryClient = criarQueryClientDeTeste()
  const user = userEvent.setup()
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[rota]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return { user, queryClient, ...resultado }
}
```

`src/frontend/src/api/mocks/server.ts`:

```ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

`src/frontend/src/api/mocks/browser.ts`:

```ts
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)
```

`src/frontend/src/api/mocks/handlers.ts` (mínimo; cresce por task):

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'

export const handlers: HttpHandler[] = [
  http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
]
```

`src/frontend/src/api/mocks/db.ts` provisório só pra `setup.ts` importar (substituído no Step 11):

```ts
export function reset(): void {}
```

- [ ] **Step 7: Teste falhando de `client.ts`**

`src/frontend/src/api/client.test.ts`:

```ts
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/api/mocks/server'
import { api, ApiError, mensagemErro, registrarNaoAutenticado } from './client'

describe('client', () => {
  it('manda X-CSRF-Token em POST quando cookie existe', async () => {
    document.cookie = 'csrf_token=abc123; Path=/'
    server.use(
      http.post('/api/eco', ({ request }) =>
        HttpResponse.json({ csrf: request.headers.get('X-CSRF-Token') }),
      ),
    )
    const r = await api.post<{ csrf: string | null }>('/eco', { x: 1 })
    expect(r.csrf).toBe('abc123')
  })

  it('manda X-CSRF-Token em PATCH', async () => {
    document.cookie = 'csrf_token=abc123; Path=/'
    server.use(
      http.patch('/api/eco', ({ request }) =>
        HttpResponse.json({ csrf: request.headers.get('X-CSRF-Token') }),
      ),
    )
    const r = await api.patch<{ csrf: string | null }>('/eco', { x: 1 })
    expect(r.csrf).toBe('abc123')
  })

  it('não manda X-CSRF-Token em GET', async () => {
    document.cookie = 'csrf_token=abc123; Path=/'
    server.use(
      http.get('/api/eco', ({ request }) =>
        HttpResponse.json({ csrf: request.headers.get('X-CSRF-Token') }),
      ),
    )
    const r = await api.get<{ csrf: string | null }>('/eco')
    expect(r.csrf).toBeNull()
  })

  it('sem cookie csrf_token a mutação ainda é enviada, sem header', async () => {
    server.use(
      http.post('/api/eco', ({ request }) =>
        HttpResponse.json({ csrf: request.headers.get('X-CSRF-Token') }),
      ),
    )
    const r = await api.post<{ csrf: string | null }>('/eco', {})
    expect(r.csrf).toBeNull()
  })

  it('FormData vai sem Content-Type JSON', async () => {
    server.use(
      http.post('/api/upload', async ({ request }) => {
        const form = await request.formData()
        const arquivo = form.get('arquivo')
        return HttpResponse.json({
          contentType: request.headers.get('Content-Type'),
          nome: arquivo instanceof File ? arquivo.name : null,
        })
      }),
    )
    const form = new FormData()
    form.append('arquivo', new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' }))
    const r = await api.post<{ contentType: string | null; nome: string | null }>('/upload', form)
    expect(r.contentType).toMatch(/^multipart\/form-data/)
    expect(r.nome).toBe('a.pdf')
  })

  it('erro JSON vira ApiError com status e detail', async () => {
    server.use(http.get('/api/x', () => HttpResponse.json({ detail: 'Não achei' }, { status: 404 })))
    const erro = await api.get('/x').catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ApiError)
    expect((erro as ApiError).status).toBe(404)
    expect((erro as ApiError).detail).toBe('Não achei')
    expect(mensagemErro(erro)).toBe('Não achei')
  })

  it('erro sem JSON vira ApiError com detail "Erro inesperado"', async () => {
    server.use(
      http.get(
        '/api/x',
        () =>
          new HttpResponse('<html>Bad Gateway</html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    )
    const erro = await api.get('/x').catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ApiError)
    expect((erro as ApiError).status).toBe(502)
    expect((erro as ApiError).detail).toBe('Erro inesperado')
  })

  it('401 dispara onNaoAutenticado, exceto em /auth/login', async () => {
    const cb = vi.fn()
    registrarNaoAutenticado(cb)
    server.use(
      http.get('/api/privado', () => HttpResponse.json({ detail: 'Não autenticado' }, { status: 401 })),
      http.post('/api/auth/login', () =>
        HttpResponse.json({ detail: 'Credenciais inválidas' }, { status: 401 }),
      ),
    )
    await api.get('/privado').catch(() => undefined)
    expect(cb).toHaveBeenCalledTimes(1)
    await api.post('/auth/login', {}).catch(() => undefined)
    expect(cb).toHaveBeenCalledTimes(1)
    registrarNaoAutenticado(null)
  })

  it('403 Sem permissão é ApiError normal e não dispara onNaoAutenticado', async () => {
    const cb = vi.fn()
    registrarNaoAutenticado(cb)
    server.use(
      http.delete('/api/processos/1', () =>
        HttpResponse.json({ detail: 'Sem permissão' }, { status: 403 }),
      ),
    )
    const erro = await api.del('/processos/1').catch((e: unknown) => e)
    expect((erro as ApiError).status).toBe(403)
    expect(mensagemErro(erro)).toBe('Sem permissão')
    expect(cb).not.toHaveBeenCalled()
    registrarNaoAutenticado(null)
  })

  it('del resolve em 204 sem tentar parsear corpo', async () => {
    server.use(http.delete('/api/x/1', () => new HttpResponse(null, { status: 204 })))
    await expect(api.del('/x/1')).resolves.toBeUndefined()
  })

  it('mensagemErro de erro desconhecido é genérica', () => {
    expect(mensagemErro(new Error('boom'))).toBe('Erro inesperado')
  })
})
```

- [ ] **Step 8: Rodar e ver falhar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/api/client.test.ts`
Expected: FAIL — `Failed to resolve import "./client"`.

- [ ] **Step 9: Implementar `client.ts` (spec frontend §5)**

`src/frontend/src/api/client.ts`:

```ts
const BASE = '/api'
const MUTACOES: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const DETAIL_GENERICO = 'Erro inesperado'

export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

let onNaoAutenticado: (() => void) | null = null

export function registrarNaoAutenticado(cb: (() => void) | null): void {
  onNaoAutenticado = cb
}

export function lerCookie(nome: string): string | null {
  const prefixo = `${nome}=`
  const parte = document.cookie.split('; ').find((c) => c.startsWith(prefixo))
  if (!parte) return null
  const valor = parte.slice(prefixo.length)
  return valor === '' ? null : decodeURIComponent(valor)
}

export function mensagemErro(erro: unknown): string {
  return erro instanceof ApiError ? erro.detail : DETAIL_GENERICO
}

async function extrairDetail(res: Response): Promise<string> {
  try {
    const corpo: unknown = await res.json()
    if (
      typeof corpo === 'object' &&
      corpo !== null &&
      'detail' in corpo &&
      typeof corpo.detail === 'string'
    ) {
      return corpo.detail
    }
  } catch {
    return DETAIL_GENERICO
  }
  return DETAIL_GENERICO
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const headers = new Headers()
  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
    payload = JSON.stringify(body)
  }
  if (MUTACOES.has(method)) {
    const csrf = lerCookie('csrf_token')
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }
  const res = await fetch(`${window.location.origin}${BASE}${path}`, {
    method,
    headers,
    body: payload,
    credentials: 'same-origin',
  })
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    onNaoAutenticado?.()
  }
  if (!res.ok) {
    throw new ApiError(res.status, await extrairDetail(res))
  }
  return res
}

async function corpo<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request('GET', path).then((r) => corpo<T>(r))
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request('POST', path, body).then((r) => corpo<T>(r))
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request('PUT', path, body).then((r) => corpo<T>(r))
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request('PATCH', path, body).then((r) => corpo<T>(r))
  },
  del(path: string): Promise<void> {
    return request('DELETE', path).then(() => undefined)
  },
}
```

`window.location.origin` em vez de path relativo porque o `fetch` do Node (Vitest) rejeita URL relativa; no browser dá a mesma origem.

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/api/client.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 10: `formatar.ts` — teste falhando, implementação, teste passando**

`src/frontend/src/lib/formatar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatarData, formatarDataHora, formatarDinheiro, ouTraco } from './formatar'

describe('formatar', () => {
  it('dinheiro string decimal vira BRL', () => {
    expect(formatarDinheiro('95000.00')).toBe('R$ 95.000,00')
    expect(formatarDinheiro('1234.5')).toBe('R$ 1.234,50')
  })

  it('dinheiro nulo ou inválido vira traço', () => {
    expect(formatarDinheiro(null)).toBe('—')
    expect(formatarDinheiro('abc')).toBe('—')
  })

  it('datetime ISO com offset mostra dia e hora no fuso America/Belem', () => {
    expect(formatarDataHora('2026-11-05T10:00:00-03:00')).toBe('05/11/2026, 10:00')
    expect(formatarDataHora('2026-11-05T13:00:00Z')).toBe('05/11/2026, 10:00')
  })

  it('data YYYY-MM-DD não desloca o dia', () => {
    expect(formatarData('2025-10-24')).toBe('24/10/2025')
    expect(formatarData(null)).toBe('—')
  })

  it('ouTraco', () => {
    expect(ouTraco(null)).toBe('—')
    expect(ouTraco(undefined)).toBe('—')
    expect(ouTraco('')).toBe('—')
    expect(ouTraco('x')).toBe('x')
  })
})
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/lib/formatar.test.ts`
Expected: FAIL — `Failed to resolve import "./formatar"`.

`src/frontend/src/lib/formatar.ts`:

```ts
const TRACO = '—'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dataCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
const dataHoraCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function ouTraco(valor: string | null | undefined): string {
  return valor === null || valor === undefined || valor === '' ? TRACO : valor
}

export function formatarDinheiro(valor: string | null): string {
  if (valor === null || !/^\d+(\.\d+)?$/.test(valor)) return TRACO
  return brl.format(Number(valor)).replace(/ /g, ' ')
}

export function formatarData(iso: string | null): string {
  if (!iso) return TRACO
  const [ano, mes, dia] = iso.split('-').map(Number)
  if (ano === undefined || mes === undefined || dia === undefined) return TRACO
  return dataCurta.format(new Date(ano, mes - 1, dia))
}

export function formatarDataHora(iso: string | null): string {
  if (!iso) return TRACO
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return TRACO
  return dataHoraCurta.format(d).replace(/ /g, ' ')
}
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/lib/formatar.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 11: Fixtures, feriados, `db.ts` real e `http.ts`**

`src/frontend/src/api/mocks/fixtures.ts` (dados de `SPEC/referencias/DOC 1 modelo checklist - imoveis.md`; valores de avaliação são fictícios, como a spec backend §4 prevê):

```ts
import type { Advogado, Checklist, Relatorio } from '@/api/types'

const ADVOGADOS_EXECUTADOS: Advogado[] = [
  { nome: 'Maria Zélida Candado de Andrade', oab: 'OAB/TO 10.217', ref: 'Id 1315207293' },
  { nome: 'Ciy Farney Jose Schmaltz Caetano', oab: 'OAB/TO 6.607', ref: 'Id 1316180771' },
]

export const CHECKLIST_EXEMPLO: Checklist = {
  vara: '2ª Vara Federal Cível e Criminal da Comarca de Araguaína - TO',
  numero_processo: '1003966-15.2022.4.01.4301',
  juiz: 'CLAUDIO CEZAR CAVALCANTES',
  tipo_justica: 'federal',
  exequente: {
    nome: 'UNIÃO FEDERAL',
    cpf_cnpj: '00.394.411/0001-09',
    advogados: [
      {
        nome: 'Procuradoria da União nos Estados e no Distrito Federal',
        oab: null,
        ref: null,
      },
    ],
  },
  executados: [
    {
      nome: 'EURIVALDO SOARES DE ANDRADE & CIA LTDA',
      cpf_cnpj: '07.354.652/0001-73',
      advogados: ADVOGADOS_EXECUTADOS,
      citado: true,
      citacao_forma: 'mandado',
      citacao_ref: 'Id 1308225768',
    },
    {
      nome: 'EURIVALDO SOARES DE ANDRADE',
      cpf_cnpj: '179.658.022-87',
      advogados: ADVOGADOS_EXECUTADOS,
      citado: true,
      citacao_forma: 'mandado',
      citacao_ref: 'Id 1308225782',
    },
  ],
  execucao: {
    cda: '12.345.678-9',
    natureza_divida: 'Tributária',
    classe: 'Execução Fiscal',
    valor_divida: '187450.32',
    data_divida: '2022-08-15',
  },
  bens: [
    {
      descricao:
        'Lote nº 04, Quadra 18, Loteamento Boa Esperança, situado na Avenida Manoel Dias de Oliveira, com área de 360m², Município de Babaçulândia-TO, medindo 12,00 metros de frente pela Avenida Manoel Dias de Oliveira; 30,00 metros de lateral direita, confrontando com o Lote 05; 12,00 metros de fundo, confrontando com o Lote 31 e 30,00 metros de lateral esquerda, confrontando com o Lote 03.',
      matricula: '6.351',
      localizacao: 'Avenida Manoel Dias de Oliveira, Babaçulândia-TO',
      data_penhora: '2025-10-24',
      penhora_ref: 'Id 2221536340',
      fiel_depositario: 'Eurivaldo Soares de Andrade (Id 2221536095)',
      executado_intimado: true,
      data_intimacao: '2025-11-06',
      intimacao_ref: 'Id 2221534539',
      propriedade: 'Imóvel de propriedade da pessoa jurídica executada',
      valor_avaliacao: '95000.00',
      data_avaliacao: '2025-10-24',
      oficial_avaliacao: 'Oficial de Justiça Avaliador',
      valor_reavaliacao: null,
      data_reavaliacao: null,
      certidao_matricula_ref: 'Id 2221536102',
      averbacao_penhora: 'Av. 3/6.351',
      hipoteca: 'Imóvel sem ônus hipotecário',
      enfiteuse: null,
      outras_penhoras: null,
    },
    {
      descricao:
        'Lote nº 10, Quadra 11, Loteamento Boa Esperança, situado na Avenida Santa Luzia, com área de 391,08m², Município de Babaçulândia-TO, medindo 9,97 metros de frente pela Avenida Santa Luzia; 38,56 metros de lateral direita, confrontando com o Lote 11; 10,12 metros de fundo, confrontando com a área da Igreja e 39,95 metros de lateral esquerda, confrontando com o Lote 09.',
      matricula: '6.235',
      localizacao: 'Avenida Santa Luzia, Babaçulândia-TO',
      data_penhora: '2025-10-24',
      penhora_ref: 'Id 2221536340',
      fiel_depositario: 'Eurivaldo Soares de Andrade (Id 2221536095)',
      executado_intimado: true,
      data_intimacao: '2025-11-06',
      intimacao_ref: 'Id 2221534539',
      propriedade: 'Imóvel de propriedade da pessoa jurídica executada',
      valor_avaliacao: '120000.00',
      data_avaliacao: '2025-10-24',
      oficial_avaliacao: 'Oficial de Justiça Avaliador',
      valor_reavaliacao: '132000.00',
      data_reavaliacao: '2026-06-10',
      certidao_matricula_ref: 'Id 2221536110',
      averbacao_penhora: 'Av. 2/6.235',
      hipoteca: 'Imóvel sem ônus hipotecário',
      enfiteuse: null,
      outras_penhoras: null,
    },
  ],
  recursos: 'Não foi certificada a interposição de quaisquer recursos nos autos de execução.',
  observacoes_leilao: [
    'Nomeação do leiloeiro Sandro de Oliveira à fl. 284.',
    'Imóveis localizados fisicamente pelo Oficial de Justiça no ato da penhora.',
  ],
}

export const RELATORIO_EXEMPLO: Relatorio = {
  resumo:
    'Execução fiscal movida pela União Federal contra Eurivaldo Soares de Andrade & Cia Ltda e sócio. Executados citados por mandado, penhora de dois imóveis em Babaçulândia-TO realizada em 24/10/2025 e executados intimados em 06/11/2025. Sem recursos pendentes; processo apto a leilão.',
  etapas: [
    { data: '2022-08-15', descricao: 'Ajuizamento da execução fiscal pela União Federal.', ref: 'Id 1298001122' },
    { data: '2023-02-10', descricao: 'Citação dos executados por mandado.', ref: 'Id 1308225768' },
    { data: '2025-10-24', descricao: 'Penhora e avaliação dos imóveis matrículas 6.351 e 6.235.', ref: 'Id 2221536340' },
    { data: '2025-11-06', descricao: 'Intimação dos executados sobre a penhora.', ref: 'Id 2221534539' },
  ],
}
```

`src/frontend/src/api/mocks/feriados.ts` (spec frontend §7: lista fixa BR + PA de 2026 e 2027):

```ts
export type Feriado = { data: string; motivo: string }

export const FERIADOS: readonly Feriado[] = [
  { data: '2026-01-01', motivo: 'Confraternização Universal' },
  { data: '2026-02-16', motivo: 'Carnaval' },
  { data: '2026-02-17', motivo: 'Carnaval' },
  { data: '2026-04-03', motivo: 'Sexta-feira Santa' },
  { data: '2026-04-21', motivo: 'Tiradentes' },
  { data: '2026-05-01', motivo: 'Dia do Trabalhador' },
  { data: '2026-06-04', motivo: 'Corpus Christi' },
  { data: '2026-08-15', motivo: 'Adesão do Pará' },
  { data: '2026-09-07', motivo: 'Independência' },
  { data: '2026-10-12', motivo: 'Nossa Senhora Aparecida' },
  { data: '2026-11-02', motivo: 'Finados' },
  { data: '2026-11-15', motivo: 'Proclamação da República' },
  { data: '2026-11-20', motivo: 'Consciência Negra' },
  { data: '2026-12-25', motivo: 'Natal' },
  { data: '2027-01-01', motivo: 'Confraternização Universal' },
  { data: '2027-02-08', motivo: 'Carnaval' },
  { data: '2027-02-09', motivo: 'Carnaval' },
  { data: '2027-03-26', motivo: 'Sexta-feira Santa' },
  { data: '2027-04-21', motivo: 'Tiradentes' },
  { data: '2027-05-01', motivo: 'Dia do Trabalhador' },
  { data: '2027-05-27', motivo: 'Corpus Christi' },
  { data: '2027-08-15', motivo: 'Adesão do Pará' },
  { data: '2027-09-07', motivo: 'Independência' },
  { data: '2027-10-12', motivo: 'Nossa Senhora Aparecida' },
  { data: '2027-11-02', motivo: 'Finados' },
  { data: '2027-11-15', motivo: 'Proclamação da República' },
  { data: '2027-11-20', motivo: 'Consciência Negra' },
  { data: '2027-12-25', motivo: 'Natal' },
]

export function feriadosDoAno(ano: number): Feriado[] {
  return FERIADOS.filter((f) => f.data.startsWith(`${ano}-`))
}
```

`src/frontend/src/api/mocks/db.ts` (substitui o provisório):

```ts
import type {
  Checklist,
  EditalOut,
  EnvioOut,
  EnvioStatus,
  LeilaoOut,
  LeilaoStatus,
  ProcessoDetalheOut,
  ProcessoOut,
  Relatorio,
  UsuarioOut,
} from '@/api/types'
import { CHECKLIST_EXEMPLO, RELATORIO_EXEMPLO } from './fixtures'

export type UsuarioMock = UsuarioOut & { password: string }
export type ProcessoMock = ProcessoOut & { checklist: Checklist | null; relatorio: Relatorio | null }
export type LeilaoMock = {
  id: string
  processo_id: string
  primeiro_leilao_em: string
  segundo_leilao_em: string
  status: LeilaoStatus
  criado_em: string
}
export type EnvioMock = {
  id: string
  leilao_id: string
  destinatarios: string[]
  enviado_em: string
  status: EnvioStatus
  erro: string | null
}

export type Db = {
  usuarios: UsuarioMock[]
  sessao: UsuarioMock | null
  falhasLogin: Map<string, number[]>
  processos: ProcessoMock[]
  leiloes: LeilaoMock[]
  bloqueios: { id: string; data: string; motivo: string }[]
  editais: EditalOut[]
  envios: EnvioMock[]
}

export const LOGIN_MAX_TENTATIVAS = 5
export const LOGIN_JANELA_MS = 15 * 60_000
export const MARKETING_EMAILS = ['marketing@exemplo.com.br']

let sequencia = 100

export function novoId(prefixo: string): string {
  sequencia += 1
  return `${prefixo}-${sequencia}`
}

function estadoInicial(): Db {
  return {
    usuarios: [
      { id: 'u-1', username: 'admin', nome: 'Administrador', perfil: 'admin', ativo: true, password: 'admin' },
      { id: 'u-2', username: 'operador', nome: 'Operador', perfil: 'operador', ativo: true, password: 'operador' },
    ],
    sessao: null,
    falhasLogin: new Map(),
    processos: [
      {
        id: 'p-1',
        nome_arquivo: 'processo-1003966.pdf',
        status: 'analisado',
        numero_processo: CHECKLIST_EXEMPLO.numero_processo,
        vara: CHECKLIST_EXEMPLO.vara,
        erro: null,
        criado_em: '2026-09-20T13:00:00-03:00',
        analisado_em: '2026-09-20T13:05:00-03:00',
        checklist: structuredClone(CHECKLIST_EXEMPLO),
        relatorio: structuredClone(RELATORIO_EXEMPLO),
      },
      {
        id: 'p-2',
        nome_arquivo: 'execucao-fiscal-2024.pdf',
        status: 'recebido',
        numero_processo: null,
        vara: null,
        erro: null,
        criado_em: '2026-09-28T09:30:00-03:00',
        analisado_em: null,
        checklist: null,
        relatorio: null,
      },
    ],
    leiloes: [
      {
        id: 'l-1',
        processo_id: 'p-1',
        primeiro_leilao_em: '2026-11-05T10:00:00-03:00',
        segundo_leilao_em: '2026-11-12T10:00:00-03:00',
        status: 'agendado',
        criado_em: '2026-09-21T10:00:00-03:00',
      },
    ],
    bloqueios: [{ id: 'b-1', data: '2026-11-27', motivo: 'Recesso interno' }],
    editais: [],
    envios: [],
  }
}

export const db: Db = estadoInicial()

export function reset(): void {
  Object.assign(db, estadoInicial())
}

export function logar(username: 'admin' | 'operador' = 'admin'): void {
  db.sessao = db.usuarios.find((u) => u.username === username) ?? null
}

export function usuarioLogado(): UsuarioMock | null {
  if (!db.sessao) return null
  const atual = db.usuarios.find((u) => u.id === db.sessao?.id) ?? null
  return atual?.ativo ? atual : null
}

export function registrarFalhaLogin(username: string): void {
  const agora = Date.now()
  const lista = (db.falhasLogin.get(username) ?? []).filter((t) => agora - t < LOGIN_JANELA_MS)
  lista.push(agora)
  db.falhasLogin.set(username, lista)
}

export function limparFalhasLogin(username: string): void {
  db.falhasLogin.delete(username)
}

export function segundosBloqueio(username: string): number {
  const agora = Date.now()
  const recentes = (db.falhasLogin.get(username) ?? []).filter((t) => agora - t < LOGIN_JANELA_MS)
  if (recentes.length < LOGIN_MAX_TENTATIVAS) return 0
  const maisAntiga = Math.min(...recentes)
  return Math.max(1, Math.ceil((maisAntiga + LOGIN_JANELA_MS - agora) / 1000))
}

export function leilaoAtivo(processoId: string): LeilaoMock | null {
  return db.leiloes.find((l) => l.processo_id === processoId && l.status === 'agendado') ?? null
}

function editalMaisRecente(leilaoId: string): EditalOut | null {
  const lista = db.editais
    .filter((e) => e.leilao_id === leilaoId)
    .sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em))
  return lista[0] ?? null
}

export function toUsuarioOut(u: UsuarioMock): UsuarioOut {
  return { id: u.id, username: u.username, nome: u.nome, perfil: u.perfil, ativo: u.ativo }
}

export function toProcessoOut(p: ProcessoMock): ProcessoOut {
  return {
    id: p.id,
    nome_arquivo: p.nome_arquivo,
    status: p.status,
    numero_processo: p.numero_processo,
    vara: p.vara,
    erro: p.erro,
    criado_em: p.criado_em,
    analisado_em: p.analisado_em,
  }
}

export function toLeilaoOut(l: LeilaoMock): LeilaoOut {
  const processo = db.processos.find((p) => p.id === l.processo_id)
  return {
    id: l.id,
    processo_id: l.processo_id,
    numero_processo: processo?.numero_processo ?? null,
    primeiro_leilao_em: l.primeiro_leilao_em,
    segundo_leilao_em: l.segundo_leilao_em,
    status: l.status,
    edital_id: editalMaisRecente(l.id)?.id ?? null,
    criado_em: l.criado_em,
  }
}

export function toDetalhe(p: ProcessoMock): ProcessoDetalheOut {
  const leilao = leilaoAtivo(p.id)
  return {
    ...toProcessoOut(p),
    checklist: p.checklist,
    relatorio: p.relatorio,
    leilao: leilao ? toLeilaoOut(leilao) : null,
  }
}

export function toEnvioOut(e: EnvioMock): EnvioOut {
  const leilao = db.leiloes.find((l) => l.id === e.leilao_id)
  const processo = leilao ? db.processos.find((p) => p.id === leilao.processo_id) : undefined
  return {
    id: e.id,
    leilao_id: e.leilao_id,
    numero_processo: processo?.numero_processo ?? null,
    destinatarios: e.destinatarios,
    enviado_em: e.enviado_em,
    status: e.status,
    erro: e.erro,
  }
}
```

`src/frontend/src/api/mocks/http.ts`:

```ts
import { HttpResponse } from 'msw'
import { usuarioLogado } from './db'

export function erro(status: number, detail: string): HttpResponse {
  return HttpResponse.json({ detail }, { status })
}

export function exigirSessao(): HttpResponse | null {
  return usuarioLogado() ? null : erro(401, 'Não autenticado')
}

export function exigirAdmin(): HttpResponse | null {
  const usuario = usuarioLogado()
  if (!usuario) return erro(401, 'Não autenticado')
  return usuario.perfil === 'admin' ? null : erro(403, 'Sem permissão')
}
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/api src/lib`
Expected: PASS, 16 testes (o `db.ts` real não quebra o setup).

- [ ] **Step 12: Dockerfile e `CLAUDE.md`**

`src/frontend/Dockerfile` (spec frontend §10; contexto de build = `src/`, por isso os `COPY` usam `frontend/...` e `nginx/...`). O `docker-compose.prod.yml` que o referencia e o `src/nginx/prod.conf` são da etapa backend.

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/prod.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`src/frontend/CLAUDE.md` — substitua o bloco de código de `## Layout` pelo abaixo (reflete a spec frontend §3; o resto do arquivo fica):

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

- [ ] **Step 13: Formatar, lint e typecheck**

Run: `cd src && rtk docker compose exec frontend sh -c "pnpm lint:fix && pnpm lint && pnpm typecheck"`
Expected: `biome check` sem erros (o `--write` já normalizou formatação e imports); `tsc` sem erros.

- [ ] **Step 14: Stage**

```bash
rtk git add src/frontend
```

Mensagem sugerida: `feat(frontend): scaffold vite+ts, client http com csrf, tipos da spec e infra de mock/teste`. Dev revisa e comita.

---

### Task 2: Autenticação — login, perfis, rota protegida/admin, layout, minha senha

**Files:**
- Create: `src/frontend/src/api/auth.ts`, `src/frontend/src/features/auth/LoginPage.tsx`, `src/frontend/src/features/auth/useUsuario.ts`, `src/frontend/src/features/auth/RotaProtegida.tsx`, `src/frontend/src/features/auth/RotaAdmin.tsx`, `src/frontend/src/features/auth/MinhaSenhaDialog.tsx`, `src/frontend/src/app/rotas.tsx`, `src/frontend/src/app/router.ts`, `src/frontend/src/app/providers.tsx`, `src/frontend/src/app/Layout.tsx`, `src/frontend/src/components/Botao.tsx`, `src/frontend/src/components/Card.tsx`, `src/frontend/src/components/Field.tsx`, `src/frontend/src/components/Alerta.tsx`, `src/frontend/src/components/Dialog.tsx`, `src/frontend/src/api/mocks/auth.ts`
- Modify: `src/frontend/src/main.tsx`, `src/frontend/src/api/mocks/handlers.ts`, `src/frontend/src/test/render.tsx`
- Delete: `src/frontend/src/app/App.tsx`
- Test: `src/frontend/src/features/auth/auth.test.tsx`

**Interfaces:**
- Consumes: `api`, `mensagemErro`, `registrarNaoAutenticado` (Task 1); `db`, `logar`, `usuarioLogado`, `registrarFalhaLogin`, `limparFalhasLogin`, `segundosBloqueio`, `toUsuarioOut` (Task 1); `erro`, `exigirSessao` (Task 1).
- Produces:
  - `src/api/auth.ts`: `const chaveUsuario = ['auth', 'me'] as const`, `login(dados: LoginIn): Promise<UsuarioOut>`, `logout(): Promise<void>`, `me(): Promise<UsuarioOut>`, `alterarSenha(dados: SenhaIn): Promise<void>`.
  - `src/features/auth/useUsuario.ts`: `useUsuario(): UseQueryResult<UsuarioOut, Error> & { ehAdmin: boolean }`.
  - `src/features/auth/RotaProtegida.tsx`: `RotaProtegida()` (renderiza `<Outlet/>`). `RotaAdmin.tsx`: `RotaAdmin()` (operador → `<Navigate to="/" replace/>`).
  - `src/features/auth/MinhaSenhaDialog.tsx`: `MinhaSenhaDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void })`.
  - `src/app/rotas.tsx`: `const rotas: RouteObject[]` — `/login`; sob `RotaProtegida` > `Layout`: `/` (placeholder até a Task 4) e, sob `RotaAdmin`, `/usuarios` (placeholder até a Task 3).
  - `src/app/router.ts`: `const router = createBrowserRouter(rotas)`. `src/app/providers.tsx`: `const queryClient`, `Providers({ children })`.
  - `src/components/Botao.tsx`: `Botao(props: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'perigo' })`. `Card({ titulo, acoes?, children })`. `Field({ label, htmlFor, erro?, children })`. `Alerta({ tipo: 'erro' | 'sucesso' | 'info', children })` com `role="alert"`. `Dialog({ aberto, titulo, onFechar, children })` com `role="dialog"`.
  - `src/test/render.tsx`: `renderComRouter(rota: string)` → `{ user, router, queryClient, ...RenderResult }`.
  - `src/api/mocks/auth.ts`: `const authHandlers: HttpHandler[]` (`POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/senha`).

- [ ] **Step 1: Teste falhando**

`src/frontend/src/features/auth/auth.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

async function preencherLogin(user: ReturnType<typeof renderComRouter>['user'], usuario: string, senha: string) {
  await user.type(await screen.findByLabelText('Usuário'), usuario)
  await user.type(screen.getByLabelText('Senha'), senha)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('autenticação', () => {
  it('rota protegida sem sessão vai pra /login', async () => {
    renderComRouter('/')
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('login ok redireciona pra / e mostra nome e perfil do usuário', async () => {
    const { user } = renderComRouter('/login')
    await preencherLogin(user, 'admin', 'admin')
    expect(await screen.findByRole('heading', { name: 'Processos' })).toBeInTheDocument()
    expect(screen.getByText('Administrador · admin')).toBeInTheDocument()
  })

  it('credenciais inválidas mostra mensagem', async () => {
    const { user } = renderComRouter('/login')
    await preencherLogin(user, 'admin', 'errada')
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciais inválidas')
  })

  it('429 após lockout mostra "Muitas tentativas"', async () => {
    db.falhasLogin.set('admin', [Date.now(), Date.now(), Date.now(), Date.now(), Date.now()])
    const { user } = renderComRouter('/login')
    await preencherLogin(user, 'admin', 'admin')
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Muitas tentativas/)
  })

  it('sair volta pra login', async () => {
    logar()
    const { user } = renderComRouter('/')
    await screen.findByRole('heading', { name: 'Processos' })
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('admin vê navegação completa, inclusive Usuários', async () => {
    logar('admin')
    renderComRouter('/')
    await screen.findByRole('heading', { name: 'Processos' })
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Processos' })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/agenda')
    expect(within(nav).getByRole('link', { name: 'Marketing' })).toHaveAttribute('href', '/marketing')
    expect(within(nav).getByRole('link', { name: 'Usuários' })).toHaveAttribute('href', '/usuarios')
  })

  it('operador não vê o link Usuários e vê seu perfil', async () => {
    logar('operador')
    renderComRouter('/')
    await screen.findByRole('heading', { name: 'Processos' })
    expect(screen.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument()
    expect(screen.getByText('Operador · operador')).toBeInTheDocument()
  })

  it('operador que acessa /usuarios é redirecionado pra /', async () => {
    logar('operador')
    renderComRouter('/usuarios')
    expect(await screen.findByRole('heading', { name: 'Processos' })).toBeInTheDocument()
  })

  it('trocar senha com sucesso fecha o diálogo e a nova senha passa a valer', async () => {
    logar('operador')
    const { user } = renderComRouter('/')
    await user.click(await screen.findByRole('button', { name: 'Minha senha' }))
    await user.type(screen.getByLabelText('Senha atual'), 'operador')
    await user.type(screen.getByLabelText('Nova senha'), 'novaSenha123')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha alterada')
    expect(db.usuarios.find((u) => u.username === 'operador')?.password).toBe('novaSenha123')
  })

  it('trocar senha com senha atual errada mostra 400', async () => {
    logar('operador')
    const { user } = renderComRouter('/')
    await user.click(await screen.findByRole('button', { name: 'Minha senha' }))
    await user.type(screen.getByLabelText('Senha atual'), 'errada')
    await user.type(screen.getByLabelText('Nova senha'), 'novaSenha123')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha atual incorreta')
  })

  it('nova senha curta bloqueia o salvar', async () => {
    logar('operador')
    const { user } = renderComRouter('/')
    await user.click(await screen.findByRole('button', { name: 'Minha senha' }))
    await user.type(screen.getByLabelText('Senha atual'), 'operador')
    await user.type(screen.getByLabelText('Nova senha'), 'curta')
    expect(screen.getByText('Mínimo de 8 caracteres')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/auth`
Expected: FAIL — `renderComRouter` não exportado de `@/test/render`.

- [ ] **Step 3: Componentes base**

`src/frontend/src/components/Botao.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'perigo'
}

const ESTILOS: Record<NonNullable<Props['variante']>, string> = {
  primario: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-300',
  secundario: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
  perigo: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
}

export function Botao({ variante = 'primario', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${ESTILOS[variante]} ${className}`}
      {...rest}
    />
  )
}
```

`src/frontend/src/components/Card.tsx`:

```tsx
import type { ReactNode } from 'react'

type Props = { titulo: string; acoes?: ReactNode; children: ReactNode }

export function Card({ titulo, acoes, children }: Props) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {acoes ? <div className="flex gap-2">{acoes}</div> : null}
      </header>
      {children}
    </section>
  )
}
```

`src/frontend/src/components/Field.tsx`:

```tsx
import type { ReactNode } from 'react'

type Props = { label: string; htmlFor: string; erro?: string; children: ReactNode }

export function Field({ label, htmlFor, erro, children }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {erro ? <p className="text-sm text-red-600">{erro}</p> : null}
    </div>
  )
}
```

`src/frontend/src/components/Alerta.tsx`:

```tsx
import type { ReactNode } from 'react'

type Props = { tipo: 'erro' | 'sucesso' | 'info'; children: ReactNode }

const ESTILOS: Record<Props['tipo'], string> = {
  erro: 'border-red-300 bg-red-50 text-red-800',
  sucesso: 'border-green-300 bg-green-50 text-green-800',
  info: 'border-blue-300 bg-blue-50 text-blue-800',
}

export function Alerta({ tipo, children }: Props) {
  return (
    <p role="alert" className={`rounded border px-3 py-2 text-sm ${ESTILOS[tipo]}`}>
      {children}
    </p>
  )
}
```

`src/frontend/src/components/Dialog.tsx` (overlay controlado; `<dialog>.showModal()` não existe no jsdom):

```tsx
import { type ReactNode, useEffect, useId } from 'react'

type Props = { aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode }

export function Dialog({ aberto, titulo, onFechar, children }: Props) {
  const idTitulo = useId()

  useEffect(() => {
    if (!aberto) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto, onFechar])

  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-lg"
      >
        <h2 id={idTitulo} className="mb-3 text-lg font-semibold">
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `api/auth.ts` e `useUsuario.ts`**

`src/frontend/src/api/auth.ts`:

```ts
import { api } from './client'
import type { LoginIn, SenhaIn, UsuarioOut } from './types'

export const chaveUsuario = ['auth', 'me'] as const

export function login(dados: LoginIn): Promise<UsuarioOut> {
  return api.post<UsuarioOut>('/auth/login', dados)
}

export function logout(): Promise<void> {
  return api.post<void>('/auth/logout')
}

export function me(): Promise<UsuarioOut> {
  return api.get<UsuarioOut>('/auth/me')
}

export function alterarSenha(dados: SenhaIn): Promise<void> {
  return api.put<void>('/auth/senha', dados)
}
```

`src/frontend/src/features/auth/useUsuario.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { chaveUsuario, me } from '@/api/auth'

export function useUsuario() {
  const query = useQuery({ queryKey: chaveUsuario, queryFn: me, retry: false, staleTime: 5 * 60_000 })
  return { ...query, ehAdmin: query.data?.perfil === 'admin' }
}
```

- [ ] **Step 5: `LoginPage`, `RotaProtegida`, `RotaAdmin`, `MinhaSenhaDialog`, `Layout`**

`src/frontend/src/features/auth/LoginPage.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { chaveUsuario, login } from '@/api/auth'
import { mensagemErro } from '@/api/client'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Field } from '@/components/Field'

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const entrar = useMutation({
    mutationFn: login,
    onSuccess: (usuario) => {
      queryClient.setQueryData(chaveUsuario, usuario)
      void navigate('/', { replace: true })
    },
  })

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    entrar.mutate({ username, password })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={aoEnviar}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Entrar</h1>
        <Field label="Usuário" htmlFor="username">
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5"
            required
          />
        </Field>
        <Field label="Senha" htmlFor="password">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5"
            required
          />
        </Field>
        {entrar.isError ? <Alerta tipo="erro">{mensagemErro(entrar.error)}</Alerta> : null}
        <Botao type="submit" disabled={entrar.isPending}>
          Entrar
        </Botao>
      </form>
    </main>
  )
}
```

`src/frontend/src/features/auth/RotaProtegida.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router'
import { useUsuario } from './useUsuario'

export function RotaProtegida() {
  const { data, isPending, isError } = useUsuario()
  if (isPending) return <p className="p-6 text-slate-500">Carregando…</p>
  if (isError || !data) return <Navigate to="/login" replace />
  return <Outlet />
}
```

`src/frontend/src/features/auth/RotaAdmin.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router'
import { useUsuario } from './useUsuario'

export function RotaAdmin() {
  const { ehAdmin, isPending } = useUsuario()
  if (isPending) return null
  return ehAdmin ? <Outlet /> : <Navigate to="/" replace />
}
```

`src/frontend/src/features/auth/MinhaSenhaDialog.tsx`:

```tsx
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { alterarSenha } from '@/api/auth'
import { mensagemErro } from '@/api/client'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'

export const SENHA_MIN = 8
export const MSG_SENHA_CURTA = 'Mínimo de 8 caracteres'
const INPUT = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm'

type Props = { aberto: boolean; onFechar: () => void }

export function MinhaSenhaDialog({ aberto, onFechar }: Props) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const curta = novaSenha !== '' && novaSenha.length < SENHA_MIN

  const alterar = useMutation({ mutationFn: alterarSenha })

  function fechar() {
    setSenhaAtual('')
    setNovaSenha('')
    alterar.reset()
    onFechar()
  }

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (curta || novaSenha === '') return
    alterar.mutate({ senha_atual: senhaAtual, nova_senha: novaSenha })
  }

  return (
    <Dialog aberto={aberto} titulo="Minha senha" onFechar={fechar}>
      {alterar.isSuccess ? (
        <div className="flex flex-col gap-3">
          <Alerta tipo="sucesso">Senha alterada</Alerta>
          <Botao variante="secundario" onClick={fechar}>
            Fechar
          </Botao>
        </div>
      ) : (
        <form onSubmit={aoEnviar} className="flex flex-col gap-3">
          <Field label="Senha atual" htmlFor="senha_atual">
            <input
              id="senha_atual"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className={INPUT}
              required
            />
          </Field>
          <Field label="Nova senha" htmlFor="nova_senha" erro={curta ? MSG_SENHA_CURTA : undefined}>
            <input
              id="nova_senha"
              type="password"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className={INPUT}
              required
            />
          </Field>
          {alterar.isError ? <Alerta tipo="erro">{mensagemErro(alterar.error)}</Alerta> : null}
          <div className="flex gap-2">
            <Botao type="submit" disabled={alterar.isPending || curta || novaSenha === ''}>
              Salvar
            </Botao>
            <Botao variante="secundario" onClick={fechar} disabled={alterar.isPending}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}
    </Dialog>
  )
}
```

`src/frontend/src/app/Layout.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { logout } from '@/api/auth'
import { MinhaSenhaDialog } from '@/features/auth/MinhaSenhaDialog'
import { useUsuario } from '@/features/auth/useUsuario'

function classeLink({ isActive }: { isActive: boolean }): string {
  return isActive ? 'font-semibold text-blue-700' : 'text-slate-700 hover:text-blue-700'
}

export function Layout() {
  const { data: usuario, ehAdmin } = useUsuario()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [senhaAberta, setSenhaAberta] = useState(false)

  const sair = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear()
      void navigate('/login', { replace: true })
    },
  })

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav
          aria-label="Principal"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm"
        >
          <span className="font-semibold">Leilões Judiciais</span>
          <NavLink to="/" end className={classeLink}>
            Processos
          </NavLink>
          <NavLink to="/agenda" className={classeLink}>
            Agenda
          </NavLink>
          <NavLink to="/marketing" className={classeLink}>
            Marketing
          </NavLink>
          {ehAdmin ? (
            <NavLink to="/usuarios" className={classeLink}>
              Usuários
            </NavLink>
          ) : null}
          <span className="ml-auto text-slate-600">
            {usuario ? `${usuario.nome} · ${usuario.perfil}` : ''}
          </span>
          <button type="button" onClick={() => setSenhaAberta(true)} className="underline">
            Minha senha
          </button>
          <button type="button" onClick={() => sair.mutate()} className="underline">
            Sair
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <MinhaSenhaDialog aberto={senhaAberta} onFechar={() => setSenhaAberta(false)} />
    </div>
  )
}
```

- [ ] **Step 6: Rotas, router, providers, `main.tsx`**

`src/frontend/src/app/rotas.tsx` (placeholders de `/` e `/usuarios` são trocados nas Tasks 3 e 4):

```tsx
import type { RouteObject } from 'react-router'
import { LoginPage } from '@/features/auth/LoginPage'
import { RotaAdmin } from '@/features/auth/RotaAdmin'
import { RotaProtegida } from '@/features/auth/RotaProtegida'
import { Layout } from './Layout'

export const rotas: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RotaProtegida />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <h1 className="text-2xl font-semibold">Processos</h1> },
          {
            element: <RotaAdmin />,
            children: [
              { path: '/usuarios', element: <h1 className="text-2xl font-semibold">Usuários</h1> },
            ],
          },
        ],
      },
    ],
  },
]
```

`src/frontend/src/app/router.ts`:

```ts
import { createBrowserRouter } from 'react-router'
import { rotas } from './rotas'

export const router = createBrowserRouter(rotas)
```

`src/frontend/src/app/providers.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

`src/frontend/src/main.tsx` (substitui o da Task 1; apague `src/app/App.tsx`):

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { registrarNaoAutenticado } from './api/client'
import { Providers, queryClient } from './app/providers'
import { router } from './app/router'

async function iniciarMocks(): Promise<void> {
  if (import.meta.env.VITE_API_MOCK !== 'true') return
  const { worker } = await import('./api/mocks/browser')
  await worker.start({ onUnhandledRequest: 'bypass' })
}

function raiz(): HTMLElement {
  const el = document.getElementById('root')
  if (!el) throw new Error('Elemento #root não encontrado')
  return el
}

registrarNaoAutenticado(() => {
  void router.navigate('/login', { replace: true }).then(() => queryClient.clear())
})

void iniciarMocks().then(() => {
  createRoot(raiz()).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  )
})
```

O `clear()` roda **depois** de navegar pra `/login`: com as rotas protegidas desmontadas não há observer pra refazer a query `me` e cair em loop 401 → clear → refetch.

- [ ] **Step 7: `renderComRouter` em `src/test/render.tsx`**

`src/frontend/src/test/render.tsx` — arquivo completo (substitui o da Task 1):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { registrarNaoAutenticado } from '@/api/client'
import { rotas } from '@/app/rotas'

export function criarQueryClientDeTeste(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

type Opcoes = { rota?: string }

export function renderComApp(ui: ReactElement, { rota = '/' }: Opcoes = {}) {
  const queryClient = criarQueryClientDeTeste()
  const user = userEvent.setup()
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[rota]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return { user, queryClient, ...resultado }
}

export function renderComRouter(rota: string) {
  const queryClient = criarQueryClientDeTeste()
  const user = userEvent.setup()
  const router = createMemoryRouter(rotas, { initialEntries: [rota] })
  registrarNaoAutenticado(() => {
    void router.navigate('/login', { replace: true }).then(() => queryClient.clear())
  })
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { user, router, queryClient, ...resultado }
}
```

- [ ] **Step 8: Handlers mock de auth**

`src/frontend/src/api/mocks/auth.ts`:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import type { LoginIn, SenhaIn } from '@/api/types'
import {
  db,
  limparFalhasLogin,
  registrarFalhaLogin,
  segundosBloqueio,
  toUsuarioOut,
  usuarioLogado,
} from './db'
import { erro, exigirSessao } from './http'

const SENHA_MIN = 8

const COOKIES_LOGIN: [string, string][] = [
  ['Set-Cookie', 'session=mock-session; Path=/; SameSite=Strict'],
  ['Set-Cookie', 'csrf_token=mock-csrf; Path=/; SameSite=Strict'],
]

const COOKIES_LOGOUT: [string, string][] = [
  ['Set-Cookie', 'session=; Path=/; Max-Age=0'],
  ['Set-Cookie', 'csrf_token=; Path=/; Max-Age=0'],
]

export const authHandlers: HttpHandler[] = [
  http.post('/api/auth/login', async ({ request }) => {
    const { username, password } = (await request.json()) as LoginIn
    const segundos = segundosBloqueio(username)
    if (segundos > 0) {
      return HttpResponse.json(
        { detail: `Muitas tentativas. Tente novamente em ${segundos} segundos` },
        { status: 429, headers: { 'Retry-After': String(segundos) } },
      )
    }
    const usuario = db.usuarios.find(
      (u) => u.username === username && u.password === password && u.ativo,
    )
    if (!usuario) {
      registrarFalhaLogin(username)
      return erro(401, 'Credenciais inválidas')
    }
    limparFalhasLogin(username)
    db.sessao = usuario
    return HttpResponse.json(toUsuarioOut(usuario), { headers: COOKIES_LOGIN })
  }),

  http.post('/api/auth/logout', () => {
    db.sessao = null
    return new HttpResponse(null, { status: 204, headers: COOKIES_LOGOUT })
  }),

  http.get('/api/auth/me', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const usuario = usuarioLogado()
    return usuario ? HttpResponse.json(toUsuarioOut(usuario)) : erro(401, 'Não autenticado')
  }),

  http.put('/api/auth/senha', async ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const usuario = usuarioLogado()
    if (!usuario) return erro(401, 'Não autenticado')
    const { senha_atual, nova_senha } = (await request.json()) as SenhaIn
    if (usuario.password !== senha_atual) return erro(400, 'Senha atual incorreta')
    if (nova_senha.length < SENHA_MIN) return erro(422, 'Senha deve ter ao menos 8 caracteres')
    usuario.password = nova_senha
    return new HttpResponse(null, { status: 204 })
  }),
]
```

Autorização por `db.sessao`, não pelo cookie, e sem validar `X-CSRF-Token` — é o que a spec frontend §7 fixa pro mock (MSW em Node não grava `document.cookie`). No browser o MSW aplica os `Set-Cookie`, então `client.ts` passa a mandar `X-CSRF-Token=mock-csrf`.

`src/frontend/src/api/mocks/handlers.ts`:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import { authHandlers } from './auth'

export const handlers: HttpHandler[] = [
  http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
  ...authHandlers,
]
```

- [ ] **Step 9: Rodar e ver passar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/auth`
Expected: PASS, 11 testes.

Run: `cd src && rtk docker compose exec frontend sh -c "pnpm lint:fix && pnpm lint && pnpm typecheck"`
Expected: sem erros.

- [ ] **Step 10: Conferir no browser em modo mock**

Run: `cd src && VITE_API_MOCK=true rtk docker compose up frontend nginx` → abrir `http://localhost`, deve cair em `/login`; `admin`/`admin` → nav com "Usuários", "Administrador · admin", "Minha senha" abre diálogo; "Sair" volta pro login; `operador`/`operador` → sem "Usuários". Encerre (`Ctrl+C`). Sem compose: `rtk docker run --rm -it -v "$PWD/frontend:/app" -w /app -p 5173:5173 node:22-alpine sh -c "corepack enable && pnpm install && pnpm dev:mock --host"` e abra `http://localhost:5173`.

- [ ] **Step 11: Stage**

```bash
rtk git add src/frontend
```

Mensagem sugerida: `feat(frontend): login com perfis, rota protegida/admin, layout e troca de senha`. Dev revisa e comita.

---

### Task 3: Usuários (admin) — listar, criar, editar, ativar/desativar, redefinir senha

**Files:**
- Create: `src/frontend/src/api/usuarios.ts`, `src/frontend/src/features/usuarios/UsuariosPage.tsx`, `src/frontend/src/features/usuarios/UsuarioForm.tsx`, `src/frontend/src/features/usuarios/RedefinirSenhaDialog.tsx`, `src/frontend/src/components/StatusBadge.tsx`, `src/frontend/src/api/mocks/usuarios.ts`
- Modify: `src/frontend/src/app/rotas.tsx`, `src/frontend/src/api/mocks/handlers.ts`
- Test: `src/frontend/src/features/usuarios/UsuariosPage.test.tsx`

**Interfaces:**
- Consumes: `api`, `mensagemErro` (Task 1); `db`, `logar`, `novoId`, `toUsuarioOut`, `usuarioLogado`, `UsuarioMock` (Task 1); `erro`, `exigirAdmin` (Task 1); `Card`, `Botao`, `Field`, `Alerta`, `Dialog` (Task 2); `SENHA_MIN`, `MSG_SENHA_CURTA` (Task 2, `MinhaSenhaDialog.tsx`); `renderComRouter` (Task 2).
- Produces:
  - `src/api/usuarios.ts`: `const chavesUsuarios = { lista: ['usuarios'] as const }`, `listarUsuarios(): Promise<UsuarioOut[]>`, `criarUsuario(dados: UsuarioCreate): Promise<UsuarioOut>`, `atualizarUsuario(id: string, dados: UsuarioUpdate): Promise<UsuarioOut>`.
  - `src/components/StatusBadge.tsx`: `StatusBadge({ status }: { status: ProcessoStatus | LeilaoStatus | EnvioStatus | 'ativo' | 'inativo' })`.
  - `features/usuarios/UsuarioForm.tsx`: `UsuarioForm({ modo, inicial?, salvando, erro, onSalvar, onCancelar })` com `modo: 'novo' | 'editar'`; `onSalvar(dados: UsuarioCreate)` em `novo`, `onSalvar({ nome, perfil })` em `editar` — assinatura única `onSalvar: (dados: UsuarioCreate | Pick<UsuarioUpdate, 'nome' | 'perfil'>) => void`.
  - `features/usuarios/RedefinirSenhaDialog.tsx`: `RedefinirSenhaDialog({ usuario, onFechar }: { usuario: UsuarioOut | null; onFechar: () => void })`.
  - `features/usuarios/UsuariosPage.tsx`: `UsuariosPage()`.
  - `src/api/mocks/usuarios.ts`: `const usuariosHandlers: HttpHandler[]` (`GET/POST /usuarios`, `PATCH /usuarios/:id`, todos **[admin]**).

- [ ] **Step 1: Teste falhando**

`src/frontend/src/features/usuarios/UsuariosPage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

function linhaDe(username: string): HTMLElement {
  const cabecalho = screen.getByRole('rowheader', { name: username })
  const linha = cabecalho.closest('tr')
  if (!linha) throw new Error(`linha de ${username} não encontrada`)
  return linha
}

describe('UsuariosPage', () => {
  beforeEach(() => logar('admin'))

  it('lista usuários com perfil e status', async () => {
    renderComRouter('/usuarios')
    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeInTheDocument()
    const admin = linhaDe('admin')
    expect(within(admin).getByText('Administrador')).toBeInTheDocument()
    expect(within(admin).getByText('ativo')).toBeInTheDocument()
    const operador = linhaDe('operador')
    expect(within(operador).getByText('operador', { selector: 'td' })).toBeInTheDocument()
  })

  it('cria usuário e ele aparece na lista', async () => {
    const { user } = renderComRouter('/usuarios')
    await user.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByLabelText('Usuário'), 'maria')
    await user.type(screen.getByLabelText('Nome'), 'Maria Souza')
    await user.selectOptions(screen.getByLabelText('Perfil'), 'operador')
    await user.type(screen.getByLabelText('Senha'), 'senhaForte1')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('rowheader', { name: 'maria' })).toBeInTheDocument()
    expect(within(linhaDe('maria')).getByText('Maria Souza')).toBeInTheDocument()
    expect(db.usuarios.some((u) => u.username === 'maria' && u.password === 'senhaForte1')).toBe(true)
  })

  it('username duplicado mostra 409', async () => {
    const { user } = renderComRouter('/usuarios')
    await user.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByLabelText('Usuário'), 'operador')
    await user.type(screen.getByLabelText('Nome'), 'Outro')
    await user.type(screen.getByLabelText('Senha'), 'senhaForte1')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nome de usuário já existe')
  })

  it('senha curta bloqueia o submit do novo usuário', async () => {
    const { user } = renderComRouter('/usuarios')
    await user.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByLabelText('Usuário'), 'joao')
    await user.type(screen.getByLabelText('Nome'), 'João')
    await user.type(screen.getByLabelText('Senha'), 'curta')
    expect(screen.getByText('Mínimo de 8 caracteres')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('desativar operador muda o badge pra inativo', async () => {
    const { user } = renderComRouter('/usuarios')
    await screen.findByRole('rowheader', { name: 'operador' })
    await user.click(within(linhaDe('operador')).getByRole('button', { name: 'Desativar' }))
    expect(await within(linhaDe('operador')).findByText('inativo')).toBeInTheDocument()
    expect(within(linhaDe('operador')).getByRole('button', { name: 'Ativar' })).toBeInTheDocument()
  })

  it('admin não consegue desativar a si mesmo (409 exibido)', async () => {
    const { user } = renderComRouter('/usuarios')
    await screen.findByRole('rowheader', { name: 'admin' })
    await user.click(within(linhaDe('admin')).getByRole('button', { name: 'Desativar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não é possível alterar o próprio perfil ou status',
    )
    expect(within(linhaDe('admin')).getByText('ativo')).toBeInTheDocument()
  })

  it('editar nome e perfil do operador', async () => {
    const { user } = renderComRouter('/usuarios')
    await screen.findByRole('rowheader', { name: 'operador' })
    await user.click(within(linhaDe('operador')).getByRole('button', { name: 'Editar' }))
    const nome = screen.getByLabelText('Nome')
    await user.clear(nome)
    await user.type(nome, 'Operadora Chefe')
    await user.selectOptions(screen.getByLabelText('Perfil'), 'admin')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Operadora Chefe')).toBeInTheDocument()
    expect(within(linhaDe('operador')).getByText('admin', { selector: 'td' })).toBeInTheDocument()
  })

  it('redefinir senha do operador', async () => {
    const { user } = renderComRouter('/usuarios')
    await screen.findByRole('rowheader', { name: 'operador' })
    await user.click(within(linhaDe('operador')).getByRole('button', { name: 'Redefinir senha' }))
    await user.type(screen.getByLabelText('Nova senha'), 'outraSenha99')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha redefinida')
    expect(db.usuarios.find((u) => u.username === 'operador')?.password).toBe('outraSenha99')
  })
})
```

(O caso "operador em `/usuarios` é redirecionado" já está em `auth.test.tsx`, Task 2 — é o segundo teste obrigatório da ação admin.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/usuarios`
Expected: FAIL — a rota `/usuarios` renderiza só o placeholder; nenhuma linha `admin`.

- [ ] **Step 3: `api/usuarios.ts` e `StatusBadge`**

`src/frontend/src/api/usuarios.ts`:

```ts
import { api } from './client'
import type { UsuarioCreate, UsuarioOut, UsuarioUpdate } from './types'

export const chavesUsuarios = {
  lista: ['usuarios'] as const,
}

export function listarUsuarios(): Promise<UsuarioOut[]> {
  return api.get<UsuarioOut[]>('/usuarios')
}

export function criarUsuario(dados: UsuarioCreate): Promise<UsuarioOut> {
  return api.post<UsuarioOut>('/usuarios', dados)
}

export function atualizarUsuario(id: string, dados: UsuarioUpdate): Promise<UsuarioOut> {
  return api.patch<UsuarioOut>(`/usuarios/${id}`, dados)
}
```

`src/frontend/src/components/StatusBadge.tsx`:

```tsx
import type { EnvioStatus, LeilaoStatus, ProcessoStatus } from '@/api/types'

type Status = ProcessoStatus | LeilaoStatus | EnvioStatus | 'ativo' | 'inativo'

const ESTILOS: Record<Status, string> = {
  recebido: 'bg-slate-100 text-slate-700',
  analisando: 'bg-amber-100 text-amber-800',
  analisado: 'bg-green-100 text-green-800',
  erro: 'bg-red-100 text-red-800',
  agendado: 'bg-blue-100 text-blue-800',
  cancelado: 'bg-slate-200 text-slate-600',
  enviado: 'bg-green-100 text-green-800',
  ativo: 'bg-green-100 text-green-800',
  inativo: 'bg-slate-200 text-slate-600',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[status]}`}>
      {status}
    </span>
  )
}
```

- [ ] **Step 4: `UsuarioForm`, `RedefinirSenhaDialog`, `UsuariosPage`**

`src/frontend/src/features/usuarios/UsuarioForm.tsx`:

```tsx
import { type FormEvent, useState } from 'react'
import type { Perfil, UsuarioCreate, UsuarioOut, UsuarioUpdate } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Field } from '@/components/Field'
import { MSG_SENHA_CURTA, SENHA_MIN } from '@/features/auth/MinhaSenhaDialog'

const INPUT = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm'

export type DadosUsuarioForm = UsuarioCreate | Pick<UsuarioUpdate, 'nome' | 'perfil'>

type Props = {
  modo: 'novo' | 'editar'
  inicial?: UsuarioOut
  salvando: boolean
  erro: string | null
  onSalvar: (dados: DadosUsuarioForm) => void
  onCancelar: () => void
}

export function UsuarioForm({ modo, inicial, salvando, erro, onSalvar, onCancelar }: Props) {
  const [username, setUsername] = useState(inicial?.username ?? '')
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [perfil, setPerfil] = useState<Perfil>(inicial?.perfil ?? 'operador')
  const [senha, setSenha] = useState('')
  const senhaCurta = modo === 'novo' && senha !== '' && senha.length < SENHA_MIN
  const incompleto = nome.trim() === '' || (modo === 'novo' && (username.trim() === '' || senha === ''))

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (senhaCurta || incompleto) return
    if (modo === 'novo') {
      onSalvar({ username: username.trim(), nome: nome.trim(), perfil, senha })
    } else {
      onSalvar({ nome: nome.trim(), perfil })
    }
  }

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-3">
      {modo === 'novo' ? (
        <Field label="Usuário" htmlFor="usuario_username">
          <input
            id="usuario_username"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={INPUT}
            required
          />
        </Field>
      ) : null}
      <Field label="Nome" htmlFor="usuario_nome">
        <input
          id="usuario_nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={INPUT}
          required
        />
      </Field>
      <Field label="Perfil" htmlFor="usuario_perfil">
        <select
          id="usuario_perfil"
          value={perfil}
          onChange={(e) => setPerfil(e.target.value === 'admin' ? 'admin' : 'operador')}
          className={INPUT}
        >
          <option value="operador">operador</option>
          <option value="admin">admin</option>
        </select>
      </Field>
      {modo === 'novo' ? (
        <Field label="Senha" htmlFor="usuario_senha" erro={senhaCurta ? MSG_SENHA_CURTA : undefined}>
          <input
            id="usuario_senha"
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={INPUT}
            required
          />
        </Field>
      ) : null}
      {erro ? <Alerta tipo="erro">{erro}</Alerta> : null}
      <div className="flex gap-2">
        <Botao type="submit" disabled={salvando || senhaCurta || incompleto}>
          Salvar
        </Botao>
        <Botao variante="secundario" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}
```

`src/frontend/src/features/usuarios/RedefinirSenhaDialog.tsx`:

```tsx
import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { mensagemErro } from '@/api/client'
import type { UsuarioOut } from '@/api/types'
import { atualizarUsuario } from '@/api/usuarios'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { MSG_SENHA_CURTA, SENHA_MIN } from '@/features/auth/MinhaSenhaDialog'

const INPUT = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm'

type Props = { usuario: UsuarioOut | null; onFechar: () => void }

export function RedefinirSenhaDialog({ usuario, onFechar }: Props) {
  const [novaSenha, setNovaSenha] = useState('')
  const curta = novaSenha !== '' && novaSenha.length < SENHA_MIN

  const redefinir = useMutation({
    mutationFn: (dados: { id: string; nova_senha: string }) =>
      atualizarUsuario(dados.id, { nova_senha: dados.nova_senha }),
  })

  function fechar() {
    setNovaSenha('')
    redefinir.reset()
    onFechar()
  }

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!usuario || curta || novaSenha === '') return
    redefinir.mutate({ id: usuario.id, nova_senha: novaSenha })
  }

  return (
    <Dialog aberto={usuario !== null} titulo={`Redefinir senha de ${usuario?.username ?? ''}`} onFechar={fechar}>
      {redefinir.isSuccess ? (
        <div className="flex flex-col gap-3">
          <Alerta tipo="sucesso">Senha redefinida</Alerta>
          <Botao variante="secundario" onClick={fechar}>
            Fechar
          </Botao>
        </div>
      ) : (
        <form onSubmit={aoEnviar} className="flex flex-col gap-3">
          <Field label="Nova senha" htmlFor="redefinir_nova_senha" erro={curta ? MSG_SENHA_CURTA : undefined}>
            <input
              id="redefinir_nova_senha"
              type="password"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className={INPUT}
              required
            />
          </Field>
          {redefinir.isError ? <Alerta tipo="erro">{mensagemErro(redefinir.error)}</Alerta> : null}
          <div className="flex gap-2">
            <Botao type="submit" disabled={redefinir.isPending || curta || novaSenha === ''}>
              Salvar
            </Botao>
            <Botao variante="secundario" onClick={fechar} disabled={redefinir.isPending}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}
    </Dialog>
  )
}
```

`src/frontend/src/features/usuarios/UsuariosPage.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { mensagemErro } from '@/api/client'
import type { UsuarioCreate, UsuarioOut, UsuarioUpdate } from '@/api/types'
import { atualizarUsuario, chavesUsuarios, criarUsuario, listarUsuarios } from '@/api/usuarios'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Dialog } from '@/components/Dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { RedefinirSenhaDialog } from './RedefinirSenhaDialog'
import { type DadosUsuarioForm, UsuarioForm } from './UsuarioForm'

type Editando = { modo: 'novo' } | { modo: 'editar'; usuario: UsuarioOut } | null

export function UsuariosPage() {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState<Editando>(null)
  const [redefinindo, setRedefinindo] = useState<UsuarioOut | null>(null)

  const usuarios = useQuery({ queryKey: chavesUsuarios.lista, queryFn: listarUsuarios })

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chavesUsuarios.lista })
  }

  const criar = useMutation({
    mutationFn: criarUsuario,
    onSuccess: () => {
      setEditando(null)
      invalidar()
    },
  })

  const atualizar = useMutation({
    mutationFn: (dados: { id: string; patch: UsuarioUpdate }) => atualizarUsuario(dados.id, dados.patch),
    onSuccess: () => {
      setEditando(null)
      invalidar()
    },
  })

  function salvar(dados: DadosUsuarioForm) {
    if (editando?.modo === 'novo') {
      criar.mutate(dados as UsuarioCreate)
    } else if (editando?.modo === 'editar') {
      atualizar.mutate({ id: editando.usuario.id, patch: dados })
    }
  }

  function fecharForm() {
    setEditando(null)
    criar.reset()
    atualizar.reset()
  }

  const erroForm = criar.isError
    ? mensagemErro(criar.error)
    : atualizar.isError && editando?.modo === 'editar'
      ? mensagemErro(atualizar.error)
      : null
  const erroLinha = atualizar.isError && editando === null ? mensagemErro(atualizar.error) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <Botao onClick={() => setEditando({ modo: 'novo' })}>Novo usuário</Botao>
      </div>
      {usuarios.isPending ? <p className="text-slate-500">Carregando…</p> : null}
      {usuarios.isError ? <Alerta tipo="erro">{mensagemErro(usuarios.error)}</Alerta> : null}
      {erroLinha ? <Alerta tipo="erro">{erroLinha}</Alerta> : null}
      {usuarios.data ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Perfil</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.data.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {u.username}
                  </th>
                  <td className="px-3 py-2">{u.nome}</td>
                  <td className="px-3 py-2">{u.perfil}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={u.ativo ? 'ativo' : 'inativo'} />
                  </td>
                  <td className="flex flex-wrap gap-2 px-3 py-2">
                    <Botao variante="secundario" onClick={() => setEditando({ modo: 'editar', usuario: u })}>
                      Editar
                    </Botao>
                    <Botao
                      variante="secundario"
                      onClick={() => atualizar.mutate({ id: u.id, patch: { ativo: !u.ativo } })}
                      disabled={atualizar.isPending}
                    >
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </Botao>
                    <Botao variante="secundario" onClick={() => setRedefinindo(u)}>
                      Redefinir senha
                    </Botao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        aberto={editando !== null}
        titulo={editando?.modo === 'editar' ? `Editar ${editando.usuario.username}` : 'Novo usuário'}
        onFechar={fecharForm}
      >
        {editando ? (
          <UsuarioForm
            key={editando.modo === 'editar' ? editando.usuario.id : 'novo'}
            modo={editando.modo}
            inicial={editando.modo === 'editar' ? editando.usuario : undefined}
            salvando={criar.isPending || atualizar.isPending}
            erro={erroForm}
            onSalvar={salvar}
            onCancelar={fecharForm}
          />
        ) : null}
      </Dialog>

      <RedefinirSenhaDialog usuario={redefinindo} onFechar={() => setRedefinindo(null)} />
    </div>
  )
}
```

- [ ] **Step 5: Rota e handlers mock**

`src/frontend/src/app/rotas.tsx` — troque o placeholder de `/usuarios` e importe a página:

```tsx
import { UsuariosPage } from '@/features/usuarios/UsuariosPage'
```

```tsx
            children: [{ path: '/usuarios', element: <UsuariosPage /> }],
```

`src/frontend/src/api/mocks/usuarios.ts`:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import type { UsuarioCreate, UsuarioUpdate } from '@/api/types'
import { db, novoId, toUsuarioOut, type UsuarioMock, usuarioLogado } from './db'
import { erro, exigirAdmin } from './http'

const SENHA_MIN = 8
const MSG_PROPRIO = 'Não é possível alterar o próprio perfil ou status'

export const usuariosHandlers: HttpHandler[] = [
  http.get('/api/usuarios', () => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const lista = [...db.usuarios].sort((a, b) => a.username.localeCompare(b.username))
    return HttpResponse.json(lista.map(toUsuarioOut))
  }),

  http.post('/api/usuarios', async ({ request }) => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const body = (await request.json()) as UsuarioCreate
    if (db.usuarios.some((u) => u.username === body.username)) {
      return erro(409, 'Nome de usuário já existe')
    }
    if (body.senha.length < SENHA_MIN) return erro(422, 'Senha deve ter ao menos 8 caracteres')
    const novo: UsuarioMock = {
      id: novoId('u'),
      username: body.username,
      nome: body.nome,
      perfil: body.perfil,
      ativo: true,
      password: body.senha,
    }
    db.usuarios.push(novo)
    return HttpResponse.json(toUsuarioOut(novo), { status: 201 })
  }),

  http.patch('/api/usuarios/:id', async ({ params, request }) => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const alvo = db.usuarios.find((u) => u.id === String(params.id))
    if (!alvo) return erro(404, 'Usuário não encontrado')
    const body = (await request.json()) as UsuarioUpdate
    const proprio = usuarioLogado()?.id === alvo.id
    const mudaStatus = body.ativo === false
    const rebaixa = body.perfil !== undefined && body.perfil !== 'admin'
    if (proprio && (mudaStatus || rebaixa)) return erro(409, MSG_PROPRIO)
    if (body.nova_senha !== undefined && body.nova_senha.length < SENHA_MIN) {
      return erro(422, 'Senha deve ter ao menos 8 caracteres')
    }
    if (body.nome !== undefined) alvo.nome = body.nome
    if (body.perfil !== undefined) alvo.perfil = body.perfil
    if (body.ativo !== undefined) alvo.ativo = body.ativo
    if (body.nova_senha !== undefined) alvo.password = body.nova_senha
    return HttpResponse.json(toUsuarioOut(alvo))
  }),
]
```

`src/frontend/src/api/mocks/handlers.ts` — arquivo completo:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import { authHandlers } from './auth'
import { usuariosHandlers } from './usuarios'

export const handlers: HttpHandler[] = [
  http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
  ...authHandlers,
  ...usuariosHandlers,
]
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/usuarios src/features/auth`
Expected: PASS, 19 testes (8 usuários + 11 auth).

Run: `cd src && rtk docker compose exec frontend sh -c "pnpm lint:fix && pnpm lint && pnpm typecheck"`
Expected: sem erros.

- [ ] **Step 7: Stage**

```bash
rtk git add src/frontend
```

Mensagem sugerida: `feat(frontend): gestão de usuários pelo admin`. Dev revisa e comita.

---

### Task 4: Processos — lista, upload de PDF e apagar (admin)

**Files:**
- Create: `src/frontend/src/api/processos.ts`, `src/frontend/src/features/processos/ProcessosPage.tsx`, `src/frontend/src/features/processos/UploadProcesso.tsx`, `src/frontend/src/features/processos/ApagarProcessoDialog.tsx`, `src/frontend/src/api/mocks/processos.ts`
- Modify: `src/frontend/src/app/rotas.tsx`, `src/frontend/src/api/mocks/handlers.ts`
- Test: `src/frontend/src/features/processos/ProcessosPage.test.tsx`

**Interfaces:**
- Consumes: `api`, `mensagemErro` (Task 1); `formatarDataHora`, `ouTraco` (Task 1); `db`, `logar`, `novoId`, `toProcessoOut`, `leilaoAtivo`, `ProcessoMock` (Task 1); `erro`, `exigirSessao`, `exigirAdmin` (Task 1); `Alerta`, `Botao`, `Dialog` (Task 2); `useUsuario` (Task 2); `StatusBadge` (Task 3); `renderComRouter` (Task 2).
- Produces:
  - `src/api/processos.ts`: `const chavesProcessos = { lista: ['processos'] as const, detalhe: (id: string) => ['processos', id] as const }`, `listarProcessos(): Promise<ProcessoOut[]>`, `obterProcesso(id): Promise<ProcessoDetalheOut>`, `enviarProcesso(arquivo: File): Promise<ProcessoOut>`, `analisarProcesso(id): Promise<ProcessoDetalheOut>`, `salvarChecklist(id, checklist: Checklist): Promise<Checklist>`, `excluirProcesso(id): Promise<void>`.
  - `features/processos/ApagarProcessoDialog.tsx`: `ApagarProcessoDialog({ processo, onFechar }: { processo: ProcessoOut | null; onFechar: () => void })`.
  - `src/api/mocks/processos.ts`: `const processosHandlers: HttpHandler[]` (`GET/POST /processos`, `DELETE /processos/:id` **[admin]**; Task 5 acrescenta detalhe/analisar/checklist).

- [ ] **Step 1: Teste falhando**

`src/frontend/src/features/processos/ProcessosPage.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

function linhaDe(nomeArquivo: string): HTMLElement {
  const linha = screen.getByText(nomeArquivo).closest('tr')
  if (!linha) throw new Error(`linha de ${nomeArquivo} não encontrada`)
  return linha
}

describe('ProcessosPage', () => {
  it('lista os processos com status e número; número nulo vira traço', async () => {
    logar('operador')
    renderComRouter('/')
    expect(await screen.findByText('processo-1003966.pdf')).toBeInTheDocument()
    expect(screen.getByText('1003966-15.2022.4.01.4301')).toBeInTheDocument()
    expect(screen.getByText('analisado')).toBeInTheDocument()
    const linhaRecebido = linhaDe('execucao-fiscal-2024.pdf')
    expect(within(linhaRecebido).getAllByText('—')).toHaveLength(2)
    expect(within(linhaRecebido).getByText('recebido')).toBeInTheDocument()
  })

  it('upload de PDF adiciona linha na lista', async () => {
    logar('operador')
    const { user } = renderComRouter('/')
    await screen.findByText('processo-1003966.pdf')
    const input = screen.getByLabelText('Arquivo PDF do processo')
    await user.upload(input, new File(['%PDF-1.4'], 'novo-processo.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText('novo-processo.pdf')).toBeInTheDocument()
  })

  it('arquivo que não é PDF mostra erro 415', async () => {
    logar('operador')
    const { user } = renderComRouter('/')
    await screen.findByText('processo-1003966.pdf')
    const input = screen.getByLabelText('Arquivo PDF do processo')
    await user.upload(input, new File(['oi'], 'nota.txt', { type: 'text/plain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo deve ser PDF')
  })

  it('lista vazia mostra estado vazio', async () => {
    logar('operador')
    db.processos = []
    renderComRouter('/')
    expect(await screen.findByText('Nenhum processo enviado ainda.')).toBeInTheDocument()
  })

  it('nome do arquivo é link pro detalhe', async () => {
    logar('operador')
    renderComRouter('/')
    const link = await screen.findByRole('link', { name: 'processo-1003966.pdf' })
    expect(link).toHaveAttribute('href', '/processos/p-1')
  })

  it('admin apaga processo sem leilão após confirmar', async () => {
    logar('admin')
    const { user } = renderComRouter('/')
    await screen.findByText('execucao-fiscal-2024.pdf')
    await user.click(within(linhaDe('execucao-fiscal-2024.pdf')).getByRole('button', { name: 'Apagar' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('execucao-fiscal-2024.pdf')
    await user.click(within(dialogo).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(screen.queryByText('execucao-fiscal-2024.pdf')).not.toBeInTheDocument())
    expect(db.processos.some((p) => p.id === 'p-2')).toBe(false)
  })

  it('admin recebe 409 ao apagar processo com leilão agendado', async () => {
    logar('admin')
    const { user } = renderComRouter('/')
    await screen.findByText('processo-1003966.pdf')
    await user.click(within(linhaDe('processo-1003966.pdf')).getByRole('button', { name: 'Apagar' }))
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Apagar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Processo tem leilão agendado')
    expect(screen.getByRole('link', { name: 'processo-1003966.pdf' })).toBeInTheDocument()
  })

  it('operador não vê o botão Apagar', async () => {
    logar('operador')
    renderComRouter('/')
    await screen.findByText('processo-1003966.pdf')
    expect(screen.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })
})
```

`user.upload` com arquivo `text/plain`: o `accept="application/pdf"` não bloqueia no jsdom nem no `userEvent` (ele só filtra com `applyAccept: true`), então o 415 do mock é exercitado.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/processos`
Expected: FAIL — a rota `/` renderiza só o placeholder; nenhum texto `processo-1003966.pdf`.

- [ ] **Step 3: `api/processos.ts`, `UploadProcesso`, `ApagarProcessoDialog`, `ProcessosPage`**

`src/frontend/src/api/processos.ts`:

```ts
import { api } from './client'
import type { Checklist, ProcessoDetalheOut, ProcessoOut } from './types'

export const chavesProcessos = {
  lista: ['processos'] as const,
  detalhe: (id: string) => ['processos', id] as const,
}

export function listarProcessos(): Promise<ProcessoOut[]> {
  return api.get<ProcessoOut[]>('/processos')
}

export function obterProcesso(id: string): Promise<ProcessoDetalheOut> {
  return api.get<ProcessoDetalheOut>(`/processos/${id}`)
}

export function enviarProcesso(arquivo: File): Promise<ProcessoOut> {
  const form = new FormData()
  form.append('arquivo', arquivo)
  return api.post<ProcessoOut>('/processos', form)
}

export function analisarProcesso(id: string): Promise<ProcessoDetalheOut> {
  return api.post<ProcessoDetalheOut>(`/processos/${id}/analisar`)
}

export function salvarChecklist(id: string, checklist: Checklist): Promise<Checklist> {
  return api.put<Checklist>(`/processos/${id}/checklist`, checklist)
}

export function excluirProcesso(id: string): Promise<void> {
  return api.del(`/processos/${id}`)
}
```

`src/frontend/src/features/processos/UploadProcesso.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useRef } from 'react'
import { mensagemErro } from '@/api/client'
import { chavesProcessos, enviarProcesso } from '@/api/processos'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'

export function UploadProcesso() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const enviar = useMutation({
    mutationFn: enviarProcesso,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chavesProcessos.lista }),
  })

  function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (arquivo) enviar.mutate(arquivo)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        aria-label="Arquivo PDF do processo"
        onChange={aoEscolher}
      />
      <Botao onClick={() => inputRef.current?.click()} disabled={enviar.isPending}>
        {enviar.isPending ? 'Enviando…' : 'Enviar PDF'}
      </Botao>
      {enviar.isError ? <Alerta tipo="erro">{mensagemErro(enviar.error)}</Alerta> : null}
    </div>
  )
}
```

`src/frontend/src/features/processos/ApagarProcessoDialog.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mensagemErro } from '@/api/client'
import { chavesProcessos, excluirProcesso } from '@/api/processos'
import type { ProcessoOut } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Dialog } from '@/components/Dialog'

type Props = { processo: ProcessoOut | null; onFechar: () => void }

export function ApagarProcessoDialog({ processo, onFechar }: Props) {
  const queryClient = useQueryClient()

  const apagar = useMutation({
    mutationFn: excluirProcesso,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.lista })
      onFechar()
    },
  })

  function fechar() {
    apagar.reset()
    onFechar()
  }

  return (
    <Dialog aberto={processo !== null} titulo="Apagar processo" onFechar={fechar}>
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Apagar <strong>{processo?.nome_arquivo}</strong>? O PDF, o checklist e o relatório serão
          removidos. Esta ação não pode ser desfeita.
        </p>
        {apagar.isError ? <Alerta tipo="erro">{mensagemErro(apagar.error)}</Alerta> : null}
        <div className="flex gap-2">
          <Botao
            variante="perigo"
            onClick={() => processo && apagar.mutate(processo.id)}
            disabled={apagar.isPending}
          >
            Apagar
          </Botao>
          <Botao variante="secundario" onClick={fechar} disabled={apagar.isPending}>
            Cancelar
          </Botao>
        </div>
      </div>
    </Dialog>
  )
}
```

`src/frontend/src/features/processos/ProcessosPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { mensagemErro } from '@/api/client'
import { chavesProcessos, listarProcessos } from '@/api/processos'
import type { ProcessoOut } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { StatusBadge } from '@/components/StatusBadge'
import { useUsuario } from '@/features/auth/useUsuario'
import { formatarDataHora, ouTraco } from '@/lib/formatar'
import { ApagarProcessoDialog } from './ApagarProcessoDialog'
import { UploadProcesso } from './UploadProcesso'

export function ProcessosPage() {
  const { ehAdmin } = useUsuario()
  const [apagando, setApagando] = useState<ProcessoOut | null>(null)
  const { data, isPending, isError, error } = useQuery({
    queryKey: chavesProcessos.lista,
    queryFn: listarProcessos,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Processos</h1>
        <UploadProcesso />
      </div>
      {isPending ? <p className="text-slate-500">Carregando…</p> : null}
      {isError ? <Alerta tipo="erro">{mensagemErro(error)}</Alerta> : null}
      {data && data.length === 0 ? (
        <p className="text-slate-500">Nenhum processo enviado ainda.</p>
      ) : null}
      {data && data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Arquivo</th>
                <th className="px-3 py-2">Nº processo</th>
                <th className="px-3 py-2">Vara</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Recebido em</th>
                {ehAdmin ? <th className="px-3 py-2">Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link to={`/processos/${p.id}`} className="text-blue-700 hover:underline">
                      {p.nome_arquivo}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{ouTraco(p.numero_processo)}</td>
                  <td className="px-3 py-2">{ouTraco(p.vara)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2">{formatarDataHora(p.criado_em)}</td>
                  {ehAdmin ? (
                    <td className="px-3 py-2">
                      <Botao variante="perigo" onClick={() => setApagando(p)}>
                        Apagar
                      </Botao>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ApagarProcessoDialog processo={apagando} onFechar={() => setApagando(null)} />
    </div>
  )
}
```

- [ ] **Step 4: Rota `/` e handlers mock**

`src/frontend/src/app/rotas.tsx` — troque o placeholder de `/` e importe a página:

```tsx
import { ProcessosPage } from '@/features/processos/ProcessosPage'
```

```tsx
          { path: '/', element: <ProcessosPage /> },
```

`src/frontend/src/api/mocks/processos.ts`:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import { db, leilaoAtivo, novoId, type ProcessoMock, toProcessoOut } from './db'
import { erro, exigirAdmin, exigirSessao } from './http'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function ordenarRecentes(lista: ProcessoMock[]): ProcessoMock[] {
  return [...lista].sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em))
}

export function buscarProcesso(id: string | readonly string[] | undefined): ProcessoMock | null {
  return db.processos.find((p) => p.id === String(id)) ?? null
}

export const processosHandlers: HttpHandler[] = [
  http.get('/api/processos', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    return HttpResponse.json(ordenarRecentes(db.processos).map(toProcessoOut))
  }),

  http.post('/api/processos', async ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const form = await request.formData()
    const arquivo = form.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.type !== 'application/pdf') {
      return erro(415, 'Arquivo deve ser PDF')
    }
    if (arquivo.size > MAX_UPLOAD_BYTES) return erro(413, 'Arquivo excede 50 MB')
    const processo: ProcessoMock = {
      id: novoId('p'),
      nome_arquivo: arquivo.name,
      status: 'recebido',
      numero_processo: null,
      vara: null,
      erro: null,
      criado_em: new Date().toISOString(),
      analisado_em: null,
      checklist: null,
      relatorio: null,
    }
    db.processos.push(processo)
    return HttpResponse.json(toProcessoOut(processo), { status: 201 })
  }),

  http.delete('/api/processos/:id', ({ params }) => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const processo = buscarProcesso(params.id)
    if (!processo) return erro(404, 'Processo não encontrado')
    if (leilaoAtivo(processo.id)) return erro(409, 'Processo tem leilão agendado')
    db.leiloes = db.leiloes.filter((l) => l.processo_id !== processo.id)
    db.processos = db.processos.filter((p) => p.id !== processo.id)
    return new HttpResponse(null, { status: 204 })
  }),
]
```

`src/frontend/src/api/mocks/handlers.ts` — arquivo completo:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import { authHandlers } from './auth'
import { processosHandlers } from './processos'
import { usuariosHandlers } from './usuarios'

export const handlers: HttpHandler[] = [
  http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
  ...authHandlers,
  ...usuariosHandlers,
  ...processosHandlers,
]
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/processos src/features/auth`
Expected: PASS, 19 testes (8 processos + 11 auth; o "login ok" continua achando o heading "Processos", agora da página real).

Run: `cd src && rtk docker compose exec frontend sh -c "pnpm lint:fix && pnpm lint && pnpm typecheck"`
Expected: sem erros.

- [ ] **Step 6: Stage**

```bash
rtk git add src/frontend
```

Mensagem sugerida: `feat(frontend): lista de processos com upload de PDF e exclusão pelo admin`. Dev revisa e comita.

---

### Task 5: Detalhe do processo — analisar, aviso de IA, checklist (visualizar/editar) e relatório

**Files:**
- Create: `src/frontend/src/components/AvisoIA.tsx`, `src/frontend/src/features/processos/ProcessoDetalhePage.tsx`, `src/frontend/src/features/processos/ChecklistView.tsx`, `src/frontend/src/features/processos/ChecklistForm.tsx`, `src/frontend/src/features/processos/RelatorioView.tsx`, `src/frontend/src/features/processos/validacao.ts`
- Modify: `src/frontend/src/app/rotas.tsx`, `src/frontend/src/api/mocks/processos.ts`
- Test: `src/frontend/src/features/processos/ProcessoDetalhePage.test.tsx`, `src/frontend/src/features/processos/validacao.test.ts`

**Interfaces:**
- Consumes: `chavesProcessos`, `obterProcesso`, `analisarProcesso`, `salvarChecklist` (Task 4); `buscarProcesso`, `processosHandlers` (Task 4); `Checklist`, `BemPenhorado`, `Execucao`, `Relatorio`, `ProcessoDetalheOut` (Task 1); `formatarDinheiro`, `formatarData`, `ouTraco` (Task 1); `Card`, `Botao`, `Field`, `Alerta` (Task 2); `StatusBadge` (Task 3); `CHECKLIST_EXEMPLO`, `RELATORIO_EXEMPLO`, `db`, `toDetalhe`, `logar` (Task 1).
- Produces:
  - `components/AvisoIA.tsx`: `AvisoIA()` — `<p role="note">Gerado por IA a partir do PDF — revise antes de usar.</p>`; constante exportada `TEXTO_AVISO_IA`.
  - `features/processos/validacao.ts`: `PADRAO_DINHEIRO: RegExp`, `dinheiroValido(valor: string | null): boolean`, `camposDinheiroInvalidos(checklist: Checklist): string[]`, `normalizarVazio(valor: string): string | null`.
  - `features/processos/ChecklistView.tsx`: `ChecklistView({ checklist, onEditar }: { checklist: Checklist; onEditar: () => void })`.
  - `features/processos/ChecklistForm.tsx`: `ChecklistForm({ inicial, salvando, erro, onSalvar, onCancelar }: { inicial: Checklist; salvando: boolean; erro: string | null; onSalvar: (c: Checklist) => void; onCancelar: () => void })`.
  - `features/processos/RelatorioView.tsx`: `RelatorioView({ relatorio }: { relatorio: Relatorio })`.
  - `features/processos/ProcessoDetalhePage.tsx`: `ProcessoDetalhePage()` — lê `:id` de `useParams`. É o **ponto de composição** (spec frontend §3): Tasks 6–8 inserem `AgendarLeilaoCard`, `EditalCard` e `EnviarMarketingCard` abaixo do `RelatorioView`.
  - Mock: `GET /api/processos/:id`, `POST /api/processos/:id/analisar`, `PUT /api/processos/:id/checklist`.

- [ ] **Step 1: Teste falhando — validação**

`src/frontend/src/features/processos/validacao.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CHECKLIST_EXEMPLO } from '@/api/mocks/fixtures'
import { camposDinheiroInvalidos, dinheiroValido, normalizarVazio } from './validacao'

describe('validacao do checklist', () => {
  it('aceita null, vazio e decimal com duas casas', () => {
    expect(dinheiroValido(null)).toBe(true)
    expect(dinheiroValido('')).toBe(true)
    expect(dinheiroValido('95000.00')).toBe(true)
  })

  it('rejeita vírgula, símbolo, uma casa decimal e texto', () => {
    expect(dinheiroValido('95000,00')).toBe(false)
    expect(dinheiroValido('R$ 95000.00')).toBe(false)
    expect(dinheiroValido('95000.0')).toBe(false)
    expect(dinheiroValido('abc')).toBe(false)
  })

  it('lista os caminhos dos campos inválidos', () => {
    const checklist = structuredClone(CHECKLIST_EXEMPLO)
    checklist.execucao.valor_divida = 'x'
    const bem = checklist.bens[1]
    if (bem) bem.valor_reavaliacao = '1,5'
    expect(camposDinheiroInvalidos(checklist)).toEqual([
      'execucao.valor_divida',
      'bens.1.valor_reavaliacao',
    ])
    expect(camposDinheiroInvalidos(CHECKLIST_EXEMPLO)).toEqual([])
  })

  it('normalizarVazio transforma string em branco em null', () => {
    expect(normalizarVazio('   ')).toBeNull()
    expect(normalizarVazio(' x ')).toBe('x')
  })
})
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/processos/validacao`
Expected: FAIL — `Failed to resolve import "./validacao"`.

- [ ] **Step 2: Implementar `validacao.ts`**

```ts
import type { Checklist } from '@/api/types'

export const PADRAO_DINHEIRO = /^\d+\.\d{2}$/

export function dinheiroValido(valor: string | null): boolean {
  return valor === null || valor === '' || PADRAO_DINHEIRO.test(valor)
}

export function camposDinheiroInvalidos(checklist: Checklist): string[] {
  const invalidos: string[] = []
  if (!dinheiroValido(checklist.execucao.valor_divida)) invalidos.push('execucao.valor_divida')
  for (const [i, bem] of checklist.bens.entries()) {
    if (!dinheiroValido(bem.valor_avaliacao)) invalidos.push(`bens.${i}.valor_avaliacao`)
    if (!dinheiroValido(bem.valor_reavaliacao)) invalidos.push(`bens.${i}.valor_reavaliacao`)
  }
  return invalidos
}

export function normalizarVazio(valor: string): string | null {
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/processos/validacao`
Expected: PASS, 4 testes.

- [ ] **Step 3: Teste falhando — página de detalhe**

`src/frontend/src/features/processos/ProcessoDetalhePage.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { TEXTO_AVISO_IA } from '@/components/AvisoIA'
import { renderComRouter } from '@/test/render'

function processo(id: string) {
  const p = db.processos.find((x) => x.id === id)
  if (!p) throw new Error(`fixture ${id} não existe`)
  return p
}

describe('ProcessoDetalhePage', () => {
  it('processo recebido mostra status, sem checklist nem aviso, com botão Analisar', async () => {
    logar('operador')
    renderComRouter('/processos/p-2')
    expect(await screen.findByRole('heading', { name: 'execucao-fiscal-2024.pdf' })).toBeInTheDocument()
    expect(screen.getByText('recebido')).toBeInTheDocument()
    expect(screen.getByText('Analise o processo para preencher o checklist.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analisar' })).toBeEnabled()
    expect(screen.queryByText(TEXTO_AVISO_IA)).not.toBeInTheDocument()
  })

  it('analisar preenche checklist e relatório, com aviso de IA e tipo de justiça', async () => {
    logar('operador')
    const { user } = renderComRouter('/processos/p-2')
    await user.click(await screen.findByRole('button', { name: 'Analisar' }))
    expect(await screen.findByText('6.351')).toBeInTheDocument()
    expect(screen.getByText('6.235')).toBeInTheDocument()
    expect(screen.getByText('CLAUDIO CEZAR CAVALCANTES')).toBeInTheDocument()
    expect(screen.getByText('analisado')).toBeInTheDocument()
    expect(screen.getByText('Justiça federal')).toBeInTheDocument()
    expect(screen.getAllByText(TEXTO_AVISO_IA)).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Reanalisar' })).toBeInTheDocument()
  })

  it('PDF sem texto mostra erro 422 e status erro', async () => {
    logar('operador')
    db.processos.push({
      id: 'p-3',
      nome_arquivo: 'semtexto-scan.pdf',
      status: 'recebido',
      numero_processo: null,
      vara: null,
      erro: null,
      criado_em: '2026-09-29T09:00:00-03:00',
      analisado_em: null,
      checklist: null,
      relatorio: null,
    })
    const { user } = renderComRouter('/processos/p-3')
    await user.click(await screen.findByRole('button', { name: 'Analisar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('PDF sem camada de texto')
    expect(await screen.findByText('erro')).toBeInTheDocument()
  })

  it('editar vara e salvar atualiza o cabeçalho', async () => {
    logar('operador')
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Editar checklist' }))
    const vara = screen.getByLabelText('Vara')
    await user.clear(vara)
    await user.type(vara, '1ª Vara Federal de Palmas - TO')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(
      await screen.findByText(/^Processo nº .+ · 1ª Vara Federal de Palmas - TO$/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
  })

  it('valor em formato inválido bloqueia o salvar', async () => {
    logar('operador')
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Editar checklist' }))
    const avaliacao = screen.getByLabelText('Bem 1 — avaliação (R$)')
    await user.clear(avaliacao)
    await user.type(avaliacao, 'abc')
    expect(screen.getByText('Use o formato 1234.56')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('relatório lista resumo e etapas em ordem', async () => {
    logar('operador')
    renderComRouter('/processos/p-1')
    expect(await screen.findByText(/Execução fiscal movida pela União Federal/)).toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Etapas do processo' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens).toHaveLength(4)
    expect(itens[0]).toHaveTextContent('15/08/2022')
    expect(itens[0]).toHaveTextContent('Ajuizamento da execução fiscal pela União Federal.')
  })

  it('checklist sem bens renderiza aviso sem quebrar', async () => {
    logar('operador')
    const p = processo('p-1')
    if (p.checklist) p.checklist.bens = []
    renderComRouter('/processos/p-1')
    expect(await screen.findByText('Nenhum bem penhorado identificado')).toBeInTheDocument()
    expect(screen.getByText('UNIÃO FEDERAL')).toBeInTheDocument()
  })

  it('id inexistente mostra 404', async () => {
    logar('operador')
    renderComRouter('/processos/nao-existe')
    expect(await screen.findByRole('alert')).toHaveTextContent('Processo não encontrado')
  })
})
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/processos/ProcessoDetalhePage`
Expected: FAIL — `Failed to resolve import "@/components/AvisoIA"`.

- [ ] **Step 4: `AvisoIA` e `ChecklistView`**

`src/frontend/src/components/AvisoIA.tsx` (visão geral §2 "Revisão humana"):

```tsx
export const TEXTO_AVISO_IA = 'Gerado por IA a partir do PDF — revise antes de usar.'

export function AvisoIA() {
  return (
    <p role="note" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {TEXTO_AVISO_IA}
    </p>
  )
}
```

`src/frontend/src/features/processos/ChecklistView.tsx`:

```tsx
import type { ReactNode } from 'react'
import type { Advogado, BemPenhorado, Checklist, Executado, Parte } from '@/api/types'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { formatarData, formatarDinheiro, ouTraco } from '@/lib/formatar'

function simNao(valor: boolean | null): string {
  if (valor === null) return '—'
  return valor ? 'Sim' : 'Não'
}

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2">
      <dt className="w-56 shrink-0 text-sm font-medium text-slate-600">{rotulo}</dt>
      <dd className="text-sm">{valor}</dd>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h3>
      <dl className="flex flex-col gap-1">{children}</dl>
    </section>
  )
}

function Advogados({ advogados }: { advogados: Advogado[] }) {
  if (advogados.length === 0) return <span>—</span>
  return (
    <ul className="list-inside list-disc">
      {advogados.map((a) => (
        <li key={`${a.nome}-${a.oab ?? ''}`}>
          {a.nome}
          {a.oab ? ` — ${a.oab}` : ''}
          {a.ref ? ` (${a.ref})` : ''}
        </li>
      ))}
    </ul>
  )
}

function ParteView({ parte }: { parte: Parte }) {
  return (
    <>
      <Linha rotulo="Nome" valor={parte.nome} />
      <Linha rotulo="CPF/CNPJ" valor={ouTraco(parte.cpf_cnpj)} />
      <Linha rotulo="Advogados" valor={<Advogados advogados={parte.advogados} />} />
    </>
  )
}

function ExecutadoView({ executado }: { executado: Executado }) {
  return (
    <div className="rounded border border-slate-100 p-2">
      <ParteView parte={executado} />
      <Linha rotulo="Citado" valor={simNao(executado.citado)} />
      <Linha rotulo="Forma da citação" valor={ouTraco(executado.citacao_forma)} />
      <Linha rotulo="Ref. citação" valor={ouTraco(executado.citacao_ref)} />
    </div>
  )
}

function BemView({ bem, indice }: { bem: BemPenhorado; indice: number }) {
  return (
    <div className="rounded border border-slate-100 p-2">
      <h4 className="mb-1 text-sm font-semibold">Bem {indice + 1}</h4>
      <Linha rotulo="Descrição" valor={bem.descricao} />
      <Linha rotulo="Matrícula" valor={ouTraco(bem.matricula)} />
      <Linha rotulo="Localização" valor={ouTraco(bem.localizacao)} />
      <Linha rotulo="Data da penhora" valor={formatarData(bem.data_penhora)} />
      <Linha rotulo="Ref. penhora" valor={ouTraco(bem.penhora_ref)} />
      <Linha rotulo="Fiel depositário" valor={ouTraco(bem.fiel_depositario)} />
      <Linha rotulo="Executado intimado" valor={simNao(bem.executado_intimado)} />
      <Linha rotulo="Data da intimação" valor={formatarData(bem.data_intimacao)} />
      <Linha rotulo="Ref. intimação" valor={ouTraco(bem.intimacao_ref)} />
      <Linha rotulo="Propriedade" valor={ouTraco(bem.propriedade)} />
      <Linha rotulo="Avaliação" valor={formatarDinheiro(bem.valor_avaliacao)} />
      <Linha rotulo="Data da avaliação" valor={formatarData(bem.data_avaliacao)} />
      <Linha rotulo="Oficial avaliador" valor={ouTraco(bem.oficial_avaliacao)} />
      <Linha rotulo="Reavaliação" valor={formatarDinheiro(bem.valor_reavaliacao)} />
      <Linha rotulo="Data da reavaliação" valor={formatarData(bem.data_reavaliacao)} />
      <Linha rotulo="Certidão de matrícula" valor={ouTraco(bem.certidao_matricula_ref)} />
      <Linha rotulo="Averbação da penhora" valor={ouTraco(bem.averbacao_penhora)} />
      <Linha rotulo="Hipoteca" valor={ouTraco(bem.hipoteca)} />
      <Linha rotulo="Enfiteuse / aforamento" valor={ouTraco(bem.enfiteuse)} />
      <Linha rotulo="Outras penhoras" valor={ouTraco(bem.outras_penhoras)} />
    </div>
  )
}

type Props = { checklist: Checklist; onEditar: () => void }

export function ChecklistView({ checklist, onEditar }: Props) {
  return (
    <Card
      titulo="Checklist processual"
      acoes={
        <Botao variante="secundario" onClick={onEditar}>
          Editar checklist
        </Botao>
      }
    >
      <div className="flex flex-col gap-5">
        <Secao titulo="Processo">
          <Linha rotulo="Vara" valor={ouTraco(checklist.vara)} />
          <Linha rotulo="Nº do processo" valor={ouTraco(checklist.numero_processo)} />
          <Linha rotulo="Juiz" valor={ouTraco(checklist.juiz)} />
          <Linha rotulo="Tipo de justiça" valor={ouTraco(checklist.tipo_justica)} />
        </Secao>
        <Secao titulo="Exequente">
          <ParteView parte={checklist.exequente} />
        </Secao>
        <Secao titulo="Executados">
          {checklist.executados.length === 0 ? <p className="text-sm">—</p> : null}
          {checklist.executados.map((ex) => (
            <ExecutadoView key={`${ex.nome}-${ex.cpf_cnpj ?? ''}`} executado={ex} />
          ))}
        </Secao>
        <Secao titulo="Execução">
          <Linha rotulo="CDA" valor={ouTraco(checklist.execucao.cda)} />
          <Linha rotulo="Natureza da dívida" valor={ouTraco(checklist.execucao.natureza_divida)} />
          <Linha rotulo="Classe" valor={ouTraco(checklist.execucao.classe)} />
          <Linha rotulo="Valor da dívida" valor={formatarDinheiro(checklist.execucao.valor_divida)} />
          <Linha rotulo="Data" valor={formatarData(checklist.execucao.data_divida)} />
        </Secao>
        <Secao titulo="Penhora">
          {checklist.bens.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum bem penhorado identificado</p>
          ) : null}
          {checklist.bens.map((bem, i) => (
            <BemView key={`${bem.matricula ?? ''}-${bem.descricao}`} bem={bem} indice={i} />
          ))}
        </Secao>
        <Secao titulo="Recursos">
          <Linha rotulo="Recursos" valor={ouTraco(checklist.recursos)} />
        </Secao>
        <Secao titulo="Observações pro leilão">
          {checklist.observacoes_leilao.length === 0 ? <p className="text-sm">—</p> : null}
          {checklist.observacoes_leilao.length > 0 ? (
            <ul className="list-inside list-disc text-sm">
              {checklist.observacoes_leilao.map((obs) => (
                <li key={obs}>{obs}</li>
              ))}
            </ul>
          ) : null}
        </Secao>
      </div>
    </Card>
  )
}
```

- [ ] **Step 5: `ChecklistForm`**

Edita campos de texto do topo, exequente, execução e, por bem: descrição, matrícula, localização, fiel depositário, avaliação e reavaliação. Advogados, executados, `tipo_justica` (spec backend §3: "só é exibido") e demais campos do bem ficam só-leitura no v1 — o `PUT` manda o objeto inteiro, então nada se perde.

`src/frontend/src/features/processos/ChecklistForm.tsx`:

```tsx
import { type FormEvent, useState } from 'react'
import type { BemPenhorado, Checklist, Execucao } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { Field } from '@/components/Field'
import { camposDinheiroInvalidos, normalizarVazio } from './validacao'

const INPUT = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm'
const MSG_DINHEIRO = 'Use o formato 1234.56'

type Props = {
  inicial: Checklist
  salvando: boolean
  erro: string | null
  onSalvar: (checklist: Checklist) => void
  onCancelar: () => void
}

type CampoTexto = {
  id: string
  label: string
  valor: string | null
  onChange: (valor: string | null) => void
  erro?: string
  multilinha?: boolean
}

function Texto({ id, label, valor, onChange, erro, multilinha = false }: CampoTexto) {
  return (
    <Field label={label} htmlFor={id} erro={erro}>
      {multilinha ? (
        <textarea
          id={id}
          value={valor ?? ''}
          onChange={(e) => onChange(normalizarVazio(e.target.value))}
          rows={3}
          className={INPUT}
        />
      ) : (
        <input
          id={id}
          value={valor ?? ''}
          onChange={(e) => onChange(normalizarVazio(e.target.value))}
          className={INPUT}
        />
      )}
    </Field>
  )
}

export function ChecklistForm({ inicial, salvando, erro, onSalvar, onCancelar }: Props) {
  const [checklist, setChecklist] = useState<Checklist>(() => structuredClone(inicial))
  const invalidos = camposDinheiroInvalidos(checklist)

  function atualizar(patch: Partial<Checklist>) {
    setChecklist((atual) => ({ ...atual, ...patch }))
  }

  function atualizarExecucao(patch: Partial<Execucao>) {
    setChecklist((atual) => ({ ...atual, execucao: { ...atual.execucao, ...patch } }))
  }

  function atualizarBem(indice: number, patch: Partial<BemPenhorado>) {
    setChecklist((atual) => ({
      ...atual,
      bens: atual.bens.map((bem, i) => (i === indice ? { ...bem, ...patch } : bem)),
    }))
  }

  function erroDe(caminho: string): string | undefined {
    return invalidos.includes(caminho) ? MSG_DINHEIRO : undefined
  }

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (invalidos.length > 0) return
    onSalvar(checklist)
  }

  return (
    <Card titulo="Editar checklist">
      <form onSubmit={aoEnviar} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Texto id="vara" label="Vara" valor={checklist.vara} onChange={(v) => atualizar({ vara: v })} />
          <Texto
            id="numero_processo"
            label="Nº do processo"
            valor={checklist.numero_processo}
            onChange={(v) => atualizar({ numero_processo: v })}
          />
          <Texto id="juiz" label="Juiz" valor={checklist.juiz} onChange={(v) => atualizar({ juiz: v })} />
          <Texto
            id="exequente_nome"
            label="Exequente — nome"
            valor={checklist.exequente.nome}
            onChange={(v) => atualizar({ exequente: { ...checklist.exequente, nome: v ?? '' } })}
          />
          <Texto
            id="exequente_cpf_cnpj"
            label="Exequente — CPF/CNPJ"
            valor={checklist.exequente.cpf_cnpj}
            onChange={(v) => atualizar({ exequente: { ...checklist.exequente, cpf_cnpj: v } })}
          />
          <Texto
            id="execucao_cda"
            label="CDA"
            valor={checklist.execucao.cda}
            onChange={(v) => atualizarExecucao({ cda: v })}
          />
          <Texto
            id="execucao_natureza"
            label="Natureza da dívida"
            valor={checklist.execucao.natureza_divida}
            onChange={(v) => atualizarExecucao({ natureza_divida: v })}
          />
          <Texto
            id="execucao_classe"
            label="Classe"
            valor={checklist.execucao.classe}
            onChange={(v) => atualizarExecucao({ classe: v })}
          />
          <Texto
            id="execucao_valor_divida"
            label="Valor da dívida (R$)"
            valor={checklist.execucao.valor_divida}
            onChange={(v) => atualizarExecucao({ valor_divida: v })}
            erro={erroDe('execucao.valor_divida')}
          />
          <Field label="Data da dívida" htmlFor="execucao_data_divida">
            <input
              id="execucao_data_divida"
              type="date"
              value={checklist.execucao.data_divida ?? ''}
              onChange={(e) => atualizarExecucao({ data_divida: normalizarVazio(e.target.value) })}
              className={INPUT}
            />
          </Field>
        </div>

        {checklist.bens.map((bem, i) => (
          <fieldset
            key={`${bem.matricula ?? 'sem-matricula'}-${bem.penhora_ref ?? ''}-${bem.descricao.slice(0, 32)}`}
            className="grid gap-3 rounded border border-slate-200 p-3 sm:grid-cols-2"
          >
            <legend className="px-1 text-sm font-semibold">Bem {i + 1}</legend>
            <div className="sm:col-span-2">
              <Texto
                id={`bem_${i}_descricao`}
                label={`Bem ${i + 1} — descrição`}
                valor={bem.descricao}
                onChange={(v) => atualizarBem(i, { descricao: v ?? '' })}
                multilinha
              />
            </div>
            <Texto
              id={`bem_${i}_matricula`}
              label={`Bem ${i + 1} — matrícula`}
              valor={bem.matricula}
              onChange={(v) => atualizarBem(i, { matricula: v })}
            />
            <Texto
              id={`bem_${i}_localizacao`}
              label={`Bem ${i + 1} — localização`}
              valor={bem.localizacao}
              onChange={(v) => atualizarBem(i, { localizacao: v })}
            />
            <Texto
              id={`bem_${i}_fiel_depositario`}
              label={`Bem ${i + 1} — fiel depositário`}
              valor={bem.fiel_depositario}
              onChange={(v) => atualizarBem(i, { fiel_depositario: v })}
            />
            <Texto
              id={`bem_${i}_valor_avaliacao`}
              label={`Bem ${i + 1} — avaliação (R$)`}
              valor={bem.valor_avaliacao}
              onChange={(v) => atualizarBem(i, { valor_avaliacao: v })}
              erro={erroDe(`bens.${i}.valor_avaliacao`)}
            />
            <Texto
              id={`bem_${i}_valor_reavaliacao`}
              label={`Bem ${i + 1} — reavaliação (R$)`}
              valor={bem.valor_reavaliacao}
              onChange={(v) => atualizarBem(i, { valor_reavaliacao: v })}
              erro={erroDe(`bens.${i}.valor_reavaliacao`)}
            />
          </fieldset>
        ))}

        <Texto
          id="recursos"
          label="Recursos"
          valor={checklist.recursos}
          onChange={(v) => atualizar({ recursos: v })}
          multilinha
        />

        {erro ? <Alerta tipo="erro">{erro}</Alerta> : null}

        <div className="flex gap-2">
          <Botao type="submit" disabled={salvando || invalidos.length > 0}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
          <Botao variante="secundario" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Botao>
        </div>
      </form>
    </Card>
  )
}
```

Bens não têm id, então a `key` do `fieldset` é derivada do conteúdo (matrícula, ref. da penhora, início da descrição) — nunca do índice, que o Biome acusa em `noArrayIndexKey` mesmo dentro de template literal. O índice `i` só entra nos `id`/`label` dos inputs.

- [ ] **Step 6: `RelatorioView` e `ProcessoDetalhePage`**

`src/frontend/src/features/processos/RelatorioView.tsx`:

```tsx
import type { Relatorio } from '@/api/types'
import { Card } from '@/components/Card'
import { formatarData } from '@/lib/formatar'

export function RelatorioView({ relatorio }: { relatorio: Relatorio }) {
  return (
    <Card titulo="Relatório">
      <p className="mb-3 text-sm leading-relaxed">{relatorio.resumo}</p>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Etapas</h3>
      <ol aria-label="Etapas do processo" className="flex flex-col gap-2 border-l-2 border-slate-200 pl-4">
        {relatorio.etapas.map((etapa) => (
          <li key={`${etapa.data ?? ''}-${etapa.descricao}`} className="text-sm">
            <span className="font-medium">{formatarData(etapa.data)}</span>
            {' — '}
            {etapa.descricao}
            {etapa.ref ? <span className="text-slate-500"> ({etapa.ref})</span> : null}
          </li>
        ))}
      </ol>
    </Card>
  )
}
```

`src/frontend/src/features/processos/ProcessoDetalhePage.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { mensagemErro } from '@/api/client'
import { analisarProcesso, chavesProcessos, obterProcesso, salvarChecklist } from '@/api/processos'
import type { Checklist } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { AvisoIA } from '@/components/AvisoIA'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { ouTraco } from '@/lib/formatar'
import { ChecklistForm } from './ChecklistForm'
import { ChecklistView } from './ChecklistView'
import { RelatorioView } from './RelatorioView'

export function ProcessoDetalhePage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)

  const consulta = useQuery({
    queryKey: chavesProcessos.detalhe(id),
    queryFn: () => obterProcesso(id),
    enabled: id !== '',
  })

  const analisar = useMutation({
    mutationFn: () => analisarProcesso(id),
    onSuccess: (detalhe) => {
      queryClient.setQueryData(chavesProcessos.detalhe(id), detalhe)
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.lista })
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.detalhe(id) })
    },
  })

  const salvar = useMutation({
    mutationFn: (checklist: Checklist) => salvarChecklist(id, checklist),
    onSuccess: () => {
      setEditando(false)
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.detalhe(id) })
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.lista })
    },
  })

  if (consulta.isPending) return <p className="text-slate-500">Carregando…</p>
  if (consulta.isError) return <Alerta tipo="erro">{mensagemErro(consulta.error)}</Alerta>

  const processo = consulta.data

  function erroDaAnalise(): string | null {
    if (analisar.isError) return mensagemErro(analisar.error)
    if (processo.status === 'erro') return processo.erro
    return null
  }
  const erroAnalise = erroDaAnalise()
  const rotuloAnalisar = processo.checklist ? 'Reanalisar' : 'Analisar'
  const tipoJustica = processo.checklist?.tipo_justica ?? null

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{processo.nome_arquivo}</h1>
          <StatusBadge status={processo.status} />
          {tipoJustica ? (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
              Justiça {tipoJustica}
            </span>
          ) : null}
          <Botao
            className="ml-auto"
            onClick={() => analisar.mutate()}
            disabled={analisar.isPending || processo.status === 'analisando'}
          >
            {analisar.isPending ? 'Analisando…' : rotuloAnalisar}
          </Botao>
        </div>
        <p className="text-sm text-slate-600">
          Processo nº {ouTraco(processo.numero_processo)} · {ouTraco(processo.vara)}
        </p>
        {erroAnalise ? <Alerta tipo="erro">{erroAnalise}</Alerta> : null}
      </header>

      {processo.checklist ? (
        <>
          <AvisoIA />
          {editando ? (
            <ChecklistForm
              inicial={processo.checklist}
              salvando={salvar.isPending}
              erro={salvar.isError ? mensagemErro(salvar.error) : null}
              onSalvar={(c) => salvar.mutate(c)}
              onCancelar={() => setEditando(false)}
            />
          ) : (
            <ChecklistView checklist={processo.checklist} onEditar={() => setEditando(true)} />
          )}
        </>
      ) : (
        <Card titulo="Checklist processual">
          <p className="text-sm text-slate-500">Analise o processo para preencher o checklist.</p>
        </Card>
      )}

      {processo.relatorio ? (
        <>
          <AvisoIA />
          <RelatorioView relatorio={processo.relatorio} />
        </>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 7: Rota e handlers mock**

`src/frontend/src/app/rotas.tsx` — acrescente a rota do detalhe logo após `/` e importe a página:

```tsx
import { ProcessoDetalhePage } from '@/features/processos/ProcessoDetalhePage'
```

```tsx
          { path: '/', element: <ProcessosPage /> },
          { path: '/processos/:id', element: <ProcessoDetalhePage /> },
```

`src/frontend/src/api/mocks/processos.ts` — acrescente aos imports e ao array `processosHandlers` (antes do `DELETE`):

```ts
import { delay } from 'msw'
import type { Checklist } from '@/api/types'
import { toDetalhe } from './db'
import { CHECKLIST_EXEMPLO, RELATORIO_EXEMPLO } from './fixtures'

const ATRASO_ANALISE_MS = import.meta.env.MODE === 'test' ? 0 : 800
```

```ts
  http.get('/api/processos/:id', ({ params }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const processo = buscarProcesso(params.id)
    if (!processo) return erro(404, 'Processo não encontrado')
    return HttpResponse.json(toDetalhe(processo))
  }),

  http.post('/api/processos/:id/analisar', async ({ params }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const processo = buscarProcesso(params.id)
    if (!processo) return erro(404, 'Processo não encontrado')
    processo.status = 'analisando'
    await delay(ATRASO_ANALISE_MS)
    if (processo.nome_arquivo.includes('semtexto')) {
      processo.status = 'erro'
      processo.erro = 'PDF sem camada de texto'
      return erro(422, 'PDF sem camada de texto')
    }
    const checklist = structuredClone(CHECKLIST_EXEMPLO)
    processo.checklist = checklist
    processo.relatorio = structuredClone(RELATORIO_EXEMPLO)
    processo.numero_processo = checklist.numero_processo
    processo.vara = checklist.vara
    processo.status = 'analisado'
    processo.erro = null
    processo.analisado_em = new Date().toISOString()
    return HttpResponse.json(toDetalhe(processo))
  }),

  http.put('/api/processos/:id/checklist', async ({ params, request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const processo = buscarProcesso(params.id)
    if (!processo) return erro(404, 'Processo não encontrado')
    const checklist = (await request.json()) as Checklist
    processo.checklist = checklist
    processo.numero_processo = checklist.numero_processo
    processo.vara = checklist.vara
    return HttpResponse.json(checklist)
  }),
```

(800 ms no browser, 0 ms em `MODE === 'test'` — spec frontend §7.)

- [ ] **Step 8: Rodar e ver passar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/processos`
Expected: PASS, 20 testes (8 lista + 4 validação + 8 detalhe).

Run: `cd src && rtk docker compose exec frontend sh -c "pnpm lint:fix && pnpm lint && pnpm typecheck"`
Expected: sem erros.

- [ ] **Step 9: Conferir no browser**

`cd src && VITE_API_MOCK=true rtk docker compose up frontend nginx` → login → clicar em `execucao-fiscal-2024.pdf` → "Analisar" (800 ms) → aviso de IA, checklist, "Justiça federal" e relatório aparecem → "Editar checklist" → mudar vara → "Salvar" → cabeçalho muda. Encerre.

- [ ] **Step 10: Stage**

```bash
rtk git add src/frontend
```

Mensagem sugerida: `feat(frontend): detalhe do processo com análise, aviso de IA, checklist editável e relatório`. Dev revisa e comita.

---

### Task 6: Agenda — regras de data (feriados BR+PA), agendar/cancelar leilão, calendário e bloqueios

**Files:**
- Create: `src/frontend/src/lib/datas.ts`, `src/frontend/src/api/agenda.ts`, `src/frontend/src/api/mocks/regrasAgenda.ts`, `src/frontend/src/api/mocks/agenda.ts`, `src/frontend/src/features/agenda/AgendarLeilaoCard.tsx`, `src/frontend/src/features/agenda/AgendaPage.tsx`, `src/frontend/src/features/agenda/Calendario.tsx`, `src/frontend/src/features/agenda/BloqueiosCard.tsx`
- Modify: `src/frontend/src/app/rotas.tsx`, `src/frontend/src/api/mocks/handlers.ts`, `src/frontend/src/features/processos/ProcessoDetalhePage.tsx`
- Test: `src/frontend/src/lib/datas.test.ts`, `src/frontend/src/api/mocks/regrasAgenda.test.ts`, `src/frontend/src/features/agenda/AgendarLeilaoCard.test.tsx`, `src/frontend/src/features/agenda/AgendaPage.test.tsx`

**Interfaces:**
- Consumes: `api`, `mensagemErro` (Task 1); `formatarDataHora`, `formatarData` (Task 1); `db`, `novoId`, `leilaoAtivo`, `toLeilaoOut`, `LeilaoMock`, `logar` (Task 1); `FERIADOS`, `feriadosDoAno`, `Feriado` (Task 1); `erro`, `exigirSessao`, `exigirAdmin` (Task 1); `useUsuario` (Task 2); `Card`, `Botao`, `Field`, `Alerta` (Task 2); `StatusBadge` (Task 3); `chavesProcessos` (Task 4); `ProcessoDetalhePage` (Task 5).
- Produces:
  - `src/lib/datas.ts`: `dataLocal(d: Date): string`, `deDataLocal(iso: string): Date`, `inicioDoDia(d)`, `adicionarDias(d, n)`, `comHorario(d, hora, minuto)`, `inicioDoMes(d)`, `fimDoMes(d)`, `adicionarMeses(d, n)`, `diasDoMes(mes: Date): Date[]`.
  - `src/api/agenda.ts`: `chavesAgenda = { raiz, leiloes(inicio, fim), sugestao, bloqueios, feriados(ano) }`, `listarLeiloes(filtro?: { inicio: string; fim: string }): Promise<LeilaoOut[]>`, `obterSugestao(): Promise<SugestaoOut>`, `agendarLeilao(dados: LeilaoCreate): Promise<LeilaoOut>`, `cancelarLeilao(id): Promise<void>`, `listarBloqueios(): Promise<BloqueioOut[]>`, `criarBloqueio(dados: BloqueioCreate): Promise<BloqueioOut>`, `removerBloqueio(id): Promise<void>`, `listarFeriados(ano: number): Promise<FeriadoOut[]>`.
  - `src/api/mocks/regrasAgenda.ts` (spec frontend §7): `type DiaMarcado = { data: string; motivo: string }`, `HORARIO_LEILAO = { hora: 10, minuto: 0 }`, `candidatos(hoje: Date): Date[]`, `motivoIndisponivel(d: Date, bloqueios: readonly DiaMarcado[], feriados: readonly DiaMarcado[]): string | null`, `validarDataManual(d: Date, hoje: Date, bloqueios, feriados): string | null`, `montarDatas(d: Date): SugestaoOut`, `sugerirDatas(hoje: Date, bloqueios, feriados): SugestaoOut | null`.
  - `src/api/mocks/agenda.ts`: `const agendaHandlers: HttpHandler[]`.
  - `features/agenda/AgendarLeilaoCard.tsx`: `AgendarLeilaoCard({ processo }: { processo: ProcessoDetalheOut })`.
  - `features/agenda/Calendario.tsx`: `Calendario({ mes, leiloes, bloqueios, feriados }: { mes: Date; leiloes: LeilaoOut[]; bloqueios: BloqueioOut[]; feriados: FeriadoOut[] })`.
  - `features/agenda/AgendaPage.tsx`: `AgendaPage()`. `features/agenda/BloqueiosCard.tsx`: `BloqueiosCard()`.

Mensagens de erro de data são as da spec backend §3, literais: `Data fora da janela de 30 a 45 dias` · `Data não é dia útil` · `Data é feriado: <nome>` · `Data bloqueada: <motivo>` · `Segundo leilão (<data>) indisponível: <motivo>` (`<data>` em `dd/mm/aaaa`). Não há colisão entre leilões (visão geral §2 "Agenda": sem limite por dia).

- [ ] **Step 1: `datas.ts` — teste falhando, implementação, teste passando**

`src/frontend/src/lib/datas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  adicionarDias,
  adicionarMeses,
  comHorario,
  dataLocal,
  deDataLocal,
  diasDoMes,
  fimDoMes,
  inicioDoMes,
} from './datas'

describe('datas', () => {
  it('dataLocal formata no fuso local sem deslocar dia', () => {
    expect(dataLocal(new Date(2026, 10, 5, 23, 59))).toBe('2026-11-05')
    expect(dataLocal(new Date('2026-11-05T13:00:00Z'))).toBe('2026-11-05')
  })

  it('deDataLocal devolve meia-noite local e é inversa de dataLocal', () => {
    const d = deDataLocal('2026-11-05')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(10)
    expect(d.getDate()).toBe(5)
    expect(d.getHours()).toBe(0)
    expect(dataLocal(d)).toBe('2026-11-05')
  })

  it('adicionarDias atravessa mês', () => {
    expect(dataLocal(adicionarDias(new Date(2026, 9, 31), 2))).toBe('2026-11-02')
  })

  it('comHorario fixa hora e zera segundos', () => {
    const d = comHorario(new Date(2026, 10, 2, 17, 45, 30), 10, 0)
    expect(d.getHours()).toBe(10)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
  })

  it('inicioDoMes, fimDoMes, adicionarMeses e diasDoMes', () => {
    expect(dataLocal(inicioDoMes(new Date(2026, 9, 15)))).toBe('2026-10-01')
    expect(dataLocal(fimDoMes(new Date(2026, 1, 10)))).toBe('2026-02-28')
    expect(dataLocal(adicionarMeses(new Date(2026, 11, 20), 1))).toBe('2027-01-01')
    const dias = diasDoMes(new Date(2026, 10, 1))
    expect(dias).toHaveLength(30)
    expect(dataLocal(dias[0] ?? new Date(0))).toBe('2026-11-01')
    expect(dataLocal(dias[29] ?? new Date(0))).toBe('2026-11-30')
  })
})
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/lib/datas`
Expected: FAIL — `Failed to resolve import "./datas"`.

`src/frontend/src/lib/datas.ts`:

```ts
export function dataLocal(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function deDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  if (ano === undefined || mes === undefined || dia === undefined) return new Date(Number.NaN)
  return new Date(ano, mes - 1, dia)
}

export function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function adicionarDias(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function comHorario(d: Date, hora: number, minuto: number): Date {
  const r = inicioDoDia(d)
  r.setHours(hora, minuto, 0, 0)
  return r
}

export function inicioDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function fimDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function adicionarMeses(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function diasDoMes(mes: Date): Date[] {
  const total = fimDoMes(mes).getDate()
  return Array.from({ length: total }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1))
}
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/lib/datas`
Expected: PASS, 5 testes.

- [ ] **Step 2: Teste falhando — regras da agenda (puras)**

Calendário de referência: `2026-10-01` é quinta. `hoje+30 = 31/10 (sáb)`, `01/11 (dom)`, `02/11 (seg, Finados)`, `03/11 (ter)`, `04/11 (qua)`; `hoje+45 = 15/11 (dom)`. `20/11/2026` (Consciência Negra) é sexta e está fora da janela a partir de 01/10.

`src/frontend/src/api/mocks/regrasAgenda.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { adicionarDias, dataLocal } from '@/lib/datas'
import { FERIADOS } from './feriados'
import {
  candidatos,
  type DiaMarcado,
  motivoIndisponivel,
  sugerirDatas,
  validarDataManual,
} from './regrasAgenda'

const HOJE = new Date(2026, 9, 1, 12)
const SEM_BLOQUEIO: DiaMarcado[] = []

function diaDe(iso: string | undefined): string | null {
  return iso ? dataLocal(new Date(iso)) : null
}

describe('candidatos', () => {
  it('são os 16 dias corridos de hoje+30 a hoje+45', () => {
    const lista = candidatos(HOJE)
    expect(lista).toHaveLength(16)
    expect(dataLocal(lista[0] ?? new Date(0))).toBe('2026-10-31')
    expect(dataLocal(lista[15] ?? new Date(0))).toBe('2026-11-15')
  })
})

describe('motivoIndisponivel', () => {
  it('fim de semana', () => {
    expect(motivoIndisponivel(new Date(2026, 10, 7), SEM_BLOQUEIO, FERIADOS)).toBe('Data não é dia útil')
  })

  it('feriado automático com o nome', () => {
    expect(motivoIndisponivel(new Date(2026, 10, 20), SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data é feriado: Consciência Negra',
    )
  })

  it('bloqueio manual com o motivo', () => {
    const bloqueios: DiaMarcado[] = [{ data: '2026-11-27', motivo: 'Recesso interno' }]
    expect(motivoIndisponivel(new Date(2026, 10, 27), bloqueios, FERIADOS)).toBe(
      'Data bloqueada: Recesso interno',
    )
  })

  it('dia útil livre devolve null', () => {
    expect(motivoIndisponivel(new Date(2026, 10, 3), SEM_BLOQUEIO, FERIADOS)).toBeNull()
  })
})

describe('sugerirDatas', () => {
  it('pula fim de semana e feriado: 31/10 sáb, 01/11 dom, 02/11 Finados → 03/11 e 10/11 às 10h', () => {
    const s = sugerirDatas(HOJE, SEM_BLOQUEIO, FERIADOS)
    expect(diaDe(s?.primeiro_leilao_em)).toBe('2026-11-03')
    expect(diaDe(s?.segundo_leilao_em)).toBe('2026-11-10')
    expect(new Date(s?.primeiro_leilao_em ?? '').getHours()).toBe(10)
    expect(new Date(s?.segundo_leilao_em ?? '').getHours()).toBe(10)
  })

  it('pula data bloqueada', () => {
    const s = sugerirDatas(HOJE, [{ data: '2026-11-03', motivo: 'x' }], FERIADOS)
    expect(diaDe(s?.primeiro_leilao_em)).toBe('2026-11-04')
  })

  it('exige D+7 livre: bloqueio em 10/11 descarta 03/11', () => {
    const s = sugerirDatas(HOJE, [{ data: '2026-11-10', motivo: 'x' }], FERIADOS)
    expect(diaDe(s?.primeiro_leilao_em)).toBe('2026-11-04')
    expect(diaDe(s?.segundo_leilao_em)).toBe('2026-11-11')
  })

  it('sem dia livre na janela devolve null', () => {
    const bloqueios = candidatos(HOJE).map((d) => ({ data: dataLocal(d), motivo: 'Recesso' }))
    expect(sugerirDatas(HOJE, bloqueios, FERIADOS)).toBeNull()
  })
})

describe('validarDataManual', () => {
  it('fora da janela de 30 a 45 dias (antes e depois)', () => {
    expect(validarDataManual(new Date(2026, 9, 10), HOJE, SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data fora da janela de 30 a 45 dias',
    )
    expect(validarDataManual(new Date(2026, 10, 20), HOJE, SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data fora da janela de 30 a 45 dias',
    )
  })

  it('feriado dentro da janela', () => {
    expect(validarDataManual(new Date(2026, 10, 2), HOJE, SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data é feriado: Finados',
    )
  })

  it('segundo leilão indisponível cita a data e o motivo', () => {
    const bloqueios: DiaMarcado[] = [{ data: '2026-11-10', motivo: 'Recesso' }]
    expect(validarDataManual(new Date(2026, 10, 3), HOJE, bloqueios, FERIADOS)).toBe(
      'Segundo leilão (10/11/2026) indisponível: Data bloqueada: Recesso',
    )
  })

  it('data válida devolve null; hoje+45 ainda está na janela', () => {
    expect(validarDataManual(new Date(2026, 10, 3), HOJE, SEM_BLOQUEIO, FERIADOS)).toBeNull()
    expect(validarDataManual(adicionarDias(HOJE, 45), HOJE, SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data não é dia útil',
    )
  })
})
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/api/mocks/regrasAgenda`
Expected: FAIL — `Failed to resolve import "./regrasAgenda"`.

- [ ] **Step 3: Implementar `regrasAgenda.ts`**

```ts
import type { SugestaoOut } from '@/api/types'
import { adicionarDias, comHorario, dataLocal, inicioDoDia } from '@/lib/datas'
import { formatarData } from '@/lib/formatar'

export type DiaMarcado = { data: string; motivo: string }

export const HORARIO_LEILAO = { hora: 10, minuto: 0 } as const
const JANELA_INICIO_DIAS = 30
const JANELA_FIM_DIAS = 45
const INTERVALO_SEGUNDO_DIAS = 7

export const MSG_FORA_DA_JANELA = 'Data fora da janela de 30 a 45 dias'
export const MSG_NAO_UTIL = 'Data não é dia útil'

export function candidatos(hoje: Date): Date[] {
  const base = inicioDoDia(hoje)
  return Array.from({ length: JANELA_FIM_DIAS - JANELA_INICIO_DIAS + 1 }, (_, i) =>
    adicionarDias(base, JANELA_INICIO_DIAS + i),
  )
}

export function motivoIndisponivel(
  d: Date,
  bloqueios: readonly DiaMarcado[],
  feriados: readonly DiaMarcado[],
): string | null {
  const semana = d.getDay()
  if (semana === 0 || semana === 6) return MSG_NAO_UTIL
  const chave = dataLocal(d)
  const feriado = feriados.find((f) => f.data === chave)
  if (feriado) return `Data é feriado: ${feriado.motivo}`
  const bloqueio = bloqueios.find((b) => b.data === chave)
  if (bloqueio) return `Data bloqueada: ${bloqueio.motivo}`
  return null
}

export function validarDataManual(
  d: Date,
  hoje: Date,
  bloqueios: readonly DiaMarcado[],
  feriados: readonly DiaMarcado[],
): string | null {
  const dia = inicioDoDia(d).getTime()
  const inicio = inicioDoDia(adicionarDias(hoje, JANELA_INICIO_DIAS)).getTime()
  const fim = inicioDoDia(adicionarDias(hoje, JANELA_FIM_DIAS)).getTime()
  if (dia < inicio || dia > fim) return MSG_FORA_DA_JANELA
  const motivoPrimeiro = motivoIndisponivel(d, bloqueios, feriados)
  if (motivoPrimeiro) return motivoPrimeiro
  const segundo = adicionarDias(d, INTERVALO_SEGUNDO_DIAS)
  const motivoSegundo = motivoIndisponivel(segundo, bloqueios, feriados)
  if (motivoSegundo) {
    return `Segundo leilão (${formatarData(dataLocal(segundo))}) indisponível: ${motivoSegundo}`
  }
  return null
}

export function montarDatas(d: Date): SugestaoOut {
  const primeiro = comHorario(d, HORARIO_LEILAO.hora, HORARIO_LEILAO.minuto)
  return {
    primeiro_leilao_em: primeiro.toISOString(),
    segundo_leilao_em: adicionarDias(primeiro, INTERVALO_SEGUNDO_DIAS).toISOString(),
  }
}

export function sugerirDatas(
  hoje: Date,
  bloqueios: readonly DiaMarcado[],
  feriados: readonly DiaMarcado[],
): SugestaoOut | null {
  for (const d of candidatos(hoje)) {
    if (validarDataManual(d, hoje, bloqueios, feriados) === null) return montarDatas(d)
  }
  return null
}
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/api/mocks/regrasAgenda`
Expected: PASS, 12 testes.

- [ ] **Step 4: Teste falhando — `AgendarLeilaoCard` no detalhe do processo**

`src/frontend/src/features/agenda/AgendarLeilaoCard.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { CHECKLIST_EXEMPLO } from '@/api/mocks/fixtures'
import { candidatos } from '@/api/mocks/regrasAgenda'
import { dataLocal } from '@/lib/datas'
import { renderComRouter } from '@/test/render'

const HOJE = new Date(2026, 9, 1, 12)

function processoAnalisado(id: string) {
  db.processos.push({
    id,
    nome_arquivo: `${id}.pdf`,
    status: 'analisado',
    numero_processo: `0000${id}`,
    vara: 'Vara X',
    erro: null,
    criado_em: '2026-09-25T10:00:00-03:00',
    analisado_em: '2026-09-25T10:05:00-03:00',
    checklist: structuredClone(CHECKLIST_EXEMPLO),
    relatorio: null,
  })
}

async function escolherDataManual(user: ReturnType<typeof renderComRouter>['user'], data: string) {
  await user.click(screen.getByLabelText('Escolher outra data'))
  fireEvent.change(screen.getByLabelText('Data do 1º leilão'), { target: { value: data } })
  await user.click(screen.getByRole('button', { name: 'Agendar' }))
}

describe('AgendarLeilaoCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(HOJE)
  })
  afterEach(() => vi.useRealTimers())

  it('operador agenda com a sugestão e vê o leilão sem botão de cancelar', async () => {
    logar('operador')
    db.leiloes = []
    const { user } = renderComRouter('/processos/p-1')
    expect(await screen.findByText('03/11/2026, 10:00')).toBeInTheDocument()
    expect(screen.getByText('10/11/2026, 10:00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agendar' }))
    expect(await screen.findByText('agendado')).toBeInTheDocument()
    expect(screen.getByText('03/11/2026, 10:00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar leilão' })).not.toBeInTheDocument()
  })

  it('data manual em feriado mostra o motivo do servidor', async () => {
    logar('operador')
    db.leiloes = []
    const { user } = renderComRouter('/processos/p-1')
    await screen.findByText('03/11/2026, 10:00')
    await escolherDataManual(user, '2026-11-02')
    expect(await screen.findByRole('alert')).toHaveTextContent('Data é feriado: Finados')
  })

  it('data manual em sábado mostra "Data não é dia útil"', async () => {
    logar('operador')
    db.leiloes = []
    const { user } = renderComRouter('/processos/p-1')
    await screen.findByText('03/11/2026, 10:00')
    await escolherDataManual(user, '2026-11-07')
    expect(await screen.findByRole('alert')).toHaveTextContent('Data não é dia útil')
  })

  it('dois leilões no mesmo dia são permitidos', async () => {
    logar('operador')
    processoAnalisado('p-9')
    db.leiloes = [
      {
        id: 'l-9',
        processo_id: 'p-9',
        primeiro_leilao_em: '2026-11-05T13:00:00.000Z',
        segundo_leilao_em: '2026-11-12T13:00:00.000Z',
        status: 'agendado',
        criado_em: '2026-09-26T10:00:00-03:00',
      },
    ]
    const { user } = renderComRouter('/processos/p-1')
    await screen.findByText('03/11/2026, 10:00')
    await escolherDataManual(user, '2026-11-05')
    expect(await screen.findByText('agendado')).toBeInTheDocument()
    expect(screen.getByText('05/11/2026, 10:00')).toBeInTheDocument()
    expect(db.leiloes.filter((l) => dataLocal(new Date(l.primeiro_leilao_em)) === '2026-11-05')).toHaveLength(2)
  })

  it('admin cancela o leilão e volta pro modo de sugestão', async () => {
    logar('admin')
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Cancelar leilão' }))
    expect(await screen.findByRole('button', { name: 'Agendar' })).toBeInTheDocument()
    expect(db.leiloes.find((l) => l.id === 'l-1')?.status).toBe('cancelado')
  })

  it('operador não vê o botão Cancelar leilão', async () => {
    logar('operador')
    renderComRouter('/processos/p-1')
    expect(await screen.findByText('05/11/2026, 10:00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar leilão' })).not.toBeInTheDocument()
  })

  it('processo não analisado não oferece agendamento', async () => {
    logar('operador')
    renderComRouter('/processos/p-2')
    expect(await screen.findByText('Analise o processo antes de agendar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agendar' })).not.toBeInTheDocument()
  })

  it('sem data disponível mostra 409 e desabilita Agendar', async () => {
    logar('operador')
    db.leiloes = []
    db.bloqueios = candidatos(HOJE).map((d, i) => ({ id: `b-${i}`, data: dataLocal(d), motivo: 'Recesso' }))
    renderComRouter('/processos/p-1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem data disponível entre 30 e 45 dias')
    expect(screen.getByRole('button', { name: 'Agendar' })).toBeDisabled()
  })
})
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/agenda/AgendarLeilaoCard`
Expected: FAIL — nenhum texto `03/11/2026, 10:00` (card não existe).

- [ ] **Step 5: `api/agenda.ts` e `AgendarLeilaoCard`**

`src/frontend/src/api/agenda.ts`:

```ts
import { api } from './client'
import type {
  BloqueioCreate,
  BloqueioOut,
  FeriadoOut,
  LeilaoCreate,
  LeilaoOut,
  SugestaoOut,
} from './types'

export const chavesAgenda = {
  raiz: ['agenda'] as const,
  leiloes: (inicio: string | null, fim: string | null) => ['agenda', 'leiloes', inicio, fim] as const,
  sugestao: ['agenda', 'sugestao'] as const,
  bloqueios: ['agenda', 'bloqueios'] as const,
  feriados: (ano: number) => ['agenda', 'feriados', ano] as const,
}

export function listarLeiloes(filtro?: { inicio: string; fim: string }): Promise<LeilaoOut[]> {
  const query = filtro ? `?inicio=${filtro.inicio}&fim=${filtro.fim}` : ''
  return api.get<LeilaoOut[]>(`/agenda/leiloes${query}`)
}

export function obterSugestao(): Promise<SugestaoOut> {
  return api.get<SugestaoOut>('/agenda/sugestao')
}

export function agendarLeilao(dados: LeilaoCreate): Promise<LeilaoOut> {
  return api.post<LeilaoOut>('/agenda/leiloes', dados)
}

export function cancelarLeilao(id: string): Promise<void> {
  return api.del(`/agenda/leiloes/${id}`)
}

export function listarBloqueios(): Promise<BloqueioOut[]> {
  return api.get<BloqueioOut[]>('/agenda/bloqueios')
}

export function criarBloqueio(dados: BloqueioCreate): Promise<BloqueioOut> {
  return api.post<BloqueioOut>('/agenda/bloqueios', dados)
}

export function removerBloqueio(id: string): Promise<void> {
  return api.del(`/agenda/bloqueios/${id}`)
}

export function listarFeriados(ano: number): Promise<FeriadoOut[]> {
  return api.get<FeriadoOut[]>(`/agenda/feriados?ano=${ano}`)
}
```

`src/frontend/src/features/agenda/AgendarLeilaoCard.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { agendarLeilao, cancelarLeilao, chavesAgenda, obterSugestao } from '@/api/agenda'
import { mensagemErro } from '@/api/client'
import { chavesProcessos } from '@/api/processos'
import type { LeilaoCreate, LeilaoOut, ProcessoDetalheOut } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { Field } from '@/components/Field'
import { StatusBadge } from '@/components/StatusBadge'
import { useUsuario } from '@/features/auth/useUsuario'
import { formatarDataHora } from '@/lib/formatar'

type Props = { processo: ProcessoDetalheOut }

type PropsAgendado = {
  leilao: LeilaoOut
  podeCancelar: boolean
  onCancelar: () => void
  cancelando: boolean
  erro: string | null
}

function LeilaoAgendado({ leilao, podeCancelar, onCancelar, cancelando, erro }: PropsAgendado) {
  return (
    <Card
      titulo="Leilão"
      acoes={
        podeCancelar ? (
          <Botao variante="perigo" onClick={onCancelar} disabled={cancelando}>
            Cancelar leilão
          </Botao>
        ) : undefined
      }
    >
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-32 font-medium text-slate-600">1º leilão</dt>
          <dd>{formatarDataHora(leilao.primeiro_leilao_em)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 font-medium text-slate-600">2º leilão</dt>
          <dd>{formatarDataHora(leilao.segundo_leilao_em)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 font-medium text-slate-600">Status</dt>
          <dd>
            <StatusBadge status={leilao.status} />
          </dd>
        </div>
      </dl>
      {erro ? <Alerta tipo="erro">{erro}</Alerta> : null}
    </Card>
  )
}

export function AgendarLeilaoCard({ processo }: Props) {
  const queryClient = useQueryClient()
  const { ehAdmin } = useUsuario()
  const [manual, setManual] = useState(false)
  const [dataManual, setDataManual] = useState('')
  const podeAgendar = processo.status === 'analisado' && processo.leilao === null

  const sugestao = useQuery({
    queryKey: chavesAgenda.sugestao,
    queryFn: obterSugestao,
    enabled: podeAgendar,
    retry: false,
    staleTime: 0,
  })

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chavesProcessos.detalhe(processo.id) })
    void queryClient.invalidateQueries({ queryKey: chavesAgenda.raiz })
  }

  const agendar = useMutation({ mutationFn: agendarLeilao, onSuccess: invalidar })
  const cancelar = useMutation({ mutationFn: cancelarLeilao, onSuccess: invalidar })

  if (processo.leilao) {
    const leilao = processo.leilao
    return (
      <LeilaoAgendado
        leilao={leilao}
        podeCancelar={ehAdmin}
        onCancelar={() => cancelar.mutate(leilao.id)}
        cancelando={cancelar.isPending}
        erro={cancelar.isError ? mensagemErro(cancelar.error) : null}
      />
    )
  }

  if (processo.status !== 'analisado') {
    return (
      <Card titulo="Leilão">
        <p className="text-sm text-slate-500">Analise o processo antes de agendar.</p>
      </Card>
    )
  }

  function confirmar() {
    const dados: LeilaoCreate = { processo_id: processo.id }
    if (manual && dataManual !== '') dados.primeiro_leilao_data = dataManual
    agendar.mutate(dados)
  }

  const podeConfirmar = manual ? dataManual !== '' : sugestao.isSuccess

  return (
    <Card titulo="Agendar leilão">
      <div className="flex flex-col gap-3 text-sm">
        {sugestao.isPending ? <p className="text-slate-500">Buscando data disponível…</p> : null}
        {sugestao.isError ? <Alerta tipo="erro">{mensagemErro(sugestao.error)}</Alerta> : null}
        {sugestao.data && !manual ? (
          <p>
            Sugestão: 1º leilão em <strong>{formatarDataHora(sugestao.data.primeiro_leilao_em)}</strong>, 2º
            leilão em <strong>{formatarDataHora(sugestao.data.segundo_leilao_em)}</strong>.
          </p>
        ) : null}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          Escolher outra data
        </label>
        {manual ? (
          <Field label="Data do 1º leilão" htmlFor="data_manual">
            <input
              id="data_manual"
              type="date"
              value={dataManual}
              onChange={(e) => setDataManual(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5"
            />
          </Field>
        ) : null}
        {manual ? (
          <p className="text-slate-500">O horário é fixo (10:00) e o 2º leilão é 7 dias depois.</p>
        ) : null}
        {agendar.isError ? <Alerta tipo="erro">{mensagemErro(agendar.error)}</Alerta> : null}
        <div>
          <Botao onClick={confirmar} disabled={!podeConfirmar || agendar.isPending}>
            Agendar
          </Botao>
        </div>
      </div>
    </Card>
  )
}
```

Em `src/frontend/src/features/processos/ProcessoDetalhePage.tsx`, importe `import { AgendarLeilaoCard } from '@/features/agenda/AgendarLeilaoCard'` e acrescente antes do `</div>` final do JSX:

```tsx
      <AgendarLeilaoCard processo={processo} />
```

(`ProcessoDetalhePage` é o ponto de composição previsto na spec frontend §3; os cards não importam uns dos outros.)

- [ ] **Step 6: Handlers mock da agenda**

`src/frontend/src/api/mocks/agenda.ts`:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import type { BloqueioCreate, LeilaoCreate } from '@/api/types'
import { dataLocal, deDataLocal } from '@/lib/datas'
import { db, leilaoAtivo, type LeilaoMock, novoId, toLeilaoOut } from './db'
import { FERIADOS, feriadosDoAno } from './feriados'
import { erro, exigirAdmin, exigirSessao } from './http'
import { montarDatas, sugerirDatas, validarDataManual } from './regrasAgenda'

const SEM_DATA = 'Sem data disponível entre 30 e 45 dias'

function noIntervalo(iso: string, inicio: string | null, fim: string | null): boolean {
  const dia = dataLocal(new Date(iso))
  return (inicio === null || dia >= inicio) && (fim === null || dia <= fim)
}

export const agendaHandlers: HttpHandler[] = [
  http.get('/api/agenda/leiloes', ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const url = new URL(request.url)
    const inicio = url.searchParams.get('inicio')
    const fim = url.searchParams.get('fim')
    const lista = db.leiloes
      .filter(
        (l) =>
          noIntervalo(l.primeiro_leilao_em, inicio, fim) || noIntervalo(l.segundo_leilao_em, inicio, fim),
      )
      .sort((a, b) => Date.parse(a.primeiro_leilao_em) - Date.parse(b.primeiro_leilao_em))
    return HttpResponse.json(lista.map(toLeilaoOut))
  }),

  http.get('/api/agenda/sugestao', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const sugestao = sugerirDatas(new Date(), db.bloqueios, FERIADOS)
    return sugestao ? HttpResponse.json(sugestao) : erro(409, SEM_DATA)
  }),

  http.get('/api/agenda/feriados', ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const param = new URL(request.url).searchParams.get('ano')
    const ano = param ? Number(param) : new Date().getFullYear()
    if (Number.isNaN(ano)) return erro(422, 'Ano inválido')
    return HttpResponse.json(feriadosDoAno(ano))
  }),

  http.post('/api/agenda/leiloes', async ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const body = (await request.json()) as LeilaoCreate
    const processo = db.processos.find((p) => p.id === body.processo_id)
    if (!processo) return erro(404, 'Processo não encontrado')
    if (processo.status !== 'analisado') return erro(409, 'Processo ainda não foi analisado')
    if (leilaoAtivo(processo.id)) return erro(409, 'Processo já tem leilão agendado')

    let datas: ReturnType<typeof montarDatas>
    if (body.primeiro_leilao_data) {
      const dia = deDataLocal(body.primeiro_leilao_data)
      if (Number.isNaN(dia.getTime())) return erro(422, 'Data inválida')
      const motivo = validarDataManual(dia, new Date(), db.bloqueios, FERIADOS)
      if (motivo) return erro(422, motivo)
      datas = montarDatas(dia)
    } else {
      const sugestao = sugerirDatas(new Date(), db.bloqueios, FERIADOS)
      if (!sugestao) return erro(409, SEM_DATA)
      datas = sugestao
    }

    const leilao: LeilaoMock = {
      id: novoId('l'),
      processo_id: processo.id,
      primeiro_leilao_em: datas.primeiro_leilao_em,
      segundo_leilao_em: datas.segundo_leilao_em,
      status: 'agendado',
      criado_em: new Date().toISOString(),
    }
    db.leiloes.push(leilao)
    return HttpResponse.json(toLeilaoOut(leilao), { status: 201 })
  }),

  http.delete('/api/agenda/leiloes/:id', ({ params }) => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const leilao = db.leiloes.find((l) => l.id === String(params.id))
    if (!leilao) return erro(404, 'Leilão não encontrado')
    leilao.status = 'cancelado'
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/agenda/bloqueios', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    return HttpResponse.json([...db.bloqueios].sort((a, b) => a.data.localeCompare(b.data)))
  }),

  http.post('/api/agenda/bloqueios', async ({ request }) => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const body = (await request.json()) as BloqueioCreate
    if (db.bloqueios.some((b) => b.data === body.data)) return erro(409, 'Já existe bloqueio nesta data')
    const novo = { id: novoId('b'), data: body.data, motivo: body.motivo }
    db.bloqueios.push(novo)
    return HttpResponse.json(novo, { status: 201 })
  }),

  http.delete('/api/agenda/bloqueios/:id', ({ params }) => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const existe = db.bloqueios.some((b) => b.id === String(params.id))
    if (!existe) return erro(404, 'Bloqueio não encontrado')
    db.bloqueios = db.bloqueios.filter((b) => b.id !== String(params.id))
    return new HttpResponse(null, { status: 204 })
  }),
]
```

`src/frontend/src/api/mocks/handlers.ts` — arquivo completo:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import { agendaHandlers } from './agenda'
import { authHandlers } from './auth'
import { processosHandlers } from './processos'
import { usuariosHandlers } from './usuarios'

export const handlers: HttpHandler[] = [
  http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
  ...authHandlers,
  ...usuariosHandlers,
  ...processosHandlers,
  ...agendaHandlers,
]
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/agenda/AgendarLeilaoCard`
Expected: PASS, 8 testes.

- [ ] **Step 7: Teste falhando — `AgendaPage`**

`src/frontend/src/features/agenda/AgendaPage.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

async function irParaNovembro(user: ReturnType<typeof renderComRouter>['user']) {
  await screen.findByRole('heading', { name: 'outubro de 2026' })
  await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
  await screen.findByRole('heading', { name: 'novembro de 2026' })
}

describe('AgendaPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 1, 12))
  })
  afterEach(() => vi.useRealTimers())

  it('abre no mês atual e navega pro próximo, listando o leilão com link pro processo', async () => {
    logar('operador')
    const { user } = renderComRouter('/agenda')
    expect(await screen.findByRole('heading', { name: 'outubro de 2026' })).toBeInTheDocument()
    expect(await screen.findByText('Nenhum leilão neste mês.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByRole('heading', { name: 'novembro de 2026' })).toBeInTheDocument()
    expect(await screen.findByText('05/11/2026, 10:00')).toBeInTheDocument()
    expect(screen.getByText('12/11/2026, 10:00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '1003966-15.2022.4.01.4301' })).toHaveAttribute(
      'href',
      '/processos/p-1',
    )
  })

  it('calendário marca feriado automático', async () => {
    logar('operador')
    const { user } = renderComRouter('/agenda')
    await irParaNovembro(user)
    expect(
      await screen.findByRole('cell', { name: '20/11/2026 — Feriado: Consciência Negra' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '02/11/2026 — Feriado: Finados' })).toBeInTheDocument()
  })

  it('calendário marca fim de semana, bloqueio e leilão', async () => {
    logar('operador')
    const { user } = renderComRouter('/agenda')
    await irParaNovembro(user)
    expect(await screen.findByRole('cell', { name: '27/11/2026 — Bloqueio: Recesso interno' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '05/11/2026 — Leilão (1)' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '12/11/2026 — Leilão (1)' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '07/11/2026 — Fim de semana' })).toBeInTheDocument()
  })

  it('admin lista bloqueios e adiciona um novo', async () => {
    logar('admin')
    const { user } = renderComRouter('/agenda')
    expect(await screen.findByText('Recesso interno')).toBeInTheDocument()
    expect(screen.getByText('27/11/2026')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-12-24' } })
    await user.type(screen.getByLabelText('Motivo'), 'Véspera de Natal')
    await user.click(screen.getByRole('button', { name: 'Bloquear' }))
    expect(await screen.findByText('Véspera de Natal')).toBeInTheDocument()
    expect(screen.getByText('24/12/2026')).toBeInTheDocument()
  })

  it('admin recebe 409 em bloqueio duplicado', async () => {
    logar('admin')
    const { user } = renderComRouter('/agenda')
    await screen.findByText('Recesso interno')
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-27' } })
    await user.type(screen.getByLabelText('Motivo'), 'Repetido')
    await user.click(screen.getByRole('button', { name: 'Bloquear' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe bloqueio nesta data')
  })

  it('admin remove bloqueio', async () => {
    logar('admin')
    const { user } = renderComRouter('/agenda')
    await screen.findByText('Recesso interno')
    await user.click(screen.getByRole('button', { name: 'Remover bloqueio 27/11/2026' }))
    await waitFor(() => expect(screen.queryByText('Recesso interno')).not.toBeInTheDocument())
  })

  it('operador vê os bloqueios mas não o formulário nem o botão de remover', async () => {
    logar('operador')
    renderComRouter('/agenda')
    const card = (await screen.findByText('Recesso interno')).closest('section')
    expect(card).not.toBeNull()
    if (!card) return
    expect(within(card).queryByRole('button', { name: 'Bloquear' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /Remover bloqueio/ })).not.toBeInTheDocument()
  })
})
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/agenda/AgendaPage`
Expected: FAIL — rota `/agenda` não existe.

- [ ] **Step 8: `Calendario`, `BloqueiosCard`, `AgendaPage`, rota**

`src/frontend/src/features/agenda/Calendario.tsx`:

```tsx
import type { BloqueioOut, FeriadoOut, LeilaoOut } from '@/api/types'
import { dataLocal, diasDoMes } from '@/lib/datas'
import { formatarData } from '@/lib/formatar'

type Props = { mes: Date; leiloes: LeilaoOut[]; bloqueios: BloqueioOut[]; feriados: FeriadoOut[] }

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

type Marcas = { rotulos: string[]; classe: string }
type Celula = { chave: string; dia: Date | null }
type Semana = { chave: string; celulas: Celula[] }

function contarLeiloesPorDia(leiloes: LeilaoOut[]): Map<string, number> {
  const porDia = new Map<string, number>()
  for (const l of leiloes) {
    if (l.status !== 'agendado') continue
    for (const iso of [l.primeiro_leilao_em, l.segundo_leilao_em]) {
      const chave = dataLocal(new Date(iso))
      porDia.set(chave, (porDia.get(chave) ?? 0) + 1)
    }
  }
  return porDia
}

function marcasDoDia(
  dia: Date,
  leiloesPorDia: Map<string, number>,
  bloqueios: BloqueioOut[],
  feriados: FeriadoOut[],
): Marcas {
  const chave = dataLocal(dia)
  const rotulos: string[] = []
  let classe = 'bg-white'
  if (dia.getDay() === 0 || dia.getDay() === 6) {
    rotulos.push('Fim de semana')
    classe = 'bg-slate-100 text-slate-400'
  }
  const feriado = feriados.find((f) => f.data === chave)
  if (feriado) {
    rotulos.push(`Feriado: ${feriado.motivo}`)
    classe = 'bg-rose-50 text-rose-800'
  }
  const bloqueio = bloqueios.find((b) => b.data === chave)
  if (bloqueio) {
    rotulos.push(`Bloqueio: ${bloqueio.motivo}`)
    classe = 'bg-amber-50 text-amber-900'
  }
  const quantidade = leiloesPorDia.get(chave) ?? 0
  if (quantidade > 0) {
    rotulos.push(`Leilão (${quantidade})`)
    classe = 'bg-blue-100 font-semibold text-blue-900'
  }
  return { rotulos, classe }
}

function montarSemanas(mes: Date): Semana[] {
  const dias = diasDoMes(mes)
  const vaziosIniciais = dias[0]?.getDay() ?? 0
  const celulas: Celula[] = []
  for (let i = 0; i < vaziosIniciais; i++) celulas.push({ chave: `vazio-inicio-${i}`, dia: null })
  for (const dia of dias) celulas.push({ chave: dataLocal(dia), dia })
  let vaziosFinais = 0
  while (celulas.length % 7 !== 0) {
    celulas.push({ chave: `vazio-fim-${vaziosFinais}`, dia: null })
    vaziosFinais += 1
  }
  const semanas: Semana[] = []
  for (let i = 0; i < celulas.length; i += 7) {
    const fatia = celulas.slice(i, i + 7)
    semanas.push({ chave: fatia[0]?.chave ?? `semana-${i}`, celulas: fatia })
  }
  return semanas
}

function Dia({ dia, marcas }: { dia: Date; marcas: Marcas }) {
  const data = formatarData(dataLocal(dia))
  const resumo = marcas.rotulos.join('; ')
  const rotulo = resumo === '' ? data : `${data} — ${resumo}`
  return (
    <td
      aria-label={rotulo}
      title={resumo}
      className={`h-12 border border-slate-200 p-1 align-top ${marcas.classe}`}
    >
      {dia.getDate()}
    </td>
  )
}

export function Calendario({ mes, leiloes, bloqueios, feriados }: Props) {
  const leiloesPorDia = contarLeiloesPorDia(leiloes)
  const semanas = montarSemanas(mes)

  return (
    <table className="w-full table-fixed border-collapse text-xs" aria-label="Calendário do mês">
      <thead>
        <tr>
          {DIAS_SEMANA.map((d) => (
            <th key={d} className="py-1 text-slate-500">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {semanas.map((semana) => (
          <tr key={semana.chave}>
            {semana.celulas.map((celula) =>
              celula.dia ? (
                <Dia
                  key={celula.chave}
                  dia={celula.dia}
                  marcas={marcasDoDia(celula.dia, leiloesPorDia, bloqueios, feriados)}
                />
              ) : (
                <td key={celula.chave} className="h-12 border border-slate-100 bg-slate-50" />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

As `key`s vêm de `montarSemanas` (data do dia ou `vazio-*` calculado fora do `map`), então o Biome não acusa `noArrayIndexKey`. O nome acessível de cada célula é o `aria-label` (`dd/mm/aaaa — Feriado: …; Leilão (n)`), que os testes consultam com `getByRole('cell', { name })`.

`src/frontend/src/features/agenda/BloqueiosCard.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { chavesAgenda, criarBloqueio, listarBloqueios, removerBloqueio } from '@/api/agenda'
import { mensagemErro } from '@/api/client'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { Field } from '@/components/Field'
import { useUsuario } from '@/features/auth/useUsuario'
import { formatarData } from '@/lib/formatar'

const INPUT = 'rounded border border-slate-300 px-2 py-1.5 text-sm'

export function BloqueiosCard() {
  const queryClient = useQueryClient()
  const { ehAdmin } = useUsuario()
  const [data, setData] = useState('')
  const [motivo, setMotivo] = useState('')

  const bloqueios = useQuery({ queryKey: chavesAgenda.bloqueios, queryFn: listarBloqueios })

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chavesAgenda.raiz })
  }

  const criar = useMutation({
    mutationFn: criarBloqueio,
    onSuccess: () => {
      setData('')
      setMotivo('')
      invalidar()
    },
  })
  const remover = useMutation({ mutationFn: removerBloqueio, onSuccess: invalidar })

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (data === '' || motivo.trim() === '') return
    criar.mutate({ data, motivo: motivo.trim() })
  }

  return (
    <Card titulo="Bloqueios da agenda">
      {ehAdmin ? (
        <form onSubmit={aoEnviar} className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Data" htmlFor="bloqueio_data">
            <input
              id="bloqueio_data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={INPUT}
              required
            />
          </Field>
          <Field label="Motivo" htmlFor="bloqueio_motivo">
            <input
              id="bloqueio_motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className={INPUT}
              required
            />
          </Field>
          <Botao type="submit" disabled={criar.isPending}>
            Bloquear
          </Botao>
        </form>
      ) : null}
      {criar.isError ? <Alerta tipo="erro">{mensagemErro(criar.error)}</Alerta> : null}
      {remover.isError ? <Alerta tipo="erro">{mensagemErro(remover.error)}</Alerta> : null}
      {bloqueios.isPending ? <p className="text-sm text-slate-500">Carregando…</p> : null}
      {bloqueios.data && bloqueios.data.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma data bloqueada.</p>
      ) : null}
      {bloqueios.data && bloqueios.data.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {bloqueios.data.map((b) => (
            <li key={b.id} className="flex items-center gap-3">
              <span className="font-medium">{formatarData(b.data)}</span>
              <span>{b.motivo}</span>
              {ehAdmin ? (
                <Botao
                  variante="secundario"
                  className="ml-auto"
                  aria-label={`Remover bloqueio ${formatarData(b.data)}`}
                  onClick={() => remover.mutate(b.id)}
                  disabled={remover.isPending}
                >
                  Remover
                </Botao>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}
```

`src/frontend/src/features/agenda/AgendaPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { chavesAgenda, listarBloqueios, listarFeriados, listarLeiloes } from '@/api/agenda'
import { mensagemErro } from '@/api/client'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { adicionarMeses, dataLocal, fimDoMes, inicioDoMes } from '@/lib/datas'
import { formatarDataHora } from '@/lib/formatar'
import { BloqueiosCard } from './BloqueiosCard'
import { Calendario } from './Calendario'

const TITULO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

export function AgendaPage() {
  const [mes, setMes] = useState(() => inicioDoMes(new Date()))
  const inicio = dataLocal(mes)
  const fim = dataLocal(fimDoMes(mes))
  const ano = mes.getFullYear()

  const leiloes = useQuery({
    queryKey: chavesAgenda.leiloes(inicio, fim),
    queryFn: () => listarLeiloes({ inicio, fim }),
  })
  const bloqueios = useQuery({ queryKey: chavesAgenda.bloqueios, queryFn: listarBloqueios })
  const feriados = useQuery({ queryKey: chavesAgenda.feriados(ano), queryFn: () => listarFeriados(ano) })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Agenda</h1>
      <Card
        titulo={TITULO_MES.format(mes)}
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setMes(adicionarMeses(mes, -1))}>
              Mês anterior
            </Botao>
            <Botao variante="secundario" onClick={() => setMes(adicionarMeses(mes, 1))}>
              Próximo mês
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Calendario
            mes={mes}
            leiloes={leiloes.data ?? []}
            bloqueios={bloqueios.data ?? []}
            feriados={feriados.data ?? []}
          />
          <p className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="rounded bg-blue-100 px-2 py-0.5">leilão</span>
            <span className="rounded bg-amber-50 px-2 py-0.5">bloqueio</span>
            <span className="rounded bg-rose-50 px-2 py-0.5">feriado</span>
            <span className="rounded bg-slate-100 px-2 py-0.5">fim de semana</span>
          </p>
          {leiloes.isPending ? <p className="text-sm text-slate-500">Carregando…</p> : null}
          {leiloes.isError ? <Alerta tipo="erro">{mensagemErro(leiloes.error)}</Alerta> : null}
          {feriados.isError ? <Alerta tipo="erro">{mensagemErro(feriados.error)}</Alerta> : null}
          {leiloes.data && leiloes.data.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum leilão neste mês.</p>
          ) : null}
          {leiloes.data && leiloes.data.length > 0 ? (
            <ul className="flex flex-col gap-2 text-sm">
              {leiloes.data.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 rounded border border-slate-100 p-2">
                  <span>
                    1º <strong>{formatarDataHora(l.primeiro_leilao_em)}</strong>
                  </span>
                  <span>
                    2º <strong>{formatarDataHora(l.segundo_leilao_em)}</strong>
                  </span>
                  <Link to={`/processos/${l.processo_id}`} className="text-blue-700 hover:underline">
                    {l.numero_processo ?? 'Processo sem número'}
                  </Link>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
      <BloqueiosCard />
    </div>
  )
}
```

`src/frontend/src/app/rotas.tsx` — acrescente a rota após `/processos/:id` e importe a página:

```tsx
import { AgendaPage } from '@/features/agenda/AgendaPage'
```

```tsx
          { path: '/agenda', element: <AgendaPage /> },
```

- [ ] **Step 9: Rodar e ver passar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/agenda src/lib src/api/mocks`
Expected: PASS — 8 card + 7 página + 12 regras + 5 datas + 5 formatar = 37.

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/processos`
Expected: PASS (o detalhe agora renderiza o card de leilão; p-1 mostra o leilão agendado, p-2 mostra "Analise o processo antes de agendar.").

Run: `cd src && rtk docker compose exec frontend sh -c "pnpm lint:fix && pnpm lint && pnpm typecheck"`
Expected: sem erros.

- [ ] **Step 10: Conferir no browser**

`cd src && VITE_API_MOCK=true rtk docker compose up frontend nginx` → login como admin → `/agenda`: navegar meses, novembro mostra Finados, Proclamação, Consciência Negra em rosa, bloqueio 27/11 em âmbar, leilão 05/11 e 12/11 em azul; adicionar/remover bloqueio. No detalhe de `execucao-fiscal-2024.pdf`: analisar → sugestão 30–45 dias → "Agendar" → leilão → "Cancelar leilão". Logar como operador: sem "Cancelar leilão", sem form de bloqueio. Encerre.

- [ ] **Step 11: Stage**

```bash
rtk git add src/frontend
```

Mensagem sugerida: `feat(frontend): agenda com feriados, sugestão de datas, agendamento, calendário e bloqueios`. Dev revisa e comita.

---

### Task 7: Editais — gerar, visualizar (markdown seguro), editar, baixar .md/.docx, regenerar

**Files:**
- Create: `src/frontend/src/api/editais.ts`, `src/frontend/src/features/editais/EditalCard.tsx`, `src/frontend/src/api/mocks/editais.ts`
- Modify: `src/frontend/src/api/mocks/handlers.ts`, `src/frontend/src/features/processos/ProcessoDetalhePage.tsx`
- Test: `src/frontend/src/features/editais/EditalCard.test.tsx`

**Interfaces:**
- Consumes: `api`, `mensagemErro` (Task 1); `formatarDataHora`, `formatarDinheiro` (Task 1); `db`, `novoId`, `LeilaoMock`, `ProcessoMock`, `logar` (Task 1); `erro`, `exigirSessao` (Task 1); `Card`, `Botao`, `Alerta` (Task 2); `AvisoIA` (Task 5); `chavesProcessos` (Task 4); `server` (Task 1).
- Produces:
  - `src/api/editais.ts`: `chavesEditais = { detalhe: (id: string) => ['editais', id] as const }`, `gerarEdital(leilao_id: string): Promise<EditalOut>`, `obterEdital(id: string): Promise<EditalOut>`, `atualizarEdital(id: string, conteudo_markdown: string): Promise<EditalOut>`, `urlDownloadEdital(id: string, formato: 'md' | 'docx'): string` (→ `/api/editais/${id}/download?formato=${formato}`).
  - `features/editais/EditalCard.tsx`: `EditalCard({ processo }: { processo: ProcessoDetalheOut })`.
  - `src/api/mocks/editais.ts`: `gerarMarkdownEdital(processo: ProcessoMock, leilao: LeilaoMock): string`, `const editaisHandlers: HttpHandler[]` (`POST /editais`, `GET /editais/:id`, `PUT /editais/:id`, `GET /editais/:id/download?formato=`).

- [ ] **Step 1: Teste falhando**

`src/frontend/src/features/editais/EditalCard.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { erro } from '@/api/mocks/http'
import { server } from '@/api/mocks/server'
import { TEXTO_AVISO_IA } from '@/components/AvisoIA'
import { renderComRouter } from '@/test/render'

function editalFixo(markdown: string) {
  db.editais.push({
    id: 'e-fixo',
    leilao_id: 'l-1',
    processo_id: 'p-1',
    conteudo_markdown: markdown,
    criado_em: '2026-09-22T10:00:00-03:00',
    atualizado_em: null,
  })
}

describe('EditalCard', () => {
  beforeEach(() => logar('operador'))

  it('sem leilão agendado o botão fica desabilitado', async () => {
    db.leiloes = []
    renderComRouter('/processos/p-1')
    expect(await screen.findByText('Agende o leilão para gerar o edital.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gerar edital' })).toBeDisabled()
  })

  it('gerar edital mostra juiz, matrículas, datas, lances, aviso de IA e links de download', async () => {
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Gerar edital' }))
    const artigo = await screen.findByRole('article', { name: 'Conteúdo do edital' })
    expect(artigo).toHaveTextContent('CLAUDIO CEZAR CAVALCANTES')
    expect(artigo).toHaveTextContent('Matrícula nº 6.351')
    expect(artigo).toHaveTextContent('Matrícula nº 6.235')
    expect(artigo).toHaveTextContent('Primeiro Leilão: 05/11/2026, 10:00')
    expect(artigo).toHaveTextContent('Última avaliação: R$ 227.000,00')
    expect(artigo).toHaveTextContent('Lance Inicial em 2º Leilão: R$ 158.900,00')
    const card = artigo.closest('section')
    expect(card).not.toBeNull()
    if (!card) return
    expect(within(card).getByText(TEXTO_AVISO_IA)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Baixar .md' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/api\/editais\/e-\d+\/download\?formato=md$/),
    )
    expect(within(card).getByRole('link', { name: 'Baixar .docx' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/api\/editais\/e-\d+\/download\?formato=docx$/),
    )
    expect(within(card).getByRole('button', { name: 'Regenerar' })).toBeInTheDocument()
  })

  it('HTML cru no markdown vira texto, nunca elemento', async () => {
    editalFixo('Texto <script>alert(1)</script> fim')
    const { container } = renderComRouter('/processos/p-1')
    const artigo = await screen.findByRole('article', { name: 'Conteúdo do edital' })
    expect(artigo).toHaveTextContent('<script>alert(1)</script>')
    expect(container.querySelector('article script')).toBeNull()
  })

  it('editar e salvar reflete no render e mostra quando foi editado', async () => {
    editalFixo('# Edital original')
    const { user } = renderComRouter('/processos/p-1')
    await screen.findByRole('article', { name: 'Conteúdo do edital' })
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const area = screen.getByLabelText('Conteúdo do edital em Markdown')
    await user.clear(area)
    await user.type(area, '# Edital revisado{enter}{enter}Com observação da equipe.')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    const artigo = await screen.findByRole('article', { name: 'Conteúdo do edital' })
    expect(artigo).toHaveTextContent('Edital revisado')
    expect(artigo).toHaveTextContent('Com observação da equipe.')
    expect(screen.getByText(/^Editado em \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/)).toBeInTheDocument()
    expect(db.editais.find((e) => e.id === 'e-fixo')?.atualizado_em).not.toBeNull()
  })

  it('conteúdo vazio desabilita o salvar', async () => {
    editalFixo('# Edital')
    const { user } = renderComRouter('/processos/p-1')
    await screen.findByRole('article', { name: 'Conteúdo do edital' })
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Conteúdo do edital em Markdown'))
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('erro do servidor ao gerar aparece no card', async () => {
    server.use(http.post('/api/editais', () => erro(409, 'Leilão cancelado')))
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Gerar edital' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Leilão cancelado')
  })
})
```

Valores: bem 1 avaliação `95000.00`, bem 2 reavaliação `132000.00` (prevalece sobre a avaliação) → `227000.00`; 70% → `158900.00` (spec backend §3, template).

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/editais`
Expected: FAIL — nenhum texto `Agende o leilão para gerar o edital.`.

- [ ] **Step 2: `api/editais.ts` e `EditalCard`**

`src/frontend/src/api/editais.ts`:

```ts
import { api } from './client'
import type { EditalOut, EditalUpdate } from './types'

export const chavesEditais = {
  detalhe: (id: string) => ['editais', id] as const,
}

export function gerarEdital(leilao_id: string): Promise<EditalOut> {
  return api.post<EditalOut>('/editais', { leilao_id })
}

export function obterEdital(id: string): Promise<EditalOut> {
  return api.get<EditalOut>(`/editais/${id}`)
}

export function atualizarEdital(id: string, conteudo_markdown: string): Promise<EditalOut> {
  const body: EditalUpdate = { conteudo_markdown }
  return api.put<EditalOut>(`/editais/${id}`, body)
}

export function urlDownloadEdital(id: string, formato: 'md' | 'docx'): string {
  return `/api/editais/${id}/download?formato=${formato}`
}
```

`src/frontend/src/features/editais/EditalCard.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Markdown from 'react-markdown'
import { mensagemErro } from '@/api/client'
import { atualizarEdital, chavesEditais, gerarEdital, obterEdital, urlDownloadEdital } from '@/api/editais'
import { chavesProcessos } from '@/api/processos'
import type { EditalOut, ProcessoDetalheOut } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { AvisoIA } from '@/components/AvisoIA'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { formatarDataHora } from '@/lib/formatar'

type Props = { processo: ProcessoDetalheOut }

const ESTILO_MARKDOWN =
  'text-sm leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5'

type PropsEditor = {
  edital: EditalOut
  salvando: boolean
  erro: string | null
  onSalvar: (conteudo: string) => void
  onCancelar: () => void
}

function EditorEdital({ edital, salvando, erro, onSalvar, onCancelar }: PropsEditor) {
  const [conteudo, setConteudo] = useState(edital.conteudo_markdown)
  const vazio = conteudo.trim() === ''
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Conteúdo do edital em Markdown"
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        rows={20}
        className="w-full rounded border border-slate-300 p-2 font-mono text-xs"
      />
      {erro ? <Alerta tipo="erro">{erro}</Alerta> : null}
      <div className="flex gap-2">
        <Botao onClick={() => onSalvar(conteudo)} disabled={salvando || vazio}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
        <Botao variante="secundario" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Botao>
      </div>
    </div>
  )
}

export function EditalCard({ processo }: Props) {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const leilao = processo.leilao
  const editalId = leilao?.edital_id ?? null

  const edital = useQuery({
    queryKey: chavesEditais.detalhe(editalId ?? ''),
    queryFn: () => obterEdital(editalId ?? ''),
    enabled: editalId !== null,
  })

  const gerar = useMutation({
    mutationFn: () => gerarEdital(leilao?.id ?? ''),
    onSuccess: (novo) => {
      queryClient.setQueryData(chavesEditais.detalhe(novo.id), novo)
      setEditando(false)
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.detalhe(processo.id) })
    },
  })

  const salvar = useMutation({
    mutationFn: (conteudo: string) => atualizarEdital(editalId ?? '', conteudo),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(chavesEditais.detalhe(atualizado.id), atualizado)
      setEditando(false)
    },
  })

  const podeGerar = leilao !== null && leilao.status === 'agendado'
  const rotuloGerar = editalId ? 'Regenerar' : 'Gerar edital'

  return (
    <Card
      titulo="Edital"
      acoes={
        <>
          {edital.data && !editando ? (
            <Botao variante="secundario" onClick={() => setEditando(true)}>
              Editar
            </Botao>
          ) : null}
          <Botao onClick={() => gerar.mutate()} disabled={!podeGerar || gerar.isPending || editando}>
            {gerar.isPending ? 'Gerando…' : rotuloGerar}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!leilao ? (
          <p className="text-sm text-slate-500">Agende o leilão para gerar o edital.</p>
        ) : null}
        {gerar.isError ? <Alerta tipo="erro">{mensagemErro(gerar.error)}</Alerta> : null}
        {editalId !== null && edital.isPending ? (
          <p className="text-sm text-slate-500">Carregando edital…</p>
        ) : null}
        {edital.isError ? <Alerta tipo="erro">{mensagemErro(edital.error)}</Alerta> : null}
        {edital.data ? (
          <>
            <AvisoIA />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <a href={urlDownloadEdital(edital.data.id, 'md')} download className="text-blue-700 underline">
                Baixar .md
              </a>
              <a href={urlDownloadEdital(edital.data.id, 'docx')} download className="text-blue-700 underline">
                Baixar .docx
              </a>
              {edital.data.atualizado_em ? (
                <span className="text-slate-500">Editado em {formatarDataHora(edital.data.atualizado_em)}</span>
              ) : null}
            </div>
            {editando ? (
              <EditorEdital
                key={edital.data.id}
                edital={edital.data}
                salvando={salvar.isPending}
                erro={salvar.isError ? mensagemErro(salvar.error) : null}
                onSalvar={(c) => salvar.mutate(c)}
                onCancelar={() => setEditando(false)}
              />
            ) : (
              <article aria-label="Conteúdo do edital" className={ESTILO_MARKDOWN}>
                <Markdown>{edital.data.conteudo_markdown}</Markdown>
              </article>
            )}
          </>
        ) : null}
      </div>
    </Card>
  )
}
```

`react-markdown` sem `rehype-raw` renderiza HTML cru como texto (spec frontend §6) — é o que o teste de XSS garante.

Em `src/frontend/src/features/processos/ProcessoDetalhePage.tsx`, importe `import { EditalCard } from '@/features/editais/EditalCard'` e acrescente logo após o `AgendarLeilaoCard`:

```tsx
      <AgendarLeilaoCard processo={processo} />
      <EditalCard processo={processo} />
```

- [ ] **Step 3: Handlers mock de editais**

`src/frontend/src/api/mocks/editais.ts`:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import type { EditalCreate, EditalOut, EditalUpdate } from '@/api/types'
import { formatarDataHora, formatarDinheiro } from '@/lib/formatar'
import { db, type LeilaoMock, novoId, type ProcessoMock } from './db'
import { erro, exigirSessao } from './http'

const VAZIO = '______'
const TIPO_MD = 'text/markdown; charset=utf-8'
const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function somaAvaliacoes(processo: ProcessoMock): number {
  const bens = processo.checklist?.bens ?? []
  return bens.reduce(
    (total, bem) => total + Number(bem.valor_reavaliacao ?? bem.valor_avaliacao ?? '0'),
    0,
  )
}

export function gerarMarkdownEdital(processo: ProcessoMock, leilao: LeilaoMock): string {
  const c = processo.checklist
  const bens = c?.bens ?? []
  const avaliacao = somaAvaliacoes(processo)
  const lanceSegundo = avaliacao * 0.7
  const executados =
    c && c.executados.length > 0
      ? c.executados.map((e) => `${e.nome} – CPF/CNPJ: ${e.cpf_cnpj ?? VAZIO}`).join('; ')
      : VAZIO
  const descricoes =
    bens.length === 0 ? [VAZIO] : bens.map((b) => `- ${b.descricao} Matrícula nº ${b.matricula ?? VAZIO}.`)

  return [
    '# EDITAL DE LEILÃO E INTIMAÇÃO',
    '',
    `O Exmo. Sr. Dr. Juiz da ${c?.vara ?? VAZIO}, ${c?.juiz ?? VAZIO}, faz ciência aos interessados e, principalmente, aos executados/devedores do processo de nº ${c?.numero_processo ?? VAZIO}, que venderá, em HASTA PÚBLICA, o bem/lote adiante discriminado:`,
    '',
    `**Valor da execução:** ${formatarDinheiro(c?.execucao.valor_divida ?? null)}`,
    '',
    `**Exequente:** ${c?.exequente.nome ?? VAZIO} – CPF/CNPJ: ${c?.exequente.cpf_cnpj ?? VAZIO}`,
    '',
    `**Executado:** ${executados}`,
    '',
    '## HASTA PÚBLICA',
    '',
    `**Primeiro Leilão**: ${formatarDataHora(leilao.primeiro_leilao_em)}`,
    '',
    `**Segundo Leilão**: ${formatarDataHora(leilao.segundo_leilao_em)}`,
    '',
    '**Local**: Os leilões serão realizados on-line, no site www.norteleiloes.com.br, de domínio do leiloeiro nomeado, Sr. Sandro de Oliveira, JUCEPA nº 20070555214. Telefone: (91) 99125-0028.',
    '',
    '## DESCRIÇÃO DO BEM',
    '',
    ...descricoes,
    '',
    `**Última avaliação**: ${formatarDinheiro(avaliacao.toFixed(2))}`,
    '',
    `**Lance Inicial em 1º Leilão**: ${formatarDinheiro(avaliacao.toFixed(2))}`,
    '',
    `**Lance Inicial em 2º Leilão**: ${formatarDinheiro(lanceSegundo.toFixed(2))}`,
  ].join('\n')
}

function buscarEdital(id: string | readonly string[] | undefined): EditalOut | null {
  return db.editais.find((e) => e.id === String(id)) ?? null
}

function nomeArquivo(edital: EditalOut, extensao: string): string {
  const processo = db.processos.find((p) => p.id === edital.processo_id)
  return `edital-${processo?.numero_processo ?? edital.id}.${extensao}`
}

export const editaisHandlers: HttpHandler[] = [
  http.post('/api/editais', async ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const body = (await request.json()) as EditalCreate
    const leilao = db.leiloes.find((l) => l.id === body.leilao_id)
    if (!leilao) return erro(404, 'Leilão não encontrado')
    if (leilao.status === 'cancelado') return erro(409, 'Leilão cancelado')
    const processo = db.processos.find((p) => p.id === leilao.processo_id)
    if (!processo) return erro(404, 'Processo não encontrado')
    const edital: EditalOut = {
      id: novoId('e'),
      leilao_id: leilao.id,
      processo_id: processo.id,
      conteudo_markdown: gerarMarkdownEdital(processo, leilao),
      criado_em: new Date().toISOString(),
      atualizado_em: null,
    }
    db.editais.push(edital)
    return HttpResponse.json(edital, { status: 201 })
  }),

  http.get('/api/editais/:id', ({ params }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const edital = buscarEdital(params.id)
    return edital ? HttpResponse.json(edital) : erro(404, 'Edital não encontrado')
  }),

  http.put('/api/editais/:id', async ({ params, request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const edital = buscarEdital(params.id)
    if (!edital) return erro(404, 'Edital não encontrado')
    const body = (await request.json()) as EditalUpdate
    if (body.conteudo_markdown.trim() === '') return erro(422, 'Conteúdo do edital não pode ser vazio')
    edital.conteudo_markdown = body.conteudo_markdown
    edital.atualizado_em = new Date().toISOString()
    return HttpResponse.json(edital)
  }),

  http.get('/api/editais/:id/download', ({ params, request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const edital = buscarEdital(params.id)
    if (!edital) return erro(404, 'Edital não encontrado')
    const formato = new URL(request.url).searchParams.get('formato') ?? 'md'
    if (formato === 'md') {
      return new HttpResponse(edital.conteudo_markdown, {
        headers: {
          'Content-Type': TIPO_MD,
          'Content-Disposition': `attachment; filename="${nomeArquivo(edital, 'md')}"`,
        },
      })
    }
    if (formato === 'docx') {
      return new HttpResponse(new Blob([], { type: TIPO_DOCX }), {
        headers: {
          'Content-Type': TIPO_DOCX,
          'Content-Disposition': `attachment; filename="${nomeArquivo(edital, 'docx')}"`,
        },
      })
    }
    return erro(422, 'Formato inválido')
  }),
]
```

`src/frontend/src/api/mocks/handlers.ts` — arquivo completo:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import { agendaHandlers } from './agenda'
import { authHandlers } from './auth'
import { editaisHandlers } from './editais'
import { processosHandlers } from './processos'
import { usuariosHandlers } from './usuarios'

export const handlers: HttpHandler[] = [
  http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
  ...authHandlers,
  ...usuariosHandlers,
  ...processosHandlers,
  ...agendaHandlers,
  ...editaisHandlers,
]
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/editais src/features/processos src/features/agenda`
Expected: PASS (6 editais + os anteriores; p-1 sem edital mostra "Gerar edital" habilitado, p-2 mostra "Agende o leilão…").

Run: `cd src && rtk docker compose exec frontend sh -c "pnpm lint:fix && pnpm lint && pnpm typecheck"`
Expected: sem erros.

- [ ] **Step 5: Conferir no browser**

`cd src && VITE_API_MOCK=true rtk docker compose up frontend nginx` → login → `processo-1003966.pdf` → "Gerar edital" → aviso de IA + markdown com datas de novembro, dois bens e lances → "Editar" → alterar → "Salvar" → "Editado em …" → "Baixar .md" baixa `edital-1003966-15.2022.4.01.4301.md`; "Baixar .docx" baixa `.docx` (vazio no mock) → "Regenerar" troca o link. Encerre.

- [ ] **Step 6: Stage**

```bash
rtk git add src/frontend
```

Mensagem sugerida: `feat(frontend): edital com visualização segura, edição, download md/docx e regeneração`. Dev revisa e comita.

---

### Task 8: Marketing — enviar planilha e listar envios

**Files:**
- Create: `src/frontend/src/api/marketing.ts`, `src/frontend/src/features/marketing/EnviarMarketingCard.tsx`, `src/frontend/src/features/marketing/MarketingPage.tsx`, `src/frontend/src/api/mocks/marketing.ts`
- Modify: `src/frontend/src/app/rotas.tsx`, `src/frontend/src/api/mocks/handlers.ts`, `src/frontend/src/features/processos/ProcessoDetalhePage.tsx`
- Test: `src/frontend/src/features/marketing/EnviarMarketingCard.test.tsx`, `src/frontend/src/features/marketing/MarketingPage.test.tsx`

**Interfaces:**
- Consumes: `api`, `mensagemErro` (Task 1); `formatarDataHora`, `ouTraco` (Task 1); `db`, `novoId`, `toLeilaoOut`, `toEnvioOut`, `EnvioMock`, `MARKETING_EMAILS`, `logar` (Task 1); `erro`, `exigirSessao` (Task 1); `Card`, `Botao`, `Alerta` (Task 2); `StatusBadge` (Task 3); `server` (Task 1).
- Produces:
  - `src/api/marketing.ts`: `chavesMarketing = { envios: ['marketing', 'envios'] as const }`, `URL_PLANILHA = '/api/marketing/planilha'`, `listarEnvios(): Promise<EnvioOut[]>`, `enviarParaMarketing(leilao_id: string): Promise<EnvioOut>`.
  - `features/marketing/EnviarMarketingCard.tsx`: `EnviarMarketingCard({ processo }: { processo: ProcessoDetalheOut })`.
  - `features/marketing/MarketingPage.tsx`: `MarketingPage()`.
  - `src/api/mocks/marketing.ts`: `const marketingHandlers: HttpHandler[]` (`GET/POST /marketing/envios`, `GET /marketing/planilha`).

`EnvioOut` segue a spec backend §2 sem mudança: `{ id, leilao_id, numero_processo, destinatarios, enviado_em, status, erro }`.

- [ ] **Step 1: Testes falhando**

`src/frontend/src/features/marketing/EnviarMarketingCard.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { erro } from '@/api/mocks/http'
import { server } from '@/api/mocks/server'
import { renderComRouter } from '@/test/render'

function comEdital() {
  db.editais.push({
    id: 'e-1',
    leilao_id: 'l-1',
    processo_id: 'p-1',
    conteudo_markdown: '# Edital',
    criado_em: '2026-09-22T10:00:00-03:00',
    atualizado_em: null,
  })
}

describe('EnviarMarketingCard', () => {
  beforeEach(() => logar('operador'))

  it('sem edital o botão fica desabilitado com orientação', async () => {
    renderComRouter('/processos/p-1')
    expect(await screen.findByText('Gere o edital para liberar o envio da planilha.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar pra marketing' })).toBeDisabled()
  })

  it('envio ok mostra destinatários e registra na lista de envios', async () => {
    comEdital()
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Enviar pra marketing' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enviado para marketing@exemplo.com.br')
    expect(db.envios).toHaveLength(1)
    expect(db.envios[0]?.status).toBe('enviado')
  })

  it('409 do servidor aparece no card', async () => {
    comEdital()
    server.use(http.post('/api/marketing/envios', () => erro(409, 'Gere o edital antes de enviar')))
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Enviar pra marketing' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Gere o edital antes de enviar')
  })
})
```

`src/frontend/src/features/marketing/MarketingPage.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

describe('MarketingPage', () => {
  beforeEach(() => logar('operador'))

  it('lista envios com processo, destinatários e status, e link da planilha', async () => {
    db.envios.push({
      id: 'env-1',
      leilao_id: 'l-1',
      destinatarios: ['marketing@exemplo.com.br'],
      enviado_em: '2026-09-23T15:30:00-03:00',
      status: 'enviado',
      erro: null,
    })
    renderComRouter('/marketing')
    expect(await screen.findByText('1003966-15.2022.4.01.4301')).toBeInTheDocument()
    expect(screen.getByText('marketing@exemplo.com.br')).toBeInTheDocument()
    expect(screen.getByText('23/09/2026, 15:30')).toBeInTheDocument()
    expect(screen.getByText('enviado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Baixar planilha' })).toHaveAttribute(
      'href',
      '/api/marketing/planilha',
    )
  })

  it('sem envios mostra estado vazio', async () => {
    renderComRouter('/marketing')
    expect(await screen.findByText('Nenhum envio realizado.')).toBeInTheDocument()
  })
})
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features/marketing`
Expected: FAIL — nenhum texto `Gere o edital para liberar o envio da planilha.`; rota `/marketing` inexistente.

- [ ] **Step 2: `api/marketing.ts`, card e página**

`src/frontend/src/api/marketing.ts`:

```ts
import { api } from './client'
import type { EnvioOut } from './types'

export const chavesMarketing = {
  envios: ['marketing', 'envios'] as const,
}

export const URL_PLANILHA = '/api/marketing/planilha'

export function listarEnvios(): Promise<EnvioOut[]> {
  return api.get<EnvioOut[]>('/marketing/envios')
}

export function enviarParaMarketing(leilao_id: string): Promise<EnvioOut> {
  return api.post<EnvioOut>('/marketing/envios', { leilao_id })
}
```

`src/frontend/src/features/marketing/EnviarMarketingCard.tsx`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mensagemErro } from '@/api/client'
import { chavesMarketing, enviarParaMarketing } from '@/api/marketing'
import type { ProcessoDetalheOut } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { formatarDataHora } from '@/lib/formatar'

type Props = { processo: ProcessoDetalheOut }

export function EnviarMarketingCard({ processo }: Props) {
  const queryClient = useQueryClient()
  const leilao = processo.leilao
  const podeEnviar = leilao !== null && leilao.status === 'agendado' && leilao.edital_id !== null

  const enviar = useMutation({
    mutationFn: () => enviarParaMarketing(leilao?.id ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chavesMarketing.envios })
    },
  })

  return (
    <Card
      titulo="Marketing"
      acoes={
        <Botao onClick={() => enviar.mutate()} disabled={!podeEnviar || enviar.isPending}>
          {enviar.isPending ? 'Enviando…' : 'Enviar pra marketing'}
        </Botao>
      }
    >
      <div className="flex flex-col gap-2">
        {podeEnviar ? (
          <p className="text-sm text-slate-500">
            Envia a planilha de leilões atualizada por e-mail pra equipe de marketing.
          </p>
        ) : (
          <p className="text-sm text-slate-500">Gere o edital para liberar o envio da planilha.</p>
        )}
        {enviar.isSuccess ? (
          <Alerta tipo="sucesso">
            Enviado para {enviar.data.destinatarios.join(', ')} em{' '}
            {formatarDataHora(enviar.data.enviado_em)}
          </Alerta>
        ) : null}
        {enviar.isError ? <Alerta tipo="erro">{mensagemErro(enviar.error)}</Alerta> : null}
      </div>
    </Card>
  )
}
```

`src/frontend/src/features/marketing/MarketingPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query'
import { mensagemErro } from '@/api/client'
import { chavesMarketing, listarEnvios, URL_PLANILHA } from '@/api/marketing'
import { Alerta } from '@/components/Alerta'
import { StatusBadge } from '@/components/StatusBadge'
import { formatarDataHora, ouTraco } from '@/lib/formatar'

export function MarketingPage() {
  const envios = useQuery({ queryKey: chavesMarketing.envios, queryFn: listarEnvios })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Marketing</h1>
        <a
          href={URL_PLANILHA}
          download
          className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
        >
          Baixar planilha
        </a>
      </div>
      {envios.isPending ? <p className="text-slate-500">Carregando…</p> : null}
      {envios.isError ? <Alerta tipo="erro">{mensagemErro(envios.error)}</Alerta> : null}
      {envios.data && envios.data.length === 0 ? (
        <p className="text-slate-500">Nenhum envio realizado.</p>
      ) : null}
      {envios.data && envios.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Processo</th>
                <th className="px-3 py-2">Enviado em</th>
                <th className="px-3 py-2">Destinatários</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {envios.data.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{ouTraco(e.numero_processo)}</td>
                  <td className="px-3 py-2">{formatarDataHora(e.enviado_em)}</td>
                  <td className="px-3 py-2">{e.destinatarios.join(', ')}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={e.status} />
                    {e.erro ? <span className="ml-2 text-red-700">{e.erro}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
```

Em `src/frontend/src/features/processos/ProcessoDetalhePage.tsx`, importe `import { EnviarMarketingCard } from '@/features/marketing/EnviarMarketingCard'` e acrescente após o `EditalCard`:

```tsx
      <EditalCard processo={processo} />
      <EnviarMarketingCard processo={processo} />
```

- [ ] **Step 3: Rota e handlers mock**

`src/frontend/src/app/rotas.tsx` — arquivo completo até aqui (a Task 9 acrescenta o `*`):

```tsx
import type { RouteObject } from 'react-router'
import { AgendaPage } from '@/features/agenda/AgendaPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RotaAdmin } from '@/features/auth/RotaAdmin'
import { RotaProtegida } from '@/features/auth/RotaProtegida'
import { MarketingPage } from '@/features/marketing/MarketingPage'
import { ProcessoDetalhePage } from '@/features/processos/ProcessoDetalhePage'
import { ProcessosPage } from '@/features/processos/ProcessosPage'
import { UsuariosPage } from '@/features/usuarios/UsuariosPage'
import { Layout } from './Layout'

export const rotas: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RotaProtegida />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <ProcessosPage /> },
          { path: '/processos/:id', element: <ProcessoDetalhePage /> },
          { path: '/agenda', element: <AgendaPage /> },
          { path: '/marketing', element: <MarketingPage /> },
          {
            element: <RotaAdmin />,
            children: [{ path: '/usuarios', element: <UsuariosPage /> }],
          },
        ],
      },
    ],
  },
]
```

`src/frontend/src/api/mocks/marketing.ts`:

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import type { EnvioCreate } from '@/api/types'
import { db, type EnvioMock, MARKETING_EMAILS, novoId, toEnvioOut, toLeilaoOut } from './db'
import { erro, exigirSessao } from './http'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const marketingHandlers: HttpHandler[] = [
  http.get('/api/marketing/envios', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const lista = [...db.envios].sort((a, b) => Date.parse(b.enviado_em) - Date.parse(a.enviado_em))
    return HttpResponse.json(lista.map(toEnvioOut))
  }),

  http.post('/api/marketing/envios', async ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const body = (await request.json()) as EnvioCreate
    const leilao = db.leiloes.find((l) => l.id === body.leilao_id)
    if (!leilao) return erro(404, 'Leilão não encontrado')
    if (toLeilaoOut(leilao).edital_id === null) return erro(409, 'Gere o edital antes de enviar')
    const envio: EnvioMock = {
      id: novoId('env'),
      leilao_id: leilao.id,
      destinatarios: [...MARKETING_EMAILS],
      enviado_em: new Date().toISOString(),
      status: 'enviado',
      erro: null,
    }
    db.envios.push(envio)
    return HttpResponse.json(toEnvioOut(envio), { status: 201 })
  }),

  http.get('/api/marketing/planilha', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    return new HttpResponse(new Blob([], { type: XLSX }), {
      headers: {
        'Content-Type': XLSX,
        'Content-Disposition': 'attachment; filename="leiloes.xlsx"',
      },
    })
  }),
]
```

`src/frontend/src/api/mocks/handlers.ts` — arquivo completo (todas as rotas da spec backend §3 cobertas):

```ts
import { http, HttpResponse, type HttpHandler } from 'msw'
import { agendaHandlers } from './agenda'
import { authHandlers } from './auth'
import { editaisHandlers } from './editais'
import { marketingHandlers } from './marketing'
import { processosHandlers } from './processos'
import { usuariosHandlers } from './usuarios'

export const handlers: HttpHandler[] = [
  http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
  ...authHandlers,
  ...usuariosHandlers,
  ...processosHandlers,
  ...agendaHandlers,
  ...editaisHandlers,
  ...marketingHandlers,
]
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/features`
Expected: PASS — auth 11, usuários 8, processos 20, agenda 15, editais 6, marketing 5 = 65.

Run: `cd src && rtk docker compose exec frontend sh -c "pnpm lint:fix && pnpm lint && pnpm typecheck"`
Expected: sem erros.

- [ ] **Step 5: Conferir no browser**

`cd src && VITE_API_MOCK=true rtk docker compose up frontend nginx` → login → `processo-1003966.pdf` → gerar edital → "Enviar pra marketing" → alerta de sucesso → `/marketing` lista o envio; "Baixar planilha" baixa `leiloes.xlsx` (vazio no mock). Encerre.

- [ ] **Step 6: Stage**

```bash
rtk git add src/frontend
```

Mensagem sugerida: `feat(frontend): envio da planilha pro marketing e histórico de envios`. Dev revisa e comita.

---

### Task 9: Fechamento — 404, ErrorBoundary, verificação completa, build da imagem e checklist manual

**Files:**
- Create: `src/frontend/src/app/NaoEncontradaPage.tsx`, `src/frontend/src/components/ErrorBoundary.tsx`
- Modify: `src/frontend/src/app/rotas.tsx`, `src/frontend/src/main.tsx`
- Test: `src/frontend/src/app/rotas.test.tsx`, `src/frontend/src/components/ErrorBoundary.test.tsx`

**Interfaces:**
- Consumes: `rotas` (Task 2), `renderComRouter` (Task 2), `logar` (Task 1).
- Produces: `NaoEncontradaPage()`, `ErrorBoundary({ children }: { children: ReactNode })`.

- [ ] **Step 1: Testes falhando**

`src/frontend/src/app/rotas.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

describe('rotas', () => {
  it('caminho desconhecido mostra 404 dentro do layout', async () => {
    logar('operador')
    renderComRouter('/nao-existe')
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar pra lista de processos' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Agenda' })).toBeInTheDocument()
  })
})
```

`src/frontend/src/components/ErrorBoundary.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Explode(): never {
  throw new Error('quebrou')
}

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('mostra mensagem amigável quando um filho lança', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <ErrorBoundary>
        <Explode />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado. Recarregue a página.')
  })

  it('renderiza filhos normalmente sem erro', () => {
    render(
      <ErrorBoundary>
        <p>tudo certo</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('tudo certo')).toBeInTheDocument()
  })
})
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/app src/components`
Expected: FAIL — `ErrorBoundary` não existe; `/nao-existe` não renderiza heading de 404.

- [ ] **Step 2: Implementar**

`src/frontend/src/app/NaoEncontradaPage.tsx`:

```tsx
import { Link } from 'react-router'

export function NaoEncontradaPage() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <Link to="/" className="text-blue-700 underline">
        Voltar pra lista de processos
      </Link>
    </div>
  )
}
```

`src/frontend/src/components/ErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { quebrou: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { quebrou: false }

  static getDerivedStateFromError(): State {
    return { quebrou: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.quebrou) {
      return (
        <main className="flex min-h-screen items-center justify-center p-6">
          <p role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">
            Algo deu errado. Recarregue a página.
          </p>
        </main>
      )
    }
    return this.props.children
  }
}
```

`src/frontend/src/app/rotas.tsx` — importe `import { NaoEncontradaPage } from './NaoEncontradaPage'` e acrescente como último filho do `Layout` (depois do bloco `RotaAdmin`):

```tsx
          { path: '*', element: <NaoEncontradaPage /> },
```

`src/frontend/src/main.tsx` — envolva `Providers` com o boundary (import `import { ErrorBoundary } from './components/ErrorBoundary'`):

```tsx
    <StrictMode>
      <ErrorBoundary>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </ErrorBoundary>
    </StrictMode>,
```

Run: `cd src && rtk docker compose exec frontend pnpm test -- src/app src/components`
Expected: PASS, 3 testes.

- [ ] **Step 3: Verificação completa (única vez que roda a suíte inteira)**

Run: `cd src && rtk docker compose exec frontend sh -c "pnpm lint:fix && pnpm lint && pnpm typecheck && pnpm test && pnpm build"`
Expected: Biome sem erros; `tsc` sem erros; Vitest 100% verde (**101 testes**: 16 infra (client 11 + formatar 5) + 11 auth + 8 usuários + 20 processos + 5 datas + 12 regras de agenda + 15 agenda UI + 6 editais + 5 marketing + 3 fechamento); `vite build` gera `dist/`. Se o build avisar sobre chunk > 500 kB, aceite — otimização de bundle não está no escopo.

- [ ] **Step 4: Build da imagem (depende da etapa backend)**

Só roda se `src/nginx/prod.conf` já existir (é da etapa backend). Os demais steps desta task não dependem disso.

Run (da raiz do repo): `rtk docker build -f src/frontend/Dockerfile -t leiloes-nginx-local src`
Expected: imagem construída. `rtk docker run --rm -p 8080:80 leiloes-nginx-local` serve `index.html` em `http://localhost:8080` (as chamadas `/api` falham sem backend, esperado). Encerre o container.

- [ ] **Step 5: Checklist manual do fluxo completo em mock**

`cd src && VITE_API_MOCK=true rtk docker compose up frontend nginx`, abrir `http://localhost` e confirmar, nesta ordem:

1. Cai em `/login`; `admin`/`admin` entra; "Administrador · admin" no topo; nav tem **Usuários**.
2. **Minha senha**: senha atual errada → "Senha atual incorreta"; correta + nova ≥ 8 → "Senha alterada".
3. `/usuarios`: lista admin e operador; **Novo usuário** cria; duplicado → 409; **Desativar** operador muda badge; desativar a si mesmo → 409; **Editar** e **Redefinir senha** funcionam.
4. `/` lista 2 processos; "Enviar PDF" com um PDF qualquer adiciona linha `recebido`; com `.txt` mostra "Arquivo deve ser PDF". **Apagar** no processo sem leilão pede confirmação e some; no `processo-1003966.pdf` → 409.
5. Clicar no processo novo → "Analisar" → após ~0,8 s aviso de IA, checklist completo, "Justiça federal", relatório, status `analisado`.
6. "Editar checklist" → alterar vara → "Salvar" → cabeçalho atualiza; valor `abc` em avaliação desabilita "Salvar" com "Use o formato 1234.56".
7. Card "Agendar leilão" sugere datas 30–45 dias à frente em dia útil não feriado; "Escolher outra data" em 02/11 → "Data é feriado: Finados"; sábado → "Data não é dia útil"; "Agendar" com a sugestão → card "Leilão" com as duas datas e **Cancelar leilão** (admin).
8. "Gerar edital" → aviso de IA + markdown com juiz, datas, bens e lances; **Editar** → alterar → **Salvar** → "Editado em …"; **Baixar .md** e **Baixar .docx** baixam; **Regenerar** troca o link.
9. "Enviar pra marketing" → alerta de sucesso com destinatário.
10. `/agenda` → navegar meses; novembro mostra feriados em rosa, bloqueio em âmbar, leilão em azul; adicionar e remover bloqueio; duplicado → 409.
11. `/marketing` → envio listado; "Baixar planilha" baixa `leiloes.xlsx`.
12. "Sair" → login como `operador`/`operador`: sem **Usuários** na nav, `/usuarios` redireciona pra `/`; sem **Apagar** na lista; sem **Cancelar leilão**; sem formulário de bloqueio na agenda; o resto (upload, analisar, editar checklist, agendar, edital, marketing, minha senha) funciona.
13. `/qualquer-coisa` → página 404 com link de volta.
14. Sem mock (`rtk docker compose up frontend nginx` sem `VITE_API_MOCK`) e sem backend: login mostra "Erro inesperado" do `client.ts` em vez de quebrar a tela.

- [ ] **Step 6: Stage**

```bash
rtk git add src/frontend
```

Mensagem sugerida: `feat(frontend): página 404, error boundary e fechamento da etapa frontend`. Dev revisa e comita.

---

## Cobertura da spec (auto-verificação)

| Spec | Task |
|---|---|
| Tipos (backend §2), inclusive `Perfil`, `SenhaIn`, `UsuarioCreate/Update`, `TipoJustica`, `LeilaoCreate.primeiro_leilao_data`, `EditalOut.atualizado_em`, `EditalUpdate` | 1 (`types.ts`) |
| `client.ts` (frontend §5): CSRF, FormData, `Erro inesperado`, 401 → callback, 403 sem redirect, 204 | 1 |
| `POST/GET /auth/*`, `PUT /auth/senha`, cookies, 401/429/400 | 2 |
| `RotaProtegida`, `RotaAdmin`, nav por perfil, `MinhaSenhaDialog` (frontend §4 Layout) | 2 |
| `GET/POST /usuarios`, `PATCH /usuarios/{id}` (409 duplicado, 409 próprio, 422 senha), `UsuariosPage` **[admin]** | 3 |
| `POST/GET /processos`, 415/413, `DELETE /processos/{id}` **[admin]** (409) com `Dialog` | 4 |
| `GET /processos/{id}`, `POST .../analisar` (422/502, 800 ms/0 ms), `PUT .../checklist`, `AvisoIA`, `tipo_justica` | 5 |
| `GET /agenda/leiloes`, `GET /agenda/sugestao` (409), `GET /agenda/feriados`, `POST /agenda/leiloes` (409/422 com mensagens literais), `DELETE` **[admin]**, bloqueios (`POST/DELETE` **[admin]**, 409) | 6 |
| Regras de data (frontend §7: `candidatos`, `motivoIndisponivel`, `sugerirDatas`; dia útil, feriado BR+PA, bloqueio, D+7, janela 30–45 corridos, sem colisão) | 6 (`regrasAgenda.ts` + 12 testes puros) |
| Calendário pintado (fim de semana, feriado, bloqueio, leilão) | 6 (`Calendario.tsx`) |
| `POST /editais` (409), `GET /editais/{id}`, `PUT /editais/{id}` (422), `GET .../download?formato=md\|docx` (422) | 7 |
| `GET /marketing/planilha`, `POST /marketing/envios` (409), `GET /marketing/envios` | 8 |
| Markdown sem HTML cru (frontend §6) | 7 |
| Modo mock (`VITE_API_MOCK`, fixtures admin+operador, DOC 1, 403 por perfil, fluxo completo) | 1 + handlers em 2–8 + checklist em 9 |
| Dois testes por ação **[admin]** (frontend §8): Usuários (link/redirect), Apagar, Cancelar leilão, Bloqueios | 2, 3, 4, 6 |
| Testes por feature (Vitest + RTL + MSW) | todas |
| Dockerfile multi-stage (frontend §10) | 1; build verificado em 9 |
| Biome + scripts `pnpm` fixos (frontend §2, contrato com CI da etapa backend) | 1 |
