import { ipcMain } from 'electron'
import bcrypt from 'bcryptjs'
import {
  alterarPapel,
  alternarAtivoVendedor,
  atualizarVendedor,
  criarVendedor,
  deletarVendedor,
  gravarPinHash,
  listarVendedores,
  type PapelVendedor
} from '../db/queries/vendedores'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono } from '../sessao'

const BCRYPT_ROUNDS = 12

export function registrarHandlersVendedores(): void {
  // Listar é leitura — qualquer sessão pode (o PDV precisa pra seletor)
  ipcMain.handle('vendedores:listar', () => {
    try {
      return { success: true, data: listarVendedores() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Operações de gestão exigem dono ─────────────────────────────────────
  ipcMain.handle(
    'vendedores:criar',
    (_event, dados: { nome: string; email?: string | null } | string) => {
      try {
        requerDono()
        // Compat: aceita string (formato antigo) ou objeto
        const payload = typeof dados === 'string' ? { nome: dados } : dados
        const resultado = criarVendedor(payload.nome, { email: payload.email ?? null })
        obterBackupManager().marcarAlteracao()
        return { success: true, data: resultado }
      } catch (error) {
        const msg = (error as Error).message
        if (msg.includes('UNIQUE')) {
          return { success: false, error: 'Já existe um técnico com esse nome.' }
        }
        return { success: false, error: msg }
      }
    }
  )

  ipcMain.handle(
    'vendedores:atualizar',
    (_event, id: number, dados: { nome?: string; email?: string | null } | string) => {
      try {
        requerDono()
        // Compat: aceita string (renomeio simples) ou objeto
        const payload = typeof dados === 'string' ? { nome: dados } : dados
        atualizarVendedor(id, payload)
        obterBackupManager().marcarAlteracao()
        return { success: true, data: null }
      } catch (error) {
        const msg = (error as Error).message
        if (msg.includes('UNIQUE')) {
          return { success: false, error: 'Já existe um técnico com esse nome.' }
        }
        return { success: false, error: msg }
      }
    }
  )

  ipcMain.handle('vendedores:alternarAtivo', (_event, id: number, ativo: boolean) => {
    try {
      requerDono()
      alternarAtivoVendedor(id, ativo)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendedores:deletar', (_event, id: number) => {
    try {
      requerDono()
      deletarVendedor(id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vendedores:alterarPapel', (_event, id: number, papel: PapelVendedor) => {
    try {
      requerDono()
      alterarPapel(id, papel)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Dono redefine o PIN de um vendedor (ex.: vendedor esqueceu). Aceita PIN
  // de 4 a 6 dígitos. O vendedor pode depois trocar pelo próprio.
  ipcMain.handle('vendedores:redefinirPin', async (_event, id: number, novoPin: string) => {
    try {
      requerDono()
      if (!/^\d{4,6}$/.test(novoPin)) {
        return { success: false, error: 'O PIN deve conter de 4 a 6 dígitos numéricos.' }
      }
      const hash = await bcrypt.hash(novoPin, BCRYPT_ROUNDS)
      gravarPinHash(id, hash)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
