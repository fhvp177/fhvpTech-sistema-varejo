import { useEffect, useState } from 'react'

/**
 * A tela é estreita o bastante para valer o desenho de celular?
 *
 * ── Por que isto existe, se o Tailwind já tem `lg:` ──────────────────────────
 * Quase tudo se resolve com classe: `hidden lg:block` não custa re-render e o
 * navegador resolve sozinho ao girar o aparelho. **Prefira sempre a classe.**
 *
 * Só que o gráfico é um SVG desenhado pelo Recharts, e largura de barra,
 * espaçamento entre elas e de quantos em quantos rótulos aparece um no eixo são
 * PROPRIEDADES em JavaScript — não existe classe que as alcance. Para esses
 * casos, e só para eles, a largura precisa ser lida em código.
 *
 * ── ⚠️ O aplicativo instalado NUNCA é celular ────────────────────────────────
 * Decisão do dono, e ela vale em qualquer largura: no Electron a janela pode
 * estar em meia tela, num monitor pequeno, e ainda assim o desenho é o de
 * computador. Por isso a pergunta não é só "a tela é estreita?", é "a tela é
 * estreita **e** estamos na web?".
 *
 * ── O 1023.98 não é frescura ─────────────────────────────────────────────────
 * É o mesmo limite do `lg` do Tailwind e o mesmo do `index.css`. Em tela com
 * zoom a largura vira fracionária, e o par `max-width: 1023px` /
 * `min-width: 1024px` deixa um vão onde nenhuma das duas regras vale.
 */
export const CONSULTA_CELULAR = '(max-width: 1023.98px)'

const medirAgora = (): boolean => {
  if (__ALVO__ !== 'web') return false
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(CONSULTA_CELULAR).matches
}

export function useEhCelular(): boolean {
  /*
   * Medido já na PRIMEIRA renderização.
   *
   * ⚠️ Começar em `false` e corrigir dentro do efeito faria o gráfico nascer
   * com barra de computador e trocar de desenho um quadro depois — a piscada
   * que o roteiro chama de layout que se refaz sozinho.
   */
  const [ehCelular, setEhCelular] = useState(medirAgora)

  useEffect(() => {
    if (__ALVO__ !== 'web') return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const consulta = window.matchMedia(CONSULTA_CELULAR)
    const aoMudar = (e: MediaQueryListEvent) => setEhCelular(e.matches)
    consulta.addEventListener('change', aoMudar)
    // Girar o aparelho entre a primeira medida e este efeito é raro, mas custa
    // uma linha cobrir.
    setEhCelular(consulta.matches)
    return () => consulta.removeEventListener('change', aoMudar)
  }, [])

  return ehCelular
}
