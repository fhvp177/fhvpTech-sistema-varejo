/** Onde esta interface está rodando: na janela instalada ou no navegador. */
declare const __ALVO__: 'desktop' | 'web'

// Tipos da API exposta pelo preload via contextBridge
// Mantido em sync com electron/preload.ts

// Injetado em build-time pelo electron.vite.config.ts a partir de package.json.version
declare const __APP_VERSION__: string

// Edição e flags de features injetadas em build-time (electron.vite.config.ts).
// Booleanos literais no build → o bundler faz tree-shaking das features desligadas.
declare const __EDICAO__: string
declare const __FEAT_DASHBOARD__: boolean
declare const __FEAT_CHATBOT__: boolean
declare const __FEAT_ETIQUETAS__: boolean
declare const __FEAT_TEF__: boolean
declare const __FEAT_NFE__: boolean
declare const __FEAT_MULTICAIXA__: boolean
/** Tapume de obra da maquininha integrada — false até a feature ficar pronta. */
declare const __FEAT_PAGAMENTO__: boolean

type RespostaIPC<T = unknown> = { success: true; data: T } | { success: false; error: string }

// Configuração fiscal da NFC-e. Espelha ConfigFiscal em electron/ipc/fiscal.ts.
// `regime_tributario` é o CRT da SEFAZ: 1 = Simples Nacional, 2 = Simples com
// excesso de sublimite, 3 = Regime Normal. Certificado e CSC não vêm aqui —
// só o que é seguro guardar localmente (identificador e metadados).
type ConfigFiscal = {
  inscricao_estadual: string
  regime_tributario: '' | '1' | '2' | '3'
  codigo_municipio: string
  email: string
  serie_nfce: number
  cfop_padrao: string
  csc_id: string
  ambiente: 'homologacao' | 'producao'
  endereco_logradouro: string
  endereco_numero: string
  endereco_complemento: string
  endereco_bairro: string
  largura_bobina: number
  empresa_cadastrada: boolean
  csc_configurado: boolean
  certificado_titular: string
  certificado_validade: string
  configurada: boolean
}

// Cadastro fiscal do cliente — o que a NF-e exige do destinatário. Só importa
// para cliente pessoa jurídica; consumidor comum recebe NFC-e, que não pede
// nada disso. `indicador_ie`: 1 = contribuinte de ICMS · 2 = isento ·
// 9 = não contribuinte.
type FiscalCliente = {
  endereco_logradouro: string
  endereco_numero: string
  endereco_complemento: string
  endereco_bairro: string
  cidade: string
  uf: string
  cep: string
  codigo_municipio: string
  inscricao_estadual: string
  indicador_ie: string
}

// Classificação fiscal de um produto. Sem NCM ele não sai em nota nenhuma.
// `origem`: 0 = nacional (a esmagadora maioria). `cst_csosn`: CSOSN no Simples.
type FiscalProduto = {
  ncm: string
  cfop: string
  cst_csosn: string
  origem: string
  unidade: string
}

type ProdutoClassificacao = {
  id: number
  nome: string
  categoria: string | null
  codigo_barras: string | null
  ncm: string | null
  cfop: string | null
  cst_csosn: string | null
  origem: string | null
  unidade: string | null
}

// Nota fiscal de uma venda, como o app guarda localmente. `status` segue o
// vocabulário da SEFAZ/ACBr: pendente → autorizado | rejeitado | denegado, e
// cancelado depois. Uma linha por TENTATIVA (rejeição faz parte do histórico).
type NotaFiscalVenda = {
  id: number
  venda_id: number
  tentativa: number
  referencia: string
  acbr_id: string | null
  ambiente: string
  modelo: number
  serie: number
  numero: number
  chave: string | null
  status: 'pendente' | 'autorizado' | 'rejeitado' | 'denegado' | 'cancelado' | 'erro'
  motivo: string | null
  criada_em: string
}

// Nota no relatório mensal (o que o contador pede).
type NotaDoMes = NotaFiscalVenda & {
  venda_total: number
  venda_data: string
  tem_xml: number
}

// Diagnóstico "a loja está pronta pra emitir?" — calculado no banco local,
// sem chamar a API e sem gastar crédito.
type DiagnosticoFiscal = {
  total_produtos: number
  produtos_sem_ncm: number
  exemplos_sem_ncm: Array<{ id: number; nome: string; codigo_barras: string | null }>
}

type StatusRelogio = {
  // 'relogio-errado-mesmo': o servidor desmentiu a data da maquina.
  // 'sem-conferencia': sem internet, nao deu para conferir com ninguem.
  tratamento: 'consertar' | 'relogio-errado-mesmo' | 'sem-conferencia'
  horaServidorISO?: string
  horaLocalISO: string
}

type StatusLicenca = {
  valida: boolean
  diasRestantes?: number
  mensagem: string
  clienteId?: string
  aviso?: string
  motivo?: 'relogio'
  relogio?: StatusRelogio
}

type CobrancaPix = {
  txid: string
  clienteId: string
  valorCentavos: number
  diasContratados: number
  status: 'pendente' | 'paga' | 'expirada'
  qrcode: string
  qrcodeBase64: string
  criadaEm: string
  expiraEm: string
  pagaEm?: string
  chaveLicencaGerada?: string
}

