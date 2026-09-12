/**
 * Como cada linha do histórico de dinheiro da venda é chamada.
 *
 * ── O que este arquivo prende ───────────────────────────────────────────────
 *
 *  1. ★ **A ORDEM das perguntas.** O estorno é testado primeiro porque ele
 *     também carrega origem 'venda' ou 'parcela'. Classificado pela origem
 *     antes do tipo, um estorno de parcela vira "Parcela 2" — e a tela mostra a
 *     mesma parcela paga duas vezes, uma delas negativa.
 *
 *  2. **"Sinal" e "Saldo" são derivados, nunca gravados.** Os dois nomes
 *     dependem de um fato de fora do movimento: a venda ter nascido com
 *     entrada. Sem esse fato, a mesma linha é só "Pagamento".
 *
 *  3. **Forma desconhecida vira travessão, não "Dinheiro".** Venda anterior ao
 *     campo não recebe chute — é a mesma regra de `rotuloForma`.
 */
import { describe, it, expect } from 'vitest'
import { rotuloDoMovimento, montarHistorico, totalLancado } from '../recebimentosVenda'
import type { MovimentoDaVenda } from '../recebimentosVenda'

const mov = (extra: Partial<MovimentoDaVenda> = {}): MovimentoDaVenda => ({
  id: 1,
  data: '2026-09-07 10:00:00',
  valor: 185,
  tipo: 'venda',
  forma_pagamento: 'pix',
  conta_id: 2,
  conta_nome: 'Nubank',
  origem_tipo: 'venda',
  parcela_numero: null,
  ...extra
})

describe('o nome de cada linha', () => {
  it('★ o que entrou ao fechar uma venda COM entrada é o sinal', () => {
    expect(rotuloDoMovimento(mov(), true)).toBe('Sinal')
  })

  it('a mesma linha, numa venda sem entrada, é só o pagamento', () => {
    // Venda à vista: o dinheiro que entrou ao fechar é a venda inteira.
    expect(rotuloDoMovimento(mov(), false)).toBe('Pagamento')
  })

  it('★ o recebimento posterior de uma venda que teve sinal é o saldo', () => {
    expect(rotuloDoMovimento(mov({ tipo: 'recebimento' }), true)).toBe('Saldo')
  })

  it('sem sinal antes, o recebimento posterior não se chama saldo', () => {
    // Fiado pago depois, sem entrada nenhuma: não há "saldo" de coisa alguma.
    expect(rotuloDoMovimento(mov({ tipo: 'recebimento' }), false)).toBe('Pagamento')
  })

  it('a baixa de parcela traz o número', () => {
    expect(
      rotuloDoMovimento(mov({ tipo: 'recebimento', origem_tipo: 'parcela', parcela_numero: 2 }), true)
    ).toBe('Parcela 2')
  })

  it('parcela sem número não vira "Parcela null"', () => {
    expect(
      rotuloDoMovimento(mov({ tipo: 'recebimento', origem_tipo: 'parcela' }), true)
    ).toBe('Parcela')
  })

  it('★ estorno DE PARCELA é estorno, não parcela', () => {
    // Se a origem for consultada antes do tipo, isto vira "Parcela 2" e a lista
    // passa a mostrar a mesma parcela recebida duas vezes.
    expect(
      rotuloDoMovimento(
        mov({ tipo: 'estorno', valor: -185, origem_tipo: 'parcela', parcela_numero: 2 }),
        true
      )
    ).toBe('Estorno')
  })

  it('valor negativo é estorno mesmo se o tipo vier com outro nome', () => {
    // Dinheiro saindo é dinheiro saindo. O sinal do valor é o fato; o `tipo` é
    // texto livre no banco e pode vir de um caminho que ainda não existe.
    expect(rotuloDoMovimento(mov({ tipo: 'ajuste', valor: -50 }), true)).toBe('Estorno')
  })
})

describe('a lista pronta para a tela', () => {
  it('traz o meio de pagamento por extenso', () => {
    const [linha] = montarHistorico([mov()], true)
    expect(linha.forma).toBe('PIX')
    expect(linha.conta).toBe('Nubank')
    expect(linha.ehEstorno).toBe(false)
  })

  it('★ forma que não conhecemos vira nulo, nunca um chute', () => {
    expect(montarHistorico([mov({ forma_pagamento: null })], true)[0].forma).toBeNull()
    expect(montarHistorico([mov({ forma_pagamento: 'vale-refeicao' })], true)[0].forma).toBeNull()
  })

  it('crediário continua tendo nome: é o que as vendas antigas gravaram', () => {
    // Antes de 12/09/2026 o sinal ia ao livro carimbado assim. A linha velha
    // tem que continuar legível — o conserto não reescreve o passado.
    expect(montarHistorico([mov({ forma_pagamento: 'crediario' })], true)[0].forma).toBe('Crediário')
  })

  it('marca o estorno para a tela pintar de vermelho', () => {
    const [linha] = montarHistorico([mov({ tipo: 'estorno', valor: -185 })], true)
    expect(linha.ehEstorno).toBe(true)
    expect(linha.valor).toBe(-185)
  })
})

describe('o total lançado', () => {
  it('★ desconta o que foi estornado', () => {
    const total = totalLancado([
      mov({ id: 1, valor: 185 }),
      mov({ id: 2, valor: 185, tipo: 'recebimento' }),
      mov({ id: 3, valor: -185, tipo: 'estorno' })
    ])
    expect(total).toBe(185)
  })

  it('lista vazia é zero, não erro', () => {
    expect(totalLancado([])).toBe(0)
  })

  it('não deixa resíduo de centavo', () => {
    expect(totalLancado([mov({ valor: 0.1 }), mov({ id: 2, valor: 0.2 })])).toBe(0.3)
  })
})
