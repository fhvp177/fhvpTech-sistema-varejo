import { ipcMain } from 'electron'
import {
  listarServicos,
  criarServico,
  atualizarServico,
  alternarAtivoServico,
  deletarServico
} from '../db/queries/servicos'

// Catálogo de serviços. Aberto a qualquer usuário logado (a tela está atrás do login).
export function registrarHandlersServicos(): void {
  ipcMain.handle('servicos:listar', () => {
    try {
      return { success: true, data: listarServicos() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('servicos:criar', (_event, dados: { nome: string; preco: number }) => {
    try {
      return { success: true, data: criarServico(dados) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'servicos:atualizar',
    (_event, id: number, dados: { nome?: string; preco?: number }) => {
      try {
        atualizarServico(id, dados)
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('servicos:alternarAtivo', (_event, id: number, ativo: boolean) => {
    try {
      alternarAtivoServico(id, ativo)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('servicos:deletar', (_event, id: number) => {
    try {
      deletarServico(id)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
