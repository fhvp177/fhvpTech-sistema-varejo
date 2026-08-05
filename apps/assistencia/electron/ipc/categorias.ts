import { registrarCanal } from '@fhvptech/core/electron/roteador'
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
  registrarCanal('categorias:listar', () => {
    try {
      return { success: true, data: listarCategorias() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('categorias:criar', (nome: string) => {
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

  registrarCanal('categorias:atualizar', (id: number, nome: string) => {
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

  registrarCanal('categorias:deletar', (id: number) => {
    try {
      requerDono()
      deletarCategoria(id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('categorias:definir-tamanhos', (id: number, usa: boolean) => {
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
