import { obterBackupManager } from './BackupManager'

/**
 * Executa o backup pré-atualização. Chamado pelo handler IPC `atualizacao:instalar`
 * antes de disparar o instalador NSIS — protege contra falhas em migrations
 * da nova versão.
 */
export async function executarBackupPreUpdate(): Promise<void> {
  const resultado = await obterBackupManager().executarBackup('pre-update')
  if (resultado.sucesso) {
    console.log('[backup-pre-update] Backup concluído com sucesso.')
  } else {
    console.warn(`[backup-pre-update] Falha no backup: ${resultado.erro}`)
    // Falha não bloqueia a atualização — o backup automático pré-restauração
    // ainda cobre o caso de rollback manual via tela de restauração.
  }
}
