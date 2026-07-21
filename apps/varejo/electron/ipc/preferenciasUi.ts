import { ipcMain } from 'electron'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'

// Preferências de INTERFACE — coisas como "esta seção das Configurações fica
// aberta ou fechada". Não é dado de negócio: se sumir, ninguém perde nada.
//
// ⚠️ Deliberadamente NÃO é um acesso genérico à tabela `config`. Ela guarda
// também o hash da senha de restauração, dados da loja e configuração fiscal —
// expor um "leia/grave qualquer chave" ao renderer transformaria isso numa
// porta de entrada para tudo. Por isso só passam chaves que casam com o
// formato abaixo, e nada mais.
const CHAVE_PERMITIDA = /^config_secao_[a-z0-9_]{1,40}_aberta$/

function validar(chave: string): string {
  const c = String(chave ?? '')
  if (!CHAVE_PERMITIDA.test(c)) {
    throw new Error('Preferência de interface inválida.')
  }
  return c
}

export function registrarHandlersPreferenciasUi(): void {
  ipcMain.handle('config:obter', (_e, chave: string) => {
    try {
      return { success: true, data: lerConfig(validar(chave)) || null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('config:salvar', (_e, chave: string, valor: string) => {
    try {
      // Só '0' ou '1' — é um interruptor, não um campo livre.
      gravarConfig(validar(chave), valor === '1' ? '1' : '0')
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
