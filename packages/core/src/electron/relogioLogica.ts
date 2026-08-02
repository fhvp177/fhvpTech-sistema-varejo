/**
 * Decisões do guardião de relógio, isoladas do Electron e do SQLite.
 *
 * A trava existe para impedir que alguém atrase o relógio do PC e continue
 * usando uma licença vencida. O problema é que, vista de dentro da máquina,
 * essa fraude é IDÊNTICA a um acidente honesto:
 *
 *   fraude   → âncora certa, relógio atrasado de propósito
 *   acidente → relógio certo, âncora no futuro (dados copiados de outra
 *              máquina adiantada, bateria de BIOS fraca, PC de origem errado)
 *
 * Nos dois casos o app só enxerga "hoje é bem antes da última data que anotei".
 * Para separar os dois é preciso um relógio de FORA, que a máquina não controle
 * — daí `relogioConfereComServidor`, alimentado pelo cabeçalho `Date` das
 * respostas HTTPS do nosso backend.
 *
 * Aqui só moram as contas. Quem lê arquivo, fala com a rede e decide o que
 * mostrar é o licenca.ts.
 */

/** Quanto o relógio pode estar atrás da âncora antes de bloquear. */
export const TOLERANCIA_RELOGIO_MS = 48 * 60 * 60 * 1000

/**
 * Quanto o relógio local pode divergir do servidor e ainda ser considerado
 * honesto. Generoso de propósito: fuso mal configurado desloca no máximo ~14h,
 * e ninguém atrasa o relógio meio dia para ganhar meio dia de licença — a
 * fraude que importa mexe em semanas ou meses.
 */
export const TOLERANCIA_SERVIDOR_MS = 24 * 60 * 60 * 1000

export type Ancoras = {
  /** Timestamp gravado no licenca.heartbeat (null = arquivo ausente/ilegível). */
  heartbeatMs: number | null
  /** MAX(vendas.data) do banco (null = sem vendas ou sem banco). */
  maxVendaMs: number | null
  /**
   * Marca d'água de datas já desmentidas por um relógio confiável. Venda com
   * data até aqui é ignorada: quando o servidor confirma que o relógio local
   * está certo, uma venda "do futuro" é resíduo do acidente, não referência.
   * Sem isso, apagar o heartbeat não bastaria — a venda re-travaria o sistema.
   */
  ignorarAte: number
}

export function calcularAncora({ heartbeatMs, maxVendaMs, ignorarAte }: Ancoras): number {
  const daVenda = maxVendaMs !== null && maxVendaMs > ignorarAte ? maxVendaMs : 0
  return Math.max(heartbeatMs ?? 0, daVenda)
}

/**
 * Conteúdo do licenca.heartbeat, já validado.
 *
 * `ignorarAte` e `destravadoEm` entraram depois. Interpretar aqui (e não no
 * licenca.ts) é o que permite testar a compatibilidade: TODA loja instalada
 * hoje tem um arquivo no formato antigo, só com `ts`, e ele precisa continuar
 * sendo lido — se virar null, a máquina perde a referência e a trava some.
 */
export type Heartbeat = {
  ts: number
  ignorarAte: number
  destravadoEm?: number
}

export function interpretarHeartbeat(bruto: unknown): Heartbeat | null {
  if (typeof bruto !== 'object' || bruto === null) return null
  const obj = bruto as Record<string, unknown>
  if (typeof obj.ts !== 'number' || !Number.isFinite(obj.ts)) return null
  return {
    ts: obj.ts,
    ignorarAte: typeof obj.ignorarAte === 'number' ? obj.ignorarAte : 0,
    destravadoEm: typeof obj.destravadoEm === 'number' ? obj.destravadoEm : undefined
  }
}

export type Veredito =
  /** Nenhuma referência ainda (instalação nova, banco vazio). */
  | 'sem-ancora'
  | 'ok'
  /** Voltou pouco: dentro da tolerância. Deixa entrar, mas avisa. */
  | 'voltou-pouco'
  | 'bloqueia'

export function avaliarRelogio(
  agora: number,
  ancora: number,
  tolerancia: number = TOLERANCIA_RELOGIO_MS
): Veredito {
  if (ancora <= 0) return 'sem-ancora'
  if (agora < ancora - tolerancia) return 'bloqueia'
  if (agora < ancora) return 'voltou-pouco'
  return 'ok'
}

/**
 * O relógio local bate com o do servidor? Se bate, o relógio é confiável e uma
 * âncora no futuro só pode ser lixo — é o sinal que autoriza o conserto
 * automático.
 */
export function relogioConfereComServidor(
  localMs: number,
  servidorMs: number,
  tolerancia: number = TOLERANCIA_SERVIDOR_MS
): boolean {
  return Math.abs(localMs - servidorMs) <= tolerancia
}

/** Lê o cabeçalho `Date` de uma resposta HTTP. Devolve null se vier torto. */
export function lerHoraDoCabecalho(cabecalho: string | null | undefined): number | null {
  if (!cabecalho) return null
  const ms = new Date(cabecalho).getTime()
  return Number.isNaN(ms) ? null : ms
}

export type Tratamento =
  /** Relógio conferido e honesto: conserta a âncora sozinho e deixa entrar. */
  | 'consertar'
  /** Servidor desmentiu o relógio: continua bloqueado, mas com data correta na tela. */
  | 'relogio-errado-mesmo'
  /** Sem internet: não dá para conferir; oferece o destravamento manual. */
  | 'sem-conferencia'

/**
 * O que fazer quando a trava dispara.
 *
 * Escolha consciente: sem internet a gente OFERECE o destravamento manual em
 * vez de bloquear. É a única brecha real (basta desligar a rede e atrasar o
 * relógio), e ela é aceita por dois motivos — o repositório é público, então o
 * script que faz exatamente isso já está ao alcance de quem quiser burlar; e o
 * custo de não oferecer recai inteiro sobre o cliente honesto, que fica sem
 * sistema até alguém do suporte guiá-lo por dentro do %APPDATA%.
 */
export function decidirTratamento(
  agora: number,
  horaServidorMs: number | null,
  tolerancia: number = TOLERANCIA_SERVIDOR_MS
): Tratamento {
  if (horaServidorMs === null) return 'sem-conferencia'
  return relogioConfereComServidor(agora, horaServidorMs, tolerancia)
    ? 'consertar'
    : 'relogio-errado-mesmo'
}
