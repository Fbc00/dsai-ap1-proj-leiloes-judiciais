import { screen } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { erro } from '@/api/mocks/http'
import { server } from '@/api/mocks/server'
import { renderComRouter } from '@/test/render'

function comEdital() {
  db.editais.push({
    id: 'e-1',
    leilao_id: 'l-1',
    processo_id: 'p-1',
    conteudo_markdown: '# Edital',
    criado_em: '2026-09-22T10:00:00-03:00',
    atualizado_em: null,
  })
}

describe('EnviarMarketingCard', () => {
  beforeEach(() => logar('operador'))

  it('sem edital o botão fica desabilitado com orientação', async () => {
    renderComRouter('/processos/p-1')
    expect(
      await screen.findByText('Gere o edital para liberar o envio da planilha.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar pra marketing' })).toBeDisabled()
  })

  it('envio ok mostra destinatários e registra na lista de envios', async () => {
    comEdital()
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Enviar pra marketing' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enviado para marketing@exemplo.com.br',
    )
    expect(db.envios).toHaveLength(1)
    expect(db.envios[0]?.status).toBe('enviado')
  })

  it('409 do servidor aparece no card', async () => {
    comEdital()
    server.use(http.post('/api/marketing/envios', () => erro(409, 'Gere o edital antes de enviar')))
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Enviar pra marketing' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Gere o edital antes de enviar')
  })
})
