import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '@/api/mocks/server'
import { ApiError, api, mensagemErro, registrarNaoAutenticado } from './client'

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
    server.use(
      http.get('/api/x', () => HttpResponse.json({ detail: 'Não achei' }, { status: 404 })),
    )
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
      http.get('/api/privado', () =>
        HttpResponse.json({ detail: 'Não autenticado' }, { status: 401 }),
      ),
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
