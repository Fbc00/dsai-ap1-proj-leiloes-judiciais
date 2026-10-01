import { HttpResponse } from 'msw'
import type { ErroOut } from '@/api/types'
import { usuarioLogado } from './db'

export function erro(status: number, detail: string): HttpResponse<ErroOut> {
  return HttpResponse.json({ detail }, { status })
}

export function exigirSessao(): HttpResponse<ErroOut> | null {
  return usuarioLogado() ? null : erro(401, 'Não autenticado')
}

export function exigirAdmin(): HttpResponse<ErroOut> | null {
  const usuario = usuarioLogado()
  if (!usuario) return erro(401, 'Não autenticado')
  return usuario.perfil === 'admin' ? null : erro(403, 'Sem permissão')
}
