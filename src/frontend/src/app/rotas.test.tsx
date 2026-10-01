import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

describe('rotas', () => {
  it('caminho desconhecido mostra 404 dentro do layout', async () => {
    logar('operador')
    renderComRouter('/nao-existe')
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar pra lista de processos' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('link', { name: 'Agenda' })).toBeInTheDocument()
  })
})
