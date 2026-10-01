import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { agendarLeilao, cancelarLeilao, chavesAgenda, obterSugestao } from '@/api/agenda'
import { mensagemErro } from '@/api/client'
import { chavesProcessos } from '@/api/processos'
import type { LeilaoCreate, LeilaoOut, ProcessoDetalheOut } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { Field } from '@/components/Field'
import { StatusBadge } from '@/components/StatusBadge'
import { useUsuario } from '@/features/auth/useUsuario'
import { formatarDataHora } from '@/lib/formatar'

type Props = { processo: ProcessoDetalheOut }

type PropsAgendado = {
  leilao: LeilaoOut
  podeCancelar: boolean
  onCancelar: () => void
  cancelando: boolean
  erro: string | null
}

function LeilaoAgendado({ leilao, podeCancelar, onCancelar, cancelando, erro }: PropsAgendado) {
  return (
    <Card
      titulo="Leilão"
      acoes={
        podeCancelar ? (
          <Botao variante="perigo" onClick={onCancelar} disabled={cancelando}>
            Cancelar leilão
          </Botao>
        ) : undefined
      }
    >
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-32 font-medium text-slate-600">1º leilão</dt>
          <dd>{formatarDataHora(leilao.primeiro_leilao_em)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 font-medium text-slate-600">2º leilão</dt>
          <dd>{formatarDataHora(leilao.segundo_leilao_em)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-32 font-medium text-slate-600">Status</dt>
          <dd>
            <StatusBadge status={leilao.status} />
          </dd>
        </div>
      </dl>
      {erro ? <Alerta tipo="erro">{erro}</Alerta> : null}
    </Card>
  )
}

export function AgendarLeilaoCard({ processo }: Props) {
  const queryClient = useQueryClient()
  const { ehAdmin } = useUsuario()
  const [manual, setManual] = useState(false)
  const [dataManual, setDataManual] = useState('')
  const podeAgendar = processo.status === 'analisado' && processo.leilao === null

  const sugestao = useQuery({
    queryKey: chavesAgenda.sugestao,
    queryFn: obterSugestao,
    enabled: podeAgendar,
    retry: false,
    staleTime: 0,
  })

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chavesProcessos.detalhe(processo.id) })
    void queryClient.invalidateQueries({ queryKey: chavesAgenda.raiz })
  }

  const agendar = useMutation({ mutationFn: agendarLeilao, onSuccess: invalidar })
  const cancelar = useMutation({ mutationFn: cancelarLeilao, onSuccess: invalidar })

  if (processo.leilao) {
    const leilao = processo.leilao
    return (
      <LeilaoAgendado
        leilao={leilao}
        podeCancelar={ehAdmin}
        onCancelar={() => cancelar.mutate(leilao.id)}
        cancelando={cancelar.isPending}
        erro={cancelar.isError ? mensagemErro(cancelar.error) : null}
      />
    )
  }

  if (processo.status !== 'analisado') {
    return (
      <Card titulo="Leilão">
        <p className="text-sm text-slate-500">Analise o processo antes de agendar.</p>
      </Card>
    )
  }

  function confirmar() {
    const dados: LeilaoCreate = { processo_id: processo.id }
    if (manual && dataManual !== '') dados.primeiro_leilao_data = dataManual
    agendar.mutate(dados)
  }

  const podeConfirmar = manual ? dataManual !== '' : sugestao.isSuccess

  return (
    <Card titulo="Agendar leilão">
      <div className="flex flex-col gap-3 text-sm">
        {sugestao.isPending ? <p className="text-slate-500">Buscando data disponível…</p> : null}
        {sugestao.isError ? <Alerta tipo="erro">{mensagemErro(sugestao.error)}</Alerta> : null}
        {sugestao.data && !manual ? (
          <p>
            Sugestão: 1º leilão em{' '}
            <strong>{formatarDataHora(sugestao.data.primeiro_leilao_em)}</strong>, 2º leilão em{' '}
            <strong>{formatarDataHora(sugestao.data.segundo_leilao_em)}</strong>.
          </p>
        ) : null}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          Escolher outra data
        </label>
        {manual ? (
          <Field label="Data do 1º leilão" htmlFor="data_manual">
            <input
              id="data_manual"
              type="date"
              value={dataManual}
              onChange={(e) => setDataManual(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5"
            />
          </Field>
        ) : null}
        {manual ? (
          <p className="text-slate-500">O horário é fixo (10:00) e o 2º leilão é 7 dias depois.</p>
        ) : null}
        {agendar.isError ? <Alerta tipo="erro">{mensagemErro(agendar.error)}</Alerta> : null}
        <div>
          <Botao onClick={confirmar} disabled={!podeConfirmar || agendar.isPending}>
            Agendar
          </Botao>
        </div>
      </div>
    </Card>
  )
}
