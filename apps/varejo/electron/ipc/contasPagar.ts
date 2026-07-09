import { ipcMain } from 'electron'
import {
  listarContasPagar,
  criarContaPagar,
  atualizarContaPagar,
  deletarContaPagar,
  registrarPagamentoConta,
  estornarPagamentoConta,
  resumoContasPagar,
  type DadosContaPagar,
  type FiltroContas
} from '../db/queries/contasPagar'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono } from '../sessao'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Normaliza e valida o payload vindo do renderer. Descrição e valor são
// obrigatórios; vencimento e fornecedor são opcionais.
function validar(payload: unknown): DadosContaPagar {
  if (!payload || typeof payload !== 'object') throw new Error('Dados inválidos.')
  const p = payload as Record<string, unknown>

  const descricao = String(p.descricao ?? '').trim()
  if (!descricao) throw new Error('A descrição da conta é obrigatória.')

  const valor = Number(p.valor_total)
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('O valor da conta deve ser maior que zero.')
  }

  let vencimento: string | null = null
  if (p.vencimento != null && String(p.vencimento).trim() !== '') {
    vencimento = String(p.vencimento).trim()
    if (!ISO_DATE.test(vencimento)) throw new Error('Data de vencimento inválida.')
  }

  let fornecedorId: number | null = null
  if (p.fornecedor_id != null && p.fornecedor_id !== '') {
    fornecedorId = Number(p.fornecedor_id)
    if (!Number.isInteger(fornecedorId)) throw new Error('Fornecedor inválido.')
  }

  const categoria = p.categoria != null && String(p.categoria).trim() !== ''
    ? String(p.categoria).trim()
    : null
  const observacao = p.observacao != null && String(p.observacao).trim() !== ''
    ? String(p.observacao).trim()
    : null

  return {
    descricao,
    categoria,
    fornecedor_id: fornecedorId,
    valor_total: +valor.toFixed(2),
    vencimento,
    observacao
  }
}

export function registrarHandlersContasPagar(): void {
  ipcMain.handle('contasPagar:listar', (_event, filtro?: string) => {
    try {
      const f: FiltroContas =
        filtro === 'aberto' || filtro === 'pago' ? filtro : 'todas'
      return { success: true, data: listarContasPagar(f) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('contasPagar:resumo', () => {
    try {
      return { success: true, data: resumoContasPagar() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('contasPagar:criar', (_event, dados: unknown) => {
    try {
      requerDono()
      const resultado = criarContaPagar(validar(dados))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: resultado }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('contasPagar:atualizar', (_event, id: number, dados: unknown) => {
    try {
      requerDono()
      atualizarContaPagar(Number(id), validar(dados))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('contasPagar:deletar', (_event, id: number) => {
    try {
      requerDono()
      deletarContaPagar(Number(id))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('contasPagar:registrarPagamento', (_event, id: number, valor: number) => {
    try {
      requerDono()
      registrarPagamentoConta(Number(id), Number(valor))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('contasPagar:estornarPagamento', (_event, id: number) => {
    try {
      requerDono()
      estornarPagamentoConta(Number(id))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
