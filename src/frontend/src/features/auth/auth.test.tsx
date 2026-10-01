import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { db, logar } from '@/api/mocks/db'
import { renderComRouter } from '@/test/render'

async function preencherLogin(
  user: ReturnType<typeof renderComRouter>['user'],
  usuario: string,
  senha: string,
) {
  await user.type(await screen.findByLabelText('Usuário'), usuario)
  await user.type(screen.getByLabelText('Senha'), senha)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('autenticação', () => {
  it('rota protegida sem sessão vai pra /login', async () => {
    renderComRouter('/')
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('login ok redireciona pra / e mostra nome e perfil do usuário', async () => {
    const { user } = renderComRouter('/login')
    await preencherLogin(user, 'admin', 'admin')
    expect(await screen.findByRole('heading', { name: 'Processos' })).toBeInTheDocument()
    expect(screen.getByText('Administrador · admin')).toBeInTheDocument()
  })

  it('credenciais inválidas mostra mensagem', async () => {
    const { user } = renderComRouter('/login')
    await preencherLogin(user, 'admin', 'errada')
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciais inválidas')
  })

  it('429 após lockout mostra "Muitas tentativas"', async () => {
    db.falhasLogin.set('admin', [Date.now(), Date.now(), Date.now(), Date.now(), Date.now()])
    const { user } = renderComRouter('/login')
    await preencherLogin(user, 'admin', 'admin')
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Muitas tentativas/)
  })

  it('sair volta pra login', async () => {
    logar()
    const { user } = renderComRouter('/')
    await screen.findByRole('heading', { name: 'Processos' })
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('admin vê navegação completa, inclusive Usuários', async () => {
    logar('admin')
    renderComRouter('/')
    await screen.findByRole('heading', { name: 'Processos' })
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Processos' })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: 'Agenda' })).toHaveAttribute('href', '/agenda')
    expect(within(nav).getByRole('link', { name: 'Marketing' })).toHaveAttribute(
      'href',
      '/marketing',
    )
    expect(within(nav).getByRole('link', { name: 'Usuários' })).toHaveAttribute('href', '/usuarios')
  })

  it('operador não vê o link Usuários e vê seu perfil', async () => {
    logar('operador')
    renderComRouter('/')
    await screen.findByRole('heading', { name: 'Processos' })
    expect(screen.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument()
    expect(screen.getByText('Operador · operador')).toBeInTheDocument()
  })

  it('operador que acessa /usuarios é redirecionado pra /', async () => {
    logar('operador')
    renderComRouter('/usuarios')
    expect(await screen.findByRole('heading', { name: 'Processos' })).toBeInTheDocument()
  })

  it('trocar senha com sucesso fecha o diálogo e a nova senha passa a valer', async () => {
    logar('operador')
    const { user } = renderComRouter('/')
    await user.click(await screen.findByRole('button', { name: 'Minha senha' }))
    await user.type(screen.getByLabelText('Senha atual'), 'operador')
    await user.type(screen.getByLabelText('Nova senha'), 'novaSenha123')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha alterada')
    expect(db.usuarios.find((u) => u.username === 'operador')?.password).toBe('novaSenha123')
  })

  it('trocar senha com senha atual errada mostra 400', async () => {
    logar('operador')
    const { user } = renderComRouter('/')
    await user.click(await screen.findByRole('button', { name: 'Minha senha' }))
    await user.type(screen.getByLabelText('Senha atual'), 'errada')
    await user.type(screen.getByLabelText('Nova senha'), 'novaSenha123')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha atual incorreta')
  })

  it('nova senha curta bloqueia o salvar', async () => {
    logar('operador')
    const { user } = renderComRouter('/')
    await user.click(await screen.findByRole('button', { name: 'Minha senha' }))
    await user.type(screen.getByLabelText('Senha atual'), 'operador')
    await user.type(screen.getByLabelText('Nova senha'), 'curta')
    expect(screen.getByText('Mínimo de 8 caracteres')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })
})
