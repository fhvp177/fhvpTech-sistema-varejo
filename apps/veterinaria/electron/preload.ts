import { contextBridge, ipcRenderer } from 'electron'

type RespostaIPC<T = unknown> = { success: true; data: T } | { success: false; error: string }

// Ponte segura. Por enquanto só a plataforma (licença) — as APIs de domínio
// (pets, tutores, consultas...) entram conforme as telas forem criadas.
const api = {
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
