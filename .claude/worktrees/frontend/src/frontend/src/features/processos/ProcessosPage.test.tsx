import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

function linhaDe(nomeArquivo: string): HTMLElement {
  const linha = screen.getByText(nomeArquivo).closest('tr')
  if (!linha) throw new Error(`linha de ${nomeArquivo} não encontrada`)
  return linha
}

describe('ProcessosPage', () => {
  it('lista os processos com status e número; número nulo vira traço', async () => {
    logar('operador')
    renderComRouter('/')
    expect(await screen.findByText('processo-1003966.pdf')).toBeInTheDocument()
    expect(screen.getByText('1003966-15.2022.4.01.4301')).toBeInTheDocument()
    expect(screen.getByText('analisado')).toBeInTheDocument()
    const linhaRecebido = linhaDe('execucao-fiscal-2024.pdf')
    expect(within(linhaRecebido).getAllByText('—')).toHaveLength(2)
    expect(within(linhaRecebido).getByText('recebido')).toBeInTheDocument()
  })

  it('upload de PDF adiciona linha na lista', async () => {
    logar('operador')
    const { user } = renderComRouter('/')
    await screen.findByText('processo-1003966.pdf')
    const input = screen.getByLabelText('Arquivo PDF do processo')
    await user.upload(
      input,
      new File(['%PDF-1.4'], 'novo-processo.pdf', { type: 'application/pdf' }),
    )
    expect(await screen.findByText('novo-processo.pdf')).toBeInTheDocument()
  })

  it('arquivo que não é PDF mostra erro 415', async () => {
    logar('operador')
    renderComRouter('/')
    const user = userEvent.setup({ applyAccept: false })
    await screen.findByText('processo-1003966.pdf')
    const input = screen.getByLabelText('Arquivo PDF do processo')
    await user.upload(input, new File(['oi'], 'nota.txt', { type: 'text/plain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo deve ser PDF')
  })

  it('lista vazia mostra estado vazio', async () => {
    logar('operador')
    db.processos = []
    renderComRouter('/')
    expect(await screen.findByText('Nenhum processo enviado ainda.')).toBeInTheDocument()
  })

  it('nome do arquivo é link pro detalhe', async () => {
    logar('operador')
    renderComRouter('/')
    const link = await screen.findByRole('link', { name: 'processo-1003966.pdf' })
    expect(link).toHaveAttribute('href', '/processos/p-1')
  })

  it('admin apaga processo sem leilão após confirmar', async () => {
    logar('admin')
    const { user } = renderComRouter('/')
    await screen.findByText('execucao-fiscal-2024.pdf')
    await user.click(
      within(linhaDe('execucao-fiscal-2024.pdf')).getByRole('button', { name: 'Apagar' }),
    )
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('execucao-fiscal-2024.pdf')
    await user.click(within(dialogo).getByRole('button', { name: 'Apagar' }))
    await waitFor(() =>
      expect(screen.queryByText('execucao-fiscal-2024.pdf')).not.toBeInTheDocument(),
    )
    expect(db.processos.some((p) => p.id === 'p-2')).toBe(false)
  })

  it('admin recebe 409 ao apagar processo com leilão agendado', async () => {
    logar('admin')
    const { user } = renderComRouter('/')
    await screen.findByText('processo-1003966.pdf')
    await user.click(
      within(linhaDe('processo-1003966.pdf')).getByRole('button', { name: 'Apagar' }),
    )
    const dialogo = await screen.findByRole('dialog')
    await user.click(within(dialogo).getByRole('button', { name: 'Apagar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Processo tem leilão agendado',
    )
    expect(screen.getByRole('link', { name: 'processo-1003966.pdf' })).toBeInTheDocument()
  })

  it('operador não vê o botão Apagar', async () => {
    logar('operador')
    renderComRouter('/')
    await screen.findByText('processo-1003966.pdf')
    expect(screen.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })
})