type MetricasDashboard = {
  periodo_dias: number
  granularidade: 'dia' | 'semana' | 'mes'
  faturamento_atual: number
  faturamento_anterior: number
  custo_vendas_atual: number
  custo_vendas_anterior: number
  devolucoes_atual: number
  devolucoes_anterior: number
  num_vendas_atual: number
  num_vendas_anterior: number
  ticket_medio_atual: number
  ticket_medio_anterior: number
  clientes_novos_atual: number
  clientes_novos_anterior: number
  meta_mensal: number
  faturamento_mes_corrente: number
  serie_temporal: Array<{
    rotulo: string
    data_inicio: string
    total: number
    total_anterior: number
    num_vendas: number
    /** O que as peças vendidas neste dia custaram — o valor da reposição. */
    custo: number
    /** Faturamento menos custo. Bruto: não desconta despesa nenhuma. */
    lucro: number
  }>
  /** Peças vendidas no período sem custo cadastrado. Zero infla o lucro. */
  itens_sem_custo: number
  faturamento_sem_custo: number
  top_produtos: Array<{
    produto_id: number
    nome: string
    quantidade: number
    receita: number
  }>
  top_categorias: Array<{
    categoria: string
    quantidade: number
    receita: number
  }>
  ranking_vendedores: Array<{
    vendedor_id: number
    nome: string
    num_vendas: number
    receita: number
  }>
  vendas_por_dia_semana: Array<{
    dow: number
    total: number
  }>
  aniversariantes_mes: Array<{
    id: number
    nome: string
    telefone: string
    dia: string
  }>
  distribuicao_pagamento: {
    pago: { num: number; valor: number }
    pendente: { num: number; valor: number }
    parcelado: { num: number; valor: number }
    inadimplente: { num: number; valor: number }
  }
  recebivel_futuro: {
    proximos_30d: number
    proximos_60d: number
    proximos_90d: number
  }
  a_receber_periodo: {
    a_vencer: number
    vencido: number
  }
  /** Em aberto sem data combinada — fora de qualquer recorte de vencimento. */
  a_receber_sem_prazo: number
  a_pagar_periodo: {
    a_vencer: number
    vencido: number
  }
  a_pagar_futuro: {
    proximos_30d: number
    proximos_60d: number
    proximos_90d: number
  }
  produtos_parados: Array<{
    produto_id: number
    nome: string
    estoque: number
    categoria: string | null
    dias_parado: number
  }>
  estoque_baixo: Array<{
    produto_id: number
    nome: string
    estoque: number
    tamanho: string | null
  }>
}

/** Papel dos comprovantes de caixa. Bobina de 80mm ou folha A4. */
type PapelCaixa = 'termica' | 'a4'

type ContaFinanceira = {
  id: number
  nome: string
  tipo: 'caixa' | 'banco' | 'a_receber'
  banco: string | null
  agencia: string | null
  conta: string | null
  saldo_inicial: number
  ativa: number
  padrao_recebimento: number
  padrao_pagamento: number
  forma_padrao: string | null
  criada_em: string
  saldo: number
}

type Transferencia = {
  id: number
  conta_origem_id: number
  conta_origem_nome: string
  conta_destino_id: number
  conta_destino_nome: string
  valor: number
  observacao: string | null
  vendedor_id: number | null
  vendedor_nome: string | null
  criada_em: string
}

type CategoriaConta = {
  id: number
  nome: string
  /** Quantas contas a pagar usam esta categoria. */
  contas_count: number
}

type MovimentoFinanceiro = {
  id: number
  conta_id: number
  conta_nome: string
  data: string
  valor: number
  tipo: string
  descricao: string | null
  forma_pagamento: string | null
  origem_tipo: string | null
  origem_id: number | null
  turno_id: number | null
  vendedor_id: number | null
  saldo_corrente: number
}

/**
 * Um item vendido, do ponto de vista da garantia.
 *
 * ⚠️ `garantia_dias` já vem resolvido pela escada (o congelado no item, senão o
 * do produto, senão o padrão da loja). A tela nunca refaz essa conta.
 * `prazo_estimado` diz que a venda é anterior ao módulo e o prazo é palpite.
 */
type ItemComGarantia = {
  item_venda_id: number
  venda_id: number
  data_venda: string
  produto_id: number
  produto_nome: string
  tamanho: string | null
  quantidade: number
  preco_unitario: number
  cliente_id: number | null
  cliente_nome: string | null
  cliente_telefone: string | null
  venda_cancelada: number
  garantia_dias: number
  garantia_ate: string | null
  dias_restantes: number | null
  prazo_estimado: boolean
  atendimentos: number
}

type Garantia = {
  id: number
  item_venda_id: number
  venda_id: number
  aberta_em: string
  aberta_por: number | null
  aberta_por_nome: string | null
  defeito: string
  situacao: 'aberta' | 'resolvida' | 'recusada'
  desfecho: string | null
  observacao: string | null
  dentro_do_prazo: number
  fechada_em: string | null
  fechada_por: number | null
  fechada_por_nome: string | null
  produto_nome: string
  cliente_nome: string | null
  cliente_telefone: string | null
  data_venda: string
}

type ResumoGarantias = {
  abertas: number
  fora_do_prazo_abertas: number
  resolvidas_30d: number
  recusadas_30d: number
}

/** Uma linha da tela de lançamento do investimento em anúncio. */
type InvestimentoCanal = {
  origem_id: number
  origem_nome: string
  valor: number
  observacao: string | null
  /** Clientes que vieram por este canal. Só para a tela explicar a linha. */
  clientes: number
}

/**
 * Tráfego pago no período do Painel.
 *
 * ⚠️ São DOIS ROAS. O `roas_atribuido` conta só o faturamento de cliente com
 * origem preenchida, e é o honesto. O `roas_geral` divide o faturamento da loja
 * INTEIRA pelo mesmo gasto, então sempre parece melhor: serve de ordem de
 * grandeza, não de atribuição.
 */
