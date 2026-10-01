import { useMutation } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { alterarSenha } from '@/api/auth'
import { mensagemErro } from '@/api/client'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'

export const SENHA_MIN = 8
export const MSG_SENHA_CURTA = 'Mínimo de 8 caracteres'
const INPUT = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm'

type Props = { aberto: boolean; onFechar: () => void }

export function MinhaSenhaDialog({ aberto, onFechar }: Props) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const curta = novaSenha !== '' && novaSenha.length < SENHA_MIN

  const alterar = useMutation({ mutationFn: alterarSenha })

  function fechar() {
    setSenhaAtual('')
    setNovaSenha('')
    alterar.reset()
    onFechar()
  }

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (curta || novaSenha === '') return
    alterar.mutate({ senha_atual: senhaAtual, nova_senha: novaSenha })
  }

  return (
    <Dialog aberto={aberto} titulo="Minha senha" onFechar={fechar}>
      {alterar.isSuccess ? (
        <div className="flex flex-col gap-3">
          <Alerta tipo="sucesso">Senha alterada</Alerta>
          <Botao variante="secundario" onClick={fechar}>
            Fechar
          </Botao>
        </div>
      ) : (
        <form onSubmit={aoEnviar} className="flex flex-col gap-3">
          <Field label="Senha atual" htmlFor="senha_atual">
            <input
              id="senha_atual"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className={INPUT}
              required
            />
          </Field>
          <Field label="Nova senha" htmlFor="nova_senha" erro={curta ? MSG_SENHA_CURTA : undefined}>
            <input
              id="nova_senha"
              type="password"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className={INPUT}
              required
            />
          </Field>
          {alterar.isError ? <Alerta tipo="erro">{mensagemErro(alterar.error)}</Alerta> : null}
          <div className="flex gap-2">
            <Botao type="submit" disabled={alterar.isPending || curta || novaSenha === ''}>
              Salvar
            </Botao>
            <Botao variante="secundario" onClick={fechar} disabled={alterar.isPending}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}
    </Dialog>
  )
}
