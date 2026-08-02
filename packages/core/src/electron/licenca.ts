/**
 * Módulo de licença — validação 100% offline via HMAC-SHA256 + arquivo AES.
 *
 * Formato da chave entregue ao lojista:  CLIENTE:AAAA-MM-DD:HMAC16
 *   Exemplo: LOJA001:2026-06-30:A3F2B891C4D5E6F7
 *
 * O arquivo licenca.lic armazena a chave criptografada com AES-256-CBC
 * para dificultar inspeção manual.
 *
 * ATENÇÃO: CHAVE_HMAC, CHAVE_AES e SALT_AES são injetadas em build-time pelo
 * electron-vite (define), lidas do .env (não versionado) — NÃO ficam no
 * código-fonte porque o repo é público. A CHAVE_HMAC precisa ser idêntica ao
 * secret `CHAVE_HMAC` do backend (Fly), que gera as chaves de licença. Veja
 * .env.example para o conjunto de variáveis necessárias.
 */
import { createHmac, createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import {
  avaliarRelogio,
  calcularAncora,
  decidirTratamento,
  interpretarHeartbeat,
  lerHoraDoCabecalho,
  type Heartbeat,
  type Tratamento
} from '@fhvptech/core/electron/relogioLogica'

// Substituídas por literais em build-time via `define` no electron.vite.config.ts.
declare const __CHAVE_HMAC__: string
declare const __CHAVE_AES__: string
declare const __SALT_AES__: string

const CHAVE_HMAC = __CHAVE_HMAC__
const CHAVE_AES = __CHAVE_AES__
const SALT_AES = __SALT_AES__

// Mesmo backend da renovação/chat (ipc/licenca-pagamento.ts). Aqui ele serve
// só como relógio de fora: o cabeçalho `Date` da resposta HTTPS. Falsificar
// exigiria um certificado válido para este domínio; bloquear a rede, não —
// e é por isso que o caminho offline existe (ver decidirTratamento).
const URL_BACKEND = 'https://licenca-gnmodas.fly.dev'
const TIMEOUT_HORA_SERVIDOR_MS = 6000

function derivarChaveAES(): Buffer {
  return scryptSync(CHAVE_AES, SALT_AES, 32)
}

function criptografar(texto: string): string {
  const chave = derivarChaveAES()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', chave, iv)
  const enc = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + enc.toString('hex')
}

function descriptografar(cifrado: string): string {
  const idx = cifrado.indexOf(':')
  if (idx === -1) throw new Error('Formato de arquivo inválido')
  const ivHex = cifrado.slice(0, idx)
  const encHex = cifrado.slice(idx + 1)
  const chave = derivarChaveAES()
  const decipher = createDecipheriv('aes-256-cbc', chave, Buffer.from(ivHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final()
  ]).toString('utf8')
}

export function calcularHMAC(clienteId: string, expiracao: string): string {
  return createHmac('sha256', CHAVE_HMAC)
    .update(`${clienteId}:${expiracao}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase()
}

export function caminhoLicenca(): string {
  return join(app.getPath('userData'), 'licenca.lic')
}

function caminhoHeartbeat(): string {
  return join(app.getPath('userData'), 'licenca.heartbeat')
}

// Lê o heartbeat. Retorna null em qualquer falha (arquivo ausente, corrompido,
// descriptografia falhando) — o chamador trata como "sem histórico" e usa
// apenas o anchor do SQLite. O formato antigo (só `ts`) continua sendo lido:
// ver interpretarHeartbeat em relogioLogica.ts.
function lerHeartbeat(): Heartbeat | null {
  try {
    const caminho = caminhoHeartbeat()
    if (!existsSync(caminho)) return null
    return interpretarHeartbeat(JSON.parse(descriptografar(readFileSync(caminho, 'utf8').trim())))
  } catch {
    return null
  }
}

function escreverHeartbeat(dados: Heartbeat): void {
  try {
    writeFileSync(caminhoHeartbeat(), criptografar(JSON.stringify(dados)), 'utf8')
  } catch {
    // Falha silenciosa — sem heartbeat o sistema só fica menos seguro, não trava.
  }
}

// Maior data registrada em vendas (em ms, UTC). Anchor "duro" porque mexer aqui
// implica adulterar o SQLite — bem mais difícil do que apagar o heartbeat.
function obterMaxDataVendaMs(): number | null {
  try {
    const db = obterBancoDeDados()
    const row = db.prepare('SELECT MAX(data) AS max_data FROM vendas').get() as {
      max_data: string | null
    }
    if (!row.max_data) return null
    const ms = new Date(row.max_data.replace(' ', 'T') + 'Z').getTime()
    return isNaN(ms) ? null : ms
  } catch {
    return null
  }
}

type ResultadoGuard =
  | { ok: true; aviso?: string }
  | { ok: false; mensagem: string; ancora: number }

// Detecta se o relógio do SO foi adulterado pra trás. Combina dois anchors:
// heartbeat criptografado + MAX(vendas.data). Em qualquer falha (sem DB,
// sem heartbeat, sem vendas), degrada com segurança — não bloqueia.
//
// Resultado:
//  - ok: false  → relógio voltou além da tolerância → bloqueia
//  - ok: true, aviso definido → voltou dentro da tolerância → permite mas avisa
//  - ok: true sem aviso → tudo certo
//
// Bloquear aqui NÃO é a palavra final: quem chama pela IPC passa por
// `validarLicencaComRelogio()`, que ainda confere a hora com o servidor antes
// de mandar o lojista para uma tela de erro.
function verificarRelogio(): ResultadoGuard {
  try {
    const agora = Date.now()
    const hb = lerHeartbeat()
    const ignorarAte = hb?.ignorarAte ?? 0
    const ancora = calcularAncora({
      heartbeatMs: hb?.ts ?? null,
      maxVendaMs: obterMaxDataVendaMs(),
      ignorarAte
    })

    switch (avaliarRelogio(agora, ancora)) {
      case 'sem-ancora':
        // Sem referência (primeira execução pós-feature ou banco vazio).
        escreverHeartbeat({ ts: agora, ignorarAte, destravadoEm: hb?.destravadoEm })
        return { ok: true }

      case 'bloqueia':
        return {
          ok: false,
          ancora,
          mensagem:
            'Relógio do sistema parece incorreto. Ajuste a data/hora do Windows e tente novamente. ' +
            'Se o problema persistir, contate o suporte.'
        }

      case 'voltou-pouco':
        // Heartbeat só avança — nunca regride, mesmo dentro da tolerância.
        escreverHeartbeat({ ts: ancora, ignorarAte, destravadoEm: hb?.destravadoEm })
        return {
          ok: true,
          aviso:
            'Atenção: detectamos que o relógio do sistema foi alterado para trás. ' +
            'Verifique se a data/hora do Windows está correta — alterações maiores podem bloquear o sistema.'
        }

      default:
        escreverHeartbeat({ ts: agora, ignorarAte, destravadoEm: hb?.destravadoEm })
        return { ok: true }
    }
  } catch {
    return { ok: true }
  }
}

/**
 * Marca como desmentidas todas as datas até `ancora` e recomeça o heartbeat de
 * agora. É o conserto — o mesmo efeito de renomear o licenca.heartbeat na mão,
 * mas alcançando também a venda com data no futuro, que o rename não resolve.
 */
function neutralizarAncora(ancora: number, manual: boolean): void {
  const hb = lerHeartbeat()
  escreverHeartbeat({
    ts: Date.now(),
    ignorarAte: Math.max(ancora, hb?.ignorarAte ?? 0),
    destravadoEm: manual ? Date.now() : hb?.destravadoEm
  })
}

/**
 * Pergunta a hora ao servidor pelo cabeçalho `Date` da resposta. Não existe
 * endpoint dedicado nem precisa: todo HTTP traz esse cabeçalho, então o custo
 * no backend é zero. Devolve null quando não deu para saber (sem internet,
 * servidor fora, resposta sem cabeçalho) — e "não deu para saber" nunca é
 * tratado como "o relógio está certo".
 */
export async function obterHoraDoServidor(): Promise<number | null> {
  try {
    const controle = new AbortController()
    const alarme = setTimeout(() => controle.abort(), TIMEOUT_HORA_SERVIDOR_MS)
    try {
      const resposta = await fetch(URL_BACKEND + '/', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controle.signal
      })
      return lerHoraDoCabecalho(resposta.headers.get('date'))
    } finally {
      clearTimeout(alarme)
    }
  } catch {
    return null
  }
}

export type StatusRelogio = {
  tratamento: Tratamento
  /** Data que o servidor diz ser a correta (ISO), quando houve conferência. */
  horaServidorISO?: string
  /** O que a máquina acha que é agora (ISO). */
  horaLocalISO: string
}

/**
 * Versão da validação que trata o bloqueio de relógio em vez de só reportá-lo.
 *
 * É a que a IPC usa. `validarLicenca()` continua síncrona e inalterada para
 * quem só quer o clienteId (BackupManager, notificações).
 */
export async function validarLicencaComRelogio(): Promise<StatusLicenca> {
  const status = validarLicenca()
  if (status.motivo !== 'relogio') return status

  const agora = Date.now()
  const horaServidor = await obterHoraDoServidor()
  const tratamento = decidirTratamento(agora, horaServidor)

  if (tratamento === 'consertar') {
    // Relógio conferido e honesto ⇒ a âncora é que está furada. Conserta e
    // revalida: o lojista não vê tela de erro nenhuma.
    neutralizarAncora(status.ancoraRelogio ?? agora, false)
    return validarLicenca()
  }

  return {
    ...status,
    relogio: {
      tratamento,
      horaLocalISO: new Date(agora).toISOString(),
      horaServidorISO: horaServidor !== null ? new Date(horaServidor).toISOString() : undefined
    }
  }
}

/**
 * Destravamento manual, oferecido só quando não deu para conferir a hora com o
 * servidor. Substitui a visita do suporte ao %APPDATA% do cliente.
 */
export function destravarRelogio(): { destravado: boolean } {
  const guard = verificarRelogio()
  if (guard.ok) return { destravado: true }
  neutralizarAncora(guard.ancora, true)
  return { destravado: verificarRelogio().ok }
}

export type StatusLicenca = {
  valida: boolean
  diasRestantes?: number
  mensagem: string
  clienteId?: string
  aviso?: string
  /**
   * Por que não vale. Só 'relogio' tem tratamento próprio — os demais caem na
   * tela de ativação de sempre. Campo novo e opcional: quem não olha continua
   * funcionando igual.
   */
  motivo?: 'relogio'
  /** Âncora que causou o bloqueio, em ms. Interno, para o conserto. */
  ancoraRelogio?: number
  /** Preenchido por validarLicencaComRelogio() quando a trava de relógio pega. */
  relogio?: StatusRelogio
}

export function validarChave(chave: string): StatusLicenca {
  const partes = chave.trim().split(':')
  if (partes.length !== 3) {
    return { valida: false, mensagem: 'Formato inválido. Use: CLIENTE:AAAA-MM-DD:CODIGO' }
  }

  const [clienteId, expiracao, hmacFornecido] = partes

  if (hmacFornecido.toUpperCase() !== calcularHMAC(clienteId, expiracao)) {
    return { valida: false, mensagem: 'Chave de licença inválida ou adulterada.' }
  }

  const dataExp = new Date(expiracao + 'T23:59:59')
  if (isNaN(dataExp.getTime())) {
    return { valida: false, mensagem: 'Data de expiração inválida na chave.' }
  }

  if (dataExp < new Date()) {
    return {
      valida: false,
      mensagem: 'Licença expirada. Contate o suporte para renovação.',
      clienteId
    }
  }

  const diasRestantes = Math.ceil((dataExp.getTime() - Date.now()) / 86_400_000)
  return {
    valida: true,
    diasRestantes,
    mensagem: `Licença válida por mais ${diasRestantes} dia(s).`,
    clienteId
  }
}

export function validarLicenca(): StatusLicenca {
  const caminho = caminhoLicenca()

  if (!existsSync(caminho)) {
    return { valida: false, mensagem: 'Nenhuma licença encontrada. Insira sua chave de ativação.' }
  }

  const guard = verificarRelogio()
  if (!guard.ok) {
    return { valida: false, mensagem: guard.mensagem, motivo: 'relogio', ancoraRelogio: guard.ancora }
  }

  try {
    const conteudo = readFileSync(caminho, 'utf8').trim()
    const chaveDecriptada = descriptografar(conteudo)
    const status = validarChave(chaveDecriptada)
    return guard.aviso ? { ...status, aviso: guard.aviso } : status
  } catch {
    return { valida: false, mensagem: 'Arquivo de licença corrompido. Reinsira a chave.' }
  }
}

// Extrai o clienteId da licença salva localmente — sem validar expiração
// ou HMAC. Usado pelo fluxo de renovação via PIX, onde a licença pode
// estar vencida mas o vínculo com o cliente continua válido.
export function extrairClienteIdLocal(): string | null {
  const caminho = caminhoLicenca()
  if (!existsSync(caminho)) return null
  try {
    const conteudo = readFileSync(caminho, 'utf8').trim()
    const chave = descriptografar(conteudo)
    const partes = chave.split(':')
    return partes.length === 3 ? partes[0] : null
  } catch {
    return null
  }
}

/**
 * Chave de licença salva, como está no disco.
 *
 * O relay do multicaixa a usa para provar ao servidor que é mesmo esta loja —
 * só o clienteId não bastaria, porque ele circula em pedidos comuns e quem o
 * conhecesse poderia se pendurar no lugar da loja e receber as chamadas dela.
 */
export function chaveLicencaLocal(): string | null {
  const caminho = caminhoLicenca()
  if (!existsSync(caminho)) return null
  try {
    const chave = descriptografar(readFileSync(caminho, 'utf8').trim())
    return chave.split(':').length === 3 ? chave : null
  } catch {
    return null
  }
}

export function ativarLicenca(chave: string): StatusLicenca {
  const status = validarChave(chave)
  if (!status.valida) return status
  const guard = verificarRelogio()
  if (!guard.ok) {
    return { valida: false, mensagem: guard.mensagem, motivo: 'relogio', ancoraRelogio: guard.ancora }
  }
  writeFileSync(caminhoLicenca(), criptografar(chave.trim()), 'utf8')
  escreverHeartbeat({ ts: Date.now(), ignorarAte: lerHeartbeat()?.ignorarAte ?? 0 })
  return guard.aviso ? { ...status, aviso: guard.aviso } : status
}
