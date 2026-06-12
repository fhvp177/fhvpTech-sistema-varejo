import { ipcMain, dialog } from 'electron'
import { fazerBackupManual } from '@fhvptech/core/electron/backup/BackupManual'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import { obterBackupAutomatico } from '@fhvptech/core/electron/backup/BackupAutomatico'
import { verificarSenha, temSenhaConfigurada } from '@fhvptech/core/electron/backup/SenhaRestauracao'
import { listarBackupsDisponiveis, restaurarBackup } from '@fhvptech/core/electron/backup/Restaurador'

export function registrarHandlersBackup(): void {
  ipcMain.handle('backup:fazerManual', async () => {
    try {
      const resultado = await fazerBackupManual()
      if (resultado.sucesso) {
        return { success: true, data: null }
      }
      return { success: false, error: resultado.erro ?? 'Falha ao criar backup.' }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('backup:obterStatus', () => {
    try {
      return {
        success: true,
        data: {
          ativo: lerConfig('backup_ativo') === '1',
          ultimaAlteracao: lerConfig('backup_timestamp_ultima_alteracao') || null,
          ultimoBackup: lerConfig('backup_timestamp_ultimo_backup') || null,
          falhasConsecutivas: parseInt(lerConfig('backup_falhas_consecutivas') || '0', 10),
          pastaPadrao: lerConfig('backup_pasta_padrao') || '',
          pastaSecundaria: lerConfig('backup_pasta_secundaria') || '',
          frequencia: lerConfig('backup_frequencia_horas') || '2',
          aoFechar: lerConfig('backup_ao_fechar') || 'perguntar',
          porVenda: lerConfig('backup_por_venda') === '1',
          alertaTamanho: lerConfig('backup_alerta_tamanho') === '1',
          senhaConfigurada: temSenhaConfigurada(),
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('backup:gravarConfig', (_event, chave: string, valor: string) => {
    try {
      gravarConfig(chave, valor)
      if (chave === 'backup_frequencia_horas' || chave === 'backup_ativo') {
        obterBackupAutomatico().reiniciar()
      }
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('backup:verificarSenha', async (_event, senha: string) => {
    try {
      const ok = await verificarSenha(senha)
      return { success: true, data: ok }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('backup:listarBackups', () => {
    try {
      return { success: true, data: listarBackupsDisponiveis() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('backup:restaurar', async (_event, caminhoZip: string) => {
    try {
      const resultado = await restaurarBackup(caminhoZip)
      if (resultado.sucesso) {
        return { success: true, data: null }
      }
      return { success: false, error: resultado.erro ?? 'Falha na restauração.' }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('backup:selecionarPasta', async () => {
    try {
      const resultado = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Selecionar pasta para backups'
      })
      if (resultado.canceled || resultado.filePaths.length === 0) {
        return { success: true, data: null }
      }
      return { success: true, data: resultado.filePaths[0] }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
