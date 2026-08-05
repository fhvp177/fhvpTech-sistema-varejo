// A regra do QR no cupom tem uma cara só e um erro caro: imprimir o convite a
// pagar num comprovante de venda JÁ PAGA. O cliente pagou em dinheiro, leva o
// papel pra casa, escaneia à noite e paga de novo — e o sistema não tem como
// saber, porque QR em papel não avisa ninguém.
//
// O outro erro caro é o valor: cobrar o total quando já houve entrada ou
// parcela paga. Estes testes fixam os dois.

import { describe, it, expect } from 'vitest'
import { gerarHtmlCupomVenda, type DadosCupomVenda } from '../cupomVenda'
import { LOJA_PADRAO, type DadosLoja } from '../dadosLoja'

const LOJA: DadosLoja = {
  ...LOJA_PADRAO,
  nome: 'Loja Teste',
  razao_social: 'Loja Teste Comercio Ltda',
  cidade: 'Fortaleza',
  uf: 'CE',
  pix_chave: '123e4567-e12b-12d1-a456-426655440000'
}

const SEM_PIX: DadosLoja = { ...LOJA, pix_chave: '' }

function venda(sobrepor: Partial<DadosCupomVenda> = {}): DadosCupomVenda {
  return {
    id: 59,
    data: '2026-08-01T16:06:00',
    total: 200,
    valor_pago: 0,
    status_pagamento: 'pendente',
    data_vencimento: '2026-08-03',
    num_parcelas: null,
    cliente_nome: 'Cliente Teste',
    itens: [{ produto_nome: 'Produto Teste', quantidade: 1, preco_unitario: 200 }],
    parcelas: [],
    ...sobrepor
  }
}

const temQr = (html: string): boolean => html.includes('PAGUE COM PIX')

describe('quando o QR aparece no cupom', () => {
  it('aparece na venda a prazo, que é onde ele serve pra alguma coisa', () => {
    expect(temQr(gerarHtmlCupomVenda(venda(), LOJA))).toBe(true)
  })

  it('NÃO aparece na venda já paga', () => {
    // O erro caro do recurso. Venda à vista sai com valor_pago igual ao total.
    const paga = venda({ status_pagamento: 'pago', valor_pago: 200 })
    expect(temQr(gerarHtmlCupomVenda(paga, LOJA))).toBe(false)
  })

  it('NÃO aparece quando a parcelada foi toda quitada', () => {
    const quitada = venda({ status_pagamento: 'parcelado', num_parcelas: 3, valor_pago: 200 })
    expect(temQr(gerarHtmlCupomVenda(quitada, LOJA))).toBe(false)
  })

  it('aparece na venda em atraso', () => {
    const atrasada = venda({ status_pagamento: 'inadimplente', valor_pago: 0 })
    expect(temQr(gerarHtmlCupomVenda(atrasada, LOJA))).toBe(true)
  })

  it('NÃO aparece quando o lojista não configurou a chave', () => {
    expect(temQr(gerarHtmlCupomVenda(venda(), SEM_PIX))).toBe(false)
  })

  it('NÃO aparece quando falta a cidade da loja', () => {
    // Sem cidade o padrão do PIX não fecha. Melhor cupom sem QR que cupom com
    // QR que nenhum banco lê.
    expect(temQr(gerarHtmlCupomVenda(venda(), { ...LOJA, cidade: '' }))).toBe(false)
  })

  it('sobrevive a uma loja recém-instalada, sem nada preenchido', () => {
    expect(() => gerarHtmlCupomVenda(venda(), LOJA_PADRAO)).not.toThrow()
    expect(temQr(gerarHtmlCupomVenda(venda(), LOJA_PADRAO))).toBe(false)
  })
})

describe('quanto o QR cobra', () => {
  const valorImpresso = (html: string): string | null =>
    /<div class="pix-valor">R\$ ([\d.,]+)<\/div>/.exec(html)?.[1] ?? null

  it('cobra o saldo, não o total, quando houve entrada', () => {
    // Venda de 200 com 80 de entrada: o QR tem que pedir 120. Pedir 200 aqui
    // seria cobrar a entrada duas vezes.
    const comEntrada = venda({ total: 200, entrada: 80, valor_pago: 80 })
    expect(valorImpresso(gerarHtmlCupomVenda(comEntrada, LOJA))).toBe('120,00')
  })

  it('desconta as parcelas já pagas', () => {
    const meioPaga = venda({ status_pagamento: 'parcelado', num_parcelas: 4, valor_pago: 150 })
    expect(valorImpresso(gerarHtmlCupomVenda(meioPaga, LOJA))).toBe('50,00')
  })

  it('cobra o total quando nada foi pago', () => {
    expect(valorImpresso(gerarHtmlCupomVenda(venda(), LOJA))).toBe('200,00')
  })
})

describe('o bloco impresso', () => {
  const html = gerarHtmlCupomVenda(venda(), LOJA)

  it('imprime o nome do recebedor pro cliente conferir', () => {
    // Defesa contra troca do QR: quadradinho preto é tudo igual, mas o nome no
    // app do banco tem que bater com o nome no papel.
    expect(html).toContain('Recebedor: Loja Teste')
    expect(html).toContain('Confira este nome no app do banco')
  })

  it('desenha o QR como SVG, e não como imagem esticada', () => {
    expect(html).toContain('<svg')
    expect(html).toContain('crispEdges')
  })

  it('cabe na faixa que a cabeça térmica alcança', () => {
    // 68mm é o corpo do cupom. QR mais largo que isso não sai cortado: some.
    const larguras = [...html.matchAll(/width:([\d.]+)mm/g)].map((m) => Number(m[1]))
    expect(larguras.length, 'o QR precisa ter largura declarada em mm').toBeGreaterThan(0)
    for (const mm of larguras) expect(mm).toBeLessThan(68)
  })

  it('vem depois do bloco de pagamento e antes do aviso de não fiscal', () => {
    // Posição importa: o QR só faz sentido logo abaixo do valor que ele cobra.
    const pagamento = html.indexOf('PAGAMENTO')
    const pix = html.indexOf('PAGUE COM PIX')
    const aviso = html.indexOf('não é documento fiscal')
    expect(pagamento).toBeGreaterThan(-1)
    expect(pix).toBeGreaterThan(pagamento)
    expect(aviso).toBeGreaterThan(pix)
  })

  it('leva junto o estilo do bloco', () => {
    // O HTML do cupom é autocontido — vai inteiro pra janela de impressão. Se o
    // CSS não for junto, o bloco sai desalinhado e o QR pode sair do tamanho
    // errado.
    expect(html).toContain('.pix-bloco')
    expect(html).toContain('.pix-qr svg')
  })

  it('escapa o nome da loja em vez de jogar como HTML', () => {
    // A marcação tem que sair como TEXTO. Nome curto de propósito: o
    // beneficiário é cortado em 25 caracteres, e uma injeção longa sumiria pelo
    // corte — o teste passaria sem escape nenhum e não estaria provando nada.
    const saida = gerarHtmlCupomVenda(venda(), { ...LOJA, nome: 'Loja <b>X</b>' })
    expect(saida).toContain('Recebedor: Loja &lt;b&gt;X&lt;/b&gt;')
    expect(saida).not.toContain('Recebedor: Loja <b>')
  })
})
