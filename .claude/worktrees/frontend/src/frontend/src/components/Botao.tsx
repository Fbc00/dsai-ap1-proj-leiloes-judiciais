import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'perigo'
}

const ESTILOS: Record<NonNullable<Props['variante']>, string> = {
  primario: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-300',
  secundario:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
  perigo: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
}

export function Botao({ variante = 'primario', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${ESTILOS[variante]} ${className}`}
      {...rest}
    />
  )
}
