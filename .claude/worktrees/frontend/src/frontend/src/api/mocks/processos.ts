import { delay, type HttpHandler, HttpResponse, http } from 'msw'
import type { Checklist } from '@/api/types'
import { db, leilaoAtivo, novoId, type ProcessoMock, toDetalhe, toProcessoOut } from './db'
import { CHECKLIST_EXEMPLO, RELATORIO_EXEMPLO } from './fixtures'
import { erro, exigirAdmin, exigirSessao } from './http'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const ATRASO_ANALISE_MS = import.meta.env.MODE === 'test' ? 0 : 800

function ordenarRecentes(lista: ProcessoMock[]): ProcessoMock[] {
  return [...lista].sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em))
}

export function buscarProcesso(id: string | readonly string[] | undefined): ProcessoMock | null {
  return db.processos.find((p) => p.id === String(id)) ?? null
}

export const processosHandlers: HttpHandler[] = [
  http.get('/api/processos', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    return HttpResponse.json(ordenarRecentes(db.processos).map(toProcessoOut))
  }),

  http.post('/api/processos', async ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const form = await request.formData()
    const arquivo = form.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.type !== 'application/pdf') {
      return erro(415, 'Arquivo deve ser PDF')
    }
    if (arquivo.size > MAX_UPLOAD_BYTES) return erro(413, 'Arquivo excede 50 MB')
    const processo: ProcessoMock = {
      id: novoId('p'),
      nome_arquivo: arquivo.name,
      status: 'recebido',
      numero_processo: null,
      vara: null,
      erro: null,
      criado_em: new Date().toISOString(),
      analisado_em: null,
      checklist: null,
      relatorio: null,
    }
    db.processos.push(processo)
    return HttpResponse.json(toProcessoOut(processo), { status: 201 })
  }),

  http.get('/api/processos/:id', ({ params }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const processo = buscarProcesso(params.id)
    if (!processo) return erro(404, 'Processo não encontrado')
    return HttpResponse.json(toDetalhe(processo))
  }),

  http.post('/api/processos/:id/analisar', async ({ params }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const processo = buscarProcesso(params.id)
    if (!processo) return erro(404, 'Processo não encontrado')
    processo.status = 'analisando'
    await delay(ATRASO_ANALISE_MS)
    if (processo.nome_arquivo.includes('semtexto')) {
      processo.status = 'erro'
      processo.erro = 'PDF sem camada de texto'
      return erro(422, 'PDF sem camada de texto')
    }
    const checklist = structuredClone(CHECKLIST_EXEMPLO)
    processo.checklist = checklist
    processo.relatorio = structuredClone(RELATORIO_EXEMPLO)
    processo.numero_processo = checklist.numero_processo
    processo.vara = checklist.vara
    processo.status = 'analisado'
    processo.erro = null
    processo.analisado_em = new Date().toISOString()
    return HttpResponse.json(toDetalhe(processo))
  }),

  http.put('/api/processos/:id/checklist', async ({ params, request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const processo = buscarProcesso(params.id)
    if (!processo) return erro(404, 'Processo não encontrado')
    const checklist = (await request.json()) as Checklist
    processo.checklist = checklist
    processo.numero_processo = checklist.numero_processo
    processo.vara = checklist.vara
    return HttpResponse.json(checklist)
  }),

  http.delete('/api/processos/:id', ({ params }) => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const processo = buscarProcesso(params.id)
    if (!processo) return erro(404, 'Processo não encontrado')
    if (leilaoAtivo(processo.id)) return erro(409, 'Processo tem leilão agendado')
    db.leiloes = db.leiloes.filter((l) => l.processo_id !== processo.id)
    db.processos = db.processos.filter((p) => p.id !== processo.id)
    return new HttpResponse(null, { status: 204 })
  }),
]
