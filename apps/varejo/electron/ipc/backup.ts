import { escolherPasta } from '@fhvptech/core/electron/plataforma'
import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { fazerBackupManual } from '@fhvptech/core/electron/backup/BackupManual'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import { verificarSenha, temSenhaConfigurada } from '@fhvptech/core/electron/backup/SenhaRestauracao'
import { listarBackupsDisponiveis, restaurarBackup } from '@fhvptech/core/electron/backup/Restaurador'

/**
 * Ganchos de quem hospeda — cada lugar liga o que faz sentido nele.
 *
 * Recebê-los por parâmetro é o que permite ao servidor web registrar os oito
 * canais de backup sem arrastar o Electron junto.
 */
export interface GanchosBackup {
  /**
   * Frequência mudou, ou o backup automático foi ligado/desligado. No
   * aplicativo instalado reinicia o agendador. No servidor não vem: aquele
   * mecanismo reage a suspender a máquina e avisa a janela, e servidor não
   * dorme nem tem janela.
   */
  aoMudarAgenda?: () => void
  /**
   * Um backup manual acabou de ficar pronto.
   *
   * Existe por causa do que se viu no primeiro teste hospedado: o lojista
   * clicava em "fazer backup", o arquivo era criado na hora, mas só saía da
   * máquina no próximo ciclo de envio — até quinze minutos depois. Quem aperta
   * aquele botão costuma estar prestes a fazer algo arriscado, e "já está
   * salvo" não pode ser uma promessa com atraso.
   */
  aoConcluirBackup?: () => void
}

export function registrarHandlersBackup(ganchos: GanchosBackup = {}): void {
  registrarCanal('backup:fazerManual', async () => {
    try {
      const resultado = await fazerBackupManual()
      if (resultado.sucesso) {
        // Sem esperar: o envio para fora da máquina começa agora, não no
        // próximo ciclo. Falha aqui não estraga o backup, que já está no disco.
        ganchos.aoConcluirBackup?.()
        return { success: true, data: null }
      }
      return { success: false, error: resultado.erro ?? 'Falha ao criar backup.' }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('backup:obterStatus', () => {
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

  registrarCanal('backup:gravarConfig', (chave: string, valor: string) => {
    try {
      gravarConfig(chave, valor)
      if (chave === 'backup_frequencia_horas' || chave === 'backup_ativo') {
        ganchos.aoMudarAgenda?.()
      }
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('backup:verificarSenha', async (senha: string) => {
    try {
      const ok = await verificarSenha(senha)
      return { success: true, data: ok }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('backup:listarBackups', () => {
    try {
      return { success: true, data: listarBackupsDisponiveis() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('backup:restaurar', async (caminhoZip: string) => {
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

  registrarCanal('backup:selecionarPasta', async () => {
    try {
      const pasta = await escolherPasta('Selecionar pasta para backups')
      return { success: true, data: pasta }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
