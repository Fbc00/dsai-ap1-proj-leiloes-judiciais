export type Feriado = { data: string; motivo: string }

export const FERIADOS: readonly Feriado[] = [
  { data: '2026-01-01', motivo: 'Confraternização Universal' },
  { data: '2026-02-16', motivo: 'Carnaval' },
  { data: '2026-02-17', motivo: 'Carnaval' },
  { data: '2026-04-03', motivo: 'Sexta-feira Santa' },
  { data: '2026-04-21', motivo: 'Tiradentes' },
  { data: '2026-05-01', motivo: 'Dia do Trabalhador' },
  { data: '2026-06-04', motivo: 'Corpus Christi' },
  { data: '2026-08-15', motivo: 'Adesão do Pará' },
  { data: '2026-09-07', motivo: 'Independência' },
  { data: '2026-10-12', motivo: 'Nossa Senhora Aparecida' },
  { data: '2026-11-02', motivo: 'Finados' },
  { data: '2026-11-15', motivo: 'Proclamação da República' },
  { data: '2026-11-20', motivo: 'Consciência Negra' },
  { data: '2026-12-25', motivo: 'Natal' },
  { data: '2027-01-01', motivo: 'Confraternização Universal' },
  { data: '2027-02-08', motivo: 'Carnaval' },
  { data: '2027-02-09', motivo: 'Carnaval' },
  { data: '2027-03-26', motivo: 'Sexta-feira Santa' },
  { data: '2027-04-21', motivo: 'Tiradentes' },
  { data: '2027-05-01', motivo: 'Dia do Trabalhador' },
  { data: '2027-05-27', motivo: 'Corpus Christi' },
  { data: '2027-08-15', motivo: 'Adesão do Pará' },
  { data: '2027-09-07', motivo: 'Independência' },
  { data: '2027-10-12', motivo: 'Nossa Senhora Aparecida' },
  { data: '2027-11-02', motivo: 'Finados' },
  { data: '2027-11-15', motivo: 'Proclamação da República' },
  { data: '2027-11-20', motivo: 'Consciência Negra' },
  { data: '2027-12-25', motivo: 'Natal' },
]

export function feriadosDoAno(ano: number): Feriado[] {
  return FERIADOS.filter((f) => f.data.startsWith(`${ano}-`))
}
