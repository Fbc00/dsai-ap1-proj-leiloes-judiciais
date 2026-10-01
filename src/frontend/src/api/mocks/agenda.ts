import { type HttpHandler, HttpResponse, http } from 'msw'
import type { BloqueioCreate, LeilaoCreate } from '@/api/types'
import { dataLocal, deDataLocal } from '@/lib/datas'
import { db, type LeilaoMock, leilaoAtivo, novoId, toLeilaoOut } from './db'
import { FERIADOS, feriadosDoAno } from './feriados'
import { erro, exigirAdmin, exigirSessao } from './http'
import { montarDatas, sugerirDatas, validarDataManual } from './regrasAgenda'

const SEM_DATA = 'Sem data disponível entre 30 e 45 dias'

function noIntervalo(iso: string, inicio: string | null, fim: string | null): boolean {
  const dia = dataLocal(new Date(iso))
  return (inicio === null || dia >= inicio) && (fim === null || dia <= fim)
}

export const agendaHandlers: HttpHandler[] = [
  http.get('/api/agenda/leiloes', ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const url = new URL(request.url)
    const inicio = url.searchParams.get('inicio')
    const fim = url.searchParams.get('fim')
    const lista = db.leiloes
      .filter(
        (l) =>
          noIntervalo(l.primeiro_leilao_em, inicio, fim) ||
          noIntervalo(l.segundo_leilao_em, inicio, fim),
      )
      .sort((a, b) => Date.parse(a.primeiro_leilao_em) - Date.parse(b.primeiro_leilao_em))
    return HttpResponse.json(lista.map(toLeilaoOut))
  }),

  http.get('/api/agenda/sugestao', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const sugestao = sugerirDatas(new Date(), db.bloqueios, FERIADOS)
    return sugestao ? HttpResponse.json(sugestao) : erro(409, SEM_DATA)
  }),

  http.get('/api/agenda/feriados', ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const param = new URL(request.url).searchParams.get('ano')
    const ano = param ? Number(param) : new Date().getFullYear()
    if (Number.isNaN(ano)) return erro(422, 'Ano inválido')
    return HttpResponse.json(feriadosDoAno(ano))
  }),

  http.post('/api/agenda/leiloes', async ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const body = (await request.json()) as LeilaoCreate
    const processo = db.processos.find((p) => p.id === body.processo_id)
    if (!processo) return erro(404, 'Processo não encontrado')
    if (processo.status !== 'analisado') return erro(409, 'Processo ainda não foi analisado')
    if (leilaoAtivo(processo.id)) return erro(409, 'Processo já tem leilão agendado')

    let datas: ReturnType<typeof montarDatas>
    if (body.primeiro_leilao_data) {
      const dia = deDataLocal(body.primeiro_leilao_data)
      if (Number.isNaN(dia.getTime())) return erro(422, 'Data inválida')
      const motivo = validarDataManual(dia, new Date(), db.bloqueios, FERIADOS)
      if (motivo) return erro(422, motivo)
      datas = montarDatas(dia)
    } else {
      const sugestao = sugerirDatas(new Date(), db.bloqueios, FERIADOS)
      if (!sugestao) return erro(409, SEM_DATA)
      datas = sugestao
    }

    const leilao: LeilaoMock = {
      id: novoId('l'),
      processo_id: processo.id,
      primeiro_leilao_em: datas.primeiro_leilao_em,
      segundo_leilao_em: datas.segundo_leilao_em,
      status: 'agendado',
      criado_em: new Date().toISOString(),
    }
    db.leiloes.push(leilao)
    return HttpResponse.json(toLeilaoOut(leilao), { status: 201 })
  }),

  http.delete('/api/agenda/leiloes/:id', ({ params }) => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const leilao = db.leiloes.find((l) => l.id === String(params.id))
    if (!leilao) return erro(404, 'Leilão não encontrado')
    leilao.status = 'cancelado'
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('/api/agenda/bloqueios', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    return HttpResponse.json([...db.bloqueios].sort((a, b) => a.data.localeCompare(b.data)))
  }),

  http.post('/api/agenda/bloqueios', async ({ request }) => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const body = (await request.json()) as BloqueioCreate
    if (db.bloqueios.some((b) => b.data === body.data))
      return erro(409, 'Já existe bloqueio nesta data')
    const novo = { id: novoId('b'), data: body.data, motivo: body.motivo }
    db.bloqueios.push(novo)
    return HttpResponse.json(novo, { status: 201 })
  }),

  http.delete('/api/agenda/bloqueios/:id', ({ params }) => {
    const bloqueado = exigirAdmin()
    if (bloqueado) return bloqueado
    const existe = db.bloqueios.some((b) => b.id === String(params.id))
    if (!existe) return erro(404, 'Bloqueio não encontrado')
    db.bloqueios = db.bloqueios.filter((b) => b.id !== String(params.id))
    return new HttpResponse(null, { status: 204 })
  }),
]
