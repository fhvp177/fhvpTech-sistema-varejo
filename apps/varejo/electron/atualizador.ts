import { ipcMain, BrowserWindow, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { executarBackupPreUpdate } from '@fhvptech/core/electron/backup/BackupPreUpdate'

type RespostaIPC<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string }

// Mantém uma referência ao último resultado pra a tela de Configurações
// poder mostrar feedback mesmo sem rodar uma verificação manual.
export type EstadoAtualizacao = {
  versaoAtual: string
  ultimaVerificacao: string | null
  ultimaMensagem: string | null
  versaoBaixada: string | null
}

const estado: EstadoAtualizacao = {
  versaoAtual: app.getVersion(),
  ultimaVerificacao: null,
  ultimaMensagem: null,
  versaoBaixada: null
}

// Permite que outros módulos (ex.: notificações) leiam o estado de atualização
// sem passar pelo IPC. Devolve uma cópia para ninguém mutar o estado interno.
export function obterEstadoAtualizacao(): EstadoAtualizacao {
  return { ...estado }
}

/**
 * Configura o autoUpdater, registra os handlers IPC e o backup pré-atualização.
 *
 * - Eventos do autoUpdater são repassados ao renderer via 'atualizacao:evento'.
 * - O renderer pode chamar 'atualizacao:verificar' / 'atualizacao:instalar' / 'atualizacao:obterInfo'.
 * - O backup automático é disparado pelo evento 'before-quit-for-update'.
 */
export function inicializarAtualizador(obterJanela: () => BrowserWindow | null): void {
  // Configurações padrão — explícitas pra clareza
  autoUpdater.autoDownload = true            // baixa em background assim que detecta update
  autoUpdater.autoInstallOnAppQuit = false   // instalação é controlada pelo usuário via modal

  // Em dev o autoUpdater não tem `app-update.yml` ainda — desabilita silenciosamente
  if (!app.isPackaged) {
    console.log('[atualizador] App em modo dev — checagem de update desativada.')
  }

  // ─── Eventos do autoUpdater ──────────────────────────────────────────────
  const enviarEvento = (tipo: string, dados?: unknown): void => {
    const janela = obterJanela()
    if (janela && !janela.isDestroyed()) {
      janela.webContents.send('atualizacao:evento', { tipo, dados })
    }
  }

  autoUpdater.on('checking-for-update', () => {
    estado.ultimaVerificacao = new Date().toISOString()
    estado.ultimaMensagem = 'Verificando...'
    enviarEvento('verificando')
  })

  autoUpdater.on('update-available', (info) => {
    estado.ultimaMensagem = `Atualização ${info.version} disponível. Baixando...`
    enviarEvento('disponivel', { versao: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    estado.ultimaMensagem = 'Você já está na versão mais recente.'
    enviarEvento('nao-disponivel')
  })

  autoUpdater.on('download-progress', (progress) => {
    estado.ultimaMensagem = `Baixando: ${Math.round(progress.percent)}%`
    enviarEvento('progresso', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    estado.versaoBaixada = info.version
    estado.ultimaMensagem = `Atualização ${info.version} pronta para instalar.`
    enviarEvento('pronta', { versao: info.version, notas: info.releaseNotes ?? null })
  })

  autoUpdater.on('error', (err) => {
    estado.ultimaMensagem = `Erro: ${err.message}`
    enviarEvento('erro', { mensagem: err.message })
    console.warn('[atualizador]', err.message)
  })

  // ─── Handlers IPC chamados pelo renderer ─────────────────────────────────
  ipcMain.handle('atualizacao:obterInfo', (): RespostaIPC<EstadoAtualizacao> => {
    return { success: true, data: { ...estado } }
  })

  ipcMain.handle('atualizacao:verificar', async (): Promise<RespostaIPC> => {
    if (!app.isPackaged) {
      return { success: false, error: 'Verificação indisponível em modo de desenvolvimento.' }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { success: true, data: null }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('atualizacao:instalar', async (): Promise<RespostaIPC> => {
    if (!estado.versaoBaixada) {
      return { success: false, error: 'Nenhuma atualização baixada disponível.' }
    }
    // Backup antes de fechar — protege contra migrations da nova versão.
    // O evento 'before-quit-for-update' do electron-updater não serve aqui:
    // é emitido no autoUpdater nativo do Electron logo antes de app.quit(),
    // sem tempo de aguardar uma operação assíncrona.
    await executarBackupPreUpdate()
    // (true, true) = instala em SILÊNCIO (sem o assistente do Windows, casado com
    // nsis.oneClick) e reabre o app sozinho. Sem janela nativa: o usuário só vê o
    // nosso aviso "Atualizando…" e o sistema reabre já atualizado.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
    return { success: true, data: null }
  })

  // ─── Verificação automática ao iniciar (só em prod) ──────────────────────
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((e) => {
      console.warn('[atualizador] Falha na verificação inicial:', e.message)
    })
  }
}
