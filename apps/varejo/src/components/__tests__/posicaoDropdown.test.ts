/**
 * Onde a lista abre, e de que tamanho.
 *
 * ── O defeito que isto prende ───────────────────────────────────────────────
 * A versão anterior fazia o óbvio — `top = campo.bottom`, altura fixa de 288px —
 * e funcionava em quase toda tela. Só quebrava quando o campo ficava perto do
 * rodapé da janela: a caixa da lista atravessava a borda, e as últimas opções
 * ficavam fora da tela **para sempre**.
 *
 * O que fez o bug sobreviver a uma release inteira é que ele PARECE funcionar: a
 * lista tem barra de rolagem, ela rola, o usuário rola até o fim — e as duas
 * últimas opções continuam sem aparecer, porque o fim da CAIXA está fora da
 * janela e rolar por dentro nunca traz de volta o que está fora. Foi assim que
 * o usuário achou: escolhendo parcelas num diálogo alto.
 *
 * Por isso a decisão virou função pura: dá pra afirmar aqui, sem navegador, que
 * a lista nunca ultrapassa a borda — que é a propriedade que interessa.
 */
import { describe, it, expect } from 'vitest'
import {
  posicaoDropdown,
  ALTURA_MAXIMA,
  type RetanguloCampo
} from '@fhvptech/core/lib/posicaoDropdown'

const JANELA = { innerHeight: 1000 }
const campo = (top: number, altura = 40): RetanguloCampo => ({
  left: 100,
  top,
  bottom: top + altura,
  width: 300
})

/** Onde a lista termina na tela, aberta pra baixo ou pra cima. */
function limites(p: ReturnType<typeof posicaoDropdown>, janela = JANELA) {
  if (p.top != null) return { inicio: p.top, fim: p.top + p.maxHeight }
  const fim = janela.innerHeight - (p.bottom ?? 0)
  return { inicio: fim - p.maxHeight, fim }
}

describe('posição da lista do dropdown', () => {
  it('campo no topo: abre pra baixo, com a altura cheia', () => {
    const p = posicaoDropdown(campo(100), JANELA)
    expect(p.top).toBe(140)
    expect(p.bottom).toBeUndefined()
    expect(p.maxHeight).toBe(ALTURA_MAXIMA)
  })

  it('mantém a largura e a margem esquerda do campo', () => {
    const p = posicaoDropdown(campo(100), JANELA)
    expect(p.left).toBe(100)
    expect(p.width).toBe(300)
  })

  it('⚠️ campo perto do rodapé: a lista ENCOLHE em vez de vazar pra fora', () => {
    // Campo terminando em 800, janela de 1000: sobram 200px (menos a margem).
    // A versão antiga devolveria 288 de altura e 88px ficariam fora da tela.
    const p = posicaoDropdown(campo(760), JANELA)
    expect(p.top).toBe(800)
    expect(p.maxHeight).toBeLessThan(ALTURA_MAXIMA)
    expect(limites(p).fim).toBeLessThanOrEqual(JANELA.innerHeight)
  })

  it('campo colado no rodapé: VIRA pra cima', () => {
    // Sobram 40px embaixo — inutilizável. Em cima há 920.
    const p = posicaoDropdown(campo(920), JANELA)
    expect(p.top).toBeUndefined()
    expect(p.bottom).toBe(JANELA.innerHeight - 920)
    expect(p.maxHeight).toBe(ALTURA_MAXIMA)
  })

  it('virada pra cima, a lista não passa do topo da janela', () => {
    // Campo alto na tela E sem espaço embaixo: janela curta.
    const janelaBaixa = { innerHeight: 300 }
    const p = posicaoDropdown(campo(250, 40), janelaBaixa)
    const l = limites(p, janelaBaixa)
    expect(l.inicio).toBeGreaterThanOrEqual(0)
    expect(l.fim).toBeLessThanOrEqual(janelaBaixa.innerHeight)
  })

  it('a lista NUNCA ultrapassa a janela, em nenhuma altura de campo', () => {
    // A propriedade que realmente importa, varrida de ponta a ponta.
    for (let topo = 0; topo <= 960; topo += 10) {
      const p = posicaoDropdown(campo(topo), JANELA)
      const l = limites(p)
      expect(l.inicio).toBeGreaterThanOrEqual(0)
      expect(l.fim).toBeLessThanOrEqual(JANELA.innerHeight)
    }
  })

  it('prefere abrir pra BAIXO quando os dois lados servem', () => {
    // É pra onde a pessoa espera que abra; virar sem necessidade assusta.
    const p = posicaoDropdown(campo(400), JANELA)
    expect(p.top).toBeDefined()
  })

  it('janela minúscula não gera altura negativa, nos DOIS ramos', () => {
    // `maxHeight: -4px` é CSS inválido: o navegador ignora a regra e a lista
    // volta a crescer sem limite — ou seja, o bug original de volta pela porta
    // dos fundos. Os dois ramos (abre pra baixo / vira pra cima) precisam do
    // piso em zero, e o primeiro teste que escrevi só exercitava um deles.
    const paraCima = posicaoDropdown(campo(10), { innerHeight: 30 })
    expect(paraCima.bottom).toBeDefined()
    expect(paraCima.maxHeight).toBeGreaterThanOrEqual(0)

    // Janela mais curta que o próprio campo, com o campo no topo: aqui sobra
    // mais espaço embaixo (ainda que negativo), então cai no ramo de baixo.
    const paraBaixo = posicaoDropdown(campo(0), { innerHeight: 44 })
    expect(paraBaixo.top).toBeDefined()
    expect(paraBaixo.maxHeight).toBeGreaterThanOrEqual(0)
  })
})
