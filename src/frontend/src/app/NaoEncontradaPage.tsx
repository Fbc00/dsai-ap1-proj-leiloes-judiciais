import { Link } from 'react-router'

export function NaoEncontradaPage() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <Link to="/" className="text-blue-700 underline">
        Voltar pra lista de processos
      </Link>
    </div>
  )
}
