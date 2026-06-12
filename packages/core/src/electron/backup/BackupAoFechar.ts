import { BrowserWindow, dialog } from 'electron'
import { obterBackupManager } from './BackupManager'
import { lerConfig, gravarConfig } from './configBackup'

/**
 * Registra o listener de fechamento na janela principal.
 * Deve ser chamado uma única vez em criarJanelaPrincipal().
 * Não substitui o handler window-all-closed existente.
 */
export function registrarBackupAoFechar(janela: BrowserWindow): void {
  janela.on('close', async (event) => {
    event.preventDefault()
    await processarFechamento(janela)
  })
}

async function processarFechamento(janela: BrowserWindow): Promise<void> {
  try {
    const preferencia = lerConfig('backup_ao_fechar') // 'perguntar' | 'sempre' | 'nunca'

    if (preferencia === 'nunca' || !precisaBackup()) {
      janela.destroy()
      return
    }

    if (preferencia === 'sempre') {
      await executarEFechar(janela)
      return
    }

    // 'perguntar' — exibe diálogo nativo
    const { response } = await dialog.showMessageBox(janela, {
      type: 'question',
      title: 'Backup ao fechar',
      message: 'Há alterações desde o último backup.',
      detail: 'Deseja fazer um backup antes de fechar o sistema?',
      buttons: ['Sim', 'Não', 'Sempre fazer automaticamente'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })

    if (response === 2) {
      gravarConfig('backup_ao_fechar', 'sempre')
      await executarEFechar(janela)
    } else if (response === 0) {
      await executarEFechar(janela)
    } else {
      janela.destroy()
    }
  } catch (err) {
    // Erro inesperado no fluxo de backup ao fechar — fechar mesmo assim
    console.error('[backup-ao-fechar] Erro inesperado:', (err as Error).message)
    if (!janela.isDestroyed()) janela.destroy()
  }
}

function precisaBackup(): boolean {
  const ultimaAlteracao = lerConfig('backup_timestamp_ultima_alteracao')
  const ultimoBackup = lerConfig('backup_timestamp_ultimo_backup')

  if (!ultimoBackup) return true    // nunca fez backup → fazer
  if (!ultimaAlteracao) return false // nenhuma alteração registrada → não fazer

  return new Date(ultimaAlteracao) > new Date(ultimoBackup)
}

async function executarEFechar(janela: BrowserWindow): Promise<void> {
  // Notifica o renderer para mostrar overlay de carregamento (componente na Fase 11)
  if (!janela.isDestroyed()) {
    janela.webContents.send('backup:carregando', true)
  }

  const resultado = await obterBackupManager().executarBackup('diario')

  if (resultado.sucesso) {
    janela.destroy()
    return
  }

  // Backup falhou — pergunta se fecha mesmo assim
  if (janela.isDestroyed()) return

  janela.webContents.send('backup:carregando', false)

  const { response } = await dialog.showMessageBox(janela, {
    type: 'error',
    title: 'Erro no backup',
    message: 'Não foi possível fazer o backup.',
    detail: resultado.erro ?? 'Erro desconhecido.',
    buttons: ['Fechar mesmo assim', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })

  if (response === 0) {
    janela.destroy()
  }
  // Se cancelar: janela permanece aberta — event.preventDefault() já foi chamado
}
