import { ipcMain } from 'electron'
import { validarLicenca, ativarLicenca } from '../licenca'

export function registrarHandlersLicenca(): void {
  ipcMain.handle('licenca:validar', () => {
    try {
      const status = validarLicenca()
      return { success: true, data: status }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('licenca:ativar', (_event, chave: string) => {
    try {
      const status = ativarLicenca(chave)
      return { success: true, data: status }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
