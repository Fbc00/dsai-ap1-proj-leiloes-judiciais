import type { Advogado, Checklist, Relatorio } from '@/api/types'

const ADVOGADOS_EXECUTADOS: Advogado[] = [
  { nome: 'Maria Zélida Candado de Andrade', oab: 'OAB/TO 10.217', ref: 'Id 1315207293' },
  { nome: 'Ciy Farney Jose Schmaltz Caetano', oab: 'OAB/TO 6.607', ref: 'Id 1316180771' },
]

export const CHECKLIST_EXEMPLO: Checklist = {
  vara: '2ª Vara Federal Cível e Criminal da Comarca de Araguaína - TO',
  numero_processo: '1003966-15.2022.4.01.4301',
  juiz: 'CLAUDIO CEZAR CAVALCANTES',
  tipo_justica: 'federal',
  exequente: {
    nome: 'UNIÃO FEDERAL',
    cpf_cnpj: '00.394.411/0001-09',
    advogados: [
      {
        nome: 'Procuradoria da União nos Estados e no Distrito Federal',
        oab: null,
        ref: null,
      },
    ],
  },
  executados: [
    {
      nome: 'EURIVALDO SOARES DE ANDRADE & CIA LTDA',
      cpf_cnpj: '07.354.652/0001-73',
      advogados: ADVOGADOS_EXECUTADOS,
      citado: true,
      citacao_forma: 'mandado',
      citacao_ref: 'Id 1308225768',
    },
    {
      nome: 'EURIVALDO SOARES DE ANDRADE',
      cpf_cnpj: '179.658.022-87',
      advogados: ADVOGADOS_EXECUTADOS,
      citado: true,
      citacao_forma: 'mandado',
      citacao_ref: 'Id 1308225782',
    },
  ],
  execucao: {
    cda: '12.345.678-9',
    natureza_divida: 'Tributária',
    classe: 'Execução Fiscal',
    valor_divida: '187450.32',
    data_divida: '2022-08-15',
  },
  bens: [
    {
      descricao:
        'Lote nº 04, Quadra 18, Loteamento Boa Esperança, situado na Avenida Manoel Dias de Oliveira, com área de 360m², Município de Babaçulândia-TO, medindo 12,00 metros de frente pela Avenida Manoel Dias de Oliveira; 30,00 metros de lateral direita, confrontando com o Lote 05; 12,00 metros de fundo, confrontando com o Lote 31 e 30,00 metros de lateral esquerda, confrontando com o Lote 03.',
      matricula: '6.351',
      localizacao: 'Avenida Manoel Dias de Oliveira, Babaçulândia-TO',
      data_penhora: '2025-10-24',
      penhora_ref: 'Id 2221536340',
      fiel_depositario: 'Eurivaldo Soares de Andrade (Id 2221536095)',
      executado_intimado: true,
      data_intimacao: '2025-11-06',
      intimacao_ref: 'Id 2221534539',
      propriedade: 'Imóvel de propriedade da pessoa jurídica executada',
      valor_avaliacao: '95000.00',
      data_avaliacao: '2025-10-24',
      oficial_avaliacao: 'Oficial de Justiça Avaliador',
      valor_reavaliacao: null,
      data_reavaliacao: null,
      certidao_matricula_ref: 'Id 2221536102',
      averbacao_penhora: 'Av. 3/6.351',
      hipoteca: 'Imóvel sem ônus hipotecário',
      enfiteuse: null,
      outras_penhoras: null,
    },
    {
      descricao:
        'Lote nº 10, Quadra 11, Loteamento Boa Esperança, situado na Avenida Santa Luzia, com área de 391,08m², Município de Babaçulândia-TO, medindo 9,97 metros de frente pela Avenida Santa Luzia; 38,56 metros de lateral direita, confrontando com o Lote 11; 10,12 metros de fundo, confrontando com a área da Igreja e 39,95 metros de lateral esquerda, confrontando com o Lote 09.',
      matricula: '6.235',
      localizacao: 'Avenida Santa Luzia, Babaçulândia-TO',
      data_penhora: '2025-10-24',
      penhora_ref: 'Id 2221536340',
      fiel_depositario: 'Eurivaldo Soares de Andrade (Id 2221536095)',
      executado_intimado: true,
      data_intimacao: '2025-11-06',
      intimacao_ref: 'Id 2221534539',
      propriedade: 'Imóvel de propriedade da pessoa jurídica executada',
      valor_avaliacao: '120000.00',
      data_avaliacao: '2025-10-24',
      oficial_avaliacao: 'Oficial de Justiça Avaliador',
      valor_reavaliacao: '132000.00',
      data_reavaliacao: '2026-06-10',
      certidao_matricula_ref: 'Id 2221536110',
      averbacao_penhora: 'Av. 2/6.235',
      hipoteca: 'Imóvel sem ônus hipotecário',
      enfiteuse: null,
      outras_penhoras: null,
    },
  ],
  recursos: 'Não foi certificada a interposição de quaisquer recursos nos autos de execução.',
  observacoes_leilao: [
    'Nomeação do leiloeiro Sandro de Oliveira à fl. 284.',
    'Imóveis localizados fisicamente pelo Oficial de Justiça no ato da penhora.',
  ],
}

export const RELATORIO_EXEMPLO: Relatorio = {
  resumo:
    'Execução fiscal movida pela União Federal contra Eurivaldo Soares de Andrade & Cia Ltda e sócio. Executados citados por mandado, penhora de dois imóveis em Babaçulândia-TO realizada em 24/10/2025 e executados intimados em 06/11/2025. Sem recursos pendentes; processo apto a leilão.',
  etapas: [
    {
      data: '2022-08-15',
      descricao: 'Ajuizamento da execução fiscal pela União Federal.',
      ref: 'Id 1298001122',
    },
    { data: '2023-02-10', descricao: 'Citação dos executados por mandado.', ref: 'Id 1308225768' },
    {
      data: '2025-10-24',
      descricao: 'Penhora e avaliação dos imóveis matrículas 6.351 e 6.235.',
      ref: 'Id 2221536340',
    },
    {
      data: '2025-11-06',
      descricao: 'Intimação dos executados sobre a penhora.',
      ref: 'Id 2221534539',
    },
  ],
}
