import type { ReactNode } from 'react'

type Props = { label: string; htmlFor: string; erro?: string; children: ReactNode }

export function Field({ label, htmlFor, erro, children }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {erro ? <p className="text-sm text-red-600">{erro}</p> : null}
    </div>
  )
}
