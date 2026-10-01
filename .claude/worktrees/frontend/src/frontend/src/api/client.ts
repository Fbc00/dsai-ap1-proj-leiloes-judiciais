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
