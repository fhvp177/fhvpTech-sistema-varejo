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
    criar: (dados: unknown): Promise<RespostaIPC> => ipcRenderer.invoke('produtos:criar', dados),
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

  // Categorias
  categorias: {
    listar: (): Promise<RespostaIPC> => ipcRenderer.invoke('categorias:listar'),
    criar: (nome: string): Promise<RespostaIPC> => ipcRenderer.invoke('categorias:criar', nome),
    atualizar: (id: number, nome: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('categorias:atualizar', id, nome),
    deletar: (id: number): Promise<RespostaIPC> => ipcRenderer.invoke('categorias:deletar', id)
  },

  // Vendedores
  vendedores: {
    listar: (): Promise<RespostaIPC> => ipcRenderer.invoke('vendedores:listar'),
    criar: (nome: string): Promise<RespostaIPC> => ipcRenderer.invoke('vendedores:criar', nome),
    atualizar: (id: number, nome: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendedores:atualizar', id, nome),
    alternarAtivo: (id: number, ativo: boolean): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendedores:alternarAtivo', id, ativo),
    deletar: (id: number): Promise<RespostaIPC> => ipcRenderer.invoke('vendedores:deletar', id)
  },

  // Vendas
  vendas: {
    listar: (): Promise<RespostaIPC> => ipcRenderer.invoke('vendas:listar'),
    criar: (dados: unknown): Promise<RespostaIPC> => ipcRenderer.invoke('vendas:criar', dados),
    atualizarStatus: (id: number, status: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:atualizarStatus', id, status),
    buscarPorId: (id: number): Promise<RespostaIPC> => ipcRenderer.invoke('vendas:buscarPorId', id),
    pagarParcela: (parcelaId: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:pagarParcela', parcelaId),
    registrarPagamentoParcial: (id: number, valor: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:registrarPagamentoParcial', id, valor),
    restaurar: (id: number, snapshot: unknown): Promise<RespostaIPC> =>
      ipcRenderer.invoke('vendas:restaurar', id, snapshot),
    resumoDashboard: (): Promise<RespostaIPC> => ipcRenderer.invoke('vendas:resumoDashboard')
  },

  // Auth (PIN do sistema)
  auth: {
    obterStatus: (): Promise<RespostaIPC> => ipcRenderer.invoke('auth:obterStatus'),
    definirPin: (pin: string): Promise<RespostaIPC> => ipcRenderer.invoke('auth:definirPin', pin),
    verificarPin: (pin: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:verificarPin', pin),
    alterarPin: (pinAtual: string, pinNovo: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:alterarPin', pinAtual, pinNovo),
    setarAutoLock: (minutos: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:setarAutoLock', minutos),
    marcarValidadoHoje: (): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:marcarValidadoHoje')
  },

  // Licença
  licenca: {
    validar: (): Promise<RespostaIPC> => ipcRenderer.invoke('licenca:validar'),
    ativar: (chave: string): Promise<RespostaIPC> => ipcRenderer.invoke('licenca:ativar', chave)
  },

  // Impressão
  impressao: {
    imprimir: (html: string): Promise<RespostaIPC> => ipcRenderer.invoke('impressao:imprimir', html)
  },

  // Dashboard (métricas agregadas)
  dashboard: {
    metricas: (intervalo: {
      inicio_atual: string
      fim_atual: string
      inicio_anterior: string
      fim_anterior: string
    }): Promise<RespostaIPC> =>
      ipcRenderer.invoke('dashboard:metricas', intervalo)
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
