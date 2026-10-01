import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { TEXTO_AVISO_IA } from '@/components/AvisoIA'
import { renderComRouter } from '@/test/render'

function processo(id: string) {
  const p = db.processos.find((x) => x.id === id)
  if (!p) throw new Error(`fixture ${id} não existe`)
  return p
}

describe('ProcessoDetalhePage', () => {
  it('processo recebido mostra status, sem checklist nem aviso, com botão Analisar', async () => {
    logar('operador')
    renderComRouter('/processos/p-2')
    expect(
      await screen.findByRole('heading', { name: 'execucao-fiscal-2024.pdf' }),
    ).toBeInTheDocument()
    expect(screen.getByText('recebido')).toBeInTheDocument()
    expect(screen.getByText('Analise o processo para preencher o checklist.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analisar' })).toBeEnabled()
    expect(screen.queryByText(TEXTO_AVISO_IA)).not.toBeInTheDocument()
  })

  it('analisar preenche checklist e relatório, com aviso de IA e tipo de justiça', async () => {
    logar('operador')
    const { user } = renderComRouter('/processos/p-2')
    await user.click(await screen.findByRole('button', { name: 'Analisar' }))
    expect(await screen.findByText('6.351')).toBeInTheDocument()
    expect(screen.getByText('6.235')).toBeInTheDocument()
    expect(screen.getByText('CLAUDIO CEZAR CAVALCANTES')).toBeInTheDocument()
    expect(screen.getByText('analisado')).toBeInTheDocument()
    expect(screen.getByText('Justiça federal')).toBeInTheDocument()
    expect(screen.getAllByText(TEXTO_AVISO_IA)).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Reanalisar' })).toBeInTheDocument()
  })

  it('PDF sem texto mostra erro 422 e status erro', async () => {
    logar('operador')
    db.processos.push({
      id: 'p-3',
      nome_arquivo: 'semtexto-scan.pdf',
      status: 'recebido',
      numero_processo: null,
      vara: null,
      erro: null,
      criado_em: '2026-09-29T09:00:00-03:00',
      analisado_em: null,
      checklist: null,
      relatorio: null,
    })
    const { user } = renderComRouter('/processos/p-3')
    await user.click(await screen.findByRole('button', { name: 'Analisar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('PDF sem camada de texto')
    expect(await screen.findByText('erro')).toBeInTheDocument()
  })

  it('editar vara e salvar atualiza o cabeçalho', async () => {
    logar('operador')
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Editar checklist' }))
    const vara = screen.getByLabelText('Vara')
    await user.clear(vara)
    await user.type(vara, '1ª Vara Federal de Palmas - TO')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(
      await screen.findByText(/^Processo nº .+ · 1ª Vara Federal de Palmas - TO$/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument()
  })

  it('valor em formato inválido bloqueia o salvar', async () => {
    logar('operador')
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Editar checklist' }))
    const avaliacao = screen.getByLabelText('Bem 1 — avaliação (R$)')
    await user.clear(avaliacao)
    await user.type(avaliacao, 'abc')
    expect(screen.getByText('Use o formato 1234.56')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('relatório lista resumo e etapas em ordem', async () => {
    logar('operador')
    renderComRouter('/processos/p-1')
    expect(await screen.findByText(/Execução fiscal movida pela União Federal/)).toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Etapas do processo' })
    const itens = within(lista).getAllByRole('listitem')
    expect(itens).toHaveLength(4)
    expect(itens[0]).toHaveTextContent('15/08/2022')
    expect(itens[0]).toHaveTextContent('Ajuizamento da execução fiscal pela União Federal.')
  })

  it('checklist sem bens renderiza aviso sem quebrar', async () => {
    logar('operador')
    const p = processo('p-1')
    if (p.checklist) p.checklist.bens = []
    renderComRouter('/processos/p-1')
    expect(await screen.findByText('Nenhum bem penhorado identificado')).toBeInTheDocument()
    expect(screen.getByText('UNIÃO FEDERAL')).toBeInTheDocument()
  })

  it('id inexistente mostra 404', async () => {
    logar('operador')
    renderComRouter('/processos/nao-existe')
    expect(await screen.findByRole('alert')).toHaveTextContent('Processo não encontrado')
  })
})
