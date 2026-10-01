import { screen, within } from '@testing-library/react'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { erro } from '@/api/mocks/http'
import { server } from '@/api/mocks/server'
import { TEXTO_AVISO_IA } from '@/components/AvisoIA'
import { renderComRouter } from '@/test/render'

function editalFixo(markdown: string) {
  db.editais.push({
    id: 'e-fixo',
    leilao_id: 'l-1',
    processo_id: 'p-1',
    conteudo_markdown: markdown,
    criado_em: '2026-09-22T10:00:00-03:00',
    atualizado_em: null,
  })
}

describe('EditalCard', () => {
  beforeEach(() => logar('operador'))

  it('sem leilão agendado o botão fica desabilitado', async () => {
    db.leiloes = []
    renderComRouter('/processos/p-1')
    expect(await screen.findByText('Agende o leilão para gerar o edital.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gerar edital' })).toBeDisabled()
  })

  it('gerar edital mostra juiz, matrículas, datas, lances, aviso de IA e links de download', async () => {
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Gerar edital' }))
    const artigo = await screen.findByRole('article', { name: 'Conteúdo do edital' })
    expect(artigo).toHaveTextContent('CLAUDIO CEZAR CAVALCANTES')
    expect(artigo).toHaveTextContent('Matrícula nº 6.351')
    expect(artigo).toHaveTextContent('Matrícula nº 6.235')
    expect(artigo).toHaveTextContent('Primeiro Leilão: 05/11/2026, 10:00')
    expect(artigo).toHaveTextContent('Última avaliação: R$ 227.000,00')
    expect(artigo).toHaveTextContent('Lance Inicial em 2º Leilão: R$ 158.900,00')
    const card = artigo.closest('section')
    expect(card).not.toBeNull()
    if (!card) return
    expect(within(card).getByText(TEXTO_AVISO_IA)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Baixar .md' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/api\/editais\/e-\d+\/download\?formato=md$/),
    )
    expect(within(card).getByRole('link', { name: 'Baixar .docx' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/api\/editais\/e-\d+\/download\?formato=docx$/),
    )
    expect(within(card).getByRole('button', { name: 'Regenerar' })).toBeInTheDocument()
  })

  it('HTML cru no markdown vira texto, nunca elemento', async () => {
    editalFixo('Texto <script>alert(1)</script> fim')
    const { container } = renderComRouter('/processos/p-1')
    const artigo = await screen.findByRole('article', { name: 'Conteúdo do edital' })
    expect(artigo).toHaveTextContent('<script>alert(1)</script>')
    expect(container.querySelector('article script')).toBeNull()
  })

  it('editar e salvar reflete no render e mostra quando foi editado', async () => {
    editalFixo('# Edital original')
    const { user } = renderComRouter('/processos/p-1')
    await screen.findByRole('article', { name: 'Conteúdo do edital' })
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const area = screen.getByLabelText('Conteúdo do edital em Markdown')
    await user.clear(area)
    await user.type(area, '# Edital revisado{enter}{enter}Com observação da equipe.')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    const artigo = await screen.findByRole('article', { name: 'Conteúdo do edital' })
    expect(artigo).toHaveTextContent('Edital revisado')
    expect(artigo).toHaveTextContent('Com observação da equipe.')
    expect(screen.getByText(/^Editado em \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/)).toBeInTheDocument()
    expect(db.editais.find((e) => e.id === 'e-fixo')?.atualizado_em).not.toBeNull()
  })

  it('conteúdo vazio desabilita o salvar', async () => {
    editalFixo('# Edital')
    const { user } = renderComRouter('/processos/p-1')
    await screen.findByRole('article', { name: 'Conteúdo do edital' })
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Conteúdo do edital em Markdown'))
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('erro do servidor ao gerar aparece no card', async () => {
    server.use(http.post('/api/editais', () => erro(409, 'Leilão cancelado')))
    const { user } = renderComRouter('/processos/p-1')
    await user.click(await screen.findByRole('button', { name: 'Gerar edital' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Leilão cancelado')
  })
})
