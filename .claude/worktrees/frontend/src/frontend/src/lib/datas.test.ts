import { describe, expect, it } from 'vitest'
import {
  adicionarDias,
  adicionarMeses,
  comHorario,
  dataLocal,
  deDataLocal,
  diasDoMes,
  fimDoMes,
  inicioDoMes,
} from './datas'

describe('datas', () => {
  it('dataLocal formata no fuso local sem deslocar dia', () => {
    expect(dataLocal(new Date(2026, 10, 5, 23, 59))).toBe('2026-11-05')
    expect(dataLocal(new Date('2026-11-05T13:00:00Z'))).toBe('2026-11-05')
  })

  it('deDataLocal devolve meia-noite local e é inversa de dataLocal', () => {
    const d = deDataLocal('2026-11-05')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(10)
    expect(d.getDate()).toBe(5)
    expect(d.getHours()).toBe(0)
    expect(dataLocal(d)).toBe('2026-11-05')
  })

  it('adicionarDias atravessa mês', () => {
    expect(dataLocal(adicionarDias(new Date(2026, 9, 31), 2))).toBe('2026-11-02')
  })

  it('comHorario fixa hora e zera segundos', () => {
    const d = comHorario(new Date(2026, 10, 2, 17, 45, 30), 10, 0)
    expect(d.getHours()).toBe(10)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
  })

  it('inicioDoMes, fimDoMes, adicionarMeses e diasDoMes', () => {
    expect(dataLocal(inicioDoMes(new Date(2026, 9, 15)))).toBe('2026-10-01')
    expect(dataLocal(fimDoMes(new Date(2026, 1, 10)))).toBe('2026-02-28')
    expect(dataLocal(adicionarMeses(new Date(2026, 11, 20), 1))).toBe('2027-01-01')
    const dias = diasDoMes(new Date(2026, 10, 1))
    expect(dias).toHaveLength(30)
    expect(dataLocal(dias[0] ?? new Date(0))).toBe('2026-11-01')
    expect(dataLocal(dias[29] ?? new Date(0))).toBe('2026-11-30')
  })
})
