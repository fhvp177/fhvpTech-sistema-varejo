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

/**
 * ── Trava 3: a sanfona é a ÚNICA exceção, e ela é curta ─────────────────────
 *
 * As travas acima inspecionam `@keyframes`. Uma `transition:` passava por elas
 * sem ser vista — o que significa que qualquer pessoa poderia animar `height`
 * amanhã, com a melhor das intenções, e nada acusaria.
 *
 * A sanfona das Configurações abriu essa exceção de propósito: recolher uma
 * seção É mudar a altura, e a tela de Configurações é aberta por vontade
 * própria, poucas vezes, sem ninguém esperando atrás — o imposto de 300x por
 * dia que condena animação decorativa nas telas de trabalho não incide ali.
 *
 * O que estes testes prendem não é a existência da exceção: é o TAMANHO dela.
 * Uma sanfona de 120ms é imperceptível como custo; a mesma sanfona em 400ms,
 * num formulário grande, engasga no PC de loja. Duração é o único parâmetro que
 * separa as duas, e é ele que fica pinado aqui.
 *
 * Se este teste ficar vermelho porque alguém precisou de uma segunda exceção:
 * a resposta certa quase nunca é adicionar à lista. É perguntar se dava pra
 * animar `opacity`/`transform` em vez de layout.
 */
describe('transições que mexem em layout', () => {
  const LAYOUT = '(height|width|margin|padding|top|left|right|bottom|grid-template-rows)'
  // O `reduzido` do describe acima é local dele; aqui se recalcula a partir do
  // mesmo helper de módulo.
  const blocoReduzido = blocosReduzidos(CSS)

  /** Toda declaração `transition:` do arquivo, com o seletor que a carrega. */
  function transicoes(fonte: string): Array<{ seletor: string; decl: string }> {
    // Os comentários saem ANTES de parsear. Sem isto, o que vem antes de uma
    // regra — e aqui vem um bloco de 30 linhas explicando a exceção — é colhido
    // junto como se fosse parte do seletor.
    const css = fonte.replace(/\/\*[\s\S]*?\*\//g, '')
    const achadas: Array<{ seletor: string; decl: string }> = []
    const re = /([^{}]+)\{([^}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(css)) !== null) {
      const decl = m[2]
      if (!/transition\s*:/.test(decl)) continue
      achadas.push({ seletor: m[1].trim().replace(/\s+/g, ' '), decl })
    }
    return achadas
  }

  const comLayout = transicoes(CSS).filter((t) =>
    new RegExp(`transition:[^;]*\\b${LAYOUT}\\b`).test(t.decl.replace(/\s+/g, ' '))
  )

  // A exceção é um PAR (seletor, propriedade) — não um seletor com passe livre.
  //
  // Duas versões deste teste já foram furadas em conferência. A primeira casava
  // o seletor por substring, e `.anim-sanfona-outra` entrava de carona. A
  // segunda usou lista exata de seletores, e aí passou trocar o
  // `grid-template-rows` por `height` DENTRO da própria sanfona — a porta certa,
  // com a carga errada. Exceção que não diz o que exatamente permite não é
  // exceção: é sala aberta.
  const PERMITIDO: Record<string, string> = { '.anim-sanfona': 'grid-template-rows' }

  it('só a sanfona anima propriedade de layout', () => {
    const forasteiros = comLayout.filter((t) => !(t.seletor in PERMITIDO))
    expect(forasteiros.map((t) => t.seletor)).toEqual([])
  })

  it('e mesmo ela só pode animar a trilha do grid, nunca height/max-height', () => {
    for (const t of comLayout) {
      const propriedades = [...t.decl.matchAll(new RegExp(`\\b${LAYOUT}\\b`, 'g'))].map(
        (m) => m[0]
      )
      for (const prop of propriedades) expect(prop).toBe(PERMITIDO[t.seletor])
    }
  })

  it('a exceção existe mesmo (senão as asserções abaixo viram teatro)', () => {
    expect(comLayout.length).toBeGreaterThan(0)
  })

  it('e ela dura no máximo 150ms', () => {
    for (const t of comLayout) {
      const duracoes = [...t.decl.matchAll(/(\d+)ms/g)].map((d) => Number(d[1]))
      expect(duracoes.length).toBeGreaterThan(0)
      for (const ms of duracoes) expect(ms).toBeLessThanOrEqual(150)
    }
  })

  it('a sanfona é desligada em prefers-reduced-motion', () => {
    // Fronteira de palavra, não substring: `.anim-sanfona-conteudo` sozinho
    // satisfazia um `toContain('.anim-sanfona')` e deixava a CAIXA continuar
    // animando para quem pediu menos movimento. São duas classes distintas e as
    // duas precisam ser desligadas.
    expect(blocoReduzido).toMatch(/\.anim-sanfona(?![\w-])/)
    expect(blocoReduzido).toMatch(/\.anim-sanfona-conteudo(?![\w-])/)
  })

  it('e o conteúdo dela fica VISÍVEL com movimento reduzido', () => {
    // Sem isto, desligar só a transição congelaria o conteúdo em opacity 0 e a
    // seção abriria vazia para quem pediu menos movimento — trocar animação por
    // tela quebrada é pior que a animação.
    expect(blocoReduzido).toMatch(/anim-sanfona-conteudo[\s\S]*opacity:\s*1/)
  })
})
