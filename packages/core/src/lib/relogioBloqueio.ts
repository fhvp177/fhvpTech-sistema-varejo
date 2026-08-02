/**
 * A regra que decide se o bloqueio de relógio vira tela.
 *
 * Vive num .ts separado do RelogioIncorreto.tsx de propósito: assim o teste
 * (que roda sob o tsconfig do main, sem JSX) consegue importá-la, e a regra
 * fica num lugar só para os três nichos.
 */
export type BloqueioRelogio = {
  tratamento: 'relogio-errado-mesmo' | 'sem-conferencia'
  horaLocalISO: string
  horaServidorISO?: string
}

/**
 * Traduz o status da licença no bloqueio de relógio, ou null se não for esse o
 * caso — e null significa "siga o fluxo normal da licença".
 *
 * 'consertar' nunca deveria chegar aqui: quando o servidor confirma o relógio,
 * o main conserta a âncora e revalida sozinho, então a tela recebe uma licença
 * válida. Se chegar mesmo assim, tratá-lo como bloqueio prenderia o lojista
 * numa tela sem saída — por isso ele também devolve null.
 */
export function bloqueioDeRelogio(status: {
  valida: boolean
  motivo?: string
  relogio?: { tratamento: string; horaLocalISO: string; horaServidorISO?: string }
}): BloqueioRelogio | null {
  if (status.valida || status.motivo !== 'relogio' || !status.relogio) return null
  const { tratamento, horaLocalISO, horaServidorISO } = status.relogio
  if (tratamento !== 'relogio-errado-mesmo' && tratamento !== 'sem-conferencia') return null
  return { tratamento, horaLocalISO, horaServidorISO }
}
