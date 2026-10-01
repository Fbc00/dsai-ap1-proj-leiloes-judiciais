import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { logout } from '@/api/auth'
import { MinhaSenhaDialog } from '@/features/auth/MinhaSenhaDialog'
import { useUsuario } from '@/features/auth/useUsuario'

function classeLink({ isActive }: { isActive: boolean }): string {
  return isActive ? 'font-semibold text-blue-700' : 'text-slate-700 hover:text-blue-700'
}

export function Layout() {
  const { data: usuario, ehAdmin } = useUsuario()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [senhaAberta, setSenhaAberta] = useState(false)

  const sair = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear()
      void navigate('/login', { replace: true })
    },
  })

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav
          aria-label="Principal"
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm"
        >
          <span className="font-semibold">Leilões Judiciais</span>
          <NavLink to="/" end className={classeLink}>
            Processos
          </NavLink>
          <NavLink to="/agenda" className={classeLink}>
            Agenda
          </NavLink>
          <NavLink to="/marketing" className={classeLink}>
            Marketing
          </NavLink>
          {ehAdmin ? (
            <NavLink to="/usuarios" className={classeLink}>
              Usuários
            </NavLink>
          ) : null}
          <span className="ml-auto text-slate-600">
            {usuario ? `${usuario.nome} · ${usuario.perfil}` : ''}
          </span>
          <button type="button" onClick={() => setSenhaAberta(true)} className="underline">
            Minha senha
          </button>
          <button type="button" onClick={() => sair.mutate()} className="underline">
            Sair
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <MinhaSenhaDialog aberto={senhaAberta} onFechar={() => setSenhaAberta(false)} />
    </div>
  )
}
