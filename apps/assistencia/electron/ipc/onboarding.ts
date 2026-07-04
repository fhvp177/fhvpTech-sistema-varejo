import { ipcMain } from 'electron'
import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'

// Estado do tutorial de primeira abertura. Os passos da checklist NÃO são gravados
// como "marcados" — são derivados do dado real (existe produto? existe venda?),
// então a lista sempre reflete a verdade, mesmo se o lojista apagar tudo depois.

function contar(tabela: 'produtos' | 'clientes' | 'vendas'): number {
  const db = obterBancoDeDados()
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }
  return row.n
}

export function registrarHandlersOnboarding(): void {
  ipcMain.handle('onboarding:estado', () => {
    try {
      return {
        success: true,
        data: {
          guiaVisto: lerConfig('onboarding_guia_visto') === '1',
          checklistDispensada: lerConfig('onboarding_checklist_dispensada') === '1',
          progresso: {
            temProduto: contar('produtos') > 0,
            temCliente: contar('clientes') > 0,
            temVenda: contar('vendas') > 0,
            lojaConfigurada: lerConfig('loja_configurada') === '1'
          }
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('onboarding:marcarGuiaVisto', () => {
    try {
      gravarConfig('onboarding_guia_visto', '1')
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('onboarding:dispensarChecklist', () => {
    try {
      gravarConfig('onboarding_checklist_dispensada', '1')
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
