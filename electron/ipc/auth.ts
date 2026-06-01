import { ipcMain } from 'electron'
import {
  alterarPinVendedor,
  definirPinVendedor,
  lerAutoLockMinutos,
  lerTetoDescontoPct,
  setarAutoLockMinutos,
  setarTetoDescontoPct,
  temPinConfigurado,
  verificarPinDono,
  verificarPinVendedor
} from '../auth'
import { definirSessao, limparSessao, obterSessao, requerDono } from '../sessao'
import { listarParaLogin } from '../db/queries/vendedores'

export function registrarHandlersAuth(): void {
  // Status geral usado pelo App pra ler auto-lock e saber se há PIN configurado
  // (instalação fresca pode não ter — a tela de login lida com 1º cadastro).
  ipcMain.handle('auth:obterStatus', () => {
    try {
      return {
        success: true,
        data: {
          pinConfigurado: temPinConfigurado(),
          autoLockMinutos: lerAutoLockMinutos()
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ─── Sessão e login por vendedor ─────────────────────────────────────
  ipcMain.handle('auth:listarVendedoresParaLogin', () => {
    try {
      return { success: true, data: listarParaLogin() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('auth:login', async (_event, vendedorId: number, pin: string) => {
    try {
      const ok = await verificarPinVendedor(vendedorId, pin)
      if (!ok) return { success: true, data: { ok: false } }
      definirSessao(vendedorId)
      const sessao = obterSessao()
      return { success: true, data: { ok: true, sessao } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('auth:logout', () => {
    try {
      limparSessao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('auth:sessaoAtual', () => {
    try {
      return { success: true, data: obterSessao() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Modal "elevar privilégio": valida PIN de qualquer dono ativo sem trocar
  // o vendedor da sessão. Retorna o id do dono que autenticou (pra log futuro).
  ipcMain.handle('auth:elevar', async (_event, pin: string) => {
    try {
      const donoId = await verificarPinDono(pin)
      return { success: true, data: { ok: donoId !== null, donoId } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    'auth:cadastrarPinPrimeiroUso',
    async (_event, vendedorId: number, pin: string) => {
      try {
        await definirPinVendedor(vendedorId, pin)
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    'auth:alterarPinVendedor',
    async (_event, vendedorId: number, pinAtual: string, pinNovo: string) => {
      try {
        await alterarPinVendedor(vendedorId, pinAtual, pinNovo)
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // ─── Auto-lock ───────────────────────────────────────────────────────
  ipcMain.handle('auth:setarAutoLock', (_event, minutos: number) => {
    try {
      setarAutoLockMinutos(minutos)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ─── Teto de desconto ────────────────────────────────────────────────
  ipcMain.handle('auth:lerTetoDesconto', () => {
    try {
      return { success: true, data: lerTetoDescontoPct() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('auth:setarTetoDesconto', (_event, pct: number) => {
    try {
      requerDono()
      setarTetoDescontoPct(pct)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
