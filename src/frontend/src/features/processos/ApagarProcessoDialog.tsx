import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mensagemErro } from '@/api/client'
import { chavesProcessos, excluirProcesso } from '@/api/processos'
import type { ProcessoOut } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Dialog } from '@/components/Dialog'

type Props = { processo: ProcessoOut | null; onFechar: () => void }

export function ApagarProcessoDialog({ processo, onFechar }: Props) {
  const queryClient = useQueryClient()

  const apagar = useMutation({
    mutationFn: excluirProcesso,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chavesProcessos.lista })
      onFechar()
    },
  })

  function fechar() {
    apagar.reset()
    onFechar()
  }

  return (
    <Dialog aberto={processo !== null} titulo="Apagar processo" onFechar={fechar}>
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Apagar <strong>{processo?.nome_arquivo}</strong>? O PDF, o checklist e o relatório serão
          removidos. Esta ação não pode ser desfeita.
        </p>
        {apagar.isError ? <Alerta tipo="erro">{mensagemErro(apagar.error)}</Alerta> : null}
        <div className="flex gap-2">
          <Botao
            variante="perigo"
            onClick={() => processo && apagar.mutate(processo.id)}
            disabled={apagar.isPending}
          >
            Apagar
          </Botao>
          <Botao variante="secundario" onClick={fechar} disabled={apagar.isPending}>
            Cancelar
          </Botao>
        </div>
      </div>
    </Dialog>
  )
}
