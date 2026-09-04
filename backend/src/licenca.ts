// Gera chaves de licença no MESMO formato que o app valida:
//   CLIENTE:AAAA-MM-DD:HMAC16
// Onde HMAC16 é HMAC-SHA256(`clienteId:expiracao`) com CHAVE_HMAC,
// truncado nos primeiros 16 chars hex, uppercase.
//
// Mantém compatibilidade total com electron/licenca.ts. Qualquer alteração
// aqui PRECISA refletir no app — e vice-versa.

export async function calcularHMAC(
  segredo: string,
  clienteId: string,
  expiracao: string
): Promise<string> {
  const enc = new TextEncoder()
  const chave = await crypto.subtle.importKey(
    'raw',
    enc.encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const assinatura = await crypto.subtle.sign(
    'HMAC',
    chave,
    enc.encode(`${clienteId}:${expiracao}`)
  )
  const hex = Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex.slice(0, 16).toUpperCase()
}

// Soma dias à data atual (UTC) e devolve no formato AAAA-MM-DD.
export function calcularExpiracao(diasContratados: number, base = new Date()): string {
  const data = new Date(base.getTime() + diasContratados * 86_400_000)
  const ano = data.getUTCFullYear()
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(data.getUTCDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

// Soma dias a uma data AAAA-MM-DD existente — usado em renovações pra estender
// a partir da validade atual, não da data de hoje (cliente que renova adiantado
// não perde os dias restantes).
export function somarDiasNaExpiracao(
  expiracaoAtual: string | undefined,
  diasContratados: number
): string {
  const hoje = new Date()
  const dataAtual = expiracaoAtual ? new Date(expiracaoAtual + 'T23:59:59Z') : hoje
  const base = dataAtual > hoje ? dataAtual : hoje
  return calcularExpiracao(diasContratados, base)
}

export type ChaveConferida =
  | { ok: true; clienteId: string; expiracao: string }
  | { ok: false; erro: string }

/**
 * Compara dois textos gastando o MESMO tempo, acertando ou errando.
 *
 * ⚠️ Não é preciosismo. Com `===`, o servidor responde mais rápido quanto
 * menos prefixo estiver certo, e essa diferença, medida muitas vezes,
 * entrega o HMAC byte a byte. Trocar por `===` não deixa vermelho nenhum
 * teste de comportamento: por isso existe teste lendo o fonte.
 */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferenca === 0
}

/**
 * A chave apresentada foi mesmo emitida por nós?
 *
 * ★ Serve à rota de vaga de dispositivo, que é PÚBLICA. Ali a chave faz as
 * vezes de credencial, e é por isso que o `clienteId` sai DE DENTRO dela.
 * Aceitar um `clienteId` solto no corpo do pedido deixaria qualquer pessoa
 * lotar as vagas da loja dos outros.
 *
 * Validade não é conferida aqui de propósito: licença vencida já trava o
 * app pelo caminho offline, e recusar a vaga por isso atrapalharia
 * justamente quem está renovando.
 */
export async function conferirChaveDeLicenca(
  segredo: string,
  chave: unknown
): Promise<ChaveConferida> {
  if (typeof chave !== 'string') return { ok: false, erro: 'chave obrigatória' }
  const partes = chave.trim().split(':')
  if (partes.length !== 3) return { ok: false, erro: 'chave em formato inválido' }

  const [clienteId, expiracao, hmac] = partes
  // Aceita o id direto (LOJA) e o de revendedor (REV-LOJA), que é o único
  // formato com hífen que existe.
  if (!/^[A-Z0-9]{2,20}(-[A-Z0-9]{2,20})?$/.test(clienteId)) {
    return { ok: false, erro: 'chave em formato inválido' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiracao)) {
    return { ok: false, erro: 'chave em formato inválido' }
  }

  const esperado = await calcularHMAC(segredo, clienteId, expiracao)
  if (!iguaisEmTempoConstante(hmac.toUpperCase(), esperado)) {
    return { ok: false, erro: 'chave inválida' }
  }
  return { ok: true, clienteId, expiracao }
}

export async function gerarChaveLicenca(
  segredo: string,
  clienteId: string,
  expiracao: string
): Promise<string> {
  const hmac = await calcularHMAC(segredo, clienteId, expiracao)
  return `${clienteId}:${expiracao}:${hmac}`
}
