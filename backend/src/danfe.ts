// A largura do DANFE da NFC-e, do jeito que a ACBr aceita.
//
// A ACBr monta o DANFE em qualquer largura de 40 a 80 milímetros (o padrão
// dela é 80). Quem escolhe é o app, porque só ele sabe a impressora da loja —
// e a medida que ele manda NÃO é a largura da bobina, e sim a que a cabeça
// térmica alcança: uma bobina de 80mm escreve 72mm, e os 4mm de cada lado
// nunca saem no papel. Pedir 80 é como mandar imprimir um pedaço da nota no ar.
//
// ⚠️ Este arquivo existe porque o backend não pode "arredondar" essa escolha.
// Antes ele reduzia qualquer valor a 58 ou 80 — o app pedia 72 e recebia 80 de
// volta, sem erro nenhum, e a nota voltava a sair cortada. Aqui a régua é a da
// ACBr (40..80), e nada mais.
export const LARGURA_MIN_MM = 40
export const LARGURA_MAX_MM = 80
export const LARGURA_PADRAO_MM = 80

/**
 * Traduz o `largura` da query para a medida que vai à ACBr.
 * Valor ausente, não numérico ou fora da faixa cai no padrão de 80mm.
 */
export function larguraDoDanfe(valor: string | undefined | null): number {
  const n = Number(valor)
  if (!Number.isInteger(n) || n < LARGURA_MIN_MM || n > LARGURA_MAX_MM) {
    return LARGURA_PADRAO_MM
  }
  return n
}
