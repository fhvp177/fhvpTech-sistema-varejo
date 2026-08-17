// Autenticação do painel do revendedor.
//
// Até aqui existia UM segredo (`ADMIN_TOKEN`) que abre tudo: ele é a chave de
// Deus da FHVP e não estende para vários donos. Este arquivo cria a segunda
// classe de acesso — cada revendedor com credencial própria, enxergando só a
// carteira dele.
//
// ── Por que sessão em BANCO e não JWT ───────────────────────────────────────
// JWT é auto-contido: uma vez assinado, vale até expirar e não há como cancelar
// sem manter uma lista de revogados (que é justamente a tabela que o JWT
// prometia evitar). Aqui a exigência é o oposto disso: **bloquear o revendedor
// tem que derrubar o acesso dele NA HORA**, não daqui a 12 horas. Token opaco
// guardado no banco resolve isso de graça — toda requisição já vai ao banco
// confirmar quem é, e no mesmo passo confere se ele ainda pode.
//
// ── Por que scrypt e não bcrypt ─────────────────────────────────────────────
// O app usa `bcryptjs` para o PIN, mas o backend não tem essa dependência e
// roda em Docker. O `scrypt` do Node é nativo (zero dependência nova) e
// memory-hard, o que o torna mais caro de atacar em GPU do que um bcrypt em JS
// puro. Para senha nova, começando do zero, é a escolha melhor.
//
// ── O que NÃO mora aqui, de propósito ───────────────────────────────────────
// Nenhuma rota deste conjunto escreve na tabela `revendedores`. A validade do
// revendedor (o teto de tudo que ele emite) só é alterada pela FHVP ou pelo
// pagamento. Se um dia isso virar uma checagem `if`, o teto passa a poder se
// levantar sozinho — ver o cabeçalho do revenda.ts.

import { randomBytes, randomInt, scrypt, createHash, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  senha: string,
  sal: Buffer,
  tamanho: number
) => Promise<Buffer>

const TAMANHO_HASH = 64
const ROTULO = 'scrypt'

/** Sessão dura o suficiente para um dia de trabalho e não mais que isso. */
export const HORAS_DE_SESSAO = 12

/** Curto o bastante para não travar quem erra, longo o bastante para brutar não
 *  valer a pena. O contador é por hora, no padrão que o backend já usa na
 *  recuperação de PIN. */
export const MAX_TENTATIVAS_LOGIN_POR_HORA = 10

/** Validade do código de recuperação. Mesmo número da recuperação de PIN do
 *  app — não inventar um segundo prazo para a mesma ideia. */
export const MINUTOS_CODIGO_RECUPERACAO = 15

/** Pedidos de código por hora, por revendedor. Freia quem usa o botão de
 *  "esqueci a senha" como metralhadora de email. */
export const MAX_PEDIDOS_RECUPERACAO_POR_HORA = 3

/**
 * Chutes permitidos no código antes de queimá-lo.
 *
 * Seis dígitos é um universo de 1 milhão — parece muito, mas sem teto de
 * tentativas um script chega lá em minutos. Com 5, a chance de acertar por
 * sorte é 5 em 1.000.000, e quem errar cinco vezes pede outro código.
 */
export const MAX_CHUTES_NO_CODIGO = 5

export type PedidoRecuperacao = {
  revendedorId: string
  codigoHash: string
  expiraEm: string // ISO
  chutes: number
}

/** Código de 6 dígitos, sorteado com gerador criptográfico — `Math.random()`
 *  é previsível e não serve para credencial, nem temporária. */
export function gerarCodigoRecuperacao(): string {
  // randomInt evita o viés de módulo que `% 1000000` introduziria.
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function codigoExpirado(p: PedidoRecuperacao, agora: number = Date.now()): boolean {
  const t = Date.parse(p.expiraEm)
  return isNaN(t) || t <= agora
}

export function codigoQueimado(p: PedidoRecuperacao): boolean {
  return p.chutes >= MAX_CHUTES_NO_CODIGO
}

/** E-mail só precisa ser plausível: quem valida de verdade é a caixa de
 *  entrada. Regex ambiciosa aqui rejeita endereço válido e não pega o inválido. */
export function emailAceitavel(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())
}

/** Senha fraca em painel que move dinheiro é problema seu, não só dele. */
export const MIN_SENHA = 10

export function senhaAceitavel(senha: string): { ok: true } | { ok: false; erro: string } {
  if (typeof senha !== 'string' || senha.length < MIN_SENHA) {
    return { ok: false, erro: `senha precisa de pelo menos ${MIN_SENHA} caracteres` }
  }
  if (/^\d+$/.test(senha)) {
    return { ok: false, erro: 'senha só de números é fácil demais de adivinhar' }
  }
  return { ok: true }
}

