import { describe, expect, it } from 'vitest'
import { formatarData, formatarDataHora, formatarDinheiro, ouTraco } from './formatar'

describe('formatar', () => {
  it('dinheiro string decimal vira BRL', () => {
    expect(formatarDinheiro('95000.00')).toBe('R$ 95.000,00')
    expect(formatarDinheiro('1234.5')).toBe('R$ 1.234,50')
  })

  it('dinheiro nulo ou inválido vira traço', () => {
    expect(formatarDinheiro(null)).toBe('—')
    expect(formatarDinheiro('abc')).toBe('—')
  })

  it('datetime ISO com offset mostra dia e hora no fuso America/Belem', () => {
    expect(formatarDataHora('2026-11-05T10:00:00-03:00')).toBe('05/11/2026, 10:00')
    expect(formatarDataHora('2026-11-05T13:00:00Z')).toBe('05/11/2026, 10:00')
  })

  it('data YYYY-MM-DD não desloca o dia', () => {
    expect(formatarData('2025-10-24')).toBe('24/10/2025')
    expect(formatarData(null)).toBe('—')
  })

  it('ouTraco', () => {
    expect(ouTraco(null)).toBe('—')
    expect(ouTraco(undefined)).toBe('—')
    expect(ouTraco('')).toBe('—')
    expect(ouTraco('x')).toBe('x')
  })
})
