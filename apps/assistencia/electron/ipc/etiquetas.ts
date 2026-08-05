// Handler IPC de etiquetas — será implementado na etapa 10
import { registrarCanal } from '@fhvptech/core/electron/roteador'

export function registrarHandlersEtiquetas(): void {
  registrarCanal('etiquetas:gerarPDF', async () => {
    return { success: false, error: 'Módulo de etiquetas ainda não implementado' }
  })
}
