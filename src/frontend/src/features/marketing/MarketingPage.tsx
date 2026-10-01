import { useQuery } from '@tanstack/react-query'
import { mensagemErro } from '@/api/client'
import { chavesMarketing, listarEnvios, URL_PLANILHA } from '@/api/marketing'
import { Alerta } from '@/components/Alerta'
import { StatusBadge } from '@/components/StatusBadge'
import { formatarDataHora, ouTraco } from '@/lib/formatar'

export function MarketingPage() {
  const envios = useQuery({ queryKey: chavesMarketing.envios, queryFn: listarEnvios })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Marketing</h1>
        <a
          href={URL_PLANILHA}
          download
          className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
        >
          Baixar planilha
        </a>
      </div>
      {envios.isPending ? <p className="text-slate-500">Carregando…</p> : null}
      {envios.isError ? <Alerta tipo="erro">{mensagemErro(envios.error)}</Alerta> : null}
      {envios.data && envios.data.length === 0 ? (
        <p className="text-slate-500">Nenhum envio realizado.</p>
      ) : null}
      {envios.data && envios.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Processo</th>
                <th className="px-3 py-2">Enviado em</th>
                <th className="px-3 py-2">Destinatários</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {envios.data.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{ouTraco(e.numero_processo)}</td>
                  <td className="px-3 py-2">{formatarDataHora(e.enviado_em)}</td>
                  <td className="px-3 py-2">{e.destinatarios.join(', ')}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={e.status} />
                    {e.erro ? <span className="ml-2 text-red-700">{e.erro}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
