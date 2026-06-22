import { ipcMain } from 'electron'
import {
  listarVendas,
  buscarVendaPorId,
  criarVenda,
  atualizarStatusVenda,
  pagarParcela,
  registrarPagamentoParcial,
  restaurarVenda,
  resumoDashboard,
  produtosMaisVendidosNoMes,
  type DadosNovaVenda,
  type StatusPagamento,
  type SnapshotVenda
} from '../db/queries/vendas'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { lerConfig } from '@fhvptech/core/electron/backup/configBackup'
import { requerSessao } from '../sessao'

// Dispara um backup ZIP em background após uma venda, se a opção estiver ativa.
// Não bloqueia o handler IPC e nunca propaga erros — o usuário não pode esperar
// por um backup pra confirmar uma venda.
function dispararBackupPorVendaSeAtivo(): void {
  if (lerConfig('backup_por_venda') !== '1') return
  obterBackupManager()
    .executarBackup('por-venda')
    .catch((err) => {
      console.warn('[backup] backup por-venda falhou:', (err as Error).message)
    })
}

export function registrarHandlersVendas(): void {
  ipcMain.handle('vendas:listar', (_event, mes?: string) => {
    try {
      return { success: true, data: listarVendas(mes) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendas:buscarPorId', (_event, id: number) => {
    try {
      return { success: true, data: buscarVendaPorId(id) ?? null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // A venda é sempre atribuída ao vendedor logado. Ignora qualquer vendedor_id
  // que venha do renderer — a sessão é fonte da verdade pra rastreabilidade.
  ipcMain.handle('vendas:criar', (_event, dados: DadosNovaVenda) => {
    try {
      const sessao = requerSessao()
      const resultado = criarVenda({ ...dados, vendedor_id: sessao.id })
      obterBackupManager().marcarAlteracao()
      dispararBackupPorVendaSeAtivo()
      return { success: true, data: resultado }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendas:atualizarStatus', (_event, id: number, status: StatusPagamento) => {
    try {
      const snapshot = atualizarStatusVenda(id, status)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: { snapshot } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendas:pagarParcela', (_event, parcelaId: number) => {
    try {
      const resultado = pagarParcela(parcelaId)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: resultado ?? null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendas:registrarPagamentoParcial', (_event, id: number, valor: number) => {
    try {
      const snapshot = registrarPagamentoParcial(id, valor)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: { snapshot } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendas:restaurar', (_event, id: number, snapshot: SnapshotVenda) => {
    try {
      restaurarVenda(id, snapshot)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendas:resumoDashboard', () => {
    try {
      return { success: true, data: resumoDashboard() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendas:produtosMaisVendidos', (_event, mes: string) => {
    try {
      return { success: true, data: produtosMaisVendidosNoMes(mes) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
