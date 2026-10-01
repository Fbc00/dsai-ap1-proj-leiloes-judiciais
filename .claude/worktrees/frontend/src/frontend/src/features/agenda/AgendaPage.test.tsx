import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

async function irParaNovembro(user: ReturnType<typeof renderComRouter>['user']) {
  await screen.findByRole('heading', { name: 'outubro de 2026' })
  await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
  await screen.findByRole('heading', { name: 'novembro de 2026' })
}

describe('AgendaPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 1, 12))
  })
  afterEach(() => vi.useRealTimers())

  it('abre no mês atual e navega pro próximo, listando o leilão com link pro processo', async () => {
    logar('operador')
    const { user } = renderComRouter('/agenda')
    expect(await screen.findByRole('heading', { name: 'outubro de 2026' })).toBeInTheDocument()
    expect(await screen.findByText('Nenhum leilão neste mês.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByRole('heading', { name: 'novembro de 2026' })).toBeInTheDocument()
    expect(await screen.findByText('05/11/2026, 10:00')).toBeInTheDocument()
    expect(screen.getByText('12/11/2026, 10:00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '1003966-15.2022.4.01.4301' })).toHaveAttribute(
      'href',
      '/processos/p-1',
    )
  })

  it('calendário marca feriado automático', async () => {
    logar('operador')
    const { user } = renderComRouter('/agenda')
    await irParaNovembro(user)
    expect(
      await screen.findByRole('cell', { name: '20/11/2026 — Feriado: Consciência Negra' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '02/11/2026 — Feriado: Finados' })).toBeInTheDocument()
  })

  it('calendário marca fim de semana, bloqueio e leilão', async () => {
    logar('operador')
    const { user } = renderComRouter('/agenda')
    await irParaNovembro(user)
    expect(
      await screen.findByRole('cell', { name: '27/11/2026 — Bloqueio: Recesso interno' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '05/11/2026 — Leilão (1)' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '12/11/2026 — Leilão (1)' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '07/11/2026 — Fim de semana' })).toBeInTheDocument()
  })

  it('admin lista bloqueios e adiciona um novo', async () => {
    logar('admin')
    const { user } = renderComRouter('/agenda')
    expect(await screen.findByText('Recesso interno')).toBeInTheDocument()
    expect(screen.getByText('27/11/2026')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-12-24' } })
    await user.type(screen.getByLabelText('Motivo'), 'Véspera de Natal')
    await user.click(screen.getByRole('button', { name: 'Bloquear' }))
    expect(await screen.findByText('Véspera de Natal')).toBeInTheDocument()
    expect(screen.getByText('24/12/2026')).toBeInTheDocument()
  })

  it('admin recebe 409 em bloqueio duplicado', async () => {
    logar('admin')
    const { user } = renderComRouter('/agenda')
    await screen.findByText('Recesso interno')
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-27' } })
    await user.type(screen.getByLabelText('Motivo'), 'Repetido')
    await user.click(screen.getByRole('button', { name: 'Bloquear' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe bloqueio nesta data')
  })

  it('admin remove bloqueio', async () => {
    logar('admin')
    const { user } = renderComRouter('/agenda')
    await screen.findByText('Recesso interno')
    await user.click(screen.getByRole('button', { name: 'Remover bloqueio 27/11/2026' }))
    await waitFor(() => expect(screen.queryByText('Recesso interno')).not.toBeInTheDocument())
  })

  it('operador vê os bloqueios mas não o formulário nem o botão de remover', async () => {
    logar('operador')
    renderComRouter('/agenda')
    const card = (await screen.findByText('Recesso interno')).closest('section')
    expect(card).not.toBeNull()
    if (!card) return
    expect(within(card).queryByRole('button', { name: 'Bloquear' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /Remover bloqueio/ })).not.toBeInTheDocument()
  })
})
