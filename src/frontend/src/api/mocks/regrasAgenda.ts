import type { SugestaoOut } from '@/api/types'
import { adicionarDias, comHorario, dataLocal, inicioDoDia } from '@/lib/datas'
import { formatarData } from '@/lib/formatar'

export type DiaMarcado = { data: string; motivo: string }

export const HORARIO_LEILAO = { hora: 10, minuto: 0 } as const
const JANELA_INICIO_DIAS = 30
const JANELA_FIM_DIAS = 45
const INTERVALO_SEGUNDO_DIAS = 7

export const MSG_FORA_DA_JANELA = 'Data fora da janela de 30 a 45 dias'
export const MSG_NAO_UTIL = 'Data não é dia útil'

export function candidatos(hoje: Date): Date[] {
  const base = inicioDoDia(hoje)
  return Array.from({ length: JANELA_FIM_DIAS - JANELA_INICIO_DIAS + 1 }, (_, i) =>
    adicionarDias(base, JANELA_INICIO_DIAS + i),
  )
}

export function motivoIndisponivel(
  d: Date,
  bloqueios: readonly DiaMarcado[],
  feriados: readonly DiaMarcado[],
): string | null {
  const semana = d.getDay()
  if (semana === 0 || semana === 6) return MSG_NAO_UTIL
  const chave = dataLocal(d)
  const feriado = feriados.find((f) => f.data === chave)
  if (feriado) return `Data é feriado: ${feriado.motivo}`
  const bloqueio = bloqueios.find((b) => b.data === chave)
  if (bloqueio) return `Data bloqueada: ${bloqueio.motivo}`
  return null
}

export function validarDataManual(
  d: Date,
  hoje: Date,
  bloqueios: readonly DiaMarcado[],
  feriados: readonly DiaMarcado[],
): string | null {
  const dia = inicioDoDia(d).getTime()
  const inicio = inicioDoDia(adicionarDias(hoje, JANELA_INICIO_DIAS)).getTime()
  const fim = inicioDoDia(adicionarDias(hoje, JANELA_FIM_DIAS)).getTime()
  if (dia < inicio || dia > fim) return MSG_FORA_DA_JANELA
  const motivoPrimeiro = motivoIndisponivel(d, bloqueios, feriados)
  if (motivoPrimeiro) return motivoPrimeiro
  const segundo = adicionarDias(d, INTERVALO_SEGUNDO_DIAS)
  const motivoSegundo = motivoIndisponivel(segundo, bloqueios, feriados)
  if (motivoSegundo) {
    return `Segundo leilão (${formatarData(dataLocal(segundo))}) indisponível: ${motivoSegundo}`
  }
  return null
}

export function montarDatas(d: Date): SugestaoOut {
  const primeiro = comHorario(d, HORARIO_LEILAO.hora, HORARIO_LEILAO.minuto)
  return {
    primeiro_leilao_em: primeiro.toISOString(),
    segundo_leilao_em: adicionarDias(primeiro, INTERVALO_SEGUNDO_DIAS).toISOString(),
  }
}

export function sugerirDatas(
  hoje: Date,
  bloqueios: readonly DiaMarcado[],
  feriados: readonly DiaMarcado[],
): SugestaoOut | null {
  for (const d of candidatos(hoje)) {
    if (validarDataManual(d, hoje, bloqueios, feriados) === null) return montarDatas(d)
  }
  return null
}
