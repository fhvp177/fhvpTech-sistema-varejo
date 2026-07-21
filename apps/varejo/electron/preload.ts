import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Tipo de retorno padrão de todos os handlers IPC
type RespostaIPC<T = unknown> = { success: true; data: T } | { success: false; error: string }

// API tipada exposta ao renderer via window.api
// Cada módulo adiciona seus handlers aqui conforme implementado
const api = {
  // Produtos — será preenchido no módulo de produtos
  produtos: {
    listar: (): Promise<RespostaIPC> => ipcRenderer.invoke('produtos:listar'),
    criar: (dados: unknown, pinDono?: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('produtos:criar', dados, pinDono),
    atualizar: (id: number, dados: unknown): Promise<RespostaIPC> =>
      ipcRenderer.invoke('produtos:atualizar', id, dados),
    deletar: (id: number): Promise<RespostaIPC> => ipcRenderer.invoke('produtos:deletar', id),
    buscarPorCodigoBarras: (codigo: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('produtos:buscarPorCodigoBarras', codigo)
  },

  // Clientes
  clientes: {
    listar: (): Promise<RespostaIPC> => ipcRenderer.invoke('clientes:listar'),
    criar: (dados: unknown): Promise<RespostaIPC> => ipcRenderer.invoke('clientes:criar', dados),
    atualizar: (id: number, dados: unknown): Promise<RespostaIPC> =>
      ipcRenderer.invoke('clientes:atualizar', id, dados),
    deletar: (id: number): Promise<RespostaIPC> => ipcRenderer.invoke('clientes:deletar', id),
    listarInadimplentes: (): Promise<RespostaIPC> =>
      ipcRenderer.invoke('clientes:listarInadimplentes'),
    listarVencendoHoje: (): Promise<RespostaIPC> =>
      ipcRenderer.invoke('clientes:listarVencendoHoje')
  },

  // Fornecedores
  fornecedores: {
    listar: (): Promise<RespostaIPC> => ipcRenderer.invoke('fornecedores:listar'),
    criar: (dados: unknown): Promise<RespostaIPC> =>
      ipcRenderer.invoke('fornecedores:criar', dados),
    atualizar: (id: number, dados: unknown): Promise<RespostaIPC> =>
      ipcRenderer.invoke('fornecedores:atualizar', id, dados),
    deletar: (id: number): Promise<RespostaIPC> => ipcRenderer.invoke('fornecedores:deletar', id)
  },

  // Contas a pagar (o que a loja deve: fornecedor, aluguel, luz, salário…)
  contasPagar: {
    listar: (filtro?: 'aberto' | 'pago' | 'todas'): Promise<RespostaIPC> =>
      ipcRenderer.invoke('contasPagar:listar', filtro),
    resumo: (): Promise<RespostaIPC> => ipcRenderer.invoke('contasPagar:resumo'),
    criar: (dados: unknown): Promise<RespostaIPC> =>
      ipcRenderer.invoke('contasPagar:criar', dados),
    atualizar: (id: number, dados: unknown): Promise<RespostaIPC> =>
      ipcRenderer.invoke('contasPagar:atualizar', id, dados),
    deletar: (id: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('contasPagar:deletar', id),
    registrarPagamento: (id: number, valor: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('contasPagar:registrarPagamento', id, valor),
    estornarPagamento: (id: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('contasPagar:estornarPagamento', id)
  },

  // Notas de entrada (importação de NF-e via XML)
  notasEntrada: {
    analisar: (
      chave: string,
      fornecedorCnpj: string | null,
      itens: unknown[]
    ): Promise<RespostaIPC> =>
      ipcRenderer.invoke('notasEntrada:analisar', chave, fornecedorCnpj, itens),
    importar: (dados: unknown): Promise<RespostaIPC> =>
      ipcRenderer.invoke('notasEntrada:importar', dados),
    listar: (mes?: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('notasEntrada:listar', mes),
    meses: (): Promise<RespostaIPC> => ipcRenderer.invoke('notasEntrada:meses'),
    exportarXmls: (mes: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('notasEntrada:exportarXmls', mes)
  },

  // Categorias
  categorias: {
    listar: (): Promise<RespostaIPC> => ipcRenderer.invoke('categorias:listar'),
    criar: (nome: string): Promise<RespostaIPC> => ipcRenderer.invoke('categorias:criar', nome),
    atualizar: (id: number, nome: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('categorias:atualizar', id, nome),
    deletar: (id: number): Promise<RespostaIPC> => ipcRenderer.invoke('categorias:deletar', id),
    definirTamanhos: (id: number, usa: boolean): Promise<RespostaIPC> =>
      ipcRenderer.invoke('categorias:definir-tamanhos', id, usa)
  },

  // Vendedores
  vendedores: {
    listar: (): Promise<RespostaIPC> => ipcRenderer.invoke('vendedores:listar'),
    criar: (dados: { nome: string; email?: string | null } | string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendedores:criar', dados),
    atualizar: (
      id: number,
      dados: { nome?: string; email?: string | null } | string
    ): Promise<RespostaIPC> => ipcRenderer.invoke('vendedores:atualizar', id, dados),
    alternarAtivo: (id: number, ativo: boolean): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendedores:alternarAtivo', id, ativo),
    deletar: (id: number): Promise<RespostaIPC> => ipcRenderer.invoke('vendedores:deletar', id),
    alterarPapel: (id: number, papel: 'dono' | 'vendedor'): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendedores:alterarPapel', id, papel),
    redefinirPin: (id: number, novoPin: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendedores:redefinirPin', id, novoPin)
  },

  // Vendas
  vendas: {
    listar: (mes?: string): Promise<RespostaIPC> => ipcRenderer.invoke('vendas:listar', mes),
    listarCanceladas: (mes?: string): Promise<RespostaIPC> => ipcRenderer.invoke('vendas:listarCanceladas', mes),
    criar: (dados: unknown): Promise<RespostaIPC> => ipcRenderer.invoke('vendas:criar', dados),
    atualizarStatus: (id: number, status: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:atualizarStatus', id, status),
    buscarPorId: (id: number): Promise<RespostaIPC> => ipcRenderer.invoke('vendas:buscarPorId', id),
    pagarParcela: (parcelaId: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:pagarParcela', parcelaId),
    registrarPagamentoParcial: (id: number, valor: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:registrarPagamentoParcial', id, valor),
    estornarParcela: (parcelaId: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:estornarParcela', parcelaId),
    estornarRecebimento: (id: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:estornarRecebimento', id),
    resumoDashboard: (): Promise<RespostaIPC> => ipcRenderer.invoke('vendas:resumoDashboard'),
    produtosMaisVendidos: (mes: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:produtosMaisVendidos', mes),
    aReceberDoMes: (mes: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:aReceberDoMes', mes),
    cancelar: (id: number, motivo: string, pinDono?: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:cancelar', id, motivo, pinDono)
  },

  // Auth (PIN do sistema + sessão por vendedor)
  auth: {
    obterStatus: (): Promise<RespostaIPC> => ipcRenderer.invoke('auth:obterStatus'),
    listarVendedoresParaLogin: (): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:listarVendedoresParaLogin'),
    login: (vendedorId: number, pin: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:login', vendedorId, pin),
    logout: (): Promise<RespostaIPC> => ipcRenderer.invoke('auth:logout'),
    sessaoAtual: (): Promise<RespostaIPC> => ipcRenderer.invoke('auth:sessaoAtual'),
    elevar: (pin: string): Promise<RespostaIPC> => ipcRenderer.invoke('auth:elevar', pin),
    cadastrarPinPrimeiroUso: (vendedorId: number, pin: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:cadastrarPinPrimeiroUso', vendedorId, pin),
    alterarPinVendedor: (
      vendedorId: number,
      pinAtual: string,
      pinNovo: string
    ): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:alterarPinVendedor', vendedorId, pinAtual, pinNovo),
    solicitarRecuperacao: (email: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:solicitarRecuperacao', email),
    redefinirComCodigo: (
      email: string,
      codigo: string,
      novoPin: string
    ): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:redefinirComCodigo', email, codigo, novoPin),
    setarAutoLock: (minutos: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:setarAutoLock', minutos),
    lerTetoDesconto: (): Promise<RespostaIPC> => ipcRenderer.invoke('auth:lerTetoDesconto'),
    setarTetoDesconto: (pct: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:setarTetoDesconto', pct)
  },

  // Licença
  licenca: {
    validar: (): Promise<RespostaIPC> => ipcRenderer.invoke('licenca:validar'),
    ativar: (chave: string): Promise<RespostaIPC> => ipcRenderer.invoke('licenca:ativar', chave),
    obterClienteId: (): Promise<RespostaIPC> => ipcRenderer.invoke('licenca:obterClienteId'),
    criarCobranca: (dados: {
      diasContratados?: number
      valorCentavos?: number
    }): Promise<RespostaIPC> => ipcRenderer.invoke('licenca:criarCobranca', dados),
    consultarCobranca: (txid: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('licenca:consultarCobranca', txid)
  },

  // Impressão
  impressao: {
    imprimir: (html: string, nomeArquivo?: string, deviceName?: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('impressao:imprimir', html, nomeArquivo, deviceName),
    imprimirPdf: (
      pdfBase64: string,
      nomeArquivo?: string,
      deviceName?: string
    ): Promise<RespostaIPC> =>
      ipcRenderer.invoke('impressao:imprimirPdf', pdfBase64, nomeArquivo, deviceName),
    listarImpressoras: (): Promise<RespostaIPC> =>
      ipcRenderer.invoke('impressao:listarImpressoras'),
    imprimirJanela: (deviceName: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('impressao:imprimirJanela', deviceName),
    obterPreferencias: (): Promise<RespostaIPC> =>
      ipcRenderer.invoke('impressao:obterPreferencias'),
    salvarPreferencias: (prefs: unknown): Promise<RespostaIPC> =>
      ipcRenderer.invoke('impressao:salvarPreferencias', prefs),
    salvarPdf: (html: string, nomeArquivo?: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('impressao:salvarPdf', html, nomeArquivo)
  },

  // Chatbot (assistente de IA)
  chat: {
    enviar: (
      historico: Array<{ role: 'user' | 'assistant'; content: string }>
    ): Promise<RespostaIPC> => ipcRenderer.invoke('chat:enviar', historico)
  },

  // Dados da loja (identidade nos cupons: nome, CNPJ, logo)
  loja: {
    obter: (): Promise<RespostaIPC> => ipcRenderer.invoke('loja:obter'),
    salvar: (dados: unknown): Promise<RespostaIPC> => ipcRenderer.invoke('loja:salvar', dados)
  },

  // Configuração fiscal da NFC-e (só plano Pro). Certificado A1 e CSC NÃO
  // trafegam por aqui — ver electron/ipc/fiscal.ts.
  fiscal: {
    obter: (): Promise<RespostaIPC> => ipcRenderer.invoke('fiscal:obter'),
    salvar: (dados: unknown): Promise<RespostaIPC> => ipcRenderer.invoke('fiscal:salvar', dados),
    diagnostico: (): Promise<RespostaIPC> => ipcRenderer.invoke('fiscal:diagnostico'),
    diasParaVencerCertificado: (): Promise<RespostaIPC> =>
      ipcRenderer.invoke('fiscal:diasParaVencerCertificado'),
    // Ponte com o backend/ACBr (passos 2 e 3 da habilitação).
    resolverMunicipio: (): Promise<RespostaIPC> => ipcRenderer.invoke('fiscal:resolverMunicipio'),
    cadastrarEmpresa: (): Promise<RespostaIPC> => ipcRenderer.invoke('fiscal:cadastrarEmpresa'),
    enviarCertificado: (args: { certificadoBase64: string; senha: string }): Promise<RespostaIPC> =>
      ipcRenderer.invoke('fiscal:enviarCertificado', args),
    configurarCsc: (args: { csc: string; idCsc: string }): Promise<RespostaIPC> =>
      ipcRenderer.invoke('fiscal:configurarCsc', args),
    statusRemoto: (): Promise<RespostaIPC> => ipcRenderer.invoke('fiscal:statusRemoto'),
    // Emissão da nota de uma venda (sempre pós-venda; nunca trava o caixa).
    emitirNfce: (args: { vendaId: number; formaPagamento?: string }): Promise<RespostaIPC> =>
      ipcRenderer.invoke('fiscal:emitirNfce', args),
    statusNfce: (args: { vendaId: number }): Promise<RespostaIPC> =>
      ipcRenderer.invoke('fiscal:statusNfce', args),
    notasDasVendas: (ids: number[]): Promise<RespostaIPC> =>
      ipcRenderer.invoke('fiscal:notasDasVendas', ids),
    danfe: (args: { vendaId: number }): Promise<RespostaIPC> =>
      ipcRenderer.invoke('fiscal:danfe', args),
    cancelarNfce: (args: { vendaId: number; justificativa: string }): Promise<RespostaIPC> =>
      ipcRenderer.invoke('fiscal:cancelarNfce', args)
  },

  // Onboarding (tutorial de primeira abertura: guia + checklist)
  onboarding: {
    estado: (): Promise<RespostaIPC> => ipcRenderer.invoke('onboarding:estado'),
    marcarGuiaVisto: (): Promise<RespostaIPC> => ipcRenderer.invoke('onboarding:marcarGuiaVisto'),
    dispensarChecklist: (): Promise<RespostaIPC> =>
      ipcRenderer.invoke('onboarding:dispensarChecklist')
  },

  // "O que há de novo" — novidades exibidas após uma atualização
  novidades: {
    estado: (): Promise<RespostaIPC> => ipcRenderer.invoke('novidades:estado'),
    marcar: (versao: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('novidades:marcar', versao)
  },

  // Notificações (sino: avisos calculados ao vivo + caixa de entrada que lembra)
  notificacoes: {
    listar: (): Promise<RespostaIPC> => ipcRenderer.invoke('notificacoes:listar'),
    detalhe: (chave: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('notificacoes:detalhe', chave),
    marcarLidas: (): Promise<RespostaIPC> => ipcRenderer.invoke('notificacoes:marcarLidas'),
    dispensar: (id: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('notificacoes:dispensar', id)
  },

  // Devolução / troca
  devolucoes: {
    itensDevolviveis: (vendaId: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('devolucoes:itensDevolviveis', vendaId),
    saldoCredito: (clienteId: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('devolucoes:saldoCredito', clienteId),
    porVenda: (vendaId: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('devolucoes:porVenda', vendaId),
    registrar: (entrada: {
      venda_id: number
      tipo: 'credito' | 'dinheiro'
      cliente_id?: number | null
      motivo?: string | null
      itens: Array<{ item_venda_id: number; quantidade: number; restocar: boolean }>
      pinDono?: string
    }): Promise<RespostaIPC> => ipcRenderer.invoke('devolucoes:registrar', entrada)
  },

  // Dashboard (métricas agregadas)
  dashboard: {
    metricas: (intervalo: {
      inicio_atual: string
      fim_atual: string
      inicio_anterior: string
      fim_anterior: string
    }): Promise<RespostaIPC> =>
      ipcRenderer.invoke('dashboard:metricas', intervalo),
    salvarMeta: (valor: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('dashboard:salvarMeta', valor)
  },

  // Atualização (electron-updater)
  atualizacao: {
    obterInfo: (): Promise<RespostaIPC> => ipcRenderer.invoke('atualizacao:obterInfo'),
    verificar: (): Promise<RespostaIPC> => ipcRenderer.invoke('atualizacao:verificar'),
    instalar: (): Promise<RespostaIPC> => ipcRenderer.invoke('atualizacao:instalar'),
    onEvento: (
      cb: (evt: { tipo: string; dados?: unknown }) => void
    ): (() => void) => {
      const handler = (_: IpcRendererEvent, evt: { tipo: string; dados?: unknown }) => cb(evt)
      ipcRenderer.on('atualizacao:evento', handler)
      return () => ipcRenderer.removeListener('atualizacao:evento', handler)
    }
  },

  // Backup
  backup: {
    fazerManual: (): Promise<RespostaIPC> => ipcRenderer.invoke('backup:fazerManual'),
    obterStatus: (): Promise<RespostaIPC> => ipcRenderer.invoke('backup:obterStatus'),
    gravarConfig: (chave: string, valor: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('backup:gravarConfig', chave, valor),
    selecionarPasta: (): Promise<RespostaIPC> => ipcRenderer.invoke('backup:selecionarPasta'),
    verificarSenha: (senha: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('backup:verificarSenha', senha),
    listarBackups: (): Promise<RespostaIPC> => ipcRenderer.invoke('backup:listarBackups'),
    restaurar: (caminhoZip: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('backup:restaurar', caminhoZip),
    onNotificacao: (cb: (data: { tipo: string; sucesso: boolean }) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, data: { tipo: string; sucesso: boolean }) => cb(data)
      ipcRenderer.on('backup:notificacao', handler)
      return () => ipcRenderer.removeListener('backup:notificacao', handler)
    },
    onCarregando: (cb: (visivel: boolean) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, visivel: boolean) => cb(visivel)
      ipcRenderer.on('backup:carregando', handler)
      return () => ipcRenderer.removeListener('backup:carregando', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Fallback para quando contextIsolation está desabilitado (não deve ocorrer em produção)
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
