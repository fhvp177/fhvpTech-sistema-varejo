import { ipcMain } from 'electron'
import {
  temPinConfigurado,
  verificarPin,
  definirPin,
  alterarPin,
  lerAutoLockMinutos,
  setarAutoLockMinutos,
  marcarValidadoHoje,
  precisaValidarHoje
} from '../auth'

export function registrarHandlersAuth(): void {
  ipcMain.handle('auth:obterStatus', () => {
    try {
      return {
        success: true,
        data: {
          pinConfigurado: temPinConfigurado(),
          precisaValidarHoje: precisaValidarHoje(),
          autoLockMinutos: lerAutoLockMinutos()
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('auth:definirPin', async (_event, pin: string) => {
    try {
      await definirPin(pin)
      marcarValidadoHoje()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('auth:verificarPin', async (_event, pin: string) => {
    try {
      const ok = await verificarPin(pin)
      if (ok) marcarValidadoHoje()
      return { success: true, data: { ok } }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('auth:alterarPin', async (_event, pinAtual: string, pinNovo: string) => {
    try {
      await alterarPin(pinAtual, pinNovo)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('auth:setarAutoLock', (_event, minutos: number) => {
    try {
      setarAutoLockMinutos(minutos)
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('auth:marcarValidadoHoje', () => {
    try {
      marcarValidadoHoje()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
