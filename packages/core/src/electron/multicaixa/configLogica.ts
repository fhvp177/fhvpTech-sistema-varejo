/**
 * Configuração do multi-caixa — leitura, validação e gravação.
 *
 * ── Por que um arquivo, e não a tabela `config` ──────────────────────────────
 * Toda configuração do sistema mora no banco. Esta não pode: no modo terminal
 * o app NÃO abre banco nenhum — é justamente essa ausência que garante que não
 * existe um segundo estado para divergir do PC. Então o modo de operação
 * precisa ser lido antes e fora do banco, de um JSON no userData, do mesmo
 * jeito que a licença e o heartbeat já fazem.
 *
 * ── Regra de ouro: isto nunca pode derrubar o boot ───────────────────────────
 * Este arquivo é lido antes de qualquer outra coisa subir. Se ele estiver
 * corrompido — pane de energia no meio de uma gravação, edição manual
 * atrapalhada — o app tem que abrir assim mesmo, em modo normal. Um caixa que
 * não abre é muito pior que um caixa sem multi-caixa. Por isso toda leitura
 * degrada para o padrão, e o arquivo inválido é preservado ao lado, para
 * suporte, em vez de ser sobrescrito calado.
 *
 * ── Sobre os tokens ──────────────────────────────────────────────────────────
 * Os dois lados guardam coisas diferentes, de propósito:
 * - No PC (modo servidor) fica só o HASH do token de cada terminal. Quem vazar
 *   o arquivo não consegue se passar por um terminal pareado.
 * - No terminal fica o token CRU, porque ele precisa apresentá-lo a cada
 *   chamada. É a credencial dele; não há como guardar de outro jeito.
 */
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'

export type ModoMulticaixa = 'normal' | 'servidor' | 'terminal'

/** Porta padrão do servidor embutido. Fixa para não virar suporte por telefone. */
export const PORTA_PADRAO = 4877

export interface TerminalPareado {
  /** Identidade do terminal. É a `origem` que o roteador carrega em cada chamada. */
  id: string
  /** Nome que o lojista lê na tela ("Notebook do balcão"). */
  nome: string
  /** SHA-256 do token. O token cru nunca é gravado aqui. */
  tokenHash: string
  /**
   * Chave do sigilo ponta a ponta, combinada no pareamento.
   *
   * Esta vai INTEIRA nos dois lados, diferente do token — é chave simétrica,
   * não credencial: os dois precisam dela para cifrar e decifrar. É o que
   * impede o servidor do meio de ler o que passa quando o caixa está fora.
   */
  chaveSigilo: string
  criadoEm: string
  ultimoAcessoEm: string | null
}

export interface ConfigMulticaixa {
  modo: ModoMulticaixa
  porta: number
  /** Terminais pareados. Só faz sentido no modo servidor. */
  terminais: TerminalPareado[]
  /**
   * Para onde este caixa fala. Só faz sentido no modo terminal.
   *
   * `url` é o endereço na rede da loja. `relay` é o caminho alternativo, para
   * quando o caixa está longe: mesmo protocolo, servidor de encontro no meio.
   * O caixa tenta a rede local primeiro e cai no relay se ela não responder.
   */
  servidor: {
    url: string
    token: string
    chaveSigilo?: string
    /** Identidade deste caixa, atribuída pelo principal no pareamento. */
    terminalId?: string
    relay?: { url: string; loja: string }
  } | null
}

export const CONFIG_PADRAO: ConfigMulticaixa = {
  modo: 'normal',
  porta: PORTA_PADRAO,
  terminais: [],
  servidor: null
}

const MODOS: readonly ModoMulticaixa[] = ['normal', 'servidor', 'terminal']

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

function normalizarTerminal(bruto: unknown): TerminalPareado | null {
  if (!bruto || typeof bruto !== 'object') return null
  const t = bruto as Record<string, unknown>
  const id = texto(t.id).trim()
  const tokenHash = texto(t.tokenHash).trim()
  // Sem id ou sem hash o registro é inútil: não dá para identificar quem é nem
  // para conferir credencial. Descartar é mais seguro que manter meia entrada.
  if (!id || !tokenHash) return null
  return {
    id,
    nome: texto(t.nome).trim() || id,
    tokenHash,
    chaveSigilo: texto(t.chaveSigilo).trim(),
    criadoEm: texto(t.criadoEm) || new Date().toISOString(),
    ultimoAcessoEm: typeof t.ultimoAcessoEm === 'string' ? t.ultimoAcessoEm : null
  }
}

