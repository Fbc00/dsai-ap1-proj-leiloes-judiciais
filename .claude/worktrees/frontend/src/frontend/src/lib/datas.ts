export function dataLocal(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function deDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  if (ano === undefined || mes === undefined || dia === undefined) return new Date(Number.NaN)
  return new Date(ano, mes - 1, dia)
}

export function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function adicionarDias(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function comHorario(d: Date, hora: number, minuto: number): Date {
  const r = inicioDoDia(d)
  r.setHours(hora, minuto, 0, 0)
  return r
}

export function inicioDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function fimDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function adicionarMeses(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function diasDoMes(mes: Date): Date[] {
  const total = fimDoMes(mes).getDate()
  return Array.from({ length: total }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1))
}
