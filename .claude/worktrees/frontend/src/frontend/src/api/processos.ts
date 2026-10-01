import { api } from './client'
import type { Checklist, ProcessoDetalheOut, ProcessoOut } from './types'

export const chavesProcessos = {
  lista: ['processos'] as const,
  detalhe: (id: string) => ['processos', id] as const,
}

export function listarProcessos(): Promise<ProcessoOut[]> {
  return api.get<ProcessoOut[]>('/processos')
}

export function obterProcesso(id: string): Promise<ProcessoDetalheOut> {
  return api.get<ProcessoDetalheOut>(`/processos/${id}`)
}

export function enviarProcesso(arquivo: File): Promise<ProcessoOut> {
  const form = new FormData()
  form.append('arquivo', arquivo)
  return api.post<ProcessoOut>('/processos', form)
}

export function analisarProcesso(id: string): Promise<ProcessoDetalheOut> {
  return api.post<ProcessoDetalheOut>(`/processos/${id}/analisar`)
}

export function salvarChecklist(id: string, checklist: Checklist): Promise<Checklist> {
  return api.put<Checklist>(`/processos/${id}/checklist`, checklist)
}

export function excluirProcesso(id: string): Promise<void> {
  return api.del(`/processos/${id}`)
}
