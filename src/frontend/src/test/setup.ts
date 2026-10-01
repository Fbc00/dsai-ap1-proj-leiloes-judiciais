import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { reset } from '@/api/mocks/db'
import { server } from '@/api/mocks/server'

function substituirGlobal(nome: 'Blob' | 'File' | 'FormData', valor: unknown): void {
  Object.defineProperty(globalThis, nome, { value: valor, writable: true, configurable: true })
}

async function usarArquivosDoFetch(): Promise<void> {
  const blob = await new Response('').blob()
  substituirGlobal('Blob', blob.constructor)
  const form = await new Response(new URLSearchParams()).formData()
  form.append('arquivo', blob)
  const arquivo = form.get('arquivo')
  if (typeof arquivo === 'string' || arquivo === null) throw new Error('FormData do fetch sem File')
  substituirGlobal('File', arquivo.constructor)
  substituirGlobal('FormData', form.constructor)
}

await usarArquivosDoFetch()

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
