/**
 * Login do painel da FHVP — o que substituiu o `ADMIN_TOKEN`.
 *
 * ── Por que mudou ────────────────────────────────────────────────────────────
 * Até aqui o painel pedia o `ADMIN_TOKEN` colado na mão, e ele ficava só na
 * memória da aba: recarregar a página exigia colar de novo. Isso era proteção
 * de verdade (ver o cabeçalho do painel), mas tinha um custo que cobrou a
 * conta: o token é um segredo do SERVIDOR, guardado no Fly, e o Fly nunca
 * devolve o valor de um secret. Quem não anotou, perdeu o acesso — foi
 * exatamente o que aconteceu.
 *
 * ── O desenho ────────────────────────────────────────────────────────────────
 * A senha vive UNICAMENTE no segredo `ADMIN_SENHA` do Fly. Não há cópia no
 * banco, e isso é decisão, não economia:
 *
 *   • **Não existe estado pra dessincronizar.** Guardar um hash no banco
 *     exigiria semear na primeira subida e detectar "o segredo mudou" nas
 *     seguintes — duas engrenagens que só falham no dia da emergência.
 *   • **Trocar o segredo JÁ É o reset.** `fly secrets set ADMIN_SENHA=...`
 *     reinicia o backend e a senha nova passa a valer sozinha. Nenhuma rota de
 *     recuperação precisa existir, e por isso nenhuma fica exposta na internet.
 *   • **Cifrar não acrescentaria nada aqui.** Hash protege senha PARADA num
 *     banco que pode vazar. Esta não fica parada em lugar nenhum: chega por
 *     variável de ambiente e é comparada em memória. O que a protege é o
 *     controle de acesso da conta do Fly — o mesmo de antes.
 *
 * O que entra no banco é só a SESSÃO, e mesmo assim só o hash dela.
 *
 * ── O que a senha passou a sofrer, e o token não sofria ─────────────────────
 * O painel mora numa URL pública. Um token de 32 bytes aleatórios não é
 * chutável; uma senha digitada por gente é. Daí três coisas serem obrigatórias
 * e não opcionais:
 *
 *   1. **Política de força** — abaixo. Esta senha abre TODAS as lojas e TODOS
 *      os revendedores; não é senha de usuário comum.
 *   2. **Limite por IP** — e por IP, não global. Um limite global deixaria
 *      qualquer estranho trancar o dono do lado de fora só gastando as
 *      tentativas: negação de serviço barata contra a única conta que existe.
 *   3. **Comparação de tempo constante** — comparar strings com `===` vaza,
 *      pelo tempo de resposta, quantos caracteres iniciais bateram.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Quanto tempo uma sessão do painel dura. */
export const HORAS_DE_SESSAO_ADMIN = 12

/**
 * Tentativas de login por IP, por hora.
 *
 * Contra senha forte, 10 chutes por hora não chegam a lugar nenhum. E como é
 * por IP, quem estiver tentando não tranca o dono: ele entra de outro lugar.
 */
export const MAX_TENTATIVAS_LOGIN_ADMIN_POR_HORA = 10

/** Mínimo de caracteres. Maior que o do revendedor de propósito — ver acima. */
export const MIN_SENHA_ADMIN = 14

export type SessaoAdmin = {
  tokenHash: string
  criadaEm: string // ISO
  expiraEm: string // ISO
}

/**
 * A senha é forte o bastante para guardar a carteira inteira?
 *
 * Exige TAMANHO e VARIEDADE juntos. Só tamanho deixaria passar
 * "senhasenhasenha"; só variedade deixaria passar "Ab1!" — e é a combinação
 * dos dois que torna o chute inviável.
 *
 * Não é validada num formulário: quem define esta senha é quem roda
 * `fly secrets set`. A conferência acontece no BOOT, e serve para avisar alto
 * quando o segredo é fraco demais para o que ele abre.
 */
