import { type HttpHandler, HttpResponse, http } from 'msw'
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
