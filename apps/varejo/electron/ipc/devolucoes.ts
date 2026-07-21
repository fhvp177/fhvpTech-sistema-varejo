import { ipcMain } from 'electron'
import {
  itensDevolviveis,
  saldoCredito,
  registrarDevolucao,
  listarDevolucoesPorVenda,
  type TipoDevolucao,
  type ItemDevolverEntrada
} from '../db/queries/devolucoes'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerSessao, ehDono } from '../sessao'
import { verificarPinDono } from '../auth'

// Payload vindo do renderer. vendedor_id e autorizado_por_id NÃO vêm daqui —
// são derivados da sessão/elevação no main (fonte da verdade pra auditoria),
// mesmo padrão de vendas:criar.
type EntradaDevolucao = {
  venda_id: number
  tipo: TipoDevolucao
  cliente_id?: number | null
  motivo?: string | null
  itens: ItemDevolverEntrada[]
  // Só usado quando tipo='dinheiro' e o vendedor logado não é gerente: PIN de um
  // gerente pra autorizar a saída de dinheiro do caixa.
  pinDono?: string
}

export function registrarHandlersDevolucoes(): void {
  ipcMain.handle('devolucoes:itensDevolviveis', (_event, vendaId: number) => {
    try {
      return { success: true, data: itensDevolviveis(vendaId) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('devolucoes:saldoCredito', (_event, clienteId: number) => {
    try {
      return { success: true, data: saldoCredito(clienteId) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('devolucoes:porVenda', (_event, vendaId: number) => {
    try {
      return { success: true, data: listarDevolucoesPorVenda(vendaId) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('devolucoes:registrar', async (_event, entrada: EntradaDevolucao) => {
    try {
      const sessao = requerSessao()

      // Permissão por risco: crédito (dinheiro fica na loja) → basta o vendedor
      // logado. Dinheiro de volta (sai do caixa) → exige gerente: ou o logado já é
      // gerente, ou um gerente autoriza pelo PIN. A verificação do PIN roda aqui no
      // main — o renderer não tem como forjar a autorização.
      let autorizadoPorId: number | null = null
      if (entrada.tipo === 'dinheiro') {
        if (ehDono()) {
          autorizadoPorId = sessao.id
        } else {
          const donoId = await verificarPinDono(entrada.pinDono ?? '')
          if (donoId === null) {
            throw new Error('Devolução em dinheiro exige autorização do gerente (PIN não confere).')
          }
          autorizadoPorId = donoId
        }
      }

      const devolucao = registrarDevolucao({
        venda_id: entrada.venda_id,
        vendedor_id: sessao.id,
        autorizado_por_id: autorizadoPorId,
        tipo: entrada.tipo,
        cliente_id: entrada.cliente_id ?? null,
        motivo: entrada.motivo ?? null,
        itens: entrada.itens
      })
      obterBackupManager().marcarAlteracao()
      return { success: true, data: devolucao }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
