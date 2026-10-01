import type { ReactNode } from 'react'

type Props = { tipo: 'erro' | 'sucesso' | 'info'; children: ReactNode }

const ESTILOS: Record<Props['tipo'], string> = {
  erro: 'border-red-300 bg-red-50 text-red-800',
  sucesso: 'border-green-300 bg-green-50 text-green-800',
  info: 'border-blue-300 bg-blue-50 text-blue-800',
}

export function Alerta({ tipo, children }: Props) {
  return (
    <p role="alert" className={`rounded border px-3 py-2 text-sm ${ESTILOS[tipo]}`}>
      {children}
    </p>
  )
}