function normalizarServidor(bruto: unknown): ConfigMulticaixa['servidor'] {
  if (!bruto || typeof bruto !== 'object') return null
  const s = bruto as Record<string, unknown>
  const url = texto(s.url).trim()
  const token = texto(s.token).trim()
  if (!url || !token) return null
  const chaveSigilo = texto(s.chaveSigilo).trim()
  const r = (s.relay ?? null) as { url?: unknown; loja?: unknown } | null
  const relayUrl = texto(r?.url).trim()
  const relayLoja = texto(r?.loja).trim()
  const terminalId = texto(s.terminalId).trim()
  return {
    url,
    token,
    ...(chaveSigilo ? { chaveSigilo } : {}),
    ...(terminalId ? { terminalId } : {}),
    // Sem chave de sigilo não há relay: sair da loja sem cifrar deixaria o
    // movimento legível no servidor do meio, que é o oposto do combinado.
    ...(relayUrl && relayLoja && chaveSigilo ? { relay: { url: relayUrl, loja: relayLoja } } : {})
  }
}

/**
 * Transforma qualquer coisa vinda do disco numa config válida. Campo estranho é
 * descartado, campo faltando vira padrão — nunca lança.
 */
export function normalizarConfig(bruto: unknown): ConfigMulticaixa {
  if (!bruto || typeof bruto !== 'object') return { ...CONFIG_PADRAO }
  const c = bruto as Record<string, unknown>

  const modo = MODOS.includes(c.modo as ModoMulticaixa) ? (c.modo as ModoMulticaixa) : 'normal'

  // Porta fora da faixa utilizável (ou abaixo de 1024, onde o Windows exige
  // privilégio) volta ao padrão em vez de fazer o servidor falhar ao subir.
  const portaBruta = typeof c.porta === 'number' && Number.isInteger(c.porta) ? c.porta : 0
  const porta = portaBruta >= 1024 && portaBruta <= 65535 ? portaBruta : PORTA_PADRAO

  const terminais = Array.isArray(c.terminais)
    ? c.terminais.map(normalizarTerminal).filter((t): t is TerminalPareado => t !== null)
    : []

  const servidor = normalizarServidor(c.servidor)

  // Um terminal sem para onde falar não consegue operar; cair para normal deixa
  // o app abrir e o lojista refazer o pareamento.
  if (modo === 'terminal' && !servidor) {
    return { ...CONFIG_PADRAO, porta }
  }

  return { modo, porta, terminais, servidor }
}

/**
 * Lê a config do caminho informado. Nunca lança: arquivo ausente, ilegível ou
 * corrompido devolve o padrão. Um arquivo corrompido é movido para `.invalido`
 * antes, para não ser perdido na próxima gravação.
 */
export function lerConfigDe(caminho: string): ConfigMulticaixa {
  if (!existsSync(caminho)) return { ...CONFIG_PADRAO }
  let conteudo: string
  try {
    conteudo = readFileSync(caminho, 'utf8')
  } catch {
    return { ...CONFIG_PADRAO }
  }
  try {
    return normalizarConfig(JSON.parse(conteudo))
  } catch {
    preservarInvalido(caminho)
    return { ...CONFIG_PADRAO }
  }
}

function preservarInvalido(caminho: string): void {
  try {
    const destino = `${caminho}.invalido`
    if (existsSync(destino)) unlinkSync(destino)
    renameSync(caminho, destino)
  } catch {
    // Não conseguir preservar não é motivo pra impedir o app de abrir.
  }
}

/**
 * Grava a config. Escreve num temporário e renomeia por cima: se faltar energia
 * no meio, o arquivo antigo continua íntegro em vez de virar metade de um JSON.
 */
export function gravarConfigEm(caminho: string, config: ConfigMulticaixa): void {
  const temporario = `${caminho}.tmp`
  writeFileSync(temporario, JSON.stringify(normalizarConfig(config), null, 2), 'utf8')
  renameSync(temporario, caminho)
}
