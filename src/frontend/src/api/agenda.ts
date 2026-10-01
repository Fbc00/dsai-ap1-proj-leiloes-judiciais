import { api } from './client'
import type {
  BloqueioCreate,
  BloqueioOut,
  FeriadoOut,
  LeilaoCreate,
  LeilaoOut,
  SugestaoOut,
} from './types'

export const chavesAgenda = {
  raiz: ['agenda'] as const,
  leiloes: (inicio: string | null, fim: string | null) =>
    ['agenda', 'leiloes', inicio, fim] as const,
  sugestao: ['agenda', 'sugestao'] as const,
  bloqueios: ['agenda', 'bloqueios'] as const,
  feriados: (ano: number) => ['agenda', 'feriados', ano] as const,
}

export function listarLeiloes(filtro?: { inicio: string; fim: string }): Promise<LeilaoOut[]> {
  const query = filtro ? `?inicio=${filtro.inicio}&fim=${filtro.fim}` : ''
  return api.get<LeilaoOut[]>(`/agenda/leiloes${query}`)
}

export function obterSugestao(): Promise<SugestaoOut> {
  return api.get<SugestaoOut>('/agenda/sugestao')
}

export function agendarLeilao(dados: LeilaoCreate): Promise<LeilaoOut> {
  return api.post<LeilaoOut>('/agenda/leiloes', dados)
}

export function cancelarLeilao(id: string): Promise<void> {
  return api.del(`/agenda/leiloes/${id}`)
}

export function listarBloqueios(): Promise<BloqueioOut[]> {
  return api.get<BloqueioOut[]>('/agenda/bloqueios')
}

export function criarBloqueio(dados: BloqueioCreate): Promise<BloqueioOut> {
  return api.post<BloqueioOut>('/agenda/bloqueios', dados)
}

export function removerBloqueio(id: string): Promise<void> {
  return api.del(`/agenda/bloqueios/${id}`)
}

export function listarFeriados(ano: number): Promise<FeriadoOut[]> {
  return api.get<FeriadoOut[]>(`/agenda/feriados?ano=${ano}`)
}
