import { obterBackupManager, temBackupManager } from './BackupManager'
import {
  executarBackupPreUpdateCom,
  type FonteBackup,
  type ResultadoPreUpdate
} from './preUpdateLogica'

export type { ResultadoPreUpdate } from './preUpdateLogica'

/** O BackupManager de verdade, atrás da interface que a lógica entende. */
const fonteReal: FonteBackup = {
  disponivel: temBackupManager,
  executar: () => obterBackupManager().executarBackup('pre-update')
}

/**
 * Executa o backup pré-atualização. Chamado pelo handler IPC `atualizacao:instalar`
 * antes de disparar o instalador NSIS — protege contra falhas em migrations
 * da nova versão.
 *
 * Não lança: devolve o que aconteceu. A regra e o motivo estão em
 * `preUpdateLogica.ts`, que é onde os testes alcançam.
 */
export async function executarBackupPreUpdate(): Promise<ResultadoPreUpdate> {
  const resultado = await executarBackupPreUpdateCom(fonteReal)

  if (resultado.estado === 'feito') {
    console.log('[backup-pre-update] Backup concluído com sucesso.')
  } else if (resultado.estado === 'nao-se-aplica') {
    // Segundo caixa: não tem banco local, não há o que guardar. Quem tem os
    // dados é o PC principal, e ele faz o próprio backup ao atualizar.
    console.log('[backup-pre-update] Máquina sem banco local — nada a fazer.')
  } else {
    console.warn(`[backup-pre-update] Falha no backup: ${resultado.erro}`)
    // Falha não bloqueia a atualização — o backup automático pré-restauração
    // ainda cobre o caso de rollback manual via tela de restauração. Mas agora
    // o resultado sobe até o modal, que avisa o lojista em vez de engolir.
  }

  return resultado
}
