/**
 * Backup da loja hospedada — feito no servidor e guardado FORA dele.
 *
 * ── O problema que este arquivo existe para resolver ─────────────────────────
 * O banco vive num volume do Fly, que é uma fatia de disco de UMA máquina
 * física. A documentação deles diz sem rodeios: se aquele disco falhar, a
 * aplicação cai, e os retratos diários que eles tiram não devem ser o backup
 * principal de ninguém.
 *
 * O `BackupManager` grava o zip em `Backups/`, dentro da MESMA pasta de dados —
 * ou seja, no mesmo volume. Na loja instalada isso é aceitável: o lojista tem a
 * pasta dele, o pendrive, o computador na frente. Aqui não há ninguém do outro
 * lado, e banco e backup se perderiam juntos.
 *
 * Então o zip é feito igual, e em seguida sai da máquina.
 *
 * ── Por que uma fila com repetição, e não "sobe e esquece" ───────────────────
 * A internet do servidor pode falhar no instante do envio. Se o envio fosse
 * tentado uma vez e descartado, aquele dia ficaria sem backup para sempre — e
 * em silêncio, que é o pior jeito de faltar backup.
 *
 * Guarda-se então o que JÁ subiu, num arquivo ao lado dos backups. Cada ciclo
 * olha os zips no disco, e manda os que ainda não constam. Um envio que falhou
 * hoje é tentado de novo no próximo ciclo, sem código de repetição nenhum: ele
 * simplesmente continua na lista dos que faltam.
 *
 * ── Onde cada arquivo fica no R2 ─────────────────────────────────────────────
 *   lojas/<clienteId>/<tipo>/<nome do zip>
 *
 * O `clienteId` vem da licença, que é o único identificador que a loja carrega
 * e que a FHVP também conhece. Sem ele não há como saber de quem é o backup na
 * hora de restaurar, então a ausência interrompe o envio em vez de inventar uma
 * pasta qualquer.
 *
 * ⚠️ O bucket é OUTRO, e privado. O `updates-fhvptech`, que já existe, é
 * público — é dele que sai o instalador. Backup de cliente ali seria dado de
 * terceiro aberto na internet para quem adivinhasse o nome do arquivo.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { obterBackupManager, type TipoBackup } from '@fhvptech/core/electron/backup/BackupManager'
import { extrairClienteIdLocal } from '@fhvptech/core/electron/licenca'
import { pastaDados } from '@fhvptech/core/electron/plataforma'

import { credenciaisDoAmbiente, enviarParaR2, type CredenciaisR2 } from './r2'

/** De quanto em quanto tempo o servidor faz um backup novo. */
const INTERVALO_BACKUP_MS = 6 * 60 * 60 * 1000
/** De quanto em quanto tempo a fila de envio é varrida. Mais curto de propósito:
 *  é o que faz um envio que falhou por rede voltar a ser tentado logo. */
const INTERVALO_ENVIO_MS = 15 * 60 * 1000
/** De quanto em quanto tempo se reconfere se a loja já foi ativada. */
const ESPERA_LICENCA_MS = 5 * 60 * 1000
/** Quantos zips no máximo o servidor guarda como "já enviados". */
const MAXIMO_LEMBRADOS = 500

/** Subpastas que valem a pena mandar para fora. */
const TIPOS_QUE_SOBEM: TipoBackup[] = ['diario', 'manual', 'pre-update']
const PASTA_DE: Record<string, string> = {
  diario: 'diarios',
  manual: 'manuais',
  // O mais importante dos três, e o mais fácil de esquecer: é a cópia tirada no
  // instante anterior a uma migration alterar o esquema. Se aquela migration
  // estragar algo, este é o único caminho de volta — `fly releases` devolve o
  // código, nunca o banco. Deixá-lo apenas no disco da máquina seria guardar o
  // extintor dentro do prédio em chamas.
  'pre-update': 'pre-update'
}

function arquivoDeControle(): string {
  return join(pastaDados(), 'Backups', 'enviados-nuvem.json')
}

function lerEnviados(): Set<string> {
  try {
    const bruto = JSON.parse(readFileSync(arquivoDeControle(), 'utf8')) as unknown
    return new Set(Array.isArray(bruto) ? (bruto as string[]) : [])
  } catch {
    // Arquivo ausente ou corrompido: começa do zero. O efeito é reenviar zips
    // que já estavam lá, o que custa alguns segundos e não perde nada.
    return new Set()
  }
}

function gravarEnviados(nomes: Set<string>): void {
  try {
    const lista = [...nomes].slice(-MAXIMO_LEMBRADOS)
    mkdirSync(join(pastaDados(), 'Backups'), { recursive: true })
    writeFileSync(arquivoDeControle(), JSON.stringify(lista), 'utf8')
  } catch (erro) {
    console.warn(`[backup-nuvem] não consegui anotar o que subiu: ${(erro as Error).message}`)
  }
}

