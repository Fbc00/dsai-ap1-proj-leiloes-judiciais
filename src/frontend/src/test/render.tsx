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
