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
  // NFS-e (serviço) — tudo daqui é do MUNICÍPIO, não da SEFAZ. Espelha o bloco
  // correspondente de ConfigFiscal em electron/ipc/fiscal.ts.
  inscricao_municipal: string
  nfse_serie_rps: string
  nfse_proximo_rps: number
  nfse_lote: number
  nfse_optante_simples: boolean
  nfse_iss_retido: boolean
  nfse_configurada: boolean
  nfse_cidade_atendida: '' | 'sim' | 'nao'
  nfse_provedor: string
  configurada: boolean
}

// Classificação fiscal de um serviço. O par item da LC 116 + alíquota de ISS é
// o que a prefeitura exige — não há NCM nem CFOP aqui, isso é de mercadoria.
type FiscalServico = {
  item_lista_servico: string
  aliquota_iss: string
  codigo_tributacao_municipio: string
  codigo_cnae: string
}

type ServicoClassificacao = {
  id: number
  nome: string
  preco: number
  item_lista_servico: string | null
  aliquota_iss: number | null
}

// Nota de serviço de uma venda. Status seguem o vocabulário da prefeitura/ACBr
// — no feminino e diferentes dos da NFC-e, que é documento estadual.
type NotaServicoVenda = {
  id: number
  venda_id: number
  tentativa: number
  referencia: string
  acbr_id: string | null
  ambiente: string
  numero: number
  codigo_verificacao: string | null
  link_url: string | null
  status: 'processando' | 'autorizada' | 'negada' | 'cancelada' | 'substituida' | 'erro'
  motivo: string | null
  criada_em: string
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
  }>
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

interface Window {
  api: {
    produtos: {
      listar: () => Promise<RespostaIPC>
      criar: (dados: unknown, pinDono?: string) => Promise<RespostaIPC>
      atualizar: (id: number, dados: unknown) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
      buscarPorCodigoBarras: (codigo: string) => Promise<RespostaIPC>
    }
    clientes: {
      listar: () => Promise<RespostaIPC>
      criar: (dados: unknown) => Promise<RespostaIPC>
      atualizar: (id: number, dados: unknown) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
      listarInadimplentes: () => Promise<RespostaIPC>
      listarVencendoHoje: () => Promise<RespostaIPC>
    }
    /**
     * Recibos avulsos — dinheiro que entra fora do caixa.
     *
     * `proximoNumero` é só para a tela mostrar "nº 8" antes de salvar. O número
     * que vale é o que o banco reserva dentro da transação de `criar`.
     */
    recibos: {
      listar: (mes?: string) => Promise<RespostaIPC>
      meses: () => Promise<RespostaIPC<string[]>>
      proximoNumero: () => Promise<RespostaIPC<number>>
      obter: (numero: number) => Promise<RespostaIPC>
      criar: (dados: {
        valor: number
        recebedor_nome: string
        recebedor_documento?: string | null
        recebedor_rg?: string | null
        pagador_nome: string
        pagador_documento?: string | null
        pagador_rg?: string | null
        pagador_cliente_id?: number | null
        referente: string
        cidade?: string | null
        uf?: string | null
        data_recibo: string
        observacao?: string | null
      }) => Promise<RespostaIPC>
      cancelar: (args: { numero: number; motivo: string }) => Promise<RespostaIPC>
    }
    os: {
      listar: () => Promise<RespostaIPC>
      obter: (id: number) => Promise<RespostaIPC>
      criar: (dados: unknown) => Promise<RespostaIPC>
      atualizar: (id: number, dados: unknown) => Promise<RespostaIPC>
      definirItens: (id: number, itens: unknown[]) => Promise<RespostaIPC>
      mudarStatus: (id: number, novo: string, extras?: unknown) => Promise<RespostaIPC>
      fechar: (id: number, dados: unknown) => Promise<RespostaIPC>
      historicoAparelho: (numeroSerie: string, ignorarOsId?: number) => Promise<RespostaIPC>
      listarFotos: (osId: number) => Promise<RespostaIPC>
      adicionarFoto: (osId: number, nome: string | null, dados: string) => Promise<RespostaIPC>
      removerFoto: (fotoId: number) => Promise<RespostaIPC>
      criarGarantia: (osOrigemId: number, defeitoRelatado: string) => Promise<RespostaIPC>
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
      registrarPagamento: (id: number, valor: number) => Promise<RespostaIPC>
      estornarPagamento: (id: number) => Promise<RespostaIPC>
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
    vendedores: {
      listar: () => Promise<RespostaIPC<Array<{
        id: number
        nome: string
        ativo: number
        papel: 'dono' | 'vendedor'
        email: string | null
        tem_pin: number
        vendas_count: number
      }>>>
      criar: (
        dados: { nome: string; email?: string | null } | string
      ) => Promise<RespostaIPC<{ id: number; nome: string }>>
      atualizar: (
        id: number,
        dados: { nome?: string; email?: string | null } | string
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
      pagarParcela: (parcelaId: number) => Promise<RespostaIPC>
      registrarPagamentoParcial: (id: number, valor: number) => Promise<RespostaIPC>
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
      // ── NFS-e (serviço) ──────────────────────────────────────────────────
      consultarCidadeNfse: () => Promise<
        RespostaIPC<{
          atendida: boolean
          cidade: { provedor?: string; municipio?: string } | null
        }>
      >
      configurarNfse: () => Promise<RespostaIPC<null>>
      emitirNfse: (args: {
        vendaId: number
        discriminacao?: string
      }) => Promise<RespostaIPC<{ jaEmitida: boolean; nota: NotaServicoVenda | null }>>
      statusNfse: (args: { vendaId: number }) => Promise<RespostaIPC<NotaServicoVenda | null>>
      notasServicoDasVendas: (
        ids: number[]
      ) => Promise<RespostaIPC<Record<number, NotaServicoVenda>>>
      danfse: (args: { vendaId: number }) => Promise<RespostaIPC<{ pdfBase64: string }>>
      cancelarNfse: (args: {
        vendaId: number
        justificativa: string
      }) => Promise<RespostaIPC<NotaServicoVenda | null>>
      obterServico: (id: number) => Promise<RespostaIPC<FiscalServico | null>>
      salvarServico: (id: number, dados: FiscalServico) => Promise<RespostaIPC<null>>
      listarServicos: () => Promise<RespostaIPC<ServicoClassificacao[]>>
      diagnosticoNfse: () => Promise<
        RespostaIPC<{
          total_servicos: number
          servicos_pendentes: number
          exemplos: Array<{ id: number; nome: string }>
        }>
      >
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
        deviceName?: string
      ) => Promise<RespostaIPC>
      listarImpressoras: () => Promise<
        RespostaIPC<Array<{ name: string; displayName: string; isDefault: boolean }>>
      >
      imprimirJanela: (deviceName: string) => Promise<RespostaIPC>
      obterPreferencias: () => Promise<
        RespostaIPC<{
          cupom: { printer: string; direto: boolean }
          documento: { printer: string; direto: boolean }
        }>
      >
      salvarPreferencias: (prefs: {
        cupom?: { printer?: string; direto?: boolean }
        documento?: { printer?: string; direto?: boolean }
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
