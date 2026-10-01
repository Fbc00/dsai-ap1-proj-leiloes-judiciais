import { type FormEvent, useState } from 'react'
import type { BemPenhorado, Checklist, Execucao } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { Field } from '@/components/Field'
import { camposDinheiroInvalidos, normalizarVazio } from './validacao'

const INPUT = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm'
const MSG_DINHEIRO = 'Use o formato 1234.56'

type Props = {
  inicial: Checklist
  salvando: boolean
  erro: string | null
  onSalvar: (checklist: Checklist) => void
  onCancelar: () => void
}

type CampoTexto = {
  id: string
  label: string
  valor: string | null
  onChange: (valor: string | null) => void
  erro?: string
  multilinha?: boolean
}

function Texto({ id, label, valor, onChange, erro, multilinha = false }: CampoTexto) {
  const aoDigitar = (texto: string) => onChange(texto === '' ? null : texto)
  const aoSair = (texto: string) => onChange(normalizarVazio(texto))
  return (
    <Field label={label} htmlFor={id} erro={erro}>
      {multilinha ? (
        <textarea
          id={id}
          value={valor ?? ''}
          onChange={(e) => aoDigitar(e.target.value)}
          onBlur={(e) => aoSair(e.target.value)}
          rows={3}
          className={INPUT}
        />
      ) : (
        <input
          id={id}
          value={valor ?? ''}
          onChange={(e) => aoDigitar(e.target.value)}
          onBlur={(e) => aoSair(e.target.value)}
          className={INPUT}
        />
      )}
    </Field>
  )
}

export function ChecklistForm({ inicial, salvando, erro, onSalvar, onCancelar }: Props) {
  const [checklist, setChecklist] = useState<Checklist>(() => structuredClone(inicial))
  const invalidos = camposDinheiroInvalidos(checklist)

  function atualizar(patch: Partial<Checklist>) {
    setChecklist((atual) => ({ ...atual, ...patch }))
  }

  function atualizarExecucao(patch: Partial<Execucao>) {
    setChecklist((atual) => ({ ...atual, execucao: { ...atual.execucao, ...patch } }))
  }

  function atualizarBem(indice: number, patch: Partial<BemPenhorado>) {
    setChecklist((atual) => ({
      ...atual,
      bens: atual.bens.map((bem, i) => (i === indice ? { ...bem, ...patch } : bem)),
    }))
  }

  function erroDe(caminho: string): string | undefined {
    return invalidos.includes(caminho) ? MSG_DINHEIRO : undefined
  }

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (invalidos.length > 0) return
    onSalvar(checklist)
  }

  return (
    <Card titulo="Editar checklist">
      <form onSubmit={aoEnviar} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Texto
            id="vara"
            label="Vara"
            valor={checklist.vara}
            onChange={(v) => atualizar({ vara: v })}
          />
          <Texto
            id="numero_processo"
            label="Nº do processo"
            valor={checklist.numero_processo}
            onChange={(v) => atualizar({ numero_processo: v })}
          />
          <Texto
            id="juiz"
            label="Juiz"
            valor={checklist.juiz}
            onChange={(v) => atualizar({ juiz: v })}
          />
          <Texto
            id="exequente_nome"
            label="Exequente — nome"
            valor={checklist.exequente.nome}
            onChange={(v) => atualizar({ exequente: { ...checklist.exequente, nome: v ?? '' } })}
          />
          <Texto
            id="exequente_cpf_cnpj"
            label="Exequente — CPF/CNPJ"
            valor={checklist.exequente.cpf_cnpj}
            onChange={(v) => atualizar({ exequente: { ...checklist.exequente, cpf_cnpj: v } })}
          />
          <Texto
            id="execucao_cda"
            label="CDA"
            valor={checklist.execucao.cda}
            onChange={(v) => atualizarExecucao({ cda: v })}
          />
          <Texto
            id="execucao_natureza"
            label="Natureza da dívida"
            valor={checklist.execucao.natureza_divida}
            onChange={(v) => atualizarExecucao({ natureza_divida: v })}
          />
          <Texto
            id="execucao_classe"
            label="Classe"
            valor={checklist.execucao.classe}
            onChange={(v) => atualizarExecucao({ classe: v })}
          />
          <Texto
            id="execucao_valor_divida"
            label="Valor da dívida (R$)"
            valor={checklist.execucao.valor_divida}
            onChange={(v) => atualizarExecucao({ valor_divida: v })}
            erro={erroDe('execucao.valor_divida')}
          />
          <Field label="Data da dívida" htmlFor="execucao_data_divida">
            <input
              id="execucao_data_divida"
              type="date"
              value={checklist.execucao.data_divida ?? ''}
              onChange={(e) => atualizarExecucao({ data_divida: normalizarVazio(e.target.value) })}
              className={INPUT}
            />
          </Field>
        </div>

        {checklist.bens.map((bem, i) => (
          <fieldset
            key={`${bem.matricula ?? 'sem-matricula'}-${bem.penhora_ref ?? ''}-${bem.descricao.slice(0, 32)}`}
            className="grid gap-3 rounded border border-slate-200 p-3 sm:grid-cols-2"
          >
            <legend className="px-1 text-sm font-semibold">Bem {i + 1}</legend>
            <div className="sm:col-span-2">
              <Texto
                id={`bem_${i}_descricao`}
                label={`Bem ${i + 1} — descrição`}
                valor={bem.descricao}
                onChange={(v) => atualizarBem(i, { descricao: v ?? '' })}
                multilinha
              />
            </div>
            <Texto
              id={`bem_${i}_matricula`}
              label={`Bem ${i + 1} — matrícula`}
              valor={bem.matricula}
              onChange={(v) => atualizarBem(i, { matricula: v })}
            />
            <Texto
              id={`bem_${i}_localizacao`}
              label={`Bem ${i + 1} — localização`}
              valor={bem.localizacao}
              onChange={(v) => atualizarBem(i, { localizacao: v })}
            />
            <Texto
              id={`bem_${i}_fiel_depositario`}
              label={`Bem ${i + 1} — fiel depositário`}
              valor={bem.fiel_depositario}
              onChange={(v) => atualizarBem(i, { fiel_depositario: v })}
            />
            <Texto
              id={`bem_${i}_valor_avaliacao`}
              label={`Bem ${i + 1} — avaliação (R$)`}
              valor={bem.valor_avaliacao}
              onChange={(v) => atualizarBem(i, { valor_avaliacao: v })}
              erro={erroDe(`bens.${i}.valor_avaliacao`)}
            />
            <Texto
              id={`bem_${i}_valor_reavaliacao`}
              label={`Bem ${i + 1} — reavaliação (R$)`}
              valor={bem.valor_reavaliacao}
              onChange={(v) => atualizarBem(i, { valor_reavaliacao: v })}
              erro={erroDe(`bens.${i}.valor_reavaliacao`)}
            />
          </fieldset>
        ))}

        <Texto
          id="recursos"
          label="Recursos"
          valor={checklist.recursos}
          onChange={(v) => atualizar({ recursos: v })}
          multilinha
        />

        {erro ? <Alerta tipo="erro">{erro}</Alerta> : null}

        <div className="flex gap-2">
          <Botao type="submit" disabled={salvando || invalidos.length > 0}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Botao>
          <Botao variante="secundario" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Botao>
        </div>
      </form>
    </Card>
  )
}
