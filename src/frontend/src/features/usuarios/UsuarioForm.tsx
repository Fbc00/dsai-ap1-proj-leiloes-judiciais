import { type FormEvent, useState } from 'react'
import type { Perfil, UsuarioCreate, UsuarioOut, UsuarioUpdate } from '@/api/types'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Field } from '@/components/Field'
import { MSG_SENHA_CURTA, SENHA_MIN } from '@/features/auth/MinhaSenhaDialog'

const INPUT = 'w-full rounded border border-slate-300 px-2 py-1.5 text-sm'

export type DadosUsuarioForm = UsuarioCreate | Pick<UsuarioUpdate, 'nome' | 'perfil'>

type Props = {
  modo: 'novo' | 'editar'
  inicial?: UsuarioOut
  salvando: boolean
  erro: string | null
  onSalvar: (dados: DadosUsuarioForm) => void
  onCancelar: () => void
}

export function UsuarioForm({ modo, inicial, salvando, erro, onSalvar, onCancelar }: Props) {
  const [username, setUsername] = useState(inicial?.username ?? '')
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [perfil, setPerfil] = useState<Perfil>(inicial?.perfil ?? 'operador')
  const [senha, setSenha] = useState('')
  const senhaCurta = modo === 'novo' && senha !== '' && senha.length < SENHA_MIN
  const incompleto =
    nome.trim() === '' || (modo === 'novo' && (username.trim() === '' || senha === ''))

  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (senhaCurta || incompleto) return
    if (modo === 'novo') {
      onSalvar({ username: username.trim(), nome: nome.trim(), perfil, senha })
    } else {
      onSalvar({ nome: nome.trim(), perfil })
    }
  }

  return (
    <form onSubmit={aoEnviar} className="flex flex-col gap-3">
      {modo === 'novo' ? (
        <Field label="Usuário" htmlFor="usuario_username">
          <input
            id="usuario_username"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={INPUT}
            required
          />
        </Field>
      ) : null}
      <Field label="Nome" htmlFor="usuario_nome">
        <input
          id="usuario_nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={INPUT}
          required
        />
      </Field>
      <Field label="Perfil" htmlFor="usuario_perfil">
        <select
          id="usuario_perfil"
          value={perfil}
          onChange={(e) => setPerfil(e.target.value === 'admin' ? 'admin' : 'operador')}
          className={INPUT}
        >
          <option value="operador">operador</option>
          <option value="admin">admin</option>
        </select>
      </Field>
      {modo === 'novo' ? (
        <Field
          label="Senha"
          htmlFor="usuario_senha"
          erro={senhaCurta ? MSG_SENHA_CURTA : undefined}
        >
          <input
            id="usuario_senha"
            type="password"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={INPUT}
            required
          />
        </Field>
      ) : null}
      {erro ? <Alerta tipo="erro">{erro}</Alerta> : null}
      <div className="flex gap-2">
        <Botao type="submit" disabled={salvando || senhaCurta || incompleto}>
          Salvar
        </Botao>
        <Botao variante="secundario" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}