type ResumoTrafego = {
  inicio: string
  fim: string
  investimento: number
  receita_atribuida: number
  receita_total: number
  roas_atribuido: number
  roas_geral: number
  clientes_novos_atribuidos: number
  custo_por_cliente: number
  clientes_sem_origem: number
  canais: Array<{
    origem_id: number
    origem_nome: string
    investimento: number
    receita: number
    num_vendas: number
    clientes_novos: number
    roas: number
  }>
}

/**
 * O mês fechado do dinheiro (tela de Relatórios financeiros).
 *
 * ⚠️ `receitas − despesas` é o RESULTADO, não a variação do saldo. O que fecha
 * a conta até o saldo final é a linha `movimentacoes_internas`, que é sangria e
 * suprimento: dinheiro que mudou de lugar sem a loja ganhar nem gastar.
 */
type ResumoFinanceiroMes = {
  mes: string
  primeiro_dia: string
  ultimo_dia: string
  saldo_inicial: number
  saldo_final: number
  receitas: number
  despesas: number
  resultado: number
  movimentacoes_internas: number
  lancamentos: number
  por_dia: Array<{ dia: string; receitas: number; despesas: number }>
  despesas_por_categoria: Array<{ categoria: string; total: number; lancamentos: number }>
  por_conta: Array<{
    conta_id: number
    nome: string
    tipo: string
    entradas: number
    saidas: number
    saldo_final: number
  }>
}

type TurnoCaixa = {
  id: number
  conta_id: number
  conta_nome: string
  aberto_por: number
  aberto_por_nome: string | null
  aberto_em: string
  fundo_troco: number
  fechado_por: number | null
  fechado_por_nome: string | null
  fechado_em: string | null
  confirmado_por: number | null
  confirmado_por_nome: string | null
  confirmado_em: string | null
  justificativa: string | null
  fora_de_hora: number
}

type DiferencaOperador = {
  vendedor_id: number | null
  vendedor_nome: string | null
  turnos: number
  quebras: number
  sobras: number
  total_diferenca: number
  pior: number
}

type ContagemTurno = {
  forma: string
  valor_contado: number
  valor_esperado: number
  diferenca: number
}

type TurnoFechado = {
  turno: TurnoCaixa
  contagens: ContagemTurno[]
  diferenca_dinheiro: number
}

type ItemPedido = {
  id: number
  produto_id: number
  variacao_id: number | null
  quantidade: number
  preco_unitario: number
  nome: string
  tamanho: string | null
}

type PedidoSeparado = {
  id: number
  cliente_id: number | null
  cliente_nome: string | null
  cliente_telefone: string | null
  vendedor_id: number
  vendedor_nome: string | null
  situacao: 'separado' | 'concluido' | 'cancelado'
  criado_em: string
  para_entrega: number
  endereco_entrega: string | null
  observacao: string | null
  desconto: number
  total: number
  /** Sinal já pago e já lançado no livro. Falta receber `total - sinal`. */
  sinal: number
  venda_id: number | null
  concluido_em: string | null
  cancelado_em: string | null
  motivo_cancelamento: string | null
  dias_parado: number
  itens?: ItemPedido[]
}

type ContaPagar = {
  id: number
  descricao: string
  categoria: string | null
  fornecedor_id: number | null
  fornecedor_nome: string | null
  valor_total: number
  valor_pago: number
  restante: number
  vencimento: string | null
  observacao: string | null
  criada_em: string
  pago_em: string | null
  situacao: 'aberta' | 'vencida' | 'paga'
}

type ResumoContasPagar = {
  vencido_total: number
  vence_7d_total: number
  aberto_total: number
  pago_mes: number
}

type LinhaComissao = {
  vendedor_id: number | null
  vendedor_nome: string
  ativo: number
  qtd_vendas: number
  base: number
  valor_comissao: number
  pct_vigente: number
  /** 1 quando as vendas do período foram carimbadas com percentuais diferentes. */
  pct_misto: number
  /** 0 na linha "Sem vendedor" — informa, mas não gera comissão. */
  comissionavel: number
  pagamento_id: number | null
  pago_em: string | null
  valor_pago_comissao: number | null
}

type ResumoComissoes = {
  inicio: string
  fim: string
  padrao: number
  linhas: LinhaComissao[]
}

type VendaComissao = {
  venda_id: number
  data: string
  cliente_nome: string | null
  total: number
  devolvido: number
  base: number
  pct: number
  valor_comissao: number
}

type PagamentoComissao = {
  id: number
  vendedor_id: number
  vendedor_nome: string
  periodo_inicio: string
  periodo_fim: string
  qtd_vendas: number
  valor_base: number
  valor_comissao: number
  pago_em: string
  pago_por_nome: string | null
  observacao: string | null
}

