import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import { randomUUID } from 'crypto'
import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { obterConfigNucleo } from '@fhvptech/core/electron/nucleo'
import { criarZip, type MetadadoBackup } from '@fhvptech/core/electron/backup/Compactador'
import { lerConfig, gravarConfig } from './configBackup'
import { aplicarPoliticaCompleta } from '@fhvptech/core/electron/backup/PoliticaRetencao'
import { espelharBackup } from '@fhvptech/core/electron/backup/EspelhoSecundario'

export type TipoBackup =
  | 'automatico'
  | 'diario'
  | 'manual'
  | 'pre-update'
  | 'pre-restauracao'
  | 'por-venda'

const RETENCAO_POR_VENDA = 30

export type ResultadoBackup = {
  sucesso: boolean
  caminhoZip?: string
  tamanhoBytes?: number
  erro?: string
}

const PASTA_POR_TIPO: Record<TipoBackup, string> = {
  automatico: 'automaticos',
  diario: 'diarios',
  manual: 'manuais',
  'pre-update': 'pre-update',
  'pre-restauracao': 'pre-restauracao',
  'por-venda': 'por-venda',
}

const TODAS_AS_SUBPASTAS = [
  'automaticos',
  'diarios',
  'semanais',
  'mensais',
  'manuais',
  'pre-update',
  'pre-restauracao',
  'por-venda',
]

function formatarNomeArquivo(data: Date, tipo: TipoBackup): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const dataParte = `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`
  const horaParte = `${p(data.getHours())}-${p(data.getMinutes())}-${p(data.getSeconds())}`
  return `backup_${dataParte}_${horaParte}_${tipo}.zip`
}

class BackupManager {
  readonly pastaPadrao: string

  constructor() {
    this.pastaPadrao = join(app.getPath('userData'), 'Backups')
    this.inicializarPastas()
    this.inicializarConfig()
  }

  private inicializarPastas(): void {
    for (const sub of TODAS_AS_SUBPASTAS) {
      mkdirSync(join(this.pastaPadrao, sub), { recursive: true })
    }
  }

  private inicializarConfig(): void {
    if (!lerConfig('backup_pasta_padrao')) {
      gravarConfig('backup_pasta_padrao', this.pastaPadrao)
    }

    if (!lerConfig('cliente_id')) {
      try {
        const status = obterConfigNucleo().validarLicenca()
        gravarConfig('cliente_id', status.clienteId ?? randomUUID())
      } catch {
        gravarConfig('cliente_id', randomUUID())
      }
    }

    // Chaves de retenção — adicionadas via INSERT OR IGNORE para compatibilidade
    // com instâncias onde a migration já foi aplicada sem essas chaves
    const db = obterBancoDeDados()
    const ins = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)')
    db.transaction(() => {
      ins.run('backup_ultima_promocao_semanal', '')
      ins.run('backup_ultima_promocao_mensal', '')
      ins.run('backup_alerta_tamanho', '0')
      ins.run('backup_hash_senha_restauracao', '')
      ins.run('backup_por_venda', '0')
    })()

    // Seed das datas de promoção: se vazias (primeiro boot do módulo), inicializar
    // com "agora" para evitar promoção imediata do primeiro backup criado.
    // A promoção real ocorrerá apenas no próximo domingo / dia 1 do mês.
    const agora = new Date().toISOString()
    if (!lerConfig('backup_ultima_promocao_semanal')) {
      gravarConfig('backup_ultima_promocao_semanal', agora)
    }
    if (!lerConfig('backup_ultima_promocao_mensal')) {
      gravarConfig('backup_ultima_promocao_mensal', agora)
    }

