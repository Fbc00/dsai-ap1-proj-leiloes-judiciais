import type { EnvioStatus, LeilaoStatus, ProcessoStatus } from '@/api/types'

type Status = ProcessoStatus | LeilaoStatus | EnvioStatus | 'ativo' | 'inativo'

const ESTILOS: Record<Status, string> = {
  recebido: 'bg-slate-100 text-slate-700',
  analisando: 'bg-amber-100 text-amber-800',
  analisado: 'bg-green-100 text-green-800',
  erro: 'bg-red-100 text-red-800',
  agendado: 'bg-blue-100 text-blue-800',
  cancelado: 'bg-slate-200 text-slate-600',
  enviado: 'bg-green-100 text-green-800',
  ativo: 'bg-green-100 text-green-800',
  inativo: 'bg-slate-200 text-slate-600',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ESTILOS[status]}`}
    >
      {status}
    </span>
  )
}
