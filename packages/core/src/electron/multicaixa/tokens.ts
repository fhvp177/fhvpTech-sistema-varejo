/**
 * Credenciais dos terminais pareados.
 *
 * O token é a única coisa que separa um caixa autorizado de qualquer aparelho
 * ligado na mesma rede. Três cuidados, e o motivo de cada um:
 *
 * 1. **Gerado por sorteio criptográfico, com 256 bits.** Não é senha escolhida
 *    por gente; ninguém precisa decorar. Sendo enorme e aleatório, tentar
 *    adivinhar por força bruta deixa de ser um caminho — e é por isso que o
 *    `/rpc` não precisa de limite de tentativas, ao contrário do pareamento,
 *    que usa código curto e digitado por humano.
 *
 * 2. **O PC guarda só o resumo (SHA-256), nunca o token.** Se o arquivo de
 *    configuração vazar, não dá pra se passar por um terminal. Aqui cabe
 *    resumo simples e rápido, e não bcrypt como no PIN: bcrypt é lento DE
 *    PROPÓSITO, para atrapalhar quem tenta adivinhar um segredo curto. Token de
 *    256 bits não tem o que adivinhar, e a conferência acontece a cada chamada
 *    — bcrypt aqui só deixaria o caixa lento à toa.
 *
 * 3. **Conferência em tempo constante.** Comparar texto com `===` para no
 *    primeiro caractere diferente, e a diferença de tempo entre "errou no
 *    primeiro" e "errou no último" é medível pela rede. Com medições
 *    suficientes dá pra descobrir o valor caractere a caractere. `timingSafeEqual`
 *    sempre gasta o mesmo tempo.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Token novo para um terminal. 256 bits em hexadecimal. */
export function gerarToken(): string {
  return randomBytes(32).toString('hex')
}

/** Resumo que o PC guarda no lugar do token. */
export function hashDeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Confere um token contra o resumo guardado, sem vazar tempo. */
export function tokenConfere(token: string, hashGuardado: string): boolean {
  const calculado = Buffer.from(hashDeToken(token), 'hex')
  let guardado: Buffer
  try {
    guardado = Buffer.from(hashGuardado, 'hex')
  } catch {
    return false
  }
  // timingSafeEqual exige mesmo tamanho; hash guardado torto reprova direto.
  if (guardado.length !== calculado.length) return false
  return timingSafeEqual(calculado, guardado)
}

/**
 * Descobre de qual terminal é o token. Percorre TODOS os terminais mesmo depois
 * de achar — parar no primeiro faria o tempo de resposta contar quantos
 * terminais existem e em que posição está cada um.
 */
export function origemDoToken(
  token: string,
  terminais: readonly { id: string; tokenHash: string }[]
): string | null {
  let achado: string | null = null
  for (const terminal of terminais) {
    if (tokenConfere(token, terminal.tokenHash)) achado = terminal.id
  }
  return achado
}
