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
