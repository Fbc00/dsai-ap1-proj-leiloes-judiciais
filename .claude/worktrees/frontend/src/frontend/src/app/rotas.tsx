import type { RouteObject } from 'react-router'
import { AgendaPage } from '@/features/agenda/AgendaPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RotaAdmin } from '@/features/auth/RotaAdmin'
import { RotaProtegida } from '@/features/auth/RotaProtegida'
import { MarketingPage } from '@/features/marketing/MarketingPage'
import { ProcessoDetalhePage } from '@/features/processos/ProcessoDetalhePage'
import { ProcessosPage } from '@/features/processos/ProcessosPage'
import { UsuariosPage } from '@/features/usuarios/UsuariosPage'
import { Layout } from './Layout'
import { NaoEncontradaPage } from './NaoEncontradaPage'

export const rotas: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RotaProtegida />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <ProcessosPage /> },
          { path: '/processos/:id', element: <ProcessoDetalhePage /> },
          { path: '/agenda', element: <AgendaPage /> },
          { path: '/marketing', element: <MarketingPage /> },
          {
            element: <RotaAdmin />,
            children: [{ path: '/usuarios', element: <UsuariosPage /> }],
          },
          { path: '*', element: <NaoEncontradaPage /> },
        ],
      },
    ],
  },
]
