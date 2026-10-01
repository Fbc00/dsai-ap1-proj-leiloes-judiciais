import { type HttpHandler, HttpResponse, http } from 'msw'
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