/** Zips no disco que ainda não constam como enviados. */
function pendentes(enviados: Set<string>): Array<{ caminho: string; tipo: string }> {
  const fila: Array<{ caminho: string; tipo: string }> = []
  for (const tipo of TIPOS_QUE_SOBEM) {
    const pasta = join(pastaDados(), 'Backups', PASTA_DE[tipo])
    if (!existsSync(pasta)) continue
    for (const nome of readdirSync(pasta)) {
      if (!nome.endsWith('.zip')) continue
      const chave = `${tipo}/${nome}`
      if (enviados.has(chave)) continue
      fila.push({ caminho: join(pasta, nome), tipo })
    }
  }
  // Mais antigos primeiro: se a conexão cair no meio, o que ficou para trás
  // sobe antes do que acabou de ser feito.
  return fila.sort((a, b) => statSync(a.caminho).mtimeMs - statSync(b.caminho).mtimeMs)
}

let enviando = false

/**
 * Manda para o R2 tudo que ainda não subiu. Nunca lança: uma falha de rede não
 * pode derrubar o servidor da loja.
 */
export async function sincronizarComNuvem(cred: CredenciaisR2, clienteId: string): Promise<void> {
  // Um ciclo por vez. Sem isto, um envio demorado se sobreporia ao próximo e o
  // mesmo arquivo subiria duas vezes.
  if (enviando) return
  enviando = true
  try {
    const enviados = lerEnviados()
    const fila = pendentes(enviados)
    if (fila.length === 0) return

    console.log(`[backup-nuvem] ${fila.length} arquivo(s) para enviar`)
    for (const { caminho, tipo } of fila) {
      const nome = basename(caminho)
      try {
        await enviarParaR2(cred, `lojas/${clienteId}/${tipo}/${nome}`, readFileSync(caminho), 'application/zip')
        enviados.add(`${tipo}/${nome}`)
        console.log(`[backup-nuvem] enviado: ${tipo}/${nome}`)
      } catch (erro) {
        // Fica de fora da lista, então volta na próxima varredura.
        console.warn(`[backup-nuvem] falhou ${nome}: ${(erro as Error).message}`)
      }
    }
    gravarEnviados(enviados)
  } finally {
    enviando = false
  }
}

/** Faz um backup e, logo depois, tenta mandá-lo para fora. */
async function backupEEnvio(cred: CredenciaisR2, clienteId: string): Promise<void> {
  try {
    const r = await obterBackupManager().executarBackup('diario')
    if (!r.sucesso) {
      console.warn(`[backup-nuvem] backup local falhou: ${r.erro}`)
      return
    }
  } catch (erro) {
    console.warn(`[backup-nuvem] backup local falhou: ${(erro as Error).message}`)
    return
  }
  await sincronizarComNuvem(cred, clienteId)
}

/**
 * Como pedir um envio fora de hora. `null` enquanto o backup na nuvem não
 * estiver ligado.
 *
 * Serve ao botão "fazer backup" da tela: quem aperta aquilo costuma estar
 * prestes a fazer algo arriscado, e esperar o próximo ciclo seria uma promessa
 * com atraso de até quinze minutos.
 */
let dispararEnvio: (() => void) | null = null

export function envioImediato(): void {
  dispararEnvio?.()
}

/**
 * Liga o backup periódico do servidor. Devolve o que impediu, ou `null` se
 * ligou — o servidor decide o quanto reclamar.
 */
function ligarDeVerdade(cred: CredenciaisR2, clienteId: string): void {
  // `unref` para os temporizadores não segurarem o processo vivo no desligamento.
  setInterval(() => void backupEEnvio(cred, clienteId), INTERVALO_BACKUP_MS).unref()
  setInterval(() => void sincronizarComNuvem(cred, clienteId), INTERVALO_ENVIO_MS).unref()

  // Uma varredura logo no boot: se a máquina reiniciou com envio pendente, ele
  // sai agora em vez de esperar o primeiro ciclo.
  setTimeout(() => void sincronizarComNuvem(cred, clienteId), 30_000).unref()

  dispararEnvio = () => void sincronizarComNuvem(cred, clienteId)

  console.log(`[backup-nuvem] ligado — loja ${clienteId}, backup a cada ${INTERVALO_BACKUP_MS / 3600000}h`)
}

export function ligarBackupNaNuvem(): string | null {
  const cred = credenciaisDoAmbiente()
  if (!cred) {
    // Configuração ausente não se conserta esperando: é preciso alguém mandar
    // os segredos. Falha e pronto.
    return 'faltam as variáveis R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_BACKUPS'
  }

  const clienteId = extrairClienteIdLocal()
  if (clienteId) {
    ligarDeVerdade(cred, clienteId)
    return null
  }

  // ── Licença ausente é ESPERA, não falha ────────────────────────────────────
  // Uma loja recém-hospedada nasce sem licença: ela abre pedindo ativação, e
  // quem digita a chave é o lojista, pela tela, muito depois deste boot.
  //
  // Tratar isso como falha definitiva seria o pior tipo de bug: a loja
  // funcionaria, venderia, encheria de dados — e nunca faria backup, porque o
  // ligamento aconteceu uma única vez, num instante em que ainda não havia
  // licença. Ninguém reinicia um servidor que está funcionando, então ninguém
  // descobriria antes de precisar do backup.
  const relogio = setInterval(() => {
    const id = extrairClienteIdLocal()
    if (!id) return
    clearInterval(relogio)
    ligarDeVerdade(cred, id)
  }, ESPERA_LICENCA_MS)
  relogio.unref()

  return 'a loja ainda não foi ativada — o backup liga sozinho assim que a licença entrar'
}