/**
 * Gera o hash guardável da senha.
 *
 * Formato: `scrypt$<sal-hex>$<hash-hex>`. O sal vai junto porque ele não é
 * segredo — a função dele é impedir que duas contas com a mesma senha tenham o
 * mesmo hash, e que alguém pré-calcule tabelas.
 */
export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16)
  const derivado = await scryptAsync(senha, sal, TAMANHO_HASH)
  return `${ROTULO}$${sal.toString('hex')}$${derivado.toString('hex')}`
}

/**
 * Confere a senha contra o hash guardado.
 *
 * Nunca lança: hash corrompido, formato desconhecido ou campo vazio devolvem
 * `false`. Um erro aqui viraria 500 numa rota de login, o que já é meio caminho
 * para contar ao atacante que aquela conta existe.
 */
export async function conferirSenha(senha: string, guardado: string | undefined): Promise<boolean> {
  try {
    if (!guardado) return false
    const partes = guardado.split('$')
    if (partes.length !== 3 || partes[0] !== ROTULO) return false
    const sal = Buffer.from(partes[1], 'hex')
    const esperado = Buffer.from(partes[2], 'hex')
    if (sal.length === 0 || esperado.length !== TAMANHO_HASH) return false
    const derivado = await scryptAsync(senha, sal, TAMANHO_HASH)
    // Comparação de tempo constante: comparar com === vazaria, pelo tempo de
    // resposta, quantos bytes iniciais o atacante já acertou.
    return timingSafeEqual(derivado, esperado)
  } catch {
    return false
  }
}

/** Token de sessão: 32 bytes de aleatoriedade criptográfica. É este valor que
 *  vai para o navegador do revendedor — e o único lugar onde ele existe em
 *  claro. */
export function gerarToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * O que fica GRAVADO é o hash do token, nunca o token.
 *
 * Mesma lógica da senha: se o banco vazar, os tokens de dentro dele não abrem
 * nada. SHA-256 puro basta aqui (diferente da senha) porque o token já tem 256
 * bits de entropia — não há o que adivinhar, então não precisa ser lento.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type SessaoRevenda = {
  tokenHash: string
  revendedorId: string
  criadaEm: string // ISO
  expiraEm: string // ISO
}

export function montarSessao(revendedorId: string, agora: number = Date.now()): {
  token: string
  sessao: SessaoRevenda
} {
  const token = gerarToken()
  return {
    token,
    sessao: {
      tokenHash: hashToken(token),
      revendedorId,
      criadaEm: new Date(agora).toISOString(),
      expiraEm: new Date(agora + HORAS_DE_SESSAO * 3_600_000).toISOString()
    }
  }
}

export function sessaoExpirada(s: SessaoRevenda, agora: number = Date.now()): boolean {
  const t = Date.parse(s.expiraEm)
  return isNaN(t) || t <= agora
}

/**
 * Lê o token do cabeçalho `Authorization: Bearer <token>`.
 *
 * O nome do esquema é insensível a caixa por especificação (RFC 7235), então
 * `bearer` minúsculo tem que passar — recusar seria rejeitar cliente HTTP que
 * está certo. Já o token em si é conferido no formato exato que geramos (hex),
 * o que descarta lixo antes mesmo de ir ao banco.
 */
export function tokenDoCabecalho(auth: string | undefined): string | null {
  if (!auth) return null
  const m = /^Bearer\s+([A-Za-z0-9]+)$/i.exec(auth.trim())
  return m ? m[1] : null
}

export function passouDoLimiteDeTentativas(total: number): boolean {
  return total >= MAX_TENTATIVAS_LOGIN_POR_HORA
}

/**
 * Um revendedor pode mexer NESTE cliente?
 *
 * A propriedade de segurança central do painel. Duas recusas distintas, e as
 * duas importam:
 *   • cliente de OUTRO revendedor — carteira alheia;
 *   • cliente SEM revendedor — é cliente direto da FHVP, e um revendedor não
 *     pode encostar neles nem para ler.
 *
 * Escrita com `!==` sobre o dono real, e não com uma lista de exceções, porque
 * lista de exceções é onde esse tipo de trava costuma vazar.
 */
export function clienteEhDoRevendedor(
  cliente: { revendedorId?: string },
  revendedorId: string
): boolean {
  return !!cliente.revendedorId && cliente.revendedorId === revendedorId
}
