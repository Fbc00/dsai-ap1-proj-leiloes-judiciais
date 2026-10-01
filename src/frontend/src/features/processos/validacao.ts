import type { Checklist } from '@/api/types'

export const PADRAO_DINHEIRO = /^\d+\.\d{2}$/

export function dinheiroValido(valor: string | null): boolean {
  return valor === null || valor === '' || PADRAO_DINHEIRO.test(valor)
}

export function camposDinheiroInvalidos(checklist: Checklist): string[] {
  const invalidos: string[] = []
  if (!dinheiroValido(checklist.execucao.valor_divida)) invalidos.push('execucao.valor_divida')
  for (const [i, bem] of checklist.bens.entries()) {
    if (!dinheiroValido(bem.valor_avaliacao)) invalidos.push(`bens.${i}.valor_avaliacao`)
    if (!dinheiroValido(bem.valor_reavaliacao)) invalidos.push(`bens.${i}.valor_reavaliacao`)
  }
  return invalidos
}

export function normalizarVazio(valor: string): string | null {
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}
