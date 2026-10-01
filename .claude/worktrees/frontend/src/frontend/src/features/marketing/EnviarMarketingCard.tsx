import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mensagemErro } from '@/api/client'
import { chavesMarketing, enviarParaMarketing } from '@/api/marketing'
import type { ProcessoDetalheOut } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Card } from '@/components/Card'
import { formatarDataHora } from '@/lib/formatar'

type Props = { processo: ProcessoDetalheOut }

export function EnviarMarketingCard({ processo }: Props) {
  const queryClient = useQueryClient()
  const leilao = processo.leilao
  const podeEnviar = leilao !== null && leilao.status === 'agendado' && leilao.edital_id !== null

  const enviar = useMutation({
    mutationFn: () => enviarParaMarketing(leilao?.id ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chavesMarketing.envios })
    },
  })

  return (
    <Card
      titulo="Marketing"
      acoes={
        <Botao onClick={() => enviar.mutate()} disabled={!podeEnviar || enviar.isPending}>
          {enviar.isPending ? 'Enviando…' : 'Enviar pra marketing'}
        </Botao>
      }
    >
      <div className="flex flex-col gap-2">
        {podeEnviar ? (
          <p className="text-sm text-slate-500">
            Envia a planilha de leilões atualizada por e-mail pra equipe de marketing.
          </p>
        ) : (
          <p className="text-sm text-slate-500">Gere o edital para liberar o envio da planilha.</p>
        )}
        {enviar.isSuccess ? (
          <Alerta tipo="sucesso">
            Enviado para {enviar.data.destinatarios.join(', ')} em{' '}
            {formatarDataHora(enviar.data.enviado_em)}
          </Alerta>
        ) : null}
        {enviar.isError ? <Alerta tipo="erro">{mensagemErro(enviar.error)}</Alerta> : null}
      </div>
    </Card>
  )
}
