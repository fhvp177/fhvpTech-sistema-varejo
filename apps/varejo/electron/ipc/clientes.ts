import { ipcMain } from 'electron'
import {
  listarClientes,
  criarCliente,
  atualizarCliente,
  deletarCliente,
  listarInadimplentes,
  listarVencendoHoje,
  type DadosCliente
} from '../db/queries/clientes'
import { obterBackupManager } from '../backup/BackupManager'
import { requerDono } from '../sessao'

export function registrarHandlersClientes(): void {
  ipcMain.handle('clientes:listar', () => {
    try {
      return { success: true, data: listarClientes() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // criar é liberado pro vendedor — frequente no PDV (cadastra cliente novo na hora)
  ipcMain.handle('clientes:criar', (_event, dados: DadosCliente) => {
    try {
      const resultado = criarCliente(dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: resultado }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('clientes:atualizar', (_event, id: number, dados: DadosCliente) => {
    try {
      requerDono()
      atualizarCliente(id, dados)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('clientes:deletar', (_event, id: number) => {
    try {
      requerDono()
      deletarCliente(id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('clientes:listarInadimplentes', () => {
    try {
      return { success: true, data: listarInadimplentes() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('clientes:listarVencendoHoje', () => {
    try {
      return { success: true, data: listarVencendoHoje() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
