import { contextBridge, ipcRenderer } from 'electron'

type RespostaIPC<T = unknown> = { success: true; data: T } | { success: false; error: string }

// Ponte segura. Plataforma (licença) + auth (login/sessão). As APIs de domínio
// (pets, tutores, consultas...) entram conforme as telas forem criadas.
const api = {
  // Auth (PIN + sessão por usuário). Canais genéricos do @fhvptech/core.
  auth: {
    obterStatus: (): Promise<RespostaIPC> => ipcRenderer.invoke('auth:obterStatus'),
    listarUsuariosParaLogin: (): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:listarUsuariosParaLogin'),
    login: (usuarioId: number, pin: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:login', usuarioId, pin),
    logout: (): Promise<RespostaIPC> => ipcRenderer.invoke('auth:logout'),
    sessaoAtual: (): Promise<RespostaIPC> => ipcRenderer.invoke('auth:sessaoAtual'),
    elevar: (pin: string): Promise<RespostaIPC> => ipcRenderer.invoke('auth:elevar', pin),
    cadastrarPinPrimeiroUso: (usuarioId: number, pin: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:cadastrarPinPrimeiroUso', usuarioId, pin),
    alterarPin: (
      usuarioId: number,
      pinAtual: string,
      pinNovo: string
    ): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:alterarPin', usuarioId, pinAtual, pinNovo),
    solicitarRecuperacao: (email: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:solicitarRecuperacao', email),
    redefinirComCodigo: (
      email: string,
      codigo: string,
      novoPin: string
    ): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:redefinirComCodigo', email, codigo, novoPin),
    setarAutoLock: (minutos: number): Promise<RespostaIPC> =>
      ipcRenderer.invoke('auth:setarAutoLock', minutos)
  },

  // Gestão de usuários (área do dono).
  usuarios: {
    listar: (): Promise<RespostaIPC> => ipcRenderer.invoke('usuarios:listar'),
    criar: (dados: { nome: string; email?: string | null }): Promise<RespostaIPC> =>
      ipcRenderer.invoke('usuarios:criar', dados),
    atualizar: (id: number, dados: { nome?: string; email?: string | null }): Promise<RespostaIPC> =>
      ipcRenderer.invoke('usuarios:atualizar', id, dados),
    alternarAtivo: (id: number, ativo: boolean): Promise<RespostaIPC> =>
      ipcRenderer.invoke('usuarios:alternarAtivo', id, ativo),
    alterarPapel: (id: number, papel: 'dono' | 'funcionario'): Promise<RespostaIPC> =>
      ipcRenderer.invoke('usuarios:alterarPapel', id, papel),
    deletar: (id: number): Promise<RespostaIPC> => ipcRenderer.invoke('usuarios:deletar', id),
    redefinirPin: (id: number, novoPin: string): Promise<RespostaIPC> =>
      ipcRenderer.invoke('usuarios:redefinirPin', id, novoPin)
  },

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
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore fallback sem contextIsolation (não deve ocorrer em produção)
  window.api = api
}
