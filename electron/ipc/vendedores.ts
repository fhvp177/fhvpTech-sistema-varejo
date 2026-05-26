import { ipcMain } from 'electron'
import {
  listarVendedores,
  criarVendedor,
  atualizarVendedor,
  alternarAtivoVendedor,
  deletarVendedor
} from '../db/queries/vendedores'
import { obterBackupManager } from '../backup/BackupManager'

export function registrarHandlersVendedores(): void {
  ipcMain.handle('vendedores:listar', () => {
    try {
      return { success: true, data: listarVendedores() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendedores:criar', (_event, nome: string) => {
    try {
      const resultado = criarVendedor(nome)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: resultado }
    } catch (error) {
      const msg = (error as Error).message
      if (msg.includes('UNIQUE')) {
        return { success: false, error: 'Já existe um vendedor com esse nome.' }
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('vendedores:atualizar', (_event, id: number, nome: string) => {
    try {
      atualizarVendedor(id, nome)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      const msg = (error as Error).message
      if (msg.includes('UNIQUE')) {
        return { success: false, error: 'Já existe um vendedor com esse nome.' }
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('vendedores:alternarAtivo', (_event, id: number, ativo: boolean) => {
    try {
      alternarAtivoVendedor(id, ativo)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendedores:deletar', (_event, id: number) => {
    try {
      deletarVendedor(id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