interface Window {
  api: {
    produtos: {
      /** Sem os arquivados, a menos que se peça — só a tela de Produtos pede. */
      listar: (incluirArquivados?: boolean) => Promise<RespostaIPC>
      criar: (dados: unknown, pinDono?: string) => Promise<RespostaIPC>
      atualizar: (id: number, dados: unknown) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
      /**
       * Tira de circulação sem apagar o passado (ou traz de volta, com `false`).
       * É o caminho para o produto que já foi vendido e por isso não pode ser
       * excluído — ver a migration 052.
       */
      arquivar: (id: number, arquivar?: boolean) => Promise<RespostaIPC>
      /** ⚠️ ACHA o arquivado de propósito, para o caixa poder dizer o que houve. */
      buscarPorCodigoBarras: (codigo: string) => Promise<RespostaIPC>
    }
    clientes: {
      listar: () => Promise<RespostaIPC>
      criar: (dados: unknown) => Promise<RespostaIPC>
      atualizar: (id: number, dados: unknown) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
      listarInadimplentes: () => Promise<RespostaIPC>
      listarVencendoHoje: () => Promise<RespostaIPC>
      resumoCaptacao: () => Promise<RespostaIPC>
    }
    fornecedores: {
      listar: () => Promise<RespostaIPC>
      criar: (dados: unknown) => Promise<RespostaIPC>
      atualizar: (id: number, dados: unknown) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
    }
    contasPagar: {
      listar: (filtro?: 'aberto' | 'pago' | 'todas') => Promise<RespostaIPC<ContaPagar[]>>
      resumo: () => Promise<RespostaIPC<ResumoContasPagar>>
      criar: (dados: unknown) => Promise<RespostaIPC<ContaPagar>>
      atualizar: (id: number, dados: unknown) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
      registrarPagamento: (
        id: number,
        valor: number,
        contaFinanceiraId?: number
      ) => Promise<RespostaIPC>
      estornarPagamento: (id: number) => Promise<RespostaIPC>
    }
    financeiro: {
      listarContas: (incluirInativas?: boolean) => Promise<RespostaIPC<ContaFinanceira[]>>
      criarConta: (dados: unknown) => Promise<RespostaIPC<{ id: number }>>
      atualizarConta: (id: number, dados: unknown) => Promise<RespostaIPC>
      desativarConta: (id: number) => Promise<RespostaIPC>
      reativarConta: (id: number) => Promise<RespostaIPC>
      extrato: (filtro?: {
        conta_id?: number | null
        de?: string | null
        ate?: string | null
        limite?: number
      }) => Promise<RespostaIPC<MovimentoFinanceiro[]>>
      saldoConsolidado: () => Promise<RespostaIPC<number>>
      resumoMensal: (mes: string) => Promise<RespostaIPC<ResumoFinanceiroMes>>
      mesesComMovimento: () => Promise<RespostaIPC<string[]>>
      lancar: (
        contaId: number,
        valor: number,
        tipo: string,
        descricao: string
      ) => Promise<RespostaIPC>
      /** Move dinheiro entre duas contas da loja. Nunca é receita nem despesa. */
      transferir: (dados: unknown) => Promise<RespostaIPC<{ id: number }>>
      listarTransferencias: (mes?: string) => Promise<RespostaIPC<Transferencia[]>>
      mesesComTransferencia: () => Promise<RespostaIPC<string[]>>
    }
    categoriasConta: {
      listar: () => Promise<RespostaIPC<CategoriaConta[]>>
      criar: (nome: string) => Promise<RespostaIPC<{ id: number; nome: string }>>
      atualizar: (id: number, nome: string) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
    }
    caixa: {
      turnoAberto: (caixaId?: number) => Promise<RespostaIPC<TurnoCaixa | null>>
      caixasComTurno: () => Promise<
        RespostaIPC<Array<{ id: number; nome: string; turno: TurnoCaixa | null }>>
      >
      abrirTurno: (contaId: number, fundoTroco: number) => Promise<RespostaIPC<{ id: number }>>
      fecharTurno: (
        turnoId: number,
        contagens: Array<{ forma: string; valor_contado: number }>
      ) => Promise<RespostaIPC<TurnoFechado>>
      confirmarTurno: (turnoId: number, justificativa?: string) => Promise<RespostaIPC>
      listarTurnos: (limite?: number) => Promise<RespostaIPC<TurnoCaixa[]>>
      contagens: (turnoId: number) => Promise<RespostaIPC<ContagemTurno[]>>
      diferencasPorOperador: (
        de: string,
        ate: string
      ) => Promise<RespostaIPC<DiferencaOperador[]>>
      turnoParaRelatorio: (
        turnoId: number
      ) => Promise<RespostaIPC<{ turno: TurnoCaixa; contagens: ContagemTurno[] } | null>>
      // O que foi vendido num turno, com o resumo por forma de pagamento.
      vendasDoTurno: (turnoId: number) => Promise<RespostaIPC>
      exigencia: () => Promise<RespostaIPC<boolean>>
      definirExigencia: (exigir: boolean) => Promise<RespostaIPC>
      sangria: (contaId: number, valor: number, descricao: string) => Promise<RespostaIPC>
      suprimento: (contaId: number, valor: number, descricao: string) => Promise<RespostaIPC>
    }
    pedidos: {
      criar: (dados: unknown) => Promise<RespostaIPC<{ id: number }>>
      concluir: (pedidoId: number, pagamento: unknown) => Promise<RespostaIPC>
      cancelar: (pedidoId: number, motivo?: string) => Promise<RespostaIPC>
      listar: (situacao?: string) => Promise<RespostaIPC<PedidoSeparado[]>>
      detalhe: (pedidoId: number) => Promise<RespostaIPC<PedidoSeparado | null>>
      totalSeparados: () => Promise<RespostaIPC<number>>
    }
    comissoes: {
      configurado: () => Promise<RespostaIPC<boolean>>
      resumo: (mes: string) => Promise<RespostaIPC<ResumoComissoes>>
      detalhe: (vendedorId: number | null, mes: string) => Promise<RespostaIPC<VendaComissao[]>>
      registrarPagamento: (dados: {
        vendedor_id: number
        mes: string
        observacao?: string | null
      }) => Promise<RespostaIPC<{ id: number; valor_comissao: number }>>
      estornarPagamento: (id: number) => Promise<RespostaIPC>
      listarPagamentos: (vendedorId?: number) => Promise<RespostaIPC<PagamentoComissao[]>>
      obterPadrao: () => Promise<RespostaIPC<number>>
      definirPadrao: (pct: number) => Promise<RespostaIPC>
    }
    notasEntrada: {
      analisar: (
        chave: string,
        fornecedorCnpj: string | null,
        itens: unknown[]
      ) => Promise<RespostaIPC>
      importar: (dados: unknown) => Promise<RespostaIPC>
      listar: (mes?: string) => Promise<RespostaIPC>
      meses: () => Promise<RespostaIPC<string[]>>
      exportarXmls: (
        mes: string
      ) => Promise<RespostaIPC<{ pasta: string; quantidade: number } | null>>
    }
    categorias: {
      listar: () => Promise<RespostaIPC<Array<{ id: number; nome: string; produtos_count: number; usa_tamanhos: number }>>>
      criar: (nome: string) => Promise<RespostaIPC<{ id: number; nome: string }>>
      atualizar: (id: number, nome: string) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
      definirTamanhos: (id: number, usa: boolean) => Promise<RespostaIPC>
    }
    // Origens de captação do cliente: Instagram, WhatsApp, presencial...
    // Comprovante de pagamento anexado a uma venda (a foto do PIX).
    comprovantes: {
      anexar: (
        vendaId: number,
        arquivo: { mime: string; dados: string; nome_arquivo?: string | null }
      ) => Promise<RespostaIPC>
      obter: (vendaId: number) => Promise<RespostaIPC>
      resumo: (vendaId: number) => Promise<RespostaIPC>
      quaisTem: (ids: number[]) => Promise<RespostaIPC<number[]>>
      remover: (vendaId: number) => Promise<RespostaIPC>
    }
    origens: {
      listar: () => Promise<RespostaIPC<Array<{ id: number; nome: string; clientes_count: number }>>>
      criar: (nome: string) => Promise<RespostaIPC<{ id: number; nome: string }>>
      atualizar: (id: number, nome: string) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
    }
    vendedores: {
      listar: () => Promise<RespostaIPC<Array<{
        id: number
        nome: string
        ativo: number
        papel: 'dono' | 'vendedor'
        email: string | null
        tem_pin: number
        vendas_count: number
        comissao_pct: number | null
      }>>>
      criar: (
        dados: { nome: string; email?: string | null } | string
      ) => Promise<RespostaIPC<{ id: number; nome: string }>>
      atualizar: (
        id: number,
        dados:
          | { nome?: string; email?: string | null; comissao_pct?: number | null }
          | string
      ) => Promise<RespostaIPC>
      alternarAtivo: (id: number, ativo: boolean) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
      alterarPapel: (id: number, papel: 'dono' | 'vendedor') => Promise<RespostaIPC>
      redefinirPin: (id: number, novoPin: string) => Promise<RespostaIPC>
    }
    vendas: {
      listar: (mes?: string) => Promise<RespostaIPC>
      listarCanceladas: (mes?: string) => Promise<RespostaIPC>
      criar: (dados: unknown) => Promise<RespostaIPC>
      atualizarStatus: (id: number, status: string) => Promise<RespostaIPC>
      buscarPorId: (id: number) => Promise<RespostaIPC>
      /** Onde cada dinheiro desta venda entrou, estornos inclusive. */
      recebimentos: (id: number) => Promise<RespostaIPC>
      /**
       * Se esta loja oferece venda parcelada. Ler é livre (o PDV decide se
       * desenha a opção); gravar é do dono.
       */
      permiteParcelamento: () => Promise<RespostaIPC>
      definirPermissaoParcelamento: (permitir: boolean) => Promise<RespostaIPC>
      // `forma` e `caixaId` NÃO são opcionais por preguiça: sem forma o
      // movimento nasce sem ela e o fechamento do caixa conta como dinheiro.
      // São opcionais só para não quebrar chamada de versão anterior.
      /**
       * ⚠️ `contaId` é IGNORADO quando a forma é dinheiro em espécie: a nota
       * está na gaveta do operador, e só lá. A trava é no banco, não aqui.
       */
      pagarParcela: (
        parcelaId: number,
        forma?: string | null,
        caixaId?: number | null,
        contaId?: number | null
      ) => Promise<RespostaIPC>
      registrarPagamentoParcial: (
        id: number,
        valor: number,
        forma?: string | null,
        caixaId?: number | null,
        contaId?: number | null
      ) => Promise<RespostaIPC>
      estornarParcela: (parcelaId: number) => Promise<RespostaIPC>
      estornarRecebimento: (id: number) => Promise<RespostaIPC>
      resumoDashboard: () => Promise<RespostaIPC>
      produtosMaisVendidos: (mes: string) => Promise<RespostaIPC>
      aReceberDoMes: (mes: string) => Promise<RespostaIPC<{ a_vencer: number; vencido: number }>>
      cancelar: (id: number, motivo: string, pinDono?: string) => Promise<RespostaIPC<null>>
    }
    config: {
      obter: (chave: string) => Promise<RespostaIPC<string | null>>
      salvar: (chave: string, valor: string) => Promise<RespostaIPC<null>>
    }
    loja: {
      obter: () => Promise<RespostaIPC>
      salvar: (dados: unknown) => Promise<RespostaIPC>
    }
    fiscal: {
      obter: () => Promise<RespostaIPC<ConfigFiscal>>
      salvar: (dados: Partial<ConfigFiscal>) => Promise<RespostaIPC<null>>
      diagnostico: () => Promise<RespostaIPC<DiagnosticoFiscal>>
      diasParaVencerCertificado: () => Promise<RespostaIPC<number | null>>
      resolverMunicipio: () => Promise<RespostaIPC<{ codigo_municipio: string; cidade: string }>>
      cadastrarEmpresa: () => Promise<RespostaIPC<null>>
      enviarCertificado: (args: {
        certificadoBase64: string
        senha: string
      }) => Promise<RespostaIPC<{ validade: string; titular: string }>>
      configurarCsc: (args: { csc: string; idCsc: string }) => Promise<RespostaIPC<null>>
      statusRemoto: () => Promise<
        RespostaIPC<{
          certificado: { existe: boolean; validade: string } | null
          creditos: number | null
        }>
      >
      emitirNfce: (args: {
        vendaId: number
        formaPagamento?: string
        /** 55 = NF-e · 65 = NFC-e. Escolhido na emissão; ausente = padrão pelo cadastro. */
        modelo?: 55 | 65
      }) => Promise<RespostaIPC<{ jaEmitida: boolean; nota: NotaFiscalVenda | null }>>
      statusNfce: (args: { vendaId: number }) => Promise<RespostaIPC<NotaFiscalVenda | null>>
      notasDasVendas: (ids: number[]) => Promise<RespostaIPC<Record<number, NotaFiscalVenda>>>
      danfe: (args: {
        vendaId: number
      }) => Promise<RespostaIPC<{ pdfBase64: string; numero: number }>>
      cancelarNfce: (args: {
        vendaId: number
        justificativa: string
      }) => Promise<RespostaIPC<NotaFiscalVenda | null>>
      obterCliente: (id: number) => Promise<RespostaIPC<FiscalCliente | null>>
      salvarCliente: (id: number, dados: FiscalCliente) => Promise<RespostaIPC<null>>
      /**
       * Dados da empresa na base da Receita, pelo CNPJ. Preenche o cadastro
       * fiscal do cliente — inclusive o código IBGE do município.
       * ⚠️ Custa 0,1 crédito pré-pago por consulta (medido). Dez consultas
       * equivalem a uma nota fiscal. Dispare num botão, nunca ao digitar.
       */
      buscarCnpj: (cnpj: string) => Promise<
        RespostaIPC<{
          cnpj: string
          razao_social: string
          nome_fantasia: string
          email?: string
          telefones?: Array<{ ddd: string; numero: string }>
          situacao_cadastral?: { codigo: string; descricao: string }
          endereco?: {
            tipo_logradouro?: string
            logradouro?: string
            numero?: string
            complemento?: string
            bairro?: string
            cep?: string
            uf?: string
            municipio?: { codigo_ibge?: string; descricao?: string }
          }
        }>
      >
      buscarCep: (cep: string) => Promise<
        RespostaIPC<{
          logradouro: string
          bairro: string
          municipio: string
          uf: string
          codigo_ibge: string
        }>
      >
      obterProduto: (id: number) => Promise<RespostaIPC<FiscalProduto | null>>
      salvarProduto: (id: number, dados: FiscalProduto) => Promise<RespostaIPC<null>>
      listarClassificacao: (filtro: {
        apenasPendentes?: boolean
        categoria?: string | null
        busca?: string
      }) => Promise<RespostaIPC<ProdutoClassificacao[]>>
      categoriasPendentes: () => Promise<
        RespostaIPC<Array<{ categoria: string | null; total: number }>>
      >
      aplicarEmLote: (args: {
        ids?: number[]
        categoria?: string | null
        dados: Partial<FiscalProduto>
        somentePendentes?: boolean
      }) => Promise<RespostaIPC<{ atualizados: number }>>
      xmlNota: (args: {
        vendaId: number
      }) => Promise<RespostaIPC<{ xml: string; doCache: boolean }>>
      notasDoMes: (mes: string) => Promise<RespostaIPC<NotaDoMes[]>>
      mesesComNotas: () => Promise<RespostaIPC<string[]>>
      salvarXmls: (
        mes: string,
        arquivos: Array<{ nome: string; conteudo: string }>
      ) => Promise<RespostaIPC<{ pasta: string; quantidade: number } | null>>
    }
    novidades: {
      estado: () => Promise<RespostaIPC<{ ultimaVersaoVista: string; guiaVisto: boolean }>>
      marcar: (versao: string) => Promise<RespostaIPC>
    }
    onboarding: {
      estado: () => Promise<RespostaIPC<{
        guiaVisto: boolean
        checklistDispensada: boolean
        progresso: {
          temProduto: boolean
          temCliente: boolean
          temVenda: boolean
          lojaConfigurada: boolean
          fiscalConfigurado?: boolean
        }
      }>>
      marcarGuiaVisto: () => Promise<RespostaIPC>
      dispensarChecklist: () => Promise<RespostaIPC>
    }
    notificacoes: {
      listar: () => Promise<RespostaIPC<{
        itens: Array<{
          id: number
          chave: string
          tipo: 'dinheiro' | 'estoque' | 'sistema' | 'relacionamento'
          severidade: 'critico' | 'alerta' | 'info'
          titulo: string
          descricao: string | null
          rota: string | null
          acao: 'suporte' | 'pix' | 'instalar-update' | null
          criada_em: string
          lida: number
        }>
        naoLidas: number
      }>>
      detalhe: (chave: string) => Promise<RespostaIPC<
        | {
            kind: 'recebiveis'
            titulo: string
            criterio: string
            cobranca: 'vence' | 'atraso'
            itens: Array<{ cliente: string; telefone: string; valor: number; vencimento: string; origem: string }>
          }
        | {
            kind: 'produtos'
            titulo: string
            criterio: string
            itens: Array<{ nome: string; estoque: number; dias_parado?: number }>
          }
        | null
      >>
      marcarLidas: () => Promise<RespostaIPC>
      dispensar: (id: number) => Promise<RespostaIPC>
    }
    licenca: {
      validar: () => Promise<RespostaIPC<StatusLicenca>>
      ativar: (chave: string) => Promise<RespostaIPC<StatusLicenca>>
      obterClienteId: () => Promise<RespostaIPC<string | null>>
      suporte: () => Promise<
        RespostaIPC<{
          atendidoPor: 'fhvp' | 'revendedor'
          nome: string
          contato: string | null
          podeRenovarNoApp: boolean
        } | null>
      >
      destravarRelogio: () => Promise<RespostaIPC<{ destravado: boolean }>>
      criarCobranca: (dados: {
        diasContratados?: number
        valorCentavos?: number
      }) => Promise<RespostaIPC<CobrancaPix>>
      consultarCobranca: (txid: string) => Promise<RespostaIPC<CobrancaPix>>
    }
    auth: {
      obterStatus: () => Promise<RespostaIPC<{
        pinConfigurado: boolean
        autoLockMinutos: number
      }>>
      listarVendedoresParaLogin: () => Promise<RespostaIPC<Array<{
        id: number
        nome: string
        papel: 'dono' | 'vendedor'
        tem_pin: number
        /**
         * Quantos dígitos tem o PIN — a tela confirma sozinha ao completar.
         * `null` enquanto o sistema ainda não sabe (instalação anterior à
         * migration 036); nesse caso a tela segue pedindo Enter. Só o TAMANHO
         * chega aqui: o PIN e o hash nunca saem do processo principal.
         */
        pin_tamanho: number | null
      }>>>
      login: (vendedorId: number, pin: string) => Promise<RespostaIPC<{
        ok: boolean
        sessao?: {
          id: number
          nome: string
          ativo: number
          papel: 'dono' | 'vendedor'
          email: string | null
          tem_pin: number
          vendas_count: number
        } | null
      }>>
      logout: () => Promise<RespostaIPC>
      sessaoAtual: () => Promise<RespostaIPC<{
        id: number
        nome: string
        ativo: number
        papel: 'dono' | 'vendedor'
        email: string | null
        tem_pin: number
        vendas_count: number
      } | null>>
      elevar: (pin: string) => Promise<RespostaIPC<{ ok: boolean; donoId: number | null }>>
      cadastrarPinPrimeiroUso: (vendedorId: number, pin: string) => Promise<RespostaIPC>
      alterarPinVendedor: (
        vendedorId: number,
        pinAtual: string,
        pinNovo: string
      ) => Promise<RespostaIPC>
      solicitarRecuperacao: (
        email: string
      ) => Promise<RespostaIPC<{ enviado: boolean }>>
      redefinirComCodigo: (
        email: string,
        codigo: string,
        novoPin: string
      ) => Promise<RespostaIPC<{
        ok: boolean
        sessao?: {
          id: number
          nome: string
          ativo: number
          papel: 'dono' | 'vendedor'
          email: string | null
          tem_pin: number
          vendas_count: number
        } | null
      }>>
      setarAutoLock: (minutos: number) => Promise<RespostaIPC>
      lerTetoDesconto: () => Promise<RespostaIPC<number>>
      setarTetoDesconto: (pct: number) => Promise<RespostaIPC>
    }
    impressao: {
      imprimir: (html: string, nomeArquivo?: string, deviceName?: string) => Promise<RespostaIPC>
      imprimirPdf: (
        pdfBase64: string,
        nomeArquivo?: string,
        deviceName?: string,
        // Decide o papel: 'cupom' imprime em 80mm, 'documento' deixa o
        // driver escolher. Ver o comentário em electron/ipc/impressao.ts.
        categoria?: 'cupom' | 'documento'
      ) => Promise<RespostaIPC>
      listarImpressoras: () => Promise<
        RespostaIPC<Array<{ name: string; displayName: string; isDefault: boolean }>>
      >
      imprimirJanela: (deviceName: string) => Promise<RespostaIPC>
      obterPreferencias: () => Promise<
        RespostaIPC<{
          cupom: { printer: string; direto: boolean }
          documento: { printer: string; direto: boolean }
          /**
           * Em que papel saem os comprovantes de abertura e fechamento de
           * caixa. Padrão `termica`: a impressora que existe ao lado de um
           * caixa é a de bobina.
           */
          papelCaixa: PapelCaixa
        }>
      >
      salvarPreferencias: (prefs: {
        cupom?: { printer?: string; direto?: boolean }
        documento?: { printer?: string; direto?: boolean }
        papelCaixa?: PapelCaixa
      }) => Promise<RespostaIPC>
      salvarPdf: (
        html: string,
        nomeArquivo?: string,
        categoria?: 'cupom' | 'documento'
      ) => Promise<RespostaIPC>
    }
    chat: {
      enviar: (
        historico: Array<{ role: 'user' | 'assistant'; content: string }>
      ) => Promise<RespostaIPC<string>>
    }
    devolucoes: {
      itensDevolviveis: (
        vendaId: number
      ) => Promise<
        RespostaIPC<
          Array<{
            item_venda_id: number
            produto_id: number
            produto_nome: string
            quantidade_vendida: number
            quantidade_devolvida: number
            quantidade_disponivel: number
            preco_unitario: number
            valor_unitario_devolvido: number
          }>
        >
      >
      saldoCredito: (clienteId: number) => Promise<RespostaIPC<number>>
      porVenda: (
        vendaId: number
      ) => Promise<
        RespostaIPC<
          Array<{
            id: number
            venda_id: number
            data: string
            vendedor_id: number
            autorizado_por_id: number | null
            tipo: 'credito' | 'dinheiro'
            valor_total: number
            motivo: string | null
            cliente_nome: string | null
            itens: Array<{ produto_nome: string; quantidade: number; valor_unitario_devolvido: number }>
          }>
        >
      >
      registrar: (entrada: {
        venda_id: number
        tipo: 'credito' | 'dinheiro'
        cliente_id?: number | null
        motivo?: string | null
        caixa_id?: number | null
        itens: Array<{ item_venda_id: number; quantidade: number; restocar: boolean }>
        pinDono?: string
      }) => Promise<
        RespostaIPC<{
          id: number
          venda_id: number
          data: string
          vendedor_id: number
          autorizado_por_id: number | null
          tipo: 'credito' | 'dinheiro'
          valor_total: number
          motivo: string | null
        }>
      >
    }
    dashboard: {
      metricas: (intervalo: {
        inicio_atual: string
        fim_atual: string
        inicio_anterior: string
        fim_anterior: string
      }) => Promise<RespostaIPC<MetricasDashboard>>
      salvarMeta: (valor: number) => Promise<RespostaIPC>
    }
    garantias: {
      buscarItens: (termo: string) => Promise<RespostaIPC<ItemComGarantia[]>>
      itensDaVenda: (vendaId: number) => Promise<RespostaIPC<ItemComGarantia[]>>
      listar: (situacao?: string) => Promise<RespostaIPC<Garantia[]>>
      doItem: (itemVendaId: number) => Promise<RespostaIPC<Garantia[]>>
      resumo: () => Promise<RespostaIPC<ResumoGarantias>>
      abrir: (dados: {
        item_venda_id: number
        defeito: string
        observacao?: string | null
      }) => Promise<RespostaIPC<{ id: number; dentro_do_prazo: boolean }>>
      fechar: (
        id: number,
        desfecho: string,
        observacao?: string | null
      ) => Promise<RespostaIPC>
      reabrir: (id: number) => Promise<RespostaIPC>
      prazoPadrao: () => Promise<RespostaIPC<number>>
      definirPrazoPadrao: (dias: number) => Promise<RespostaIPC>
    }
    trafego: {
      resumo: (inicio: string, fim: string) => Promise<RespostaIPC<ResumoTrafego>>
      investimentos: (mes: string) => Promise<RespostaIPC<InvestimentoCanal[]>>
      gravarInvestimentos: (
        mes: string,
        linhas: Array<{ origem_id: number; valor: number; observacao?: string | null }>
      ) => Promise<RespostaIPC>
    }
    atualizacao: {
      obterInfo: () => Promise<RespostaIPC<{
        versaoAtual: string
        ultimaVerificacao: string | null
        ultimaMensagem: string | null
        versaoBaixada: string | null
      }>>
      verificar: () => Promise<RespostaIPC>
      /**
       * Dispara o instalador. `backup` conta o que houve com o backup
       * pré-atualização: 'nao-se-aplica' é o segundo caixa, que não tem banco
       * local; 'falhou' é máquina com dados que não conseguiu guardá-los — a
       * atualização segue, mas o modal avisa.
       */
      instalar: () => Promise<RespostaIPC<{
        backup:
          | { estado: 'feito' }
          | { estado: 'nao-se-aplica' }
          | { estado: 'falhou'; erro: string }
      }>>
      onEvento: (cb: (evt: { tipo: string; dados?: unknown }) => void) => () => void
    }
    backup: {
      fazerManual: () => Promise<RespostaIPC>
      obterStatus: () => Promise<RespostaIPC>
      gravarConfig: (chave: string, valor: string) => Promise<RespostaIPC>
      selecionarPasta: () => Promise<RespostaIPC>
      verificarSenha: (senha: string) => Promise<RespostaIPC>
      listarBackups: () => Promise<RespostaIPC>
      listarNuvem: () => Promise<
        RespostaIPC<
          Array<{ chave: string; nome: string; tamanhoBytes: number; quando: string }>
        >
      >
      baixarDaNuvem: (chaveObjeto: string) => Promise<RespostaIPC<string>>
      restaurar: (caminhoZip: string) => Promise<RespostaIPC>
      onNotificacao: (cb: (data: { tipo: string; sucesso: boolean }) => void) => () => void
      onCarregando: (cb: (visivel: boolean) => void) => () => void
    }
    // ⚠️ Os tipos vêm por `import(...)` inline, e não por um `import` no topo:
    // este arquivo não pode ter import/export de módulo, senão deixa de ser
    // script global e derruba `window.api`, `__APP_VERSION__` e as flags de
    // build junto. Ver o comentário em types/multicaixa.ts.
    multicaixa: {
      estado: () => Promise<RespostaIPC<import('./multicaixa').EstadoMulticaixa>>
      ligarServidor: () => Promise<RespostaIPC<import('./multicaixa').EstadoMulticaixa>>
      desligarServidor: () => Promise<RespostaIPC<import('./multicaixa').EstadoMulticaixa>>
      abrirPareamento: () => Promise<RespostaIPC<{ codigo: string; expiraEm: number }>>
      liberarFirewall: () => Promise<RespostaIPC<import('./multicaixa').EstadoMulticaixa>>
      fecharPareamento: () => Promise<RespostaIPC<null>>
      revogarTerminal: (id: string) => Promise<RespostaIPC<import('./multicaixa').EstadoMulticaixa>>
      abrirClonagem: () => Promise<
        RespostaIPC<{ codigo: string; expiraEm: number; porta: number }>
      >
      fecharClonagem: () => Promise<RespostaIPC<null>>
      exigeSenhaParaReceber: () => Promise<RespostaIPC<boolean>>
      receberBanco: (
        endereco: string,
        codigo: string,
        senha: string
      ) => Promise<RespostaIPC<{ copiaDeSeguranca?: string }>>
      conectarComoTerminal: (
        endereco: string,
        codigo: string,
        nome: string
      ) => Promise<RespostaIPC<null>>
      sairDoModoTerminal: () => Promise<RespostaIPC<null>>
      reiniciarApp: () => Promise<RespostaIPC<null>>
      situacao: () => Promise<
        RespostaIPC<{
          modo: 'normal' | 'servidor' | 'terminal'
          conectado: boolean
          quedas: {
            total: number
            ultimaQueda: string | null
            tempoForaMs: number
            foraDoArAgora: boolean
          } | null
        }>
      >
      onConexao: (cb: (conectado: boolean) => void) => () => void
    }
  }
}
