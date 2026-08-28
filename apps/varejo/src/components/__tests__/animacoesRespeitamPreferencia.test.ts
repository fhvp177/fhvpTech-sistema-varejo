/**
 * Toda animação tem que ser desligável, e nenhuma pode remexer o layout.
 *
 * ── Trava 1: quem pediu menos movimento não vê movimento ────────────────────
 * O Windows tem um ajuste de "reduzir animações", e há gente que o liga por
 * necessidade real — enxaqueca vestibular, náusea de movimento, dificuldade de
 * concentração. O `animacoes.css` respeita isso num bloco
 * `@media (prefers-reduced-motion: reduce)` que precisa listar CADA classe.
 *
 * O problema é que esse bloco é fácil de esquecer: quem adiciona `.anim-nova`
 * lá em cima vê a animação funcionando, comemora e vai embora. Nada acusa. E
 * quem depende do ajuste passa a ver movimento que pediu para não ver — uma
 * regressão de acessibilidade que só aparece na máquina de quem sofre com ela.
 *
 * ── Trava 2: nada de animar propriedade de layout ───────────────────────────
 * Animar `height`, `width`, `margin`, `padding`, `top` ou `left` obriga o
 * navegador a recalcular a posição de tudo a cada quadro. Em máquina boa passa
 * despercebido; no PC de loja onde estes apps rodam, engasga — e engasgo é pior
 * que animação nenhuma. `transform`, `opacity`, `background-color` e
 * `box-shadow` não têm esse custo.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const CSS = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'packages', 'core', 'src', 'ui', 'animacoes.css'),
  'utf8'
)

/** Todas as classes `.anim-*` que carregam uma `animation:`. */
function classesAnimadas(css: string): string[] {
  const achadas = new Set<string>()
  // Um seletor .anim-... seguido do bloco; só conta se o bloco anima de fato.
  const re = /(\.anim-[a-z0-9-]+(?:[^{,]*)?(?:,\s*\.anim-[a-z0-9-]+[^{,]*)*)\s*\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    if (!/animation\s*:/.test(m[2])) continue
    for (const nome of m[1].match(/\.anim-[a-z0-9-]+/g) ?? []) achadas.add(nome.slice(1))
  }
  return [...achadas]
}

/** O conteúdo dos blocos de reduced-motion (pode haver mais de um). */
function blocosReduzidos(css: string): string {
  const partes: string[] = []
  let i = css.indexOf('prefers-reduced-motion')
  while (i !== -1) {
    const abre = css.indexOf('{', i)
    // Fecha por contagem: o bloco @media contém outros blocos dentro.
    let prof = 0
    for (let j = abre; j < css.length; j++) {
      if (css[j] === '{') prof++
      else if (css[j] === '}') {
        prof--
        if (prof === 0) {
          partes.push(css.slice(abre, j))
          break
        }
      }
    }
    i = css.indexOf('prefers-reduced-motion', i + 1)
  }
  return partes.join('\n')
}

describe('animacoes.css', () => {
  const animadas = classesAnimadas(CSS)
  const reduzido = blocosReduzidos(CSS)

  it('achou as classes animadas (se isto falhar, o resto vira teatro)', () => {
    expect(animadas.length).toBeGreaterThanOrEqual(8)
  })

  it('achou o bloco de movimento reduzido', () => {
    expect(reduzido.length).toBeGreaterThan(50)
  })

  it.each(animadas)('%s é desligada em prefers-reduced-motion', (classe) => {
    expect(reduzido).toContain('.' + classe)
  })

  it('nenhum @keyframes anima propriedade que refaz o layout', () => {
    const proibidas = /(^|[\s;{])(height|width|margin|padding|top|left|right|bottom)\s*:/
    const culpados: string[] = []
    const re = /@keyframes\s+([a-z0-9-]+)\s*\{/g
    let m: RegExpExecArray | null
    while ((m = re.exec(CSS)) !== null) {
      let prof = 0
      const abre = CSS.indexOf('{', m.index)
      for (let j = abre; j < CSS.length; j++) {
        if (CSS[j] === '{') prof++
        else if (CSS[j] === '}') {
          prof--
          if (prof === 0) {
            if (proibidas.test(CSS.slice(abre, j))) culpados.push(m[1])
            break
          }
        }
      }
    }
    expect(culpados).toEqual([])
  })
})
