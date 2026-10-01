import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

describe('MarketingPage', () => {
  beforeEach(() => logar('operador'))

  it('lista envios com processo, destinatários e status, e link da planilha', async () => {
    db.envios.push({
      id: 'env-1',
      leilao_id: 'l-1',
      destinatarios: ['marketing@exemplo.com.br'],
      enviado_em: '2026-09-23T15:30:00-03:00',
      status: 'enviado',
      erro: null,
    })
    renderComRouter('/marketing')
    expect(await screen.findByText('1003966-15.2022.4.01.4301')).toBeInTheDocument()
    expect(screen.getByText('marketing@exemplo.com.br')).toBeInTheDocument()
    expect(screen.getByText('23/09/2026, 15:30')).toBeInTheDocument()
    expect(screen.getByText('enviado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Baixar planilha' })).toHaveAttribute(
      'href',
      '/api/marketing/planilha',
    )
  })

  it('sem envios mostra estado vazio', async () => {
    renderComRouter('/marketing')
    expect(await screen.findByText('Nenhum envio realizado.')).toBeInTheDocument()
  })
})
