import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { registrarNaoAutenticado } from './api/client'
import { Providers, queryClient } from './app/providers'
import { router } from './app/router'
import { ErrorBoundary } from './components/ErrorBoundary'

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
      <ErrorBoundary>
        <Providers>
          <RouterProvider router={router} />
        </Providers>
      </ErrorBoundary>
    </StrictMode>,
  )
})
