import { api } from './client'
import type { EnvioOut } from './types'

export const chavesMarketing = {
  envios: ['marketing', 'envios'] as const,
}

export const URL_PLANILHA = '/api/marketing/planilha'

export function listarEnvios(): Promise<EnvioOut[]> {
  return api.get<EnvioOut[]>('/marketing/envios')
}

export function enviarParaMarketing(leilao_id: string): Promise<EnvioOut> {
  return api.post<EnvioOut>('/marketing/envios', { leilao_id })
}
