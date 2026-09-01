/**
 * Onde desenhar a lista de um dropdown que vive num portal preso à janela.
 *
 * ── O bug que isto resolve ──────────────────────────────────────────────────
 * A versão anterior fazia o óbvio: `top = campo.bottom`, altura máxima fixa. Com
 * o campo no meio da tela funciona. Com o campo perto do rodapé, a caixa da
 * lista atravessa a borda da janela — e aí acontece o pior tipo de defeito, o
 * que parece funcionar: a lista TEM barra de rolagem, ela ROLA, o usuário rola
 * até o fim... e as últimas opções continuam invisíveis, porque o fim da CAIXA
 * está fora da tela. Rolar por dentro nunca traz de volta o que está fora.
 *
 * ── As duas saídas, nesta ordem ─────────────────────────────────────────────
 * 1. **Encolher.** Se cabe alguma coisa embaixo, a lista usa exatamente o espaço
 *    disponível como altura máxima. Ela fica mais baixa, mas inteira dentro da
 *    tela — e aí sim a rolagem interna alcança tudo.
 * 2. **Virar pra cima.** Quando o espaço de cima é maior, a lista nasce acima do
 *    campo. Ancorada pelo `bottom`, não pelo `top`: assim ela cresce para cima
 *    sozinha e a base fica sempre colada no campo, sem precisar saber a altura
 *    antes de desenhar.
 *
 * É função pura de propósito — recebe medidas, devolve medidas. Dá pra testar a
 * decisão sem navegador, que é justamente o que faltava quando o bug passou.
 */

export type RetanguloCampo = {
  left: number
  top: number
  bottom: number
  width: number
}

export type PosicaoDropdown = {
  left: number
  width: number
  /** Definido quando a lista abre para BAIXO. */
  top?: number
  /** Definido quando a lista abre para CIMA (distância do rodapé da janela). */
  bottom?: number
  /** Teto de altura já descontado o que cabe na tela. */
  maxHeight: number
}

/** Altura máxima desejada — o `max-h-72` do Tailwind (18rem). */
export const ALTURA_MAXIMA = 288

/** Respiro entre a lista e a borda da janela, para não colar. */
const MARGEM_BORDA = 8

/** Abaixo disto a lista fica inutilizável; melhor virar pra cima. */
const ALTURA_MINIMA_UTIL = 120

export function posicaoDropdown(
  campo: RetanguloCampo,
  janela: { innerHeight: number },
  alturaMaxima: number = ALTURA_MAXIMA
): PosicaoDropdown {
  const base = { left: campo.left, width: campo.width }

  const espacoAbaixo = janela.innerHeight - campo.bottom - MARGEM_BORDA
  const espacoAcima = campo.top - MARGEM_BORDA

  // Abre para baixo quando cabe inteira, ou quando não cabe em lugar nenhum mas
  // ainda sobra mais espaço embaixo. Preferir baixo é proposital: é para onde a
  // pessoa espera que a lista abra.
  const cabeAbaixo = espacoAbaixo >= alturaMaxima
  const abaixoServe = espacoAbaixo >= ALTURA_MINIMA_UTIL

  if (cabeAbaixo || abaixoServe || espacoAbaixo >= espacoAcima) {
    return { ...base, top: campo.bottom, maxHeight: Math.max(0, Math.min(alturaMaxima, espacoAbaixo)) }
  }

  return {
    ...base,
    bottom: janela.innerHeight - campo.top,
    maxHeight: Math.max(0, Math.min(alturaMaxima, espacoAcima))
  }
}
