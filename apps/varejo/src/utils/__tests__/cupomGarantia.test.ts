/**
 * A garantia impressa no cupom.
 *
 * ── Por que isto merece teste próprio ───────────────────────────────────────
 * O cupom é a prova que fica na mão do cliente. É ele que volta ao balcão daqui
 * a dois meses dizendo "está escrito aqui", e a data impressa passa a valer
 * mesmo que o sistema discorde depois.
 *
 * Os erros possíveis aqui são todos silenciosos: nada quebra, o papel sai, e a
 * diferença só aparece numa discussão com o cliente. São três:
 *
 *  1. **Imprimir só um prazo quando os itens têm prazos diferentes.** Encurta a
 *     garantia dos outros produtos no único documento que o cliente guarda.
 *  2. **Imprimir uma data para venda que não tem prazo congelado.** Venda
 *     anterior ao módulo: o sistema não sabe o que foi prometido, e um chute
 *     impresso vira promessa.
 *  3. **Errar a data por um dia.** Somar dias no fuso da máquina faz a virada
 *     do horário de verão empurrar a data, e um dia a menos numa garantia
 *     impressa é a loja recusando o cliente na data que o papel prometeu.
 */
import { describe, it, expect } from 'vitest'
import { gerarHtmlCupomVenda, type DadosCupomVenda } from '../cupomVenda'
import { LOJA_PADRAO, type DadosLoja } from '../dadosLoja'

const LOJA: DadosLoja = { ...LOJA_PADRAO, nome: 'Loja Teste', cidade: 'Cidade', uf: 'CE' }

type Item = DadosCupomVenda['itens'][number]

function venda(itens: Item[], sobrepor: Partial<DadosCupomVenda> = {}): DadosCupomVenda {
  return {
    id: 7,
    data: '2026-08-01T16:06:00',
    total: 100,
    valor_pago: 100,
    status_pagamento: 'pago',
    data_vencimento: null,
    num_parcelas: null,
    cliente_nome: 'Cliente Teste',
    itens,
    parcelas: [],
    ...sobrepor
  }
}

/** O miolo do bloco GARANTIA, sem o resto do cupom. */
function blocoGarantia(html: string): string | null {
  const m = /<div class="garantia">([\s\S]*?)<\/div>\s*\n/.exec(html)
  return m ? m[0] : null
}

const temSecaoGarantia = (html: string): boolean =>
  html.includes('<div class="titulo-secao">GARANTIA</div>')

describe('o bloco de garantia no cupom', () => {
  it('sai uma linha só quando todos os itens têm o mesmo prazo', () => {
    const html = gerarHtmlCupomVenda(
      venda([
        { produto_nome: 'Liquidificador', quantidade: 1, preco_unitario: 50, garantia_dias: 90 },
        { produto_nome: 'Batedeira', quantidade: 1, preco_unitario: 50, garantia_dias: 90 }
      ]),
      LOJA
    )
    expect(temSecaoGarantia(html)).toBe(true)
    const bloco = blocoGarantia(html)!
    expect(bloco).toContain('90 dias')
    // Uma linha só: os nomes dos produtos não aparecem no bloco.
    expect(bloco).not.toContain('Liquidificador')
    expect(bloco).not.toContain('Batedeira')
  })

  it('★ com prazos diferentes, sai UMA LINHA POR PRODUTO', () => {
    /*
     * Imprimir só um prazo aqui encurtaria a garantia do produto de 365 dias
     * para 90, no papel que o cliente guarda — e o papel ganha a discussão.
     */
    const html = gerarHtmlCupomVenda(
      venda([
        { produto_nome: 'Liquidificador', quantidade: 1, preco_unitario: 50, garantia_dias: 90 },
        { produto_nome: 'Furadeira', quantidade: 1, preco_unitario: 50, garantia_dias: 365 }
      ]),
      LOJA
    )
    const bloco = blocoGarantia(html)!
    expect(bloco).toContain('Liquidificador')
    expect(bloco).toContain('Furadeira')
    // 01/08/2026 + 90 dias = 30/10/2026; + 365 dias = 01/08/2027.
    expect(bloco).toContain('30/10/2026')
    expect(bloco).toContain('01/08/2027')
  })

  it('a data impressa é a data da venda mais o prazo, no calendário', () => {
    const html = gerarHtmlCupomVenda(
      venda([{ produto_nome: 'Produto', quantidade: 1, preco_unitario: 50, garantia_dias: 30 }]),
      LOJA
    )
    // 01/08/2026 + 30 dias = 31/08/2026.
    expect(blocoGarantia(html)!).toContain('31/08/2026')
  })

  it('atravessa a virada do ano sem errar', () => {
    const html = gerarHtmlCupomVenda(
      venda([{ produto_nome: 'Produto', quantidade: 1, preco_unitario: 50, garantia_dias: 90 }], {
        data: '2026-12-20T10:00:00'
      }),
      LOJA
    )
    // 20/12/2026 + 90 dias = 20/03/2027.
    expect(blocoGarantia(html)!).toContain('20/03/2027')
  })

  it('venda de produto sem garantia diz isso, e não imprime data', () => {
    const html = gerarHtmlCupomVenda(
      venda([{ produto_nome: 'Ponta de estoque', quantidade: 1, preco_unitario: 10, garantia_dias: 0 }]),
      LOJA
    )
    const bloco = blocoGarantia(html)!
    expect(bloco).toContain('não tem garantia')
    expect(bloco).not.toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('produto sem garantia no meio de outros aparece marcado na lista', () => {
    const html = gerarHtmlCupomVenda(
      venda([
        { produto_nome: 'Liquidificador', quantidade: 1, preco_unitario: 50, garantia_dias: 90 },
        { produto_nome: 'Brinde', quantidade: 1, preco_unitario: 0, garantia_dias: 0 }
      ]),
      LOJA
    )
    const bloco = blocoGarantia(html)!
    expect(bloco).toContain('Brinde: sem garantia')
    expect(bloco).toContain('Liquidificador: até 30/10/2026')
  })

  it('★ venda anterior ao módulo NÃO imprime bloco nenhum', () => {
    /*
     * Sem prazo congelado, o sistema não sabe o que foi prometido. Imprimir o
     * padrão de hoje transformaria um palpite em promessa assinada.
     */
    const html = gerarHtmlCupomVenda(
      venda([{ produto_nome: 'Produto antigo', quantidade: 1, preco_unitario: 50 }]),
      LOJA
    )
    expect(temSecaoGarantia(html)).toBe(false)
  })

  it('venda em parte antiga imprime só o que tem prazo, item por item', () => {
    const html = gerarHtmlCupomVenda(
      venda([
        { produto_nome: 'Produto novo', quantidade: 1, preco_unitario: 50, garantia_dias: 90 },
        { produto_nome: 'Produto antigo', quantidade: 1, preco_unitario: 50 }
      ]),
      LOJA
    )
    const bloco = blocoGarantia(html)!
    expect(bloco).toContain('Produto novo')
    expect(bloco).not.toContain('Produto antigo')
  })

  it('o nome do produto é escapado, como no resto do cupom', () => {
    const html = gerarHtmlCupomVenda(
      venda([
        { produto_nome: '<b>Camisa</b>', quantidade: 1, preco_unitario: 50, garantia_dias: 30 },
        { produto_nome: 'Outro', quantidade: 1, preco_unitario: 50, garantia_dias: 90 }
      ]),
      LOJA
    )
    const bloco = blocoGarantia(html)!
    expect(bloco).not.toContain('<b>Camisa</b>')
    expect(bloco).toContain('&lt;b&gt;Camisa&lt;/b&gt;')
  })
})
