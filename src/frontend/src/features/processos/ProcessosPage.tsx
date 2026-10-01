import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { mensagemErro } from '@/api/client'
import { chavesProcessos, listarProcessos } from '@/api/processos'
import type { ProcessoOut } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { StatusBadge } from '@/components/StatusBadge'
import { useUsuario } from '@/features/auth/useUsuario'
import { formatarDataHora, ouTraco } from '@/lib/formatar'
import { ApagarProcessoDialog } from './ApagarProcessoDialog'
import { UploadProcesso } from './UploadProcesso'

export function ProcessosPage() {
  const { ehAdmin } = useUsuario()
  const [apagando, setApagando] = useState<ProcessoOut | null>(null)
  const { data, isPending, isError, error } = useQuery({
    queryKey: chavesProcessos.lista,
    queryFn: listarProcessos,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Processos</h1>
        <UploadProcesso />
      </div>
      {isPending ? <p className="text-slate-500">Carregando…</p> : null}
      {isError ? <Alerta tipo="erro">{mensagemErro(error)}</Alerta> : null}
      {data && data.length === 0 ? (
        <p className="text-slate-500">Nenhum processo enviado ainda.</p>
      ) : null}
      {data && data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Arquivo</th>
                <th className="px-3 py-2">Nº processo</th>
                <th className="px-3 py-2">Vara</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Recebido em</th>
                {ehAdmin ? <th className="px-3 py-2">Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <Link to={`/processos/${p.id}`} className="text-blue-700 hover:underline">
                      {p.nome_arquivo}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{ouTraco(p.numero_processo)}</td>
                  <td className="px-3 py-2">{ouTraco(p.vara)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2">{formatarDataHora(p.criado_em)}</td>
                  {ehAdmin ? (
                    <td className="px-3 py-2">
                      <Botao variante="perigo" onClick={() => setApagando(p)}>
                        Apagar
                      </Botao>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ApagarProcessoDialog processo={apagando} onFechar={() => setApagando(null)} />
    </div>
  )
}
