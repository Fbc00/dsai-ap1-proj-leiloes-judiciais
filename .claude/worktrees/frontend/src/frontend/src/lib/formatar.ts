const TRACO = '—'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dataCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
const dataHoraCurta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function ouTraco(valor: string | null | undefined): string {
  return valor === null || valor === undefined || valor === '' ? TRACO : valor
}

export function formatarDinheiro(valor: string | null): string {
  if (valor === null || !/^\d+(\.\d+)?$/.test(valor)) return TRACO
  return brl.format(Number(valor)).replace(/ /g, ' ')
}

export function formatarData(iso: string | null): string {
  if (!iso) return TRACO
  const [ano, mes, dia] = iso.split('-').map(Number)
  if (ano === undefined || mes === undefined || dia === undefined) return TRACO
  return dataCurta.format(new Date(ano, mes - 1, dia))
}

export function formatarDataHora(iso: string | null): string {
  if (!iso) return TRACO
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return TRACO
  return dataHoraCurta.format(d).replace(/ /g, ' ')
}
