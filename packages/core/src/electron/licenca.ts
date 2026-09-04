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
import { pastaDados, versaoApp } from './plataforma'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import {
  identidadeDoDispositivo,
  identificadorLocal
} from '@fhvptech/core/electron/dispositivo'
import { modoMulticaixa } from '@fhvptech/core/electron/multicaixa/config'
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

/**
 * Endereço do backend.
 *
 * `FHVP_BACKEND_URL` existe para apontar um licenciador LOCAL durante o
 * desenvolvimento. Sem isso, a única forma de exercitar a vaga de
 * dispositivo seria contra PRODUÇÃO, o que é inaceitável para um caminho
 * que decide se a loja abre.
 *
 * Mesma ideia e mesmo nome de variável do `backendUrl.ts` de cada app, que já
 * fazia isto para as rotas fiscais. Em produção ela não existe e
 * tudo cai no Fly de sempre.
 */
function urlDoBackend(): string {
  const override = process.env.FHVP_BACKEND_URL
  return (override && override.trim()) || URL_BACKEND
}

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
  return join(pastaDados(), 'licenca.lic')
}

function caminhoHeartbeat(): string {
  return join(pastaDados(), 'licenca.heartbeat')
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
      const resposta = await fetch(urlDoBackend() + '/', {
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

  if (status.motivo !== 'relogio') {
    // Licença ausente ou vencida não pergunta por vaga: a tela de ativação já
    // vai perguntar, na hora de ativar.
    if (!status.valida && status.motivo !== 'dispositivo') return status
    await reconferirVaga()
    const depois = validarLicenca()
    return status.aviso && !depois.aviso ? { ...depois, aviso: status.aviso } : depois
  }

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

// ── Vaga de dispositivo ─────────────────────────────────────────────────────
//
// O plano do lojista pode dizer "até 2 computadores". Como a licença é validada
// offline, quem conta as máquinas é o servidor: cada instalação se apresenta e
// pede uma vaga. O porquê de cada regra está em `backend/src/dispositivos.ts`.
//
// ★ A REGRA QUE MANDA AQUI: só um "não" EXPLÍCITO do servidor fecha o sistema.
// Internet caída, servidor fora do ar, resposta estranha, nada disso bloqueia
// nada. É a mesma disciplina do guardião de relógio ("não deu para saber" nunca
// vira "não pode"), e pelo mesmo motivo: loja parada é o pior desfecho
// possível, pior até que um cliente usando uma máquina a mais.

const CAMINHO_VAGA = '/licenca/dispositivo'
const TIMEOUT_VAGA_MS = 3500

type PasseDispositivo = {
  /** De qual instalação é este passe. */
  deviceId: string
  /** A última resposta EXPLÍCITA do servidor. */
  resposta: 'sim' | 'nao'
  /** A partir de quando vale perguntar de novo (ms). */
  reconferirEm: number
  /** O que dizer ao lojista. Só existe quando a resposta foi não. */
  mensagem?: string
}

function caminhoPasse(): string {
  return join(pastaDados(), 'licenca.dispositivo')
}

function lerPasse(): PasseDispositivo | null {
  try {
    const caminho = caminhoPasse()
    if (!existsSync(caminho)) return null
    const bruto = JSON.parse(descriptografar(readFileSync(caminho, 'utf8').trim())) as PasseDispositivo
    if (bruto.resposta !== 'sim' && bruto.resposta !== 'nao') return null
    // ⚠️ Passe de OUTRA instalação não vale. Sem isto, copiar a pasta de dados
    // levaria junto um "sim" que não é desta máquina.
    if (bruto.deviceId !== identificadorLocal()) return null
    return bruto
  } catch {
    return null
  }
}

function escreverPasse(passe: PasseDispositivo): void {
  try {
    writeFileSync(caminhoPasse(), criptografar(JSON.stringify(passe)), 'utf8')
  } catch {
    // Sem passe gravado o sistema só pergunta de novo na próxima abertura.
  }
}

/** O modo do multicaixa vira a origem que o servidor registra. */
function origemDestaMaquina(): 'principal' | 'terminal' {
  try {
    return modoMulticaixa() === 'terminal' ? 'terminal' : 'principal'
  } catch {
    return 'principal'
  }
}

/**
 * Apresenta esta máquina ao servidor e pede a vaga.
 *
 * Devolve o passe quando houve resposta, e `null` quando não houve. `null` NÃO
 * é recusa: é silêncio, e silêncio não bloqueia ninguém.
 */
async function pedirVaga(chave: string): Promise<PasseDispositivo | null> {
  const identidade = await identidadeDoDispositivo()
  const controle = new AbortController()
  const alarme = setTimeout(() => controle.abort(), TIMEOUT_VAGA_MS)
  try {
    const resposta = await fetch(urlDoBackend() + CAMINHO_VAGA, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      signal: controle.signal,
      body: JSON.stringify({
        chave,
        deviceId: identidade.deviceId,
        digital: identidade.digital,
        nome: identidade.nome,
        origem: origemDestaMaquina(),
        versao: versaoApp()
      })
    })

    if (resposta.status === 403) {
      const corpo = (await resposta.json()) as { mensagem?: string }
      const passe: PasseDispositivo = {
        deviceId: identidade.deviceId,
        resposta: 'nao',
        // Recusa se reconfere na abertura seguinte: quem liberou uma vaga no
        // painel espera que a loja volte sozinha, sem desinstalar nada.
        reconferirEm: 0,
        mensagem: corpo.mensagem
      }
      escreverPasse(passe)
      return passe
    }

    if (!resposta.ok) return null

    const corpo = (await resposta.json()) as { reconferirEm?: string }
    const quando = Date.parse(String(corpo.reconferirEm ?? ''))
    const passe: PasseDispositivo = {
      deviceId: identidade.deviceId,
      resposta: 'sim',
      reconferirEm: Number.isFinite(quando) ? quando : Date.now() + 12 * 3_600_000
    }
    escreverPasse(passe)
    return passe
  } catch {
    // Sem rede, sem servidor, resposta ilegível. Nada disso é um "não".
    return null
  } finally {
    clearTimeout(alarme)
  }
}

/**
 * Reconfere a vaga desta máquina, se for hora.
 *
 * ── Por que nem sempre espera a resposta ────────────────────────────────────
 * Quem já tem um "sim" no bolso não pode ficar parado na abertura esperando um
 * servidor que talvez esteja fora: a conferência dele acontece em segundo
 * plano e vale para a PRÓXIMA abertura. Espera de verdade só nos dois casos em
 * que a resposta muda o que aparece na tela agora: a primeira vez (ainda não
 * há passe nenhum) e depois de uma recusa (para a loja voltar sozinha assim
 * que uma vaga for liberada).
 */
async function reconferirVaga(): Promise<void> {
  const chave = chaveLicencaLocal()
  if (!chave) return

  const passe = lerPasse()
  if (passe && passe.resposta === 'sim' && Date.now() < passe.reconferirEm) return

  if (passe && passe.resposta === 'sim') {
    void pedirVaga(chave)
    return
  }
  await pedirVaga(chave)
}

export type StatusLicenca = {
  valida: boolean
  diasRestantes?: number
  mensagem: string
  clienteId?: string
  aviso?: string
  /**
   * Por que não vale. Só 'relogio' tem tratamento próprio; os demais caem na
   * tela de ativação de sempre. Campo opcional: quem não olha continua
   * funcionando igual.
   *
   * 'dispositivo' é o servidor dizendo que esta máquina não tem vaga no plano
   * da loja. A `mensagem` já vem pronta de lá, com os nomes dos computadores
   * em uso, porque é o painel que sabe quais são.
   */
  motivo?: 'relogio' | 'dispositivo'
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

    // A vaga só é consultada depois de a licença passar. Uma loja com licença
    // vencida tem que ver "vencida", que é o problema dela; falar de máquina
    // ali mandaria o lojista resolver a coisa errada.
    if (status.valida) {
      const passe = lerPasse()
      if (passe?.resposta === 'nao') {
        return {
          valida: false,
          motivo: 'dispositivo',
          clienteId: status.clienteId,
          mensagem:
            passe.mensagem ??
            'Esta máquina não está entre as liberadas no plano desta loja. ' +
              'Fale com a FHVP Tech.'
        }
      }
    }

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

/**
 * Ativa a licença nesta máquina.
 *
 * ★ A vaga é pedida ANTES de gravar a chave. Gravar primeiro e recusar depois
 * deixaria a instalação com uma licença válida no disco e o sistema fechado,
 * que é o estado mais confuso possível para quem está instalando.
 *
 * A recusa por vaga é a ÚNICA que vem do servidor, e por isso a única que
 * depende de internet. Sem resposta, a ativação segue: instalar numa loja com
 * a internet caída tem que continuar funcionando, e a conferência acontece
 * sozinha na próxima abertura.
 */
export async function ativarLicenca(chave: string): Promise<StatusLicenca> {
  const status = validarChave(chave)
  if (!status.valida) return status
  const guard = verificarRelogio()
  if (!guard.ok) {
    return { valida: false, mensagem: guard.mensagem, motivo: 'relogio', ancoraRelogio: guard.ancora }
  }

  const passe = await pedirVaga(chave.trim())
  if (passe?.resposta === 'nao') {
    return {
      valida: false,
      motivo: 'dispositivo',
      clienteId: status.clienteId,
      mensagem:
        passe.mensagem ??
        'Esta máquina não está entre as liberadas no plano desta loja. ' +
          'Fale com a FHVP Tech.'
    }
  }

  writeFileSync(caminhoLicenca(), criptografar(chave.trim()), 'utf8')
  escreverHeartbeat({ ts: Date.now(), ignorarAte: lerHeartbeat()?.ignorarAte ?? 0 })
  return guard.aviso ? { ...status, aviso: guard.aviso } : status
}
