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
