export const TEXTO_AVISO_IA = 'Gerado por IA a partir do PDF — revise antes de usar.'

export function AvisoIA() {
  return (
    <p
      role="note"
      className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {TEXTO_AVISO_IA}
    </p>
  )
}
