import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { chavesAgenda, criarBloqueio, listarBloqueios, removerBloqueio } from '@/api/agenda'
import { mensagemErro } from '@/api/client'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { Field } from '@/components/Field'
import { useUsuario } from '@/features/auth/useUsuario'
import { formatarData } from '@/lib/formatar'

const INPUT = 'rounded border border-slate-300 px-2 py-1.5 text-sm'

export function BloqueiosCard() {
  const queryClient = useQueryClient()
  const { ehAdmin } = useUsuario()
  const [data, setData] = useState('')
  const [motivo, setMotivo] = useState('')

  const bloqueios = useQuery({ queryKey: chavesAgenda.bloqueios, queryFn: listarBloqueios })

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chavesAgenda.raiz })
  }

  const criar = useMutation({
    mutationFn: criarBloqueio,
    onSuccess: () => {
      setData('')
      setMotivo('')
      invalidar()
    },
  })
  const remover = useMutation({ mutationFn: removerBloqueio, onSuccess: invalidar })

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (data === '' || motivo.trim() === '') return
    criar.mutate({ data, motivo: motivo.trim() })
  }

  return (
    <Card titulo="Bloqueios da agenda">
      {ehAdmin ? (
        <form onSubmit={aoEnviar} className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Data" htmlFor="bloqueio_data">
            <input
              id="bloqueio_data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={INPUT}
              required
            />
          </Field>
          <Field label="Motivo" htmlFor="bloqueio_motivo">
            <input
              id="bloqueio_motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className={INPUT}
              required
            />
          </Field>
          <Botao type="submit" disabled={criar.isPending}>
            Bloquear
          </Botao>
        </form>
      ) : null}
      {criar.isError ? <Alerta tipo="erro">{mensagemErro(criar.error)}</Alerta> : null}
      {remover.isError ? <Alerta tipo="erro">{mensagemErro(remover.error)}</Alerta> : null}
      {bloqueios.isPending ? <p className="text-sm text-slate-500">Carregando…</p> : null}
      {bloqueios.data && bloqueios.data.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma data bloqueada.</p>
      ) : null}
      {bloqueios.data && bloqueios.data.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {bloqueios.data.map((b) => (
            <li key={b.id} className="flex items-center gap-3">
              <span className="font-medium">{formatarData(b.data)}</span>
              <span>{b.motivo}</span>
              {ehAdmin ? (
                <Botao
                  variante="secundario"
                  className="ml-auto"
                  aria-label={`Remover bloqueio ${formatarData(b.data)}`}
                  onClick={() => remover.mutate(b.id)}
                  disabled={remover.isPending}
                >
                  Remover
                </Botao>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}
