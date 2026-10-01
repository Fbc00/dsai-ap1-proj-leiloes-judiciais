import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { mensagemErro } from '@/api/client'
import type { UsuarioCreate, UsuarioOut, UsuarioUpdate } from '@/api/types'
import { atualizarUsuario, chavesUsuarios, criarUsuario, listarUsuarios } from '@/api/usuarios'
import { Alerta } from '@/components/Alerta'
import { Botao } from '@/components/Botao'
import { Dialog } from '@/components/Dialog'
import { StatusBadge } from '@/components/StatusBadge'
import { RedefinirSenhaDialog } from './RedefinirSenhaDialog'
import { type DadosUsuarioForm, UsuarioForm } from './UsuarioForm'

type Editando = { modo: 'novo' } | { modo: 'editar'; usuario: UsuarioOut } | null

export function UsuariosPage() {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState<Editando>(null)
  const [redefinindo, setRedefinindo] = useState<UsuarioOut | null>(null)

  const usuarios = useQuery({ queryKey: chavesUsuarios.lista, queryFn: listarUsuarios })

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: chavesUsuarios.lista })
  }

  const criar = useMutation({
    mutationFn: criarUsuario,
    onSuccess: () => {
      setEditando(null)
      invalidar()
    },
  })

  const atualizar = useMutation({
    mutationFn: (dados: { id: string; patch: UsuarioUpdate }) =>
      atualizarUsuario(dados.id, dados.patch),
    onSuccess: () => {
      setEditando(null)
      invalidar()
    },
  })

  function salvar(dados: DadosUsuarioForm) {
    if (editando?.modo === 'novo') {
      criar.mutate(dados as UsuarioCreate)
    } else if (editando?.modo === 'editar') {
      atualizar.mutate({ id: editando.usuario.id, patch: dados })
    }
  }

  function fecharForm() {
    setEditando(null)
    criar.reset()
    atualizar.reset()
  }

  const erroForm = criar.isError
    ? mensagemErro(criar.error)
    : atualizar.isError && editando?.modo === 'editar'
      ? mensagemErro(atualizar.error)
      : null
  const erroLinha = atualizar.isError && editando === null ? mensagemErro(atualizar.error) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <Botao onClick={() => setEditando({ modo: 'novo' })}>Novo usuário</Botao>
      </div>
      {usuarios.isPending ? <p className="text-slate-500">Carregando…</p> : null}
      {usuarios.isError ? <Alerta tipo="erro">{mensagemErro(usuarios.error)}</Alerta> : null}
      {erroLinha ? <Alerta tipo="erro">{erroLinha}</Alerta> : null}
      {usuarios.data ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Perfil</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.data.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {u.username}
                  </th>
                  <td className="px-3 py-2">{u.nome}</td>
                  <td className="px-3 py-2">{u.perfil}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={u.ativo ? 'ativo' : 'inativo'} />
                  </td>
                  <td className="flex flex-wrap gap-2 px-3 py-2">
                    <Botao
                      variante="secundario"
                      onClick={() => setEditando({ modo: 'editar', usuario: u })}
                    >
                      Editar
                    </Botao>
                    <Botao
                      variante="secundario"
                      onClick={() => atualizar.mutate({ id: u.id, patch: { ativo: !u.ativo } })}
                      disabled={atualizar.isPending}
                    >
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </Botao>
                    <Botao variante="secundario" onClick={() => setRedefinindo(u)}>
                      Redefinir senha
                    </Botao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        aberto={editando !== null}
        titulo={
          editando?.modo === 'editar' ? `Editar ${editando.usuario.username}` : 'Novo usuário'
        }
        onFechar={fecharForm}
      >
        {editando ? (
          <UsuarioForm
            key={editando.modo === 'editar' ? editando.usuario.id : 'novo'}
            modo={editando.modo}
            inicial={editando.modo === 'editar' ? editando.usuario : undefined}
            salvando={criar.isPending || atualizar.isPending}
            erro={erroForm}
            onSalvar={salvar}
            onCancelar={fecharForm}
          />
        ) : null}
      </Dialog>

      <RedefinirSenhaDialog usuario={redefinindo} onFechar={() => setRedefinindo(null)} />
    </div>
  )
}
