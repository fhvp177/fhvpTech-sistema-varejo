import { obterBackupManager, type ResultadoBackup } from './BackupManager'

export async function fazerBackupManual(): Promise<ResultadoBackup> {
  return obterBackupManager().executarBackup('manual')
}
