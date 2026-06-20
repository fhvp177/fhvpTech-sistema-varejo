import { ipcMain } from 'electron'
import {
  listarCategorias,
  criarCategoria,
  atualizarCategoria,
  deletarCategoria,
  definirUsaTamanhos
} from '../db/queries/categorias'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono } from '../sessao'

export function registrarHandlersCategorias(): void {
  ipcMain.handle('categorias:listar', () => {
    try {
      return { success: true, data: listarCategorias() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('categorias:criar', (_event, nome: string) => {
    try {
      requerDono()
      const resultado = criarCategoria(nome)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: resultado }
    } catch (error) {
      const msg = (error as Error).message
      if (msg.includes('UNIQUE')) {
        return { success: false, error: 'Já existe uma categoria com esse nome.' }
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('categorias:atualizar', (_event, id: number, nome: string) => {
    try {
      requerDono()
      atualizarCategoria(id, nome)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      const msg = (error as Error).message
      if (msg.includes('UNIQUE')) {
        return { success: false, error: 'Já existe uma categoria com esse nome.' }
      }
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('categorias:deletar', (_event, id: number) => {
    try {
      requerDono()
      deletarCategoria(id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('categorias:definir-tamanhos', (_event, id: number, usa: boolean) => {
    try {
      requerDono()
      definirUsaTamanhos(id, usa)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
