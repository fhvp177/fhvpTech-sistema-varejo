// Handler IPC de etiquetas — será implementado na etapa 10
import { ipcMain } from 'electron'

export function registrarHandlersEtiquetas(): void {
  ipcMain.handle('etiquetas:gerarPDF', async () => {
    return { success: false, error: 'Módulo de etiquetas ainda não implementado' }
  })
}
