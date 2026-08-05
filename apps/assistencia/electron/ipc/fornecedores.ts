import { registrarCanal } from '@fhvptech/core/electron/roteador'
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
  registrarCanal('fornecedores:listar', () => {
    try {
      return { success: true, data: listarFornecedores() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('fornecedores:criar', (dados: DadosFornecedor) => {
    try {
      requerDono()
      const resultado = criarFornecedor(dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: resultado }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('fornecedores:atualizar', (id: number, dados: DadosFornecedor) => {
    try {
      requerDono()
      atualizarFornecedor(id, dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('fornecedores:deletar', (id: number) => {
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
