import { Navigate, Outlet } from 'react-router'
import { useUsuario } from './useUsuario'

export function RotaAdmin() {
  const { ehAdmin, isPending } = useUsuario()
  if (isPending) return null
  return ehAdmin ? <Outlet /> : <Navigate to="/" replace />
}
