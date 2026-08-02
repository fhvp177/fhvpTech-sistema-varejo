import { ipcMain } from 'electron'
import {
  validarLicencaComRelogio,
  ativarLicenca,
  destravarRelogio
} from '@fhvptech/core/electron/licenca'

export function registrarHandlersLicenca(): void {
  // Usa a versão que confere a hora com o servidor antes de acusar o relógio.
  // Custa uma requisição HEAD com timeout curto, e só quando a trava dispara.
  ipcMain.handle('licenca:validar', async () => {
    try {
      const status = await validarLicencaComRelogio()
      return { success: true, data: status }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('licenca:destravarRelogio', () => {
    try {
      return { success: true, data: destravarRelogio() }
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
