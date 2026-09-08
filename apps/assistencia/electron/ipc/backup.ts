import { dialog } from 'electron'
import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { fazerBackupManual } from '@fhvptech/core/electron/backup/BackupManual'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import { obterBackupAutomatico } from '@fhvptech/core/electron/backup/BackupAutomatico'
import { verificarSenha, temSenhaConfigurada } from '@fhvptech/core/electron/backup/SenhaRestauracao'
import { listarBackupsDisponiveis, restaurarBackup } from '@fhvptech/core/electron/backup/Restaurador'
import { baixarDaNuvem, listarNaNuvem } from '@fhvptech/core/electron/backup/EnvioNuvem'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { urlBackend } from '../backendUrl'

export function registrarHandlersBackup(): void {
  registrarCanal('backup:fazerManual', async () => {
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
        obterBackupAutomatico().reiniciar()
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


  /*
   * ── Backup em nuvem ──
   *
   * Só o caminho de VOLTA passa por aqui. O envio não tem canal de propósito:
   * ele roda sozinho, no fundo, e nada na tela espera por ele — um botão
   * "enviar agora" convidaria alguém a ficar olhando a barra de progresso de
   * uma coisa que existe justamente para não precisar de atenção.
   *
   * ⚠️ Os dois devolvem vazio/erro em vez de lançar: a tela de restauração é
   * onde alguém chega no pior dia, e ela não pode quebrar porque a internet
   * caiu.
   */
  registrarCanal('backup:listarNuvem', async () => {
    const itens = await listarNaNuvem({
      pastaBackups: obterBackupManager().pastaPadrao,
      urlBackend: urlBackend()
    })
    return { success: true, data: itens }
  })

  registrarCanal('backup:baixarDaNuvem', async (chaveObjeto: string) => {
    const r = await baixarDaNuvem(
      { pastaBackups: obterBackupManager().pastaPadrao, urlBackend: urlBackend() },
      String(chaveObjeto)
    )
    return r.ok ? { success: true, data: r.caminho } : { success: false, error: r.erro }
  })

  registrarCanal('backup:selecionarPasta', async () => {
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
