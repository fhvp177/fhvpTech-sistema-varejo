/**
 * Chamar o cliente no WhatsApp, com a mensagem já escrita.
 *
 * Pedido dele: "não tinha a opção de chamar o cliente no WhatsApp em pedidos
 * separados; queria ter, e se possível com uma mensagem pré-definida".
 *
 * ── Por que `wa.me` e não uma integração ────────────────────────────────────
 * `wa.me` abre o aplicativo que a pessoa já usa, com a conversa certa e o texto
 * pronto — e ela lê antes de enviar. Uma integração de verdade (API de negócios)
 * exige cadastro, aprovação de modelo de mensagem e mensalidade, para no fim
 * mandar a mesma frase. E mensagem que sai sozinha, sem ninguém ler, é como se
 * perde cliente.
 */

/**
 * Telefone brasileiro no formato que o WhatsApp entende: só dígitos, com o 55 na
 * frente.
 *
 * ⚠️ Devolve null em vez de "dar um jeito". Número curto demais quase sempre é
 * cadastro incompleto, e abrir o WhatsApp num número inventado faz o lojista
 * mandar mensagem para um estranho.
 */
export function telefoneWhatsApp(telefone: string | null | undefined): string | null {
  const digitos = String(telefone ?? '').replace(/\D/g, '')
  if (digitos.length < 10) return null

  // Já veio com o código do país.
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) return digitos

  // DDD + número (10 com fixo antigo, 11 com o 9).
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`

  return null
}

export type DadosMensagem = {
  cliente: string | null
  loja: string
  total: string
  paraEntrega: boolean
}

/**
 * A mensagem padrão de um pedido separado.
 *
 * Escrita para ser enviada como está, mas o lojista sempre pode editar antes de
 * mandar — o WhatsApp abre com o texto no campo, não enviado.
 */
export function mensagemPedidoSeparado(d: DadosMensagem): string {
  const primeiroNome = (d.cliente ?? '').trim().split(/\s+/)[0]
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!'
  const fecho = d.paraEntrega
    ? 'Podemos combinar a entrega?'
    : 'Já está separado e pode ser retirado quando você puder vir.'
  return `${saudacao} Aqui é da ${d.loja}. Seu pedido está pronto, no valor de ${d.total}. ${fecho}`
}

/** O endereço que abre a conversa com o texto já digitado. */
export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const numero = telefoneWhatsApp(telefone)
  if (!numero) return null
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}
