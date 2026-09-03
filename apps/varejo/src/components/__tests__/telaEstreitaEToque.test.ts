/**
 * O sistema tem que servir num tablet — deitado e em pé.
 *
 * ── Por que este arquivo lê CSS e JSX em vez de medir a tela ─────────────────
 * O que se quer provar aqui é layout: alvo grande o bastante para o dedo,
 * tabela que rola em vez de cortar, menu que sai da frente numa tela estreita.
 * Nada disso o jsdom calcula — ele não faz layout, não tem viewport de verdade
 * e não conhece `any-pointer`. Medir de mentira daria um teste que passa
 * enquanto o lojista não consegue tocar no botão.
 *
 * Então aqui ficam as travas estruturais: as peças existem, e continuam ligadas
 * onde precisam estar. A conferência de olho é no roteiro manual, no aparelho.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = join(AQUI, '..', '..')
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8')
const APP = readFileSync(join(SRC, 'App.tsx'), 'utf8')

/**
 * Só o bloco de toque, delimitado pelo `@media print` que vem logo depois.
 *
 * Recortar por número de caracteres pareceria mais simples e seria uma
 * armadilha: bastaria um seletor mais longo para a janela deixar de alcançar o
 * que se quer conferir, e o teste reprovaria sem nada estar errado.
 */
function blocoDeToque(): string {
  const inicio = CSS.indexOf('any-pointer: coarse')
  if (inicio === -1) return ''
  const resto = CSS.slice(inicio)
  const fim = resto.indexOf('@media print')
  return fim > 0 ? resto.slice(0, fim) : resto
}

function arquivosDeTela(dir: string): string[] {
  const achados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__') continue
      achados.push(...arquivosDeTela(caminho))
    } else if (nome.endsWith('.tsx')) {
      achados.push(caminho)
    }
  }
  return achados
}

describe('o dedo alcança os alvos', () => {
  /**
   * A regra mora no CSS, e não espalhada em 67 classes, por um motivo: subir
   * o tamanho nas telas engordaria também a janela do desktop, onde o mouse
   * acerta 32px sem esforço.
   */
  it('existe um bloco para ponteiro grosso', () => {
    expect(CSS, 'o bloco de toque sumiu do index.css').toContain('any-pointer: coarse')
  })

  it('e ele é `any-pointer`, não `pointer`', () => {
    // O tablet do lojista tem teclado acoplado, e nesse arranjo o navegador
    // pode declarar o ponteiro PRINCIPAL como fino. `pointer: coarse` deixaria
    // as regras de fora justamente no aparelho para o qual foram escritas.
    expect(blocoDeToque()).toContain('min-height: 44px')
  })

  /**
   * Ponteiro grosso sozinho não basta: um notebook Windows com tela sensível
   * também casa, e receberia os alvos maiores — mudando a aparência de quem já
   * usa o aplicativo instalado e nunca pediu isso.
   */
  it('as regras valem só na página servida pelo navegador', () => {
    const seletores = blocoDeToque()
      .split(/\r?\n/)
      .filter((l) => l.trim().endsWith(',') || l.trim().endsWith('{'))
      .filter((l) => !l.includes('@media') && !l.trim().startsWith('*') && !l.trim().startsWith('/'))
      .filter((l) => l.trim().length > 1)

    const soltos = seletores.filter((l) => !l.includes("[data-alvo='web']"))
    expect(soltos, 'seletor sem [data-alvo=web] vaza para o app instalado').toEqual([])
  })

  it('e a página web se identifica no boot', () => {
    const entrada = readFileSync(join(SRC, 'main.web.tsx'), 'utf8')
    expect(entrada, 'sem esta marca, nenhuma regra de toque aplica').toContain(
      "dataset.alvo = 'web'"
    )
  })

  it('44px, que é o mínimo que o dedo pede', () => {
    expect(CSS).toMatch(/min-height:\s*44px/)
    expect(CSS, 'botão só de ícone também precisa de largura').toMatch(/min-width:\s*44px/)
  })

  /**
   * A tabela corta o nome e deixa o inteiro no `title`, que no toque não
   * existe. Sem isto, "aliança ouro 18k 4mm" e "aliança ouro 18k 6mm" ficam
   * indistinguíveis na tela do lojista.
   */
  it('nome cortado volta a caber quando não há hover', () => {
    const bloco = blocoDeToque()
    expect(bloco).toContain('td .truncate')
    expect(bloco).toMatch(/white-space:\s*normal/)
  })
})

describe('a tela estreita cabe', () => {
  it('a barra lateral vira gaveta abaixo de lg', () => {
    expect(APP, 'a gaveta perdeu o estado').toContain('menuAberto')
    expect(APP, 'sem `lg:static` ela ficaria por cima também na tela larga').toContain('lg:static')
    expect(APP).toContain('lg:translate-x-0')
  })

  it('há como abrir e como fechar sem escolher nada', () => {
    expect(APP, 'sumiu o botão que abre').toContain('Abrir menu')
    expect(APP, 'sumiu o véu que fecha ao tocar fora').toContain('Fechar menu')
  })

  /**
   * O desktop não pode ganhar uma faixa vazia que nunca existiu: a barra de
   * cima só aparecia para o gerente, por causa do sino.
   */
  it('a barra de cima continua escondida para vendedor em tela larga', () => {
    expect(APP).toContain("vendedor?.papel === 'dono' ? '' : 'lg:hidden'")
  })

  /**
   * Tabela sem rolagem horizontal corta coluna em silêncio — o lojista não vê
   * que existe mais à direita. Já aconteceu antes com `overflow-hidden`.
   */
  it('toda tabela pode rolar de lado', () => {
    const semRolagem = arquivosDeTela(SRC)
      .filter((f) => {
        const fonte = readFileSync(f, 'utf8')
        return fonte.includes('<table') && !/overflow-(x-)?auto|overflow-x-scroll/.test(fonte)
      })
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, '/'))

    expect(
      semRolagem,
      'tabela sem rolagem horizontal: em tela estreita ela corta coluna sem avisar'
    ).toEqual([])
  })
})
