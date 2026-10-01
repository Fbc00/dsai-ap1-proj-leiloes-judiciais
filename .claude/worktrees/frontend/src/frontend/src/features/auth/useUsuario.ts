import { useQuery } from '@tanstack/react-query'
import { chaveUsuario, me } from '@/api/auth'

export function useUsuario() {
  const query = useQuery({
    queryKey: chaveUsuario,
    queryFn: me,
    retry: false,
    staleTime: 5 * 60_000,
  })
  return { ...query, ehAdmin: query.data?.perfil === 'admin' }
}
