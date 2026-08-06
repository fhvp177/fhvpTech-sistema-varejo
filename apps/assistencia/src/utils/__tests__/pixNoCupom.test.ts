// A regra do QR no cupom é simples de dizer e tem um erro caro escondido no
// valor: TODO cupom impresso sai com QR (decisão do lojista em 2026-08-06), e o
// QR cobra o SALDO quando ainda falta pagar, ou o TOTAL quando não falta nada.
//
// O erro caro é cobrar o total em cima de quem já pagou uma parte: venda com
// entrada, parcelada no meio do caminho. Aí o QR tem que pedir só o que resta —
// pedir o total é cobrar duas vezes o que já entrou.
//
// O que NÃO é erro, e está aqui documentado de propósito: a reimpressão de uma
// venda inteiramente quitada também sai com QR do valor cheio. É o preço
// aceito pra que a venda à vista — que nasce marcada como paga no instante em
// que o cupom é impresso — leve QR pro cliente escanear ali no balcão.

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

// Procura o bloco pela classe, não pelo título: o título muda conforme o cupom
// tenha ou não saldo em aberto, e um detector preso à palavra "PAGUE" daria
// "cupom sem QR" justamente nos cupons já pagos, que é onde ele mais engana.
const temQr = (html: string): boolean => html.includes('class="pix-bloco"')

const valorImpresso = (html: string): string | null =>
  /<div class="pix-valor">R\$ ([\d.,]+)<\/div>/.exec(html)?.[1] ?? null

const tituloImpresso = (html: string): string | null =>
  /<div class="pix-titulo">([^<]+)<\/div>/.exec(html)?.[1] ?? null

describe('quando o QR aparece no cupom', () => {
  it('aparece na venda a prazo', () => {
    expect(temQr(gerarHtmlCupomVenda(venda(), LOJA))).toBe(true)
  })

  it('aparece na venda em atraso', () => {
    const atrasada = venda({ status_pagamento: 'inadimplente', valor_pago: 0 })
    expect(temQr(gerarHtmlCupomVenda(atrasada, LOJA))).toBe(true)
  })

  it('aparece na venda à vista, que é o caso mais comum da loja', () => {
    // Ela nasce paga: valor_pago igual ao total, sem vencimento. Enquanto o QR
    // dependia de saldo, era justamente aqui que ele NUNCA saía — e é aqui que
    // o cliente está de pé no balcão com o celular na mão.
    const aVista = venda({ status_pagamento: 'pago', valor_pago: 200, data_vencimento: null })
    expect(temQr(gerarHtmlCupomVenda(aVista, LOJA))).toBe(true)
  })

  it('aparece também na reimpressão de venda já quitada — risco aceito', () => {
    // O fiado que o cliente terminou de pagar vira `pago`, igual à venda à
    // vista, e o cupom não tem como distinguir os dois. O lojista foi avisado
    // de que esse papel convida a pagar de novo e manteve a decisão. Este teste
    // existe pra que a escolha seja explícita: se um dia ele mudar de ideia, é
    // este teste que vira vermelho primeiro e mostra onde mexer.
    const fiadoQuitado = venda({ status_pagamento: 'pago', valor_pago: 200 })
    expect(temQr(gerarHtmlCupomVenda(fiadoQuitado, LOJA))).toBe(true)
  })

  it('NÃO aparece quando o lojista não configurou a chave', () => {
    expect(temQr(gerarHtmlCupomVenda(venda(), SEM_PIX))).toBe(false)
  })

  it('NÃO aparece quando falta a cidade da loja', () => {
    // Sem cidade o padrão do PIX não fecha. Melhor cupom sem QR que cupom com
    // QR que nenhum banco lê.
    expect(temQr(gerarHtmlCupomVenda(venda(), { ...LOJA, cidade: '' }))).toBe(false)
  })

  it('NÃO aparece quando a venda não cobra nada', () => {
    // Brinde, bonificação, desconto de 100%: não há valor pra cobrar, e o
    // padrão do PIX não aceita R$ 0,00. Cupom sai normal, sem QR.
    const brinde = venda({
      total: 0,
      valor_pago: 0,
      itens: [{ produto_nome: 'Brinde', quantidade: 1, preco_unitario: 0 }]
    })
    expect(temQr(gerarHtmlCupomVenda(brinde, LOJA))).toBe(false)
  })

  it('sobrevive a uma loja recém-instalada, sem nada preenchido', () => {
    expect(() => gerarHtmlCupomVenda(venda(), LOJA_PADRAO)).not.toThrow()
    expect(temQr(gerarHtmlCupomVenda(venda(), LOJA_PADRAO))).toBe(false)
  })
})

describe('quanto o QR cobra', () => {
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

  it('cobra o total na venda à vista, onde o saldo já nasce zerado', () => {
    const aVista = venda({ status_pagamento: 'pago', valor_pago: 200, data_vencimento: null })
    expect(valorImpresso(gerarHtmlCupomVenda(aVista, LOJA))).toBe('200,00')
  })

  it('cobra o total, e não o troco, quando o cliente pagou a mais', () => {
    // valor_pago acima do total deixaria o saldo negativo. O QR não pode nascer
    // pedindo um valor negativo nem R$ 0,00 — cai no total, como qualquer
    // cupom de venda quitada.
    const comTroco = venda({ status_pagamento: 'pago', valor_pago: 250 })
    expect(valorImpresso(gerarHtmlCupomVenda(comTroco, LOJA))).toBe('200,00')
  })
})

describe('como o bloco se chama', () => {
  // O papel não pode se contradizer. Com dívida em aberto, "PAGUE" é um convite
  // legítimo. Sem dívida, a linha de pagamento já carimbou "Pago" — mandar
  // pagar logo abaixo disso lê como cobrança de algo que o cliente já quitou.
  it('manda pagar quando o cliente ainda deve', () => {
    expect(tituloImpresso(gerarHtmlCupomVenda(venda(), LOJA))).toBe('PAGUE COM PIX')
  })

  it('vira etiqueta, e não ordem, no cupom que diz "Pago"', () => {
    const aVista = venda({ status_pagamento: 'pago', valor_pago: 200, data_vencimento: null })
    const html = gerarHtmlCupomVenda(aVista, LOJA)
    // As duas coisas juntas no mesmo papel — é o par que importa, não cada
    // metade: este é exatamente o cupom onde "PAGUE" se contradizia.
    expect(html).toContain('<td>Pago</td>')
    expect(tituloImpresso(html)).toBe('PAGAMENTO POR PIX')
  })

  it('manda pagar na venda em atraso, onde a cobrança é o ponto', () => {
    const atrasada = venda({ status_pagamento: 'inadimplente', valor_pago: 0 })
    expect(tituloImpresso(gerarHtmlCupomVenda(atrasada, LOJA))).toBe('PAGUE COM PIX')
  })

  it('manda pagar quando sobrou saldo depois da entrada', () => {
    const comEntrada = venda({ total: 200, entrada: 80, valor_pago: 80 })
    expect(tituloImpresso(gerarHtmlCupomVenda(comEntrada, LOJA))).toBe('PAGUE COM PIX')
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
    const pix = html.indexOf('class="pix-bloco"')
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
