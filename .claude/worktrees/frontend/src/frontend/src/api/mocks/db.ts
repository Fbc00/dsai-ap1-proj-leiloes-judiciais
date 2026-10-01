import type {
  Checklist,
  EditalOut,
  EnvioOut,
  EnvioStatus,
  LeilaoOut,
  LeilaoStatus,
  ProcessoDetalheOut,
  ProcessoOut,
  Relatorio,
  UsuarioOut,
} from '@/api/types'
import { CHECKLIST_EXEMPLO, RELATORIO_EXEMPLO } from './fixtures'

export type UsuarioMock = UsuarioOut & { password: string }
export type ProcessoMock = ProcessoOut & {
  checklist: Checklist | null
  relatorio: Relatorio | null
}
export type LeilaoMock = {
  id: string
  processo_id: string
  primeiro_leilao_em: string
  segundo_leilao_em: string
  status: LeilaoStatus
  criado_em: string
}
export type EnvioMock = {
  id: string
  leilao_id: string
  destinatarios: string[]
  enviado_em: string
  status: EnvioStatus
  erro: string | null
}

export type Db = {
  usuarios: UsuarioMock[]
  sessao: UsuarioMock | null
  falhasLogin: Map<string, number[]>
  processos: ProcessoMock[]
  leiloes: LeilaoMock[]
  bloqueios: { id: string; data: string; motivo: string }[]
  editais: EditalOut[]
  envios: EnvioMock[]
}

export const LOGIN_MAX_TENTATIVAS = 5
export const LOGIN_JANELA_MS = 15 * 60_000
export const MARKETING_EMAILS = ['marketing@exemplo.com.br']

let sequencia = 100

export function novoId(prefixo: string): string {
  sequencia += 1
  return `${prefixo}-${sequencia}`
}

function estadoInicial(): Db {
  return {
    usuarios: [
      {
        id: 'u-1',
        username: 'admin',
        nome: 'Administrador',
        perfil: 'admin',
        ativo: true,
        password: 'admin',
      },
      {
        id: 'u-2',
        username: 'operador',
        nome: 'Operador',
        perfil: 'operador',
        ativo: true,
        password: 'operador',
      },
    ],
    sessao: null,
    falhasLogin: new Map(),
    processos: [
      {
        id: 'p-1',
        nome_arquivo: 'processo-1003966.pdf',
        status: 'analisado',
        numero_processo: CHECKLIST_EXEMPLO.numero_processo,
        vara: CHECKLIST_EXEMPLO.vara,
        erro: null,
        criado_em: '2026-09-20T13:00:00-03:00',
        analisado_em: '2026-09-20T13:05:00-03:00',
        checklist: structuredClone(CHECKLIST_EXEMPLO),
        relatorio: structuredClone(RELATORIO_EXEMPLO),
      },
      {
        id: 'p-2',
        nome_arquivo: 'execucao-fiscal-2024.pdf',
        status: 'recebido',
        numero_processo: null,
        vara: null,
        erro: null,
        criado_em: '2026-09-28T09:30:00-03:00',
        analisado_em: null,
        checklist: null,
        relatorio: null,
      },
    ],
    leiloes: [
      {
        id: 'l-1',
        processo_id: 'p-1',
        primeiro_leilao_em: '2026-11-05T10:00:00-03:00',
        segundo_leilao_em: '2026-11-12T10:00:00-03:00',
        status: 'agendado',
        criado_em: '2026-09-21T10:00:00-03:00',
      },
    ],
    bloqueios: [{ id: 'b-1', data: '2026-11-27', motivo: 'Recesso interno' }],
    editais: [],
    envios: [],
  }
}

export const db: Db = estadoInicial()

export function reset(): void {
  Object.assign(db, estadoInicial())
}

export function logar(username: 'admin' | 'operador' = 'admin'): void {
  db.sessao = db.usuarios.find((u) => u.username === username) ?? null
}

export function usuarioLogado(): UsuarioMock | null {
  if (!db.sessao) return null
  const atual = db.usuarios.find((u) => u.id === db.sessao?.id) ?? null
  return atual?.ativo ? atual : null
}

export function registrarFalhaLogin(username: string): void {
  const agora = Date.now()
  const lista = (db.falhasLogin.get(username) ?? []).filter((t) => agora - t < LOGIN_JANELA_MS)
  lista.push(agora)
  db.falhasLogin.set(username, lista)
}

export function limparFalhasLogin(username: string): void {
  db.falhasLogin.delete(username)
}

export function segundosBloqueio(username: string): number {
  const agora = Date.now()
  const recentes = (db.falhasLogin.get(username) ?? []).filter((t) => agora - t < LOGIN_JANELA_MS)
  if (recentes.length < LOGIN_MAX_TENTATIVAS) return 0
  const maisAntiga = Math.min(...recentes)
  return Math.max(1, Math.ceil((maisAntiga + LOGIN_JANELA_MS - agora) / 1000))
}

export function leilaoAtivo(processoId: string): LeilaoMock | null {
  return db.leiloes.find((l) => l.processo_id === processoId && l.status === 'agendado') ?? null
}

function editalMaisRecente(leilaoId: string): EditalOut | null {
  const lista = db.editais
    .filter((e) => e.leilao_id === leilaoId)
    .sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em))
  return lista[0] ?? null
}

export function toUsuarioOut(u: UsuarioMock): UsuarioOut {
  return { id: u.id, username: u.username, nome: u.nome, perfil: u.perfil, ativo: u.ativo }
}

export function toProcessoOut(p: ProcessoMock): ProcessoOut {
  return {
    id: p.id,
    nome_arquivo: p.nome_arquivo,
    status: p.status,
    numero_processo: p.numero_processo,
    vara: p.vara,
    erro: p.erro,
    criado_em: p.criado_em,
    analisado_em: p.analisado_em,
  }
}

export function toLeilaoOut(l: LeilaoMock): LeilaoOut {
  const processo = db.processos.find((p) => p.id === l.processo_id)
  return {
    id: l.id,
    processo_id: l.processo_id,
    numero_processo: processo?.numero_processo ?? null,
    primeiro_leilao_em: l.primeiro_leilao_em,
    segundo_leilao_em: l.segundo_leilao_em,
    status: l.status,
    edital_id: editalMaisRecente(l.id)?.id ?? null,
    criado_em: l.criado_em,
  }
}

export function toDetalhe(p: ProcessoMock): ProcessoDetalheOut {
  const leilao = leilaoAtivo(p.id)
  return {
    ...toProcessoOut(p),
    checklist: p.checklist,
    relatorio: p.relatorio,
    leilao: leilao ? toLeilaoOut(leilao) : null,
  }
}

export function toEnvioOut(e: EnvioMock): EnvioOut {
  const leilao = db.leiloes.find((l) => l.id === e.leilao_id)
  const processo = leilao ? db.processos.find((p) => p.id === leilao.processo_id) : undefined
  return {
    id: e.id,
    leilao_id: e.leilao_id,
    numero_processo: processo?.numero_processo ?? null,
    destinatarios: e.destinatarios,
    enviado_em: e.enviado_em,
    status: e.status,
    erro: e.erro,
  }
}
