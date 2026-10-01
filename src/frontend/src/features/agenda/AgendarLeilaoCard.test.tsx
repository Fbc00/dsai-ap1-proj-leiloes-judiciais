import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { CHECKLIST_EXEMPLO } from '@/api/mocks/fixtures'
import { candidatos } from '@/api/mocks/regrasAgenda'
import { dataLocal } from '@/lib/datas'
import { renderComRouter } from '@/test/render'

const HOJE = new Date(2026, 9, 1, 12)

function processoAnalisado(id: string) {
  db.processos.push({
    id,
    nome_arquivo: `${id}.pdf`,
    status: 'analisado',
    numero_processo: `0000${id}`,
    vara: 'Vara X',
    erro: null,
    criado_em: '2026-09-25T10:00:00-03:00',
    analisado_em: '2026-09-25T10:05:00-03:00',
    checklist: structuredClone(CHECKLIST_EXEMPLO),
    relatorio: null,
  })
}

async function escolherDataManual(user: ReturnType<typeof renderComRouter>['user'], data: string) {
  await user.click(screen.getByLabelText('Escolher outra data'))
  fireEvent.change(screen.getByLabelText('Data do 1º leilão'), { target: { value: data } })
  await user.click(screen.getByRole('button', { name: 'Agendar' }))
}

describe('AgendarLeilaoCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(HOJE)
  })
  afterEach(() => vi.useRealTimers())

  it('operador agenda com a sugestão e vê o leilão sem botão de cancelar', async () => {
    logar('operador')
    db.leiloes = []
    const { user } = renderComRouter('/processos/p-1')
    expect(await screen.findByText('03/11/2026, 10:00')).toBeInTheDocument()
    expect(screen.getByText('10/11/2026, 10:00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agendar' }))
    expect(await screen.findByText('agendado')).toBeInTheDocument()
    expect(screen.getByText('03/11/2026, 10:00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar leilão' })).not.toBeInTheDocument()
  })

  it('data manual em feriado mostra o motivo do servidor', async () => {
    logar('operador')
    db.leiloes = []
    const { user } = renderComRouter('/processos/p-1')
    await screen.findByText('03/11/2026, 10:00')
    await escolherDataManual(user, '2026-11-02')
    expect(await screen.findByRole('alert')).toHaveTextContent('Data é feriado: Finados')
  })

  it('data manual em sábado mostra "Data não é dia útil"', async () => {
    logar('operador')
    db.leiloes = []
    const { user } = renderComRouter('/processos/p-1')
    await screen.findByText('03/11/2026, 10:00')
    await escolherDataManual(user, '2026-11-07')
    expect(await screen.findByRole('alert')).toHaveTextContent('Data não é dia útil')
  })

  it('dois leilões no mesmo dia são permitidos', async () => {
    logar('operador')
    processoAnalisado('p-9')
    db.leiloes = [
      {
        id: 'l-9',
        processo_id: 'p-9',
        primeiro_leilao_em: '2026-11-05T13:00:00.000Z',
        segundo_leilao_em: '2026-11-12T13:00:00.000Z',
        status: 'agendado',
        criado_em: '2026-09-26T10:00:00-03:00',
      },
    ]
    const { user } = renderComRouter('/processos/p-1')
    await screen.findByText('03/11/2026, 10:00')
    await escolherDataManual(user, '2026-11-05')
    expect(await screen.findByText('agendado')).toBeInTheDocument()
    expect(screen.getByText('05/11/2026, 10:00')).toBeInTheDocument()
    expect(
      db.leiloes.filter((l) => dataLocal(new Date(l.primeiro_leilao_em)) === '2026-11-05'),
    ).toHaveLength(2)
  })

  it('admin cancela o leilão e volta pro modo de sugestão', async () => {
    logar('admin')
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Cancelar leilão' }))
    expect(await screen.findByRole('button', { name: 'Agendar' })).toBeInTheDocument()
    expect(db.leiloes.find((l) => l.id === 'l-1')?.status).toBe('cancelado')
  })

  it('operador não vê o botão Cancelar leilão', async () => {
    logar('operador')
    renderComRouter('/processos/p-1')
    expect(await screen.findByText('05/11/2026, 10:00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar leilão' })).not.toBeInTheDocument()
  })

  it('processo não analisado não oferece agendamento', async () => {
    logar('operador')
    renderComRouter('/processos/p-2')
    expect(await screen.findByText('Analise o processo antes de agendar.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agendar' })).not.toBeInTheDocument()
  })

  it('sem data disponível mostra 409 e desabilita Agendar', async () => {
    logar('operador')
    db.leiloes = []
    db.bloqueios = candidatos(HOJE).map((d, i) => ({
      id: `b-${i}`,
      data: dataLocal(d),
      motivo: 'Recesso',
    }))
    renderComRouter('/processos/p-1')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sem data disponível entre 30 e 45 dias',
    )
    expect(screen.getByRole('button', { name: 'Agendar' })).toBeDisabled()
  })
})
