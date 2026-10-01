import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Markdown from 'react-markdown'
import { mensagemErro } from '@/api/client'
import {
  atualizarEdital,
  chavesEditais,
  gerarEdital,
  obterEdital,
  urlDownloadEdital,
} from '@/api/editais'
import { chavesProcessos } from '@/api/processos'
import type { EditalOut, ProcessoDetalheOut } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { AvisoIA } from '@/components/AvisoIA'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { formatarDataHora } from '@/lib/formatar'

type Props = { processo: ProcessoDetalheOut }

const ESTILO_MARKDOWN =
  'text-sm leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5'

type PropsEditor = {
  edital: EditalOut
  salvando: boolean
  erro: string | null
  onSalvar: (conteudo: string) => void
  onCancelar: () => void
}

function EditorEdital({ edital, salvando, erro, onSalvar, onCancelar }: PropsEditor) {
  const [conteudo, setConteudo] = useState(edital.conteudo_markdown)
  const vazio = conteudo.trim() === ''
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Conteúdo do edital em Markdown"
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        rows={20}
        className="w-full rounded border border-slate-300 p-2 font-mono text-xs"
      />
      {erro ? <Alerta tipo="erro">{erro}</Alerta> : null}
      <div className="flex gap-2">
        <Botao onClick={() => onSalvar(conteudo)} disabled={salvando || vazio}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
        <Botao variante="secundario" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Botao>
      </div>
    </div>
  )
}

export function EditalCard({ processo }: Props) {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const leilao = processo.leilao
  const editalId = leilao?.edital_id ?? null

  const edital = useQuery({
    queryKey: chavesEditais.detalhe(editalId ?? ''),
    queryFn: () => obterEdital(editalId ?? ''),
    enabled: editalId !== null,
  })

  const gerar = useMutation({
    mutationFn: () => gerarEdital(leilao?.id ?? ''),
    onSuccess: (novo) => {
      queryClient.setQueryData(chavesEditais.detalhe(novo.id), novo)
      setEditando(false)
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.detalhe(processo.id) })
    },
  })

  const salvar = useMutation({
    mutationFn: (conteudo: string) => atualizarEdital(editalId ?? '', conteudo),
    onSuccess: (atualizado) => {
      queryClient.setQueryData(chavesEditais.detalhe(atualizado.id), atualizado)
      setEditando(false)
    },
  })

  const podeGerar = leilao !== null && leilao.status === 'agendado'
  const rotuloGerar = editalId ? 'Regenerar' : 'Gerar edital'

  return (
    <Card
      titulo="Edital"
      acoes={
        <>
          {edital.data && !editando ? (
            <Botao variante="secundario" onClick={() => setEditando(true)}>
              Editar
            </Botao>
          ) : null}
          <Botao
            onClick={() => gerar.mutate()}
            disabled={!podeGerar || gerar.isPending || editando}
          >
            {gerar.isPending ? 'Gerando…' : rotuloGerar}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!leilao ? (
          <p className="text-sm text-slate-500">Agende o leilão para gerar o edital.</p>
        ) : null}
        {gerar.isError ? <Alerta tipo="erro">{mensagemErro(gerar.error)}</Alerta> : null}
        {editalId !== null && edital.isPending ? (
          <p className="text-sm text-slate-500">Carregando edital…</p>
        ) : null}
        {edital.isError ? <Alerta tipo="erro">{mensagemErro(edital.error)}</Alerta> : null}
        {edital.data ? (
          <>
            <AvisoIA />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <a
                href={urlDownloadEdital(edital.data.id, 'md')}
                download
                className="text-blue-700 underline"
              >
                Baixar .md
              </a>
              <a
                href={urlDownloadEdital(edital.data.id, 'docx')}
                download
                className="text-blue-700 underline"
              >
                Baixar .docx
              </a>
              {edital.data.atualizado_em ? (
                <span className="text-slate-500">
                  Editado em {formatarDataHora(edital.data.atualizado_em)}
                </span>
              ) : null}
            </div>
            {editando ? (
              <EditorEdital
                key={edital.data.id}
                edital={edital.data}
                salvando={salvar.isPending}
                erro={salvar.isError ? mensagemErro(salvar.error) : null}
                onSalvar={(c) => salvar.mutate(c)}
                onCancelar={() => setEditando(false)}
              />
            ) : (
              <article aria-label="Conteúdo do edital" className={ESTILO_MARKDOWN}>
                <Markdown>{edital.data.conteudo_markdown}</Markdown>
              </article>
            )}
          </>
        ) : null}
      </div>
    </Card>
  )
}
