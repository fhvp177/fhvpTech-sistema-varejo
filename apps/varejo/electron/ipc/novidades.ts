import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'

// "O que há de novo": guarda em `config` a última versão cujas novidades já
// foram exibidas. O renderer compara com a versão atual pra decidir se mostra.
export function registrarHandlersNovidades(): void {
  registrarCanal('novidades:estado', () => {
    try {
      return {
        success: true,
        data: {
          ultimaVersaoVista: lerConfig('ultima_versao_vista') || '',
          // Pista p/ a ESTREIA do recurso: quem já viu o tutorial é cliente
          // antigo (que atualizou), não instalação nova — então merece ver as
          // novidades já nesta primeira vez.
          guiaVisto: lerConfig('onboarding_guia_visto') === '1'
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('novidades:marcar', (versao: string) => {
    try {
      gravarConfig('ultima_versao_vista', String(versao))
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
