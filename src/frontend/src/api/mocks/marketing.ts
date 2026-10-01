import { type HttpHandler, HttpResponse, http } from 'msw'
import type { EnvioCreate } from '@/api/types'
import { db, type EnvioMock, MARKETING_EMAILS, novoId, toEnvioOut, toLeilaoOut } from './db'
import { erro, exigirSessao } from './http'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const marketingHandlers: HttpHandler[] = [
  http.get('/api/marketing/envios', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const lista = [...db.envios].sort((a, b) => Date.parse(b.enviado_em) - Date.parse(a.enviado_em))
    return HttpResponse.json(lista.map(toEnvioOut))
  }),

  http.post('/api/marketing/envios', async ({ request }) => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    const body = (await request.json()) as EnvioCreate
    const leilao = db.leiloes.find((l) => l.id === body.leilao_id)
    if (!leilao) return erro(404, 'Leilão não encontrado')
    if (toLeilaoOut(leilao).edital_id === null) return erro(409, 'Gere o edital antes de enviar')
    const envio: EnvioMock = {
      id: novoId('env'),
      leilao_id: leilao.id,
      destinatarios: [...MARKETING_EMAILS],
      enviado_em: new Date().toISOString(),
      status: 'enviado',
      erro: null,
    }
    db.envios.push(envio)
    return HttpResponse.json(toEnvioOut(envio), { status: 201 })
  }),

  http.get('/api/marketing/planilha', () => {
    const bloqueado = exigirSessao()
    if (bloqueado) return bloqueado
    return new HttpResponse(new Blob([], { type: XLSX }), {
      headers: {
        'Content-Type': XLSX,
        'Content-Disposition': 'attachment; filename="leiloes.xlsx"',
      },
    })
  }),
]
