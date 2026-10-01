import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useRef } from 'react'
import { mensagemErro } from '@/api/client'
import { chavesProcessos, enviarProcesso } from '@/api/processos'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'

export function UploadProcesso() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const enviar = useMutation({
    mutationFn: enviarProcesso,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chavesProcessos.lista }),
  })

  function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (arquivo) enviar.mutate(arquivo)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        aria-label="Arquivo PDF do processo"
        onChange={aoEscolher}
      />
      <Botao onClick={() => inputRef.current?.click()} disabled={enviar.isPending}>
        {enviar.isPending ? 'Enviando…' : 'Enviar PDF'}
      </Botao>
      {enviar.isError ? <Alerta tipo="erro">{mensagemErro(enviar.error)}</Alerta> : null}
    </div>
  )
}