export function senhaAdminAceitavel(senha: unknown): { ok: true } | { ok: false; erro: string } {
  if (typeof senha !== 'string' || senha.length < MIN_SENHA_ADMIN) {
    return { ok: false, erro: `precisa de pelo menos ${MIN_SENHA_ADMIN} caracteres` }
  }

  const classes = [
    /[a-z]/.test(senha),
    /[A-Z]/.test(senha),
    /\d/.test(senha),
    // Qualquer coisa que não seja letra sem acento nem dígito conta como
    // símbolo — inclusive acentuados, que são perfeitamente bons numa senha.
    /[^A-Za-z0-9]/.test(senha)
  ].filter(Boolean).length

  if (classes < 3) {
    return {
      ok: false,
      erro: 'misture pelo menos três tipos de caractere (minúscula, MAIÚSCULA, número, símbolo)'
    }
  }

  return { ok: true }
}

/**
 * Confere a senha enviada contra a esperada, sem vazar pelo relógio.
 *
 * `===` em string sai no primeiro caractere diferente. A diferença de tempo é
 * pequena, mas mensurável em muitas tentativas — e permite descobrir a senha
 * caractere a caractere, em vez de chutá-la inteira.
 *
 * Os dois lados passam por SHA-256 antes de comparar porque `timingSafeEqual`
 * exige buffers do mesmo tamanho: comparar direto revelaria o COMPRIMENTO da
 * senha certa pelo simples fato de aceitar ou recusar a comparação.
 */
export function senhaAdminConfere(enviada: unknown, esperada: string | undefined): boolean {
  if (typeof enviada !== 'string' || typeof esperada !== 'string' || esperada === '') {
    return false
  }
  const a = createHash('sha256').update(enviada, 'utf8').digest()
  const b = createHash('sha256').update(esperada, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/** Token de sessão: aleatório, opaco, sem nada dentro. */
export function gerarTokenAdmin(): string {
  return randomBytes(32).toString('hex')
}

/**
 * O que vai para o banco no lugar do token.
 *
 * Guardar o token cru faria de um vazamento do banco um acesso pronto ao
 * painel. Guardando o hash, o que vaza não abre nada — e a conferência
 * continua barata, porque é só hashear de novo o que chega no cabeçalho.
 */
export function hashTokenAdmin(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function montarSessaoAdmin(agora: number = Date.now()): {
  token: string
  sessao: SessaoAdmin
} {
  const token = gerarTokenAdmin()
  return {
    token,
    sessao: {
      tokenHash: hashTokenAdmin(token),
      criadaEm: new Date(agora).toISOString(),
      expiraEm: new Date(agora + HORAS_DE_SESSAO_ADMIN * 3_600_000).toISOString()
    }
  }
}

export function sessaoAdminExpirada(s: SessaoAdmin, agora: number = Date.now()): boolean {
  const t = Date.parse(s.expiraEm)
  // Data ilegível conta como expirada: erra para o lado de pedir login de novo.
  if (Number.isNaN(t)) return true
  return t <= agora
}

export function passouDoLimiteAdmin(total: number): boolean {
  return total >= MAX_TENTATIVAS_LOGIN_ADMIN_POR_HORA
}

/**
 * Extrai o token do cabeçalho `Authorization: Bearer <token>`.
 *
 * Devolve `null` para qualquer coisa fora do formato — inclusive cabeçalho
 * ausente — para que quem chama não precise distinguir "não mandou" de
 * "mandou torto".
 */
export function tokenAdminDoCabecalho(auth: string | undefined): string | null {
  if (!auth) return null
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim())
  return m ? m[1] : null
}

/**
 * De onde veio o pedido, para contar tentativas por origem.
 *
 * Atrás do proxy do Fly, `x-forwarded-for` traz a cadeia de IPs e o PRIMEIRO é
 * o do cliente. Os seguintes são proxies, e confiar neles deixaria qualquer um
 * escolher a própria identidade mandando um cabeçalho falso.
 *
 * Sem cabeçalho nenhum (dev local), cai num balde único — o que é certo:
 * localmente não há proxy, e um balde só é o comportamento mais restritivo.
 */
export function origemDoPedido(xForwardedFor: string | undefined): string {
  if (!xForwardedFor) return 'local'
  const primeiro = xForwardedFor.split(',')[0]?.trim()
  return primeiro && primeiro.length > 0 ? primeiro : 'local'
}
