import { ipcMain } from 'electron'
import {
  listarFornecedores,
  criarFornecedor,
  atualizarFornecedor,
  deletarFornecedor,
  type DadosFornecedor
} from '../db/queries/fornecedores'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono } from '../sessao'

export function registrarHandlersFornecedores(): void {
  ipcMain.handle('fornecedores:listar', () => {
    try {
      return { success: true, data: listarFornecedores() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('fornecedores:criar', (_event, dados: DadosFornecedor) => {
    try {
      requerDono()
      const resultado = criarFornecedor(dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: resultado }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('fornecedores:atualizar', (_event, id: number, dados: DadosFornecedor) => {
    try {
      requerDono()
      atualizarFornecedor(id, dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('fornecedores:deletar', (_event, id: number) => {
    try {
      requerDono()
      deletarFornecedor(id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