    // Aplica promoções retroativas pendentes (ex: app não abriu no domingo)
    this.aplicarRetencao()
  }

  async executarBackup(tipo: TipoBackup): Promise<ResultadoBackup> {
    const db = obterBancoDeDados()
    const agora = new Date()
    const nomeArquivo = formatarNomeArquivo(agora, tipo)
    const pastaDestino = join(this.pastaPadrao, PASTA_POR_TIPO[tipo])
    const caminhoZip = join(pastaDestino, nomeArquivo)
    const caminhoTemp = join(app.getPath('temp'), `db_backup_temp_${Date.now()}.sqlite`)

    try {
      await db.backup(caminhoTemp)

      const tamanhoDb = statSync(caminhoTemp).size
      const metadata: MetadadoBackup = {
        versao_app: app.getVersion(),
        data: agora.toISOString(),
        tipo,
        tamanho_db_bytes: tamanhoDb,
      }

      const resultado = await criarZip(caminhoTemp, caminhoZip, metadata)

      this.registrarLog({
        tipo,
        caminho_arquivo: caminhoZip,
        tamanho_bytes: resultado.tamanhoBytes,
        sucesso: resultado.sucesso,
        mensagem_erro: resultado.erro,
      })

      if (resultado.sucesso) {
        gravarConfig('backup_timestamp_ultimo_backup', agora.toISOString())
        gravarConfig('backup_falhas_consecutivas', '0')
        if (tipo === 'por-venda') {
          this.aplicarRetencaoPorVenda()
        } else {
          this.aplicarRetencao()
        }
        this.espelharParaSecundario(caminhoZip, PASTA_POR_TIPO[tipo])
        return { sucesso: true, caminhoZip, tamanhoBytes: resultado.tamanhoBytes }
      }

      this.incrementarFalhas()
      return { sucesso: false, erro: resultado.erro }
    } catch (err) {
      const mensagem = (err as Error).message
      this.registrarLog({ tipo, caminho_arquivo: caminhoZip, sucesso: false, mensagem_erro: mensagem })
      this.incrementarFalhas()
      return { sucesso: false, erro: mensagem }
    } finally {
      if (existsSync(caminhoTemp)) rmSync(caminhoTemp, { force: true })
    }
  }

  private aplicarRetencao(): void {
    const ultimaSemanal = lerConfig('backup_ultima_promocao_semanal')
    const ultimaMensal = lerConfig('backup_ultima_promocao_mensal')

    const resultado = aplicarPoliticaCompleta(this.pastaPadrao, {
      ultimaPromocaoSemanal: ultimaSemanal ? new Date(ultimaSemanal) : null,
      ultimaPromocaoMensal: ultimaMensal ? new Date(ultimaMensal) : null,
    })

    if (resultado.novaDataPromocaoSemanal) {
      gravarConfig('backup_ultima_promocao_semanal', resultado.novaDataPromocaoSemanal.toISOString())
    }
    if (resultado.novaDataPromocaoMensal) {
      gravarConfig('backup_ultima_promocao_mensal', resultado.novaDataPromocaoMensal.toISOString())
    }
    gravarConfig('backup_alerta_tamanho', resultado.alertaTamanho ? '1' : '0')

    if (resultado.arquivosDeletados > 0 || resultado.arquivosPromovidos > 0) {
      console.log(
        `[backup] Retenção: ${resultado.arquivosDeletados} deletados, ` +
        `${resultado.arquivosPromovidos} promovidos, ` +
        `${resultado.tamanhoTotalMB} MB total`
      )
    }
  }

  // Mantém apenas os RETENCAO_POR_VENDA arquivos mais recentes na pasta 'por-venda',
  // já que essa pasta cresce muito rápido (1 ZIP por venda) e fica fora da política
  // de promoção semanal/mensal usada pelos outros tipos.
  private aplicarRetencaoPorVenda(): void {
    const pasta = join(this.pastaPadrao, PASTA_POR_TIPO['por-venda'])
    if (!existsSync(pasta)) return
    try {
      const arquivos = readdirSync(pasta)
        .filter((nome) => nome.endsWith('.zip'))
        .map((nome) => {
          const caminho = join(pasta, nome)
          return { caminho, mtime: statSync(caminho).mtimeMs }
        })
        .sort((a, b) => b.mtime - a.mtime) // mais recentes primeiro

      for (const arquivo of arquivos.slice(RETENCAO_POR_VENDA)) {
        rmSync(arquivo.caminho, { force: true })
      }
    } catch (err) {
      console.warn('[backup] Falha ao aplicar retenção por-venda:', (err as Error).message)
    }
  }

  private espelharParaSecundario(caminhoZip: string, subpasta: string): void {
    const pastaSecundaria = lerConfig('backup_pasta_secundaria')
    if (!pastaSecundaria) return
    const resultado = espelharBackup(caminhoZip, pastaSecundaria, subpasta)
    if (!resultado.sucesso) {
      console.warn(`[backup] Espelho secundário falhou: ${resultado.erro}`)
    }
  }

  // Chamado pelos handlers IPC após operações que alteram dados
  marcarAlteracao(): void {
    gravarConfig('backup_timestamp_ultima_alteracao', new Date().toISOString())
  }

  private registrarLog(dados: {
    tipo: TipoBackup
    caminho_arquivo: string
    tamanho_bytes?: number
    sucesso: boolean
    mensagem_erro?: string
  }): void {
    try {
      obterBancoDeDados()
        .prepare(
          `INSERT INTO backup_log (tipo, caminho_arquivo, tamanho_bytes, sucesso, mensagem_erro)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          dados.tipo,
          dados.caminho_arquivo,
          dados.tamanho_bytes ?? null,
          dados.sucesso ? 1 : 0,
          dados.mensagem_erro ?? null
        )
    } catch {
      // Falha no log nunca deve travar o app
    }
  }

  private incrementarFalhas(): void {
    const atual = parseInt(lerConfig('backup_falhas_consecutivas') || '0', 10)
    gravarConfig('backup_falhas_consecutivas', String(atual + 1))
  }
}

// Singleton
let instancia: BackupManager | null = null

export function inicializarBackupManager(): void {
  instancia = new BackupManager()
}

export function obterBackupManager(): BackupManager {
  if (!instancia) throw new Error('BackupManager não inicializado. Chame inicializarBackupManager() primeiro.')
  return instancia
}
