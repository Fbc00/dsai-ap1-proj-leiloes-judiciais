import { type ReactNode, useEffect, useId } from 'react'

type Props = { aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode }

export function Dialog({ aberto, titulo, onFechar, children }: Props) {
  const idTitulo = useId()

  useEffect(() => {
    if (!aberto) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto, onFechar])

  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-lg"
      >
        <h2 id={idTitulo} className="mb-3 text-lg font-semibold">
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  )
}
