/**
 * Sigilo ponta a ponta entre o caixa adicional e o computador principal.
 *
 * ── Por que existe ───────────────────────────────────────────────────────────
 * Quando o caixa opera fora da loja, a chamada não alcança o computador
 * principal diretamente: ela passa por um servidor no meio. Esse servidor é
 * nosso, e as duas pernas vão por HTTPS — mas ele conseguiria LER o que passa:
 * vendas, CPF de cliente, valores.
 *
 * Aqui isso deixa de ser possível. As duas máquinas combinam uma chave no
 * pareamento, que acontece na rede da loja, e o conteúdo viaja cifrado com ela.
 * O servidor do meio empurra bytes que não sabe interpretar. Não é uma promessa
 * de política de privacidade: é uma impossibilidade técnica.
 *
 * ── Por que AES-GCM ──────────────────────────────────────────────────────────
 * Ele cifra e autentica ao mesmo tempo. Só esconder não bastaria: sem
 * autenticação, alguém no meio poderia alterar bytes do pedido — trocar o valor
 * de uma venda, por exemplo — e o outro lado aceitaria a versão adulterada sem
 * perceber. Com GCM, qualquer bit alterado faz a abertura falhar.
 *
 * ── A regra que não pode ser quebrada ────────────────────────────────────────
 * **Cada mensagem usa um nonce novo e aleatório.** Repetir nonce com a mesma
 * chave é a falha catastrófica do GCM: dois textos cifrados com o mesmo par
 * revelam a diferença entre eles e permitem forjar mensagens. Por isso o nonce
 * é sorteado aqui dentro, a cada chamada, e nunca vem de fora.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'

const ALGORITMO = 'aes-256-gcm'
const BYTES_CHAVE = 32
const BYTES_NONCE = 12
const BYTES_ASSINATURA = 16

/** Chave combinada no pareamento. Hexadecimal, 256 bits. */
export function gerarChaveSigilo(): string {
  return randomBytes(BYTES_CHAVE).toString('hex')
}

function chaveEmBytes(chaveHex: string): Buffer {
  const chave = Buffer.from(String(chaveHex ?? ''), 'hex')
  if (chave.length !== BYTES_CHAVE) {
    throw new Error('Chave de sigilo inválida.')
  }
  return chave
}

/**
 * Fecha um objeto num pacote cifrado.
 *
 * O `vinculo` entra como dado autenticado mas não cifrado: ele não é secreto,
 * porém fica preso à mensagem. Serve para amarrar o pacote a um caixa
 * específico — assim um pacote legítimo de um caixa não pode ser reapresentado
 * como se fosse de outro.
 */
export function selar(chaveHex: string, conteudo: unknown, vinculo = ''): Buffer {
  const nonce = randomBytes(BYTES_NONCE)
  const cifra = createCipheriv(ALGORITMO, chaveEmBytes(chaveHex), nonce)
  if (vinculo) cifra.setAAD(Buffer.from(vinculo, 'utf8'))
  const corpo = Buffer.concat([
    cifra.update(Buffer.from(JSON.stringify(conteudo ?? null), 'utf8')),
    cifra.final()
  ])
  return Buffer.concat([nonce, cifra.getAuthTag(), corpo])
}

/**
 * Abre um pacote. Lança se a chave estiver errada, se o vínculo não bater ou se
 * qualquer byte tiver sido alterado no caminho.
 */
export function abrir(chaveHex: string, pacote: Buffer, vinculo = ''): unknown {
  if (!Buffer.isBuffer(pacote) || pacote.length < BYTES_NONCE + BYTES_ASSINATURA) {
    throw new Error('Pacote cifrado inválido.')
  }
  const nonce = pacote.subarray(0, BYTES_NONCE)
  const assinatura = pacote.subarray(BYTES_NONCE, BYTES_NONCE + BYTES_ASSINATURA)
  const corpo = pacote.subarray(BYTES_NONCE + BYTES_ASSINATURA)

  const decifra = createDecipheriv(ALGORITMO, chaveEmBytes(chaveHex), nonce)
  decifra.setAuthTag(assinatura)
  if (vinculo) decifra.setAAD(Buffer.from(vinculo, 'utf8'))

  let texto: string
  try {
    texto = Buffer.concat([decifra.update(corpo), decifra.final()]).toString('utf8')
  } catch {
    // Mensagem única para chave errada, vínculo trocado e adulteração: contar
    // qual dos três falhou ajudaria quem está tentando adivinhar.
    throw new Error('Não foi possível abrir a mensagem: conteúdo inválido ou alterado.')
  }

  try {
    return JSON.parse(texto)
  } catch {
    throw new Error('Não foi possível abrir a mensagem: conteúdo inválido ou alterado.')
  }
}

/** Compara duas chaves sem vazar tempo. Usado ao conferir pareamento. */
export function mesmaChave(a: string, b: string): boolean {
  try {
    return timingSafeEqual(chaveEmBytes(a), chaveEmBytes(b))
  } catch {
    return false
  }
}
