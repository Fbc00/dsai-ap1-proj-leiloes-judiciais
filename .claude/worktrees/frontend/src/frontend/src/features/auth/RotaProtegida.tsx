import { Navigate, Outlet } from 'react-router'
import { useUsuario } from './useUsuario'

export function RotaProtegida() {
  const { data, isPending, isError } = useUsuario()
  if (isPending) return <p className="p-6 text-slate-500">Carregando…</p>
  if (isError || !data) return <Navigate to="/login" replace />
  return <Outlet />
}
