import { ipcMain } from 'electron'
import {
  listarProdutos,
  buscarProdutoPorCodigoBarras,
  criarProduto,
  atualizarProduto,
  deletarProduto,
  type DadosProduto
} from '../db/queries/produtos'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono, ehDono } from '../sessao'
import { verificarPinDono } from '../auth'

export function registrarHandlersProdutos(): void {
  ipcMain.handle('produtos:listar', () => {
    try {
      return { success: true, data: listarProdutos() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('produtos:buscarPorCodigoBarras', (_event, codigo: string) => {
    try {
      const produto = buscarProdutoPorCodigoBarras(codigo)
      return { success: true, data: produto ?? null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Cadastrar produto é ação de gerente. Pra não travar o caixa quando um vendedor
  // bipa um item ainda não cadastrado, aceitamos a autorização por PIN de um gerente
  // (mesmo padrão do desconto acima do teto) — validada aqui no backend, não na
  // confiança do renderer.
  ipcMain.handle('produtos:criar', async (_event, dados: DadosProduto, pinDono?: string) => {
    try {
      if (!ehDono()) {
        const donoId = pinDono ? await verificarPinDono(pinDono) : null
        if (donoId === null) {
          throw new Error('Cadastrar um produto requer a autorização de um gerente.')
        }
      }
      const resultado = criarProduto(dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: resultado }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('produtos:atualizar', (_event, id: number, dados: DadosProduto) => {
    try {
      requerDono()
      atualizarProduto(id, dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('produtos:deletar', (_event, id: number) => {
    try {
      requerDono()
      deletarProduto(id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
