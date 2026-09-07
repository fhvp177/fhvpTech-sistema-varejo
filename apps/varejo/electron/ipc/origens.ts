import { registrarCanal } from '@fhvptech/core/electron/roteador'
import {
  listarOrigens,
  criarOrigem,
  atualizarOrigem,
  deletarOrigem
} from '../db/queries/origens'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono } from '../sessao'

/**
 * Origens de captação, no mesmo molde das categorias de produto.
 *
 * ⚠️ Listar é livre e mexer na lista é do dono, igual a categorias: o vendedor
 * precisa ESCOLHER a origem ao cadastrar um cliente, mas quem decide quais
 * canais a loja acompanha é quem paga o anúncio. Sem isso a lista vira dez
 * variações de "instagram" digitadas por pessoas diferentes, e o relatório de
 * captação deixa de somar.
 */
export function registrarHandlersOrigens(): void {
  registrarCanal('origens:listar', () => {
    try {
      return { success: true, data: listarOrigens() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('origens:criar', (nome: string) => {
    try {
      requerDono()
      const resultado = criarOrigem(nome)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: resultado }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('origens:atualizar', (id: number, nome: string) => {
    try {
      requerDono()
      atualizarOrigem(id, nome)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('origens:deletar', (id: number) => {
    try {
      requerDono()
      deletarOrigem(id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
