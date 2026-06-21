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

type RespostaIPC<T = unknown> = { success: true; data: T } | { success: false; error: string }

type StatusLicenca = {
  valida: boolean
  diasRestantes?: number
  mensagem: string
  clienteId?: string
  aviso?: string
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

type SnapshotVenda = {
  status: 'pago' | 'pendente' | 'inadimplente' | 'parcelado'
  valor_pago: number
  parcelas: Array<{ id: number; status: 'pendente' | 'pago' | 'inadimplente' }>
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
    fornecedores: {
      listar: () => Promise<RespostaIPC>
      criar: (dados: unknown) => Promise<RespostaIPC>
      atualizar: (id: number, dados: unknown) => Promise<RespostaIPC>
      deletar: (id: number) => Promise<RespostaIPC>
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
      listar: () => Promise<RespostaIPC>
      criar: (dados: unknown) => Promise<RespostaIPC>
      atualizarStatus: (id: number, status: string) => Promise<RespostaIPC<{ snapshot?: SnapshotVenda }>>
      buscarPorId: (id: number) => Promise<RespostaIPC>
      pagarParcela: (parcelaId: number) => Promise<RespostaIPC<{ vendaId: number; snapshot: SnapshotVenda } | null>>
      registrarPagamentoParcial: (id: number, valor: number) => Promise<RespostaIPC<{ snapshot?: SnapshotVenda }>>
      restaurar: (id: number, snapshot: SnapshotVenda) => Promise<RespostaIPC>
      resumoDashboard: () => Promise<RespostaIPC>
      produtosMaisVendidos: (mes: string) => Promise<RespostaIPC>
    }
    loja: {
      obter: () => Promise<RespostaIPC>
      salvar: (dados: unknown) => Promise<RespostaIPC>
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
      marcarLidas: () => Promise<RespostaIPC>
      dispensar: (id: number) => Promise<RespostaIPC>
    }
    licenca: {
      validar: () => Promise<RespostaIPC<StatusLicenca>>
      ativar: (chave: string) => Promise<RespostaIPC<StatusLicenca>>
      obterClienteId: () => Promise<RespostaIPC<string | null>>
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
      imprimir: (html: string, nomeArquivo?: string) => Promise<RespostaIPC>
      salvarPdf: (html: string, nomeArquivo?: string) => Promise<RespostaIPC>
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
      instalar: () => Promise<RespostaIPC>
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
  }
}
