import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { mensagemErro } from '@/api/client'
import { analisarProcesso, chavesProcessos, obterProcesso, salvarChecklist } from '@/api/processos'
import type { Checklist } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { AvisoIA } from '@/components/AvisoIA'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { AgendarLeilaoCard } from '@/features/agenda/AgendarLeilaoCard'
import { EditalCard } from '@/features/editais/EditalCard'
import { EnviarMarketingCard } from '@/features/marketing/EnviarMarketingCard'
import { ouTraco } from '@/lib/formatar'
import { ChecklistForm } from './ChecklistForm'
import { ChecklistView } from './ChecklistView'
import { RelatorioView } from './RelatorioView'

export function ProcessoDetalhePage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)

  const consulta = useQuery({
    queryKey: chavesProcessos.detalhe(id),
    queryFn: () => obterProcesso(id),
    enabled: id !== '',
  })

  const analisar = useMutation({
    mutationFn: () => analisarProcesso(id),
    onSuccess: (detalhe) => {
      queryClient.setQueryData(chavesProcessos.detalhe(id), detalhe)
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.lista })
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.detalhe(id) })
    },
  })

  const salvar = useMutation({
    mutationFn: (checklist: Checklist) => salvarChecklist(id, checklist),
    onSuccess: () => {
      setEditando(false)
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.detalhe(id) })
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.lista })
    },
  })

  if (consulta.isPending) return <p className="text-slate-500">Carregando…</p>
  if (consulta.isError) return <Alerta tipo="erro">{mensagemErro(consulta.error)}</Alerta>

  const processo = consulta.data

  function erroDaAnalise(): string | null {
    if (analisar.isError) return mensagemErro(analisar.error)
    if (processo.status === 'erro') return processo.erro
    return null
  }
  const erroAnalise = erroDaAnalise()
  const rotuloAnalisar = processo.checklist ? 'Reanalisar' : 'Analisar'
  const tipoJustica = processo.checklist?.tipo_justica ?? null

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{processo.nome_arquivo}</h1>
          <StatusBadge status={processo.status} />
          {tipoJustica ? (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
              Justiça {tipoJustica}
            </span>
          ) : null}
          <Botao
            className="ml-auto"
            onClick={() => analisar.mutate()}
            disabled={analisar.isPending || processo.status === 'analisando'}
          >
            {analisar.isPending ? 'Analisando…' : rotuloAnalisar}
          </Botao>
        </div>
        <p className="text-sm text-slate-600">
          Processo nº {ouTraco(processo.numero_processo)} · {ouTraco(processo.vara)}
        </p>
        {erroAnalise ? <Alerta tipo="erro">{erroAnalise}</Alerta> : null}
      </header>

      {processo.checklist ? (
        <>
          <AvisoIA />
          {editando ? (
            <ChecklistForm
              inicial={processo.checklist}
              salvando={salvar.isPending}
              erro={salvar.isError ? mensagemErro(salvar.error) : null}
              onSalvar={(c) => salvar.mutate(c)}
              onCancelar={() => setEditando(false)}
            />
          ) : (
            <ChecklistView checklist={processo.checklist} onEditar={() => setEditando(true)} />
          )}
        </>
      ) : (
        <Card titulo="Checklist processual">
          <p className="text-sm text-slate-500">Analise o processo para preencher o checklist.</p>
        </Card>
      )}

      {processo.relatorio ? (
        <>
          <AvisoIA />
          <RelatorioView relatorio={processo.relatorio} />
        </>
      ) : null}

      <AgendarLeilaoCard processo={processo} />
      <EditalCard processo={processo} />
      <EnviarMarketingCard processo={processo} />
    </div>
  )
}
