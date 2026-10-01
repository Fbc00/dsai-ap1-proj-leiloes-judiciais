import { describe, expect, it } from 'vitest'
import { CHECKLIST_EXEMPLO } from '@/api/mocks/fixtures'
import { camposDinheiroInvalidos, dinheiroValido, normalizarVazio } from './validacao'

describe('validacao do checklist', () => {
  it('aceita null, vazio e decimal com duas casas', () => {
    expect(dinheiroValido(null)).toBe(true)
    expect(dinheiroValido('')).toBe(true)
    expect(dinheiroValido('95000.00')).toBe(true)
  })

  it('rejeita vírgula, símbolo, uma casa decimal e texto', () => {
    expect(dinheiroValido('95000,00')).toBe(false)
    expect(dinheiroValido('R$ 95000.00')).toBe(false)
    expect(dinheiroValido('95000.0')).toBe(false)
    expect(dinheiroValido('abc')).toBe(false)
  })

  it('lista os caminhos dos campos inválidos', () => {
    const checklist = structuredClone(CHECKLIST_EXEMPLO)
    checklist.execucao.valor_divida = 'x'
    const bem = checklist.bens[1]
    if (bem) bem.valor_reavaliacao = '1,5'
    expect(camposDinheiroInvalidos(checklist)).toEqual([
      'execucao.valor_divida',
      'bens.1.valor_reavaliacao',
    ])
    expect(camposDinheiroInvalidos(CHECKLIST_EXEMPLO)).toEqual([])
  })

  it('normalizarVazio transforma string em branco em null', () => {
    expect(normalizarVazio('   ')).toBeNull()
    expect(normalizarVazio(' x ')).toBe('x')
  })
})
