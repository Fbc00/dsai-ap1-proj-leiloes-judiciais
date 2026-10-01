import { api } from './client'
import type { EditalOut, EditalUpdate } from './types'

export const chavesEditais = {
  detalhe: (id: string) => ['editais', id] as const,
}

export function gerarEdital(leilao_id: string): Promise<EditalOut> {
  return api.post<EditalOut>('/editais', { leilao_id })
}

export function obterEdital(id: string): Promise<EditalOut> {
  return api.get<EditalOut>(`/editais/${id}`)
}

export function atualizarEdital(id: string, conteudo_markdown: string): Promise<EditalOut> {
  const body: EditalUpdate = { conteudo_markdown }
  return api.put<EditalOut>(`/editais/${id}`, body)
}

export function urlDownloadEdital(id: string, formato: 'md' | 'docx'): string {
  return `/api/editais/${id}/download?formato=${formato}`
}
