import type { Relatorio } from '@/api/types'
import { Card } from '@/components/Card'
import { formatarData } from '@/lib/formatar'

export function RelatorioView({ relatorio }: { relatorio: Relatorio }) {
  return (
    <Card titulo="Relatório">
      <p className="mb-3 text-sm leading-relaxed">{relatorio.resumo}</p>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Etapas</h3>
      <ol
        aria-label="Etapas do processo"
        className="flex flex-col gap-2 border-l-2 border-slate-200 pl-4"
      >
        {relatorio.etapas.map((etapa) => (
          <li key={`${etapa.data ?? ''}-${etapa.descricao}`} className="text-sm">
            <span className="font-medium">{formatarData(etapa.data)}</span>
            {' — '}
            {etapa.descricao}
            {etapa.ref ? <span className="text-slate-500"> ({etapa.ref})</span> : null}
          </li>
        ))}
      </ol>
    </Card>
  )
}
