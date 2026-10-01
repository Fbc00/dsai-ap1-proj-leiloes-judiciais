import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

function linhaDe(username: string): HTMLElement {
  const cabecalho = screen.getByRole('rowheader', { name: username })
  const linha = cabecalho.closest('tr')
  if (!linha) throw new Error(`linha de ${username} não encontrada`)
  return linha
}

describe('UsuariosPage', () => {
  beforeEach(() => logar('admin'))

  it('lista usuários com perfil e status', async () => {
    renderComRouter('/usuarios')
    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeInTheDocument()
    await screen.findByRole('rowheader', { name: 'admin' })
    const admin = linhaDe('admin')
    expect(within(admin).getByText('Administrador')).toBeInTheDocument()
    expect(within(admin).getByText('ativo')).toBeInTheDocument()
    const operador = linhaDe('operador')
    expect(within(operador).getByText('operador', { selector: 'td' })).toBeInTheDocument()
  })

  it('cria usuário e ele aparece na lista', async () => {
    const { user } = renderComRouter('/usuarios')
    await user.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByLabelText('Usuário'), 'maria')
    await user.type(screen.getByLabelText('Nome'), 'Maria Souza')
    await user.selectOptions(screen.getByLabelText('Perfil'), 'operador')
    await user.type(screen.getByLabelText('Senha'), 'senhaForte1')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('rowheader', { name: 'maria' })).toBeInTheDocument()
    expect(within(linhaDe('maria')).getByText('Maria Souza')).toBeInTheDocument()
    expect(db.usuarios.some((u) => u.username === 'maria' && u.password === 'senhaForte1')).toBe(
      true,
    )
  })

  it('username duplicado mostra 409', async () => {
    const { user } = renderComRouter('/usuarios')
    await user.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByLabelText('Usuário'), 'operador')
    await user.type(screen.getByLabelText('Nome'), 'Outro')
    await user.type(screen.getByLabelText('Senha'), 'senhaForte1')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nome de usuário já existe')
  })

  it('senha curta bloqueia o submit do novo usuário', async () => {
    const { user } = renderComRouter('/usuarios')
    await user.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    await user.type(screen.getByLabelText('Usuário'), 'joao')
    await user.type(screen.getByLabelText('Nome'), 'João')
    await user.type(screen.getByLabelText('Senha'), 'curta')
    expect(screen.getByText('Mínimo de 8 caracteres')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('desativar operador muda o badge pra inativo', async () => {
    const { user } = renderComRouter('/usuarios')
    await screen.findByRole('rowheader', { name: 'operador' })
    await user.click(within(linhaDe('operador')).getByRole('button', { name: 'Desativar' }))
    expect(await within(linhaDe('operador')).findByText('inativo')).toBeInTheDocument()
    expect(within(linhaDe('operador')).getByRole('button', { name: 'Ativar' })).toBeInTheDocument()
  })

  it('admin não consegue desativar a si mesmo (409 exibido)', async () => {
    const { user } = renderComRouter('/usuarios')
    await screen.findByRole('rowheader', { name: 'admin' })
    await user.click(within(linhaDe('admin')).getByRole('button', { name: 'Desativar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não é possível alterar o próprio perfil ou status',
    )
    expect(within(linhaDe('admin')).getByText('ativo')).toBeInTheDocument()
  })

  it('editar nome e perfil do operador', async () => {
    const { user } = renderComRouter('/usuarios')
    await screen.findByRole('rowheader', { name: 'operador' })
    await user.click(within(linhaDe('operador')).getByRole('button', { name: 'Editar' }))
    const nome = screen.getByLabelText('Nome')
    await user.clear(nome)
    await user.type(nome, 'Operadora Chefe')
    await user.selectOptions(screen.getByLabelText('Perfil'), 'admin')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Operadora Chefe')).toBeInTheDocument()
    expect(within(linhaDe('operador')).getByText('admin', { selector: 'td' })).toBeInTheDocument()
  })

  it('redefinir senha do operador', async () => {
    const { user } = renderComRouter('/usuarios')
    await screen.findByRole('rowheader', { name: 'operador' })
    await user.click(within(linhaDe('operador')).getByRole('button', { name: 'Redefinir senha' }))
    await user.type(screen.getByLabelText('Nova senha'), 'outraSenha99')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha redefinida')
    expect(db.usuarios.find((u) => u.username === 'operador')?.password).toBe('outraSenha99')
  })
})
