import type { ReactNode } from 'react'

type Props = { titulo: string; acoes?: ReactNode; children: ReactNode }

export function Card({ titulo, acoes, children }: Props) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        {acoes ? <div className="flex gap-2">{acoes}</div> : null}
      </header>
      {children}
    </section>
  )
}
