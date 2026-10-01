export type ErroOut = { detail: string }

export type Perfil = 'admin' | 'operador'

export type UsuarioOut = {
  id: string
  username: string
  nome: string
  perfil: Perfil
  ativo: boolean
}
export type LoginIn = { username: string; password: string }
export type SenhaIn = { senha_atual: string; nova_senha: string }
export type UsuarioCreate = { username: string; nome: string; perfil: Perfil; senha: string }
export type UsuarioUpdate = {
  nome?: string
  perfil?: Perfil
  ativo?: boolean
  nova_senha?: string
}

export type ProcessoStatus = 'recebido' | 'analisando' | 'analisado' | 'erro'

export type ProcessoOut = {
  id: string
  nome_arquivo: string
  status: ProcessoStatus
  numero_processo: string | null
  vara: string | null
  erro: string | null
  criado_em: string
  analisado_em: string | null
}

export type Advogado = { nome: string; oab: string | null; ref: string | null }

export type Parte = { nome: string; cpf_cnpj: string | null; advogados: Advogado[] }

export type Executado = Parte & {
  citado: boolean | null
  citacao_forma: string | null
  citacao_ref: string | null
}

export type Execucao = {
  cda: string | null
  natureza_divida: string | null
  classe: string | null
  valor_divida: string | null
  data_divida: string | null
}

export type BemPenhorado = {
  descricao: string
  matricula: string | null
  localizacao: string | null
  data_penhora: string | null
  penhora_ref: string | null
  fiel_depositario: string | null
  executado_intimado: boolean | null
  data_intimacao: string | null
  intimacao_ref: string | null
  propriedade: string | null
  valor_avaliacao: string | null
  data_avaliacao: string | null
  oficial_avaliacao: string | null
  valor_reavaliacao: string | null
  data_reavaliacao: string | null
  certidao_matricula_ref: string | null
  averbacao_penhora: string | null
  hipoteca: string | null
  enfiteuse: string | null
  outras_penhoras: string | null
}

export type TipoJustica = 'estadual' | 'federal'

export type Checklist = {
  vara: string | null
  numero_processo: string | null
  juiz: string | null
  tipo_justica: TipoJustica | null
  exequente: Parte
  executados: Executado[]
  execucao: Execucao
  bens: BemPenhorado[]
  recursos: string | null
  observacoes_leilao: string[]
}

export type Etapa = { data: string | null; descricao: string; ref: string | null }
export type Relatorio = { resumo: string; etapas: Etapa[] }

export type LeilaoStatus = 'agendado' | 'cancelado'

export type LeilaoOut = {
  id: string
  processo_id: string
  numero_processo: string | null
  primeiro_leilao_em: string
  segundo_leilao_em: string
  status: LeilaoStatus
  edital_id: string | null
  criado_em: string
}

export type LeilaoCreate = { processo_id: string; primeiro_leilao_data?: string }
export type SugestaoOut = { primeiro_leilao_em: string; segundo_leilao_em: string }
export type BloqueioOut = { id: string; data: string; motivo: string }
export type BloqueioCreate = { data: string; motivo: string }
export type FeriadoOut = { data: string; motivo: string }

export type ProcessoDetalheOut = ProcessoOut & {
  checklist: Checklist | null
  relatorio: Relatorio | null
  leilao: LeilaoOut | null
}

export type EditalOut = {
  id: string
  leilao_id: string
  processo_id: string
  conteudo_markdown: string
  criado_em: string
  atualizado_em: string | null
}
export type EditalCreate = { leilao_id: string }
export type EditalUpdate = { conteudo_markdown: string }

export type EnvioStatus = 'enviado' | 'erro'

export type EnvioOut = {
  id: string
  leilao_id: string
  numero_processo: string | null
  destinatarios: string[]
  enviado_em: string
  status: EnvioStatus
  erro: string | null
}
export type EnvioCreate = { leilao_id: string }
