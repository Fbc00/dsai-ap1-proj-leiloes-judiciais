import { describe, expect, it } from 'vitest'
import { adicionarDias, dataLocal } from '@/lib/datas'
import { FERIADOS } from './feriados'
import {
  candidatos,
  type DiaMarcado,
  motivoIndisponivel,
  sugerirDatas,
  validarDataManual,
} from './regrasAgenda'

const HOJE = new Date(2026, 9, 1, 12)
const SEM_BLOQUEIO: DiaMarcado[] = []

function diaDe(iso: string | undefined): string | null {
  return iso ? dataLocal(new Date(iso)) : null
}

describe('candidatos', () => {
  it('são os 16 dias corridos de hoje+30 a hoje+45', () => {
    const lista = candidatos(HOJE)
    expect(lista).toHaveLength(16)
    expect(dataLocal(lista[0] ?? new Date(0))).toBe('2026-10-31')
    expect(dataLocal(lista[15] ?? new Date(0))).toBe('2026-11-15')
  })
})

describe('motivoIndisponivel', () => {
  it('fim de semana', () => {
    expect(motivoIndisponivel(new Date(2026, 10, 7), SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data não é dia útil',
    )
  })

  it('feriado automático com o nome', () => {
    expect(motivoIndisponivel(new Date(2026, 10, 20), SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data é feriado: Consciência Negra',
    )
  })

  it('bloqueio manual com o motivo', () => {
    const bloqueios: DiaMarcado[] = [{ data: '2026-11-27', motivo: 'Recesso interno' }]
    expect(motivoIndisponivel(new Date(2026, 10, 27), bloqueios, FERIADOS)).toBe(
      'Data bloqueada: Recesso interno',
    )
  })

  it('dia útil livre devolve null', () => {
    expect(motivoIndisponivel(new Date(2026, 10, 3), SEM_BLOQUEIO, FERIADOS)).toBeNull()
  })
})

describe('sugerirDatas', () => {
  it('pula fim de semana e feriado: 31/10 sáb, 01/11 dom, 02/11 Finados → 03/11 e 10/11 às 10h', () => {
    const s = sugerirDatas(HOJE, SEM_BLOQUEIO, FERIADOS)
    expect(diaDe(s?.primeiro_leilao_em)).toBe('2026-11-03')
    expect(diaDe(s?.segundo_leilao_em)).toBe('2026-11-10')
    expect(new Date(s?.primeiro_leilao_em ?? '').getHours()).toBe(10)
    expect(new Date(s?.segundo_leilao_em ?? '').getHours()).toBe(10)
  })

  it('pula data bloqueada', () => {
    const s = sugerirDatas(HOJE, [{ data: '2026-11-03', motivo: 'x' }], FERIADOS)
    expect(diaDe(s?.primeiro_leilao_em)).toBe('2026-11-04')
  })

  it('exige D+7 livre: bloqueio em 10/11 descarta 03/11', () => {
    const s = sugerirDatas(HOJE, [{ data: '2026-11-10', motivo: 'x' }], FERIADOS)
    expect(diaDe(s?.primeiro_leilao_em)).toBe('2026-11-04')
    expect(diaDe(s?.segundo_leilao_em)).toBe('2026-11-11')
  })

  it('sem dia livre na janela devolve null', () => {
    const bloqueios = candidatos(HOJE).map((d) => ({ data: dataLocal(d), motivo: 'Recesso' }))
    expect(sugerirDatas(HOJE, bloqueios, FERIADOS)).toBeNull()
  })
})

describe('validarDataManual', () => {
  it('fora da janela de 30 a 45 dias (antes e depois)', () => {
    expect(validarDataManual(new Date(2026, 9, 10), HOJE, SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data fora da janela de 30 a 45 dias',
    )
    expect(validarDataManual(new Date(2026, 10, 20), HOJE, SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data fora da janela de 30 a 45 dias',
    )
  })

  it('feriado dentro da janela', () => {
    expect(validarDataManual(new Date(2026, 10, 2), HOJE, SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data é feriado: Finados',
    )
  })

  it('segundo leilão indisponível cita a data e o motivo', () => {
    const bloqueios: DiaMarcado[] = [{ data: '2026-11-10', motivo: 'Recesso' }]
    expect(validarDataManual(new Date(2026, 10, 3), HOJE, bloqueios, FERIADOS)).toBe(
      'Segundo leilão (10/11/2026) indisponível: Data bloqueada: Recesso',
    )
  })

  it('data válida devolve null; hoje+45 ainda está na janela', () => {
    expect(validarDataManual(new Date(2026, 10, 3), HOJE, SEM_BLOQUEIO, FERIADOS)).toBeNull()
    expect(validarDataManual(adicionarDias(HOJE, 45), HOJE, SEM_BLOQUEIO, FERIADOS)).toBe(
      'Data não é dia útil',
    )
  })
})
