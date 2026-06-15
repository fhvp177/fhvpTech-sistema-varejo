import { ipcMain } from 'electron'
import {
  listarProdutos,
  criarProduto,
  atualizarProduto,
  alternarAtivoProduto,
  deletarProduto
} from '../db/queries/produtos'

// Catálogo de produtos/medicamentos. Aberto a qualquer usuário logado.
export function registrarHandlersProdutos(): void {
  ipcMain.handle('produtos:listar', () => {
    try {
      return { success: true, data: listarProdutos() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'produtos:criar',
    (_event, dados: { nome: string; preco: number; estoque?: number }) => {
      try {
        return { success: true, data: criarProduto(dados) }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'produtos:atualizar',
    (_event, id: number, dados: { nome?: string; preco?: number; estoque?: number }) => {
      try {
        atualizarProduto(id, dados)
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle('produtos:alternarAtivo', (_event, id: number, ativo: boolean) => {
    try {
      alternarAtivoProduto(id, ativo)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('produtos:deletar', (_event, id: number) => {
    try {
      deletarProduto(id)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
