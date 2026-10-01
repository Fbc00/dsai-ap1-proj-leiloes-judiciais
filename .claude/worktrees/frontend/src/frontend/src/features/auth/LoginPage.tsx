import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { chaveUsuario, login } from '@/api/auth'
import { mensagemErro } from '@/api/client'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Field } from '@/components/Field'

export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const entrar = useMutation({
    mutationFn: login,
    onSuccess: (usuario) => {
      queryClient.setQueryData(chaveUsuario, usuario)
      void navigate('/', { replace: true })
    },
  })

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    entrar.mutate({ username, password })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={aoEnviar}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Entrar</h1>
        <Field label="Usuário" htmlFor="username">
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5"
            required
          />
        </Field>
        <Field label="Senha" htmlFor="password">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5"
            required
          />
        </Field>
        {entrar.isError ? <Alerta tipo="erro">{mensagemErro(entrar.error)}</Alerta> : null}
        <Botao type="submit" disabled={entrar.isPending}>
          Entrar
        </Botao>
      </form>
    </main>
  )
}
