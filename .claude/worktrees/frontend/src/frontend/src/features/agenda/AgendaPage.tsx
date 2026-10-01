import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { chavesAgenda, listarBloqueios, listarFeriados, listarLeiloes } from '@/api/agenda'
import { mensagemErro } from '@/api/client'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { adicionarMeses, dataLocal, fimDoMes, inicioDoMes } from '@/lib/datas'
import { formatarDataHora } from '@/lib/formatar'
import { BloqueiosCard } from './BloqueiosCard'
import { Calendario } from './Calendario'

const TITULO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

export function AgendaPage() {
  const [mes, setMes] = useState(() => inicioDoMes(new Date()))
  const inicio = dataLocal(mes)
  const fim = dataLocal(fimDoMes(mes))
  const ano = mes.getFullYear()

  const leiloes = useQuery({
    queryKey: chavesAgenda.leiloes(inicio, fim),
    queryFn: () => listarLeiloes({ inicio, fim }),
  })
  const bloqueios = useQuery({ queryKey: chavesAgenda.bloqueios, queryFn: listarBloqueios })
  const feriados = useQuery({
    queryKey: chavesAgenda.feriados(ano),
    queryFn: () => listarFeriados(ano),
  })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Agenda</h1>
      <Card
        titulo={TITULO_MES.format(mes)}
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setMes(adicionarMeses(mes, -1))}>
              Mês anterior
            </Botao>
            <Botao variante="secundario" onClick={() => setMes(adicionarMeses(mes, 1))}>
              Próximo mês
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Calendario
            mes={mes}
            leiloes={leiloes.data ?? []}
            bloqueios={bloqueios.data ?? []}
            feriados={feriados.data ?? []}
          />
          <p className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span className="rounded bg-blue-100 px-2 py-0.5">leilão</span>
            <span className="rounded bg-amber-50 px-2 py-0.5">bloqueio</span>
            <span className="rounded bg-rose-50 px-2 py-0.5">feriado</span>
            <span className="rounded bg-slate-100 px-2 py-0.5">fim de semana</span>
          </p>
          {leiloes.isPending ? <p className="text-sm text-slate-500">Carregando…</p> : null}
          {leiloes.isError ? <Alerta tipo="erro">{mensagemErro(leiloes.error)}</Alerta> : null}
          {feriados.isError ? <Alerta tipo="erro">{mensagemErro(feriados.error)}</Alerta> : null}
          {leiloes.data && leiloes.data.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum leilão neste mês.</p>
          ) : null}
          {leiloes.data && leiloes.data.length > 0 ? (
            <ul className="flex flex-col gap-2 text-sm">
              {leiloes.data.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-3 rounded border border-slate-100 p-2"
                >
                  <span>
                    1º <strong>{formatarDataHora(l.primeiro_leilao_em)}</strong>
                  </span>
                  <span>
                    2º <strong>{formatarDataHora(l.segundo_leilao_em)}</strong>
                  </span>
                  <Link
                    to={`/processos/${l.processo_id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {l.numero_processo ?? 'Processo sem número'}
                  </Link>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
      <BloqueiosCard />
    </div>
  )
}
