import { type HttpHandler, HttpResponse, http } from 'msw'
import type { EditalCreate, EditalOut, EditalUpdate } from '@/api/types'
import { formatarDataHora, formatarDinheiro } from '@/lib/formatar'
import { db, type LeilaoMock, novoId, type ProcessoMock } from './db'
import { erro, exigirSessao } from './http'

const VAZIO = '______'
const TIPO_MD = 'text/markdown; charset=utf-8'
const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function somaAvaliacoes(processo: ProcessoMock): number {
  const bens = processo.checklist?.bens ?? []
  return bens.reduce(
    (total, bem) => total + Number(bem.valor_reavaliacao ?? bem.valor_avaliacao ?? '0'),
    0,
  )
}

export function gerarMarkdownEdital(processo: ProcessoMock, leilao: LeilaoMock): string {
  const c = processo.checklist
  const bens = c?.bens ?? []
  const avaliacao = somaAvaliacoes(processo)
  const lanceSegundo = avaliacao * 0.7
  const executados =
    c && c.executados.length > 0
      ? c.executados.map((e) => `${e.nome} – CPF/CNPJ: ${e.cpf_cnpj ?? VAZIO}`).join('; ')
      : VAZIO
  const descricoes =
    bens.length === 0
      ? [VAZIO]
      : bens.map((b) => `- ${b.descricao} Matrícula nº ${b.matricula ?? VAZIO}.`)

  return [
    '# EDITAL DE LEILÃO E INTIMAÇÃO',
    '',
    `O Exmo. Sr. Dr. Juiz da ${c?.vara ?? VAZIO}, ${c?.juiz ?? VAZIO}, faz ciência aos interessados e, principalmente, aos executados/devedores do processo de nº ${c?.numero_processo ?? VAZIO}, que venderá, em HASTA PÚBLICA, o bem/lote adiante discriminado:`,
    '',
    `**Valor da execução:** ${formatarDinheiro(c?.execucao.valor_divida ?? null)}`,
    '',
    `**Exequente:** ${c?.exequente.nome ?? VAZIO} – CPF/CNPJ: ${c?.exequente.cpf_cnpj ?? VAZIO}`,
    '',
    `**Executado:** ${executados}`,
    '',
    '## HASTA PÚBLICA',
    '',
    `**Primeiro Leilão**: ${formatarDataHora(leilao.primeiro_leilao_em)}`,
    '',
    `**Segundo Leilão**: ${formatarDataHora(leilao.segundo_leilao_em)}`,
    '',
    '**Local**: Os leilões serão realizados on-line, no site www.norteleiloes.com.br, de domínio do leiloeiro nomeado, Sr. Sandro de Oliveira, JUCEPA nº 20070555214. Telefone: (91) 99125-0028.',
    '',
    '## DESCRIÇÃO DO BEM',
    '',
    ...descricoes,
    '',
    `**Última avaliação**: ${formatarDinheiro(avaliacao.toFixed(2))}`,
    '',
    `**Lance Inicial em 1º Leilão**: ${formatarDinheiro(avaliacao.toFixed(2))}`,
    '',
    `**Lance Inicial em 2º Leilão**: ${formatarDinheiro(lanceSegundo.toFixed(2))}`,
  ].join('\n')
}

function buscarEdital(id: string | readonly string[] | undefined): EditalOut | null {
  return db.editais.find((e) => e.id === String(id)) ?? null
}

function nomeArquivo(edital: EditalOut, extensao: string): string {
  const processo = db.processos.find((p) => p.id === edital.processo_id)
  return `edital-${processo?.numero_processo ?? edital.id}.${extensao}`
}

export const editaisHandlers: HttpHandler[] = [
  http.post('/api/editais', async ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const body = (await request.json()) as EditalCreate
    const leilao = db.leiloes.find((l) => l.id === body.leilao_id)
    if (!leilao) return erro(404, 'Leilão não encontrado')
    if (leilao.status === 'cancelado') return erro(409, 'Leilão cancelado')
    const processo = db.processos.find((p) => p.id === leilao.processo_id)
    if (!processo) return erro(404, 'Processo não encontrado')
    const edital: EditalOut = {
      id: novoId('e'),
      leilao_id: leilao.id,
      processo_id: processo.id,
      conteudo_markdown: gerarMarkdownEdital(processo, leilao),
      criado_em: new Date().toISOString(),
      atualizado_em: null,
    }
    db.editais.push(edital)
    return HttpResponse.json(edital, { status: 201 })
  }),

  http.get('/api/editais/:id', ({ params }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const edital = buscarEdital(params.id)
    return edital ? HttpResponse.json(edital) : erro(404, 'Edital não encontrado')
  }),

  http.put('/api/editais/:id', async ({ params, request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const edital = buscarEdital(params.id)
    if (!edital) return erro(404, 'Edital não encontrado')
    const body = (await request.json()) as EditalUpdate
    if (body.conteudo_markdown.trim() === '')
      return erro(422, 'Conteúdo do edital não pode ser vazio')
    edital.conteudo_markdown = body.conteudo_markdown
    edital.atualizado_em = new Date().toISOString()
    return HttpResponse.json(edital)
  }),

  http.get('/api/editais/:id/download', ({ params, request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const edital = buscarEdital(params.id)
    if (!edital) return erro(404, 'Edital não encontrado')
    const formato = new URL(request.url).searchParams.get('formato') ?? 'md'
    if (formato === 'md') {
      return new HttpResponse(edital.conteudo_markdown, {
        headers: {
          'Content-Type': TIPO_MD,
          'Content-Disposition': `attachment; filename="${nomeArquivo(edital, 'md')}"`,
        },
      })
    }
    if (formato === 'docx') {
      return new HttpResponse(new Blob([], { type: TIPO_DOCX }), {
        headers: {
          'Content-Type': TIPO_DOCX,
          'Content-Disposition': `attachment; filename="${nomeArquivo(edital, 'docx')}"`,
        },
      })
    }
    return erro(422, 'Formato inválido')
  }),
]
