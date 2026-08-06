// O QR do PIX é um enfeite no rodapé do cupom. O cupom é o documento que o
// lojista PRECISA imprimir pra entregar a venda.
//
// Estes dois nunca podem estar amarrados: se o desenho do QR falhar por
// qualquer motivo, o cupom tem que sair mesmo assim — só que sem o QR. O
// contrário (uma falha no enfeite impedindo a loja inteira de imprimir) seria
// trocar um recurso novo por uma parada de caixa.
//
// A biblioteca que desenha o QR é de terceiro e LANÇA EXCEÇÃO quando não
// consegue montar o código. É por isso que este teste força a exceção em vez de
// confiar que ela nunca acontece.

import { describe, it, expect, vi } from 'vitest'

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => {
    throw new Error('estourou ao desenhar o QR')
  }
}))

const { gerarHtmlCupomVenda } = await import('../cupomVenda')
const { qrPixParaDocumento } = await import('@fhvptech/core/lib/qrCodePix')
const { LOJA_PADRAO } = await import('../dadosLoja')
type DadosLoja = import('../dadosLoja').DadosLoja
type DadosCupomVenda = import('../cupomVenda').DadosCupomVenda

const LOJA: DadosLoja = {
  ...LOJA_PADRAO,
  nome: 'Loja Teste',
  cidade: 'Fortaleza',
  uf: 'CE',
  pix_chave: '123e4567-e12b-12d1-a456-426655440000'
}

const VENDA: DadosCupomVenda = {
  id: 59,
  data: '2026-08-01T16:06:00',
  total: 200,
  valor_pago: 0,
  status_pagamento: 'pendente',
  data_vencimento: '2026-08-03',
  num_parcelas: null,
  cliente_nome: 'Cliente Teste',
  itens: [{ produto_nome: 'Produto Teste', quantidade: 1, preco_unitario: 200 }],
  parcelas: []
}

describe('quando o desenho do QR quebra', () => {
  it('não deixa a exceção escapar', () => {
    expect(() =>
      qrPixParaDocumento({
        chave: LOJA.pix_chave,
        beneficiario: LOJA.nome,
        cidade: LOJA.cidade,
        valorACobrar: 200
      })
    ).not.toThrow()
  })

  it('o cupom continua sendo impresso, só que sem o QR', () => {
    // O ponto do arquivo inteiro. Sem a rede de proteção, esta chamada estoura
    // e o lojista não imprime cupom nenhum.
    let html = ''
    expect(() => {
      html = gerarHtmlCupomVenda(VENDA, LOJA)
    }).not.toThrow()

    expect(html).toContain('PEDIDO N° 059')
    expect(html).toContain('Total do pedido')
    expect(html).toContain('Produto Teste')
    expect(html).toContain('não é documento fiscal')
    expect(html).not.toContain('PAGUE COM PIX')
  })
})
