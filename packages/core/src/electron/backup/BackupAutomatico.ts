import { BrowserWindow, powerMonitor } from 'electron'
import { obterBackupManager } from './BackupManager'
import { lerConfig } from './configBackup'

const IDLE_LIMITE_SEGUNDOS = 10 * 60   // 10 minutos
const TICK_MS = 60_000                 // verifica a cada 1 minuto

class BackupAutomatico {
  private intervaloId: NodeJS.Timeout | null = null
  private minutosAtivos = 0

  iniciar(): void {
    if (this.intervaloId) return // já rodando
    if (!this.deveRodar()) return

    this.intervaloId = setInterval(() => {
      this.tick().catch(() => {
        // tick nunca deve propagar erros — falhas são registradas no backup_log
      })
    }, TICK_MS)

    console.log('[backup-auto] Iniciado — frequência:', lerConfig('backup_frequencia_horas'), 'h')
  }

  parar(): void {
    if (this.intervaloId) {
      clearInterval(this.intervaloId)
      this.intervaloId = null
    }
    this.minutosAtivos = 0
    console.log('[backup-auto] Parado.')
  }

  /** Reinicia o agendador após mudança de configuração. */
  reiniciar(): void {
    this.parar()
    this.iniciar()
  }

  private deveRodar(): boolean {
    if (lerConfig('backup_ativo') !== '1') return false
    const freq = lerConfig('backup_frequencia_horas')
    return freq !== 'desativado' && Number(freq) > 0
  }

  private async tick(): Promise<void> {
    // Reavalia a flag a cada tick — permite ligar/desligar sem reiniciar o app
    if (!this.deveRodar()) return

    const idleSegundos = powerMonitor.getSystemIdleTime()
    const usuarioAtivo = idleSegundos < IDLE_LIMITE_SEGUNDOS

    if (usuarioAtivo) {
      this.minutosAtivos++
    }

    const limiteMinutos = Number(lerConfig('backup_frequencia_horas')) * 60

    if (this.minutosAtivos >= limiteMinutos) {
      this.minutosAtivos = 0
      await this.executar()
    }
  }

  private async executar(): Promise<void> {
    const resultado = await obterBackupManager().executarBackup('automatico')
    this.notificarRenderer(resultado.sucesso)
  }

  private notificarRenderer(sucesso: boolean): void {
    const janelas = BrowserWindow.getAllWindows()
    if (janelas.length > 0) {
      // O renderer usa este evento para mostrar o indicador visual (Fase 11)
      janelas[0].webContents.send('backup:notificacao', {
        tipo: 'automatico',
        sucesso,
      })
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let instancia: BackupAutomatico | null = null

export function inicializarBackupAutomatico(): void {
  instancia = new BackupAutomatico()
  instancia.iniciar()
}

export function obterBackupAutomatico(): BackupAutomatico {
  if (!instancia) throw new Error('BackupAutomatico não inicializado.')
  return instancia
}
