import type { ReactNode } from 'react'
import type { Advogado, BemPenhorado, Checklist, Executado, Parte } from '@/api/types'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { formatarData, formatarDinheiro, ouTraco } from '@/lib/formatar'

function simNao(valor: boolean | null): string {
  if (valor === null) return '—'
  return valor ? 'Sim' : 'Não'
}

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2">
      <dt className="w-56 shrink-0 text-sm font-medium text-slate-600">{rotulo}</dt>
      <dd className="text-sm">{valor}</dd>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h3>
      <dl className="flex flex-col gap-1">{children}</dl>
    </section>
  )
}

function Advogados({ advogados }: { advogados: Advogado[] }) {
  if (advogados.length === 0) return <span>—</span>
  return (
    <ul className="list-inside list-disc">
      {advogados.map((a) => (
        <li key={`${a.nome}-${a.oab ?? ''}`}>
          {a.nome}
          {a.oab ? ` — ${a.oab}` : ''}
          {a.ref ? ` (${a.ref})` : ''}
        </li>
      ))}
    </ul>
  )
}

function ParteView({ parte }: { parte: Parte }) {
  return (
    <>
      <Linha rotulo="Nome" valor={parte.nome} />
      <Linha rotulo="CPF/CNPJ" valor={ouTraco(parte.cpf_cnpj)} />
      <Linha rotulo="Advogados" valor={<Advogados advogados={parte.advogados} />} />
    </>
  )
}

function ExecutadoView({ executado }: { executado: Executado }) {
  return (
    <div className="rounded border border-slate-100 p-2">
      <ParteView parte={executado} />
      <Linha rotulo="Citado" valor={simNao(executado.citado)} />
      <Linha rotulo="Forma da citação" valor={ouTraco(executado.citacao_forma)} />
      <Linha rotulo="Ref. citação" valor={ouTraco(executado.citacao_ref)} />
    </div>
  )
}

function BemView({ bem, indice }: { bem: BemPenhorado; indice: number }) {
  return (
    <div className="rounded border border-slate-100 p-2">
      <h4 className="mb-1 text-sm font-semibold">Bem {indice + 1}</h4>
      <Linha rotulo="Descrição" valor={bem.descricao} />
      <Linha rotulo="Matrícula" valor={ouTraco(bem.matricula)} />
      <Linha rotulo="Localização" valor={ouTraco(bem.localizacao)} />
      <Linha rotulo="Data da penhora" valor={formatarData(bem.data_penhora)} />
      <Linha rotulo="Ref. penhora" valor={ouTraco(bem.penhora_ref)} />
      <Linha rotulo="Fiel depositário" valor={ouTraco(bem.fiel_depositario)} />
      <Linha rotulo="Executado intimado" valor={simNao(bem.executado_intimado)} />
      <Linha rotulo="Data da intimação" valor={formatarData(bem.data_intimacao)} />
      <Linha rotulo="Ref. intimação" valor={ouTraco(bem.intimacao_ref)} />
      <Linha rotulo="Propriedade" valor={ouTraco(bem.propriedade)} />
      <Linha rotulo="Avaliação" valor={formatarDinheiro(bem.valor_avaliacao)} />
      <Linha rotulo="Data da avaliação" valor={formatarData(bem.data_avaliacao)} />
      <Linha rotulo="Oficial avaliador" valor={ouTraco(bem.oficial_avaliacao)} />
      <Linha rotulo="Reavaliação" valor={formatarDinheiro(bem.valor_reavaliacao)} />
      <Linha rotulo="Data da reavaliação" valor={formatarData(bem.data_reavaliacao)} />
      <Linha rotulo="Certidão de matrícula" valor={ouTraco(bem.certidao_matricula_ref)} />
      <Linha rotulo="Averbação da penhora" valor={ouTraco(bem.averbacao_penhora)} />
      <Linha rotulo="Hipoteca" valor={ouTraco(bem.hipoteca)} />
      <Linha rotulo="Enfiteuse / aforamento" valor={ouTraco(bem.enfiteuse)} />
      <Linha rotulo="Outras penhoras" valor={ouTraco(bem.outras_penhoras)} />
    </div>
  )
}

type Props = { checklist: Checklist; onEditar: () => void }

export function ChecklistView({ checklist, onEditar }: Props) {
  return (
    <Card
      titulo="Checklist processual"
      acoes={
        <Botao variante="secundario" onClick={onEditar}>
          Editar checklist
        </Botao>
      }
    >
      <div className="flex flex-col gap-5">
        <Secao titulo="Processo">
          <Linha rotulo="Vara" valor={ouTraco(checklist.vara)} />
          <Linha rotulo="Nº do processo" valor={ouTraco(checklist.numero_processo)} />
          <Linha rotulo="Juiz" valor={ouTraco(checklist.juiz)} />
          <Linha rotulo="Tipo de justiça" valor={ouTraco(checklist.tipo_justica)} />
        </Secao>
        <Secao titulo="Exequente">
          <ParteView parte={checklist.exequente} />
        </Secao>
        <Secao titulo="Executados">
          {checklist.executados.length === 0 ? <p className="text-sm">—</p> : null}
          {checklist.executados.map((ex) => (
            <ExecutadoView key={`${ex.nome}-${ex.cpf_cnpj ?? ''}`} executado={ex} />
          ))}
        </Secao>
        <Secao titulo="Execução">
          <Linha rotulo="CDA" valor={ouTraco(checklist.execucao.cda)} />
          <Linha rotulo="Natureza da dívida" valor={ouTraco(checklist.execucao.natureza_divida)} />
          <Linha rotulo="Classe" valor={ouTraco(checklist.execucao.classe)} />
          <Linha
            rotulo="Valor da dívida"
            valor={formatarDinheiro(checklist.execucao.valor_divida)}
          />
          <Linha rotulo="Data" valor={formatarData(checklist.execucao.data_divida)} />
        </Secao>
        <Secao titulo="Penhora">
          {checklist.bens.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum bem penhorado identificado</p>
          ) : null}
          {checklist.bens.map((bem, i) => (
            <BemView key={`${bem.matricula ?? ''}-${bem.descricao}`} bem={bem} indice={i} />
          ))}
        </Secao>
        <Secao titulo="Recursos">
          <Linha rotulo="Recursos" valor={ouTraco(checklist.recursos)} />
        </Secao>
        <Secao titulo="Observações pro leilão">
          {checklist.observacoes_leilao.length === 0 ? <p className="text-sm">—</p> : null}
          {checklist.observacoes_leilao.length > 0 ? (
            <ul className="list-inside list-disc text-sm">
              {checklist.observacoes_leilao.map((obs) => (
                <li key={obs}>{obs}</li>
              ))}
            </ul>
          ) : null}
        </Secao>
      </div>
    </Card>
  )
}
