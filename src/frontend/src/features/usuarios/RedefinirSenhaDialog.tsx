import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { mensagemErro } from '@/api/client'
import type { UsuarioOut } from '@/api/types'
import { atualizarUsuario } from '@/api/usuarios'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { MSG_SENHA_CURTA, SENHA_MIN } from '@/features/auth/MinhaSenhaDialog'

const INPUT = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm'

type Props = { usuario: UsuarioOut | null; onFechar: () => void }

export function RedefinirSenhaDialog({ usuario, onFechar }: Props) {
  const [novaSenha, setNovaSenha] = useState('')
  const curta = novaSenha !== '' && novaSenha.length < SENHA_MIN

  const redefinir = useMutation({
    mutationFn: (dados: { id: string; nova_senha: string }) =>
      atualizarUsuario(dados.id, { nova_senha: dados.nova_senha }),
  })

  function fechar() {
    setNovaSenha('')
    redefinir.reset()
    onFechar()
  }

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!usuario || curta || novaSenha === '') return
    redefinir.mutate({ id: usuario.id, nova_senha: novaSenha })
  }

  return (
    <Dialog
      aberto={usuario !== null}
      titulo={`Redefinir senha de ${usuario?.username ?? ''}`}
      onFechar={fechar}
    >
      {redefinir.isSuccess ? (
        <div className="flex flex-col gap-3">
          <Alerta tipo="sucesso">Senha redefinida</Alerta>
          <Botao variante="secundario" onClick={fechar}>
            Fechar
          </Botao>
        </div>
      ) : (
        <form onSubmit={aoEnviar} className="flex flex-col gap-3">
          <Field
            label="Nova senha"
            htmlFor="redefinir_nova_senha"
            erro={curta ? MSG_SENHA_CURTA : undefined}
          >
            <input
              id="redefinir_nova_senha"
              type="password"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className={INPUT}
              required
            />
          </Field>
          {redefinir.isError ? <Alerta tipo="erro">{mensagemErro(redefinir.error)}</Alerta> : null}
          <div className="flex gap-2">
            <Botao type="submit" disabled={redefinir.isPending || curta || novaSenha === ''}>
              Salvar
            </Botao>
            <Botao variante="secundario" onClick={fechar} disabled={redefinir.isPending}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}
    </Dialog>
  )
}
