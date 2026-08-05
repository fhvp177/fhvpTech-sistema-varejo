// A OS tem uma armadilha que o cupom não tem: ela é impressa VÁRIAS vezes ao
// longo da vida do serviço — entrada, orçamento, entrega, e segundas vias meses
// depois. Cada uma dessas folhas está num ponto diferente da história do
// dinheiro, e só duas delas podem cobrar.
//
// A pior é a 2ª via da entrega: o cliente já pagou, pede o comprovante de novo
// pra garantia, e se o QR reaparecer ele paga duas vezes.

import { describe, it, expect } from 'vitest'
import {
  gerarHtmlComprovanteEntradaOS,
  gerarHtmlComprovanteEntregaOS,
  type DadosComprovanteOS
} from '../comprovantesOS'
import { gerarHtmlOrcamentoOS } from '../documentosOS'
import { LOJA_PADRAO, type DadosLoja } from '../dadosLoja'

const LOJA: DadosLoja = {
  ...LOJA_PADRAO,
  nome: 'Assistencia Teste',
  cidade: 'Fortaleza',
  uf: 'CE',
  pix_chave: '123e4567-e12b-12d1-a456-426655440000'
}

function os(sobrepor: Partial<DadosComprovanteOS> = {}): DadosComprovanteOS {
  return {
    id: 42,
    tipo_atendimento: 'bancada',
    natureza: 'conserto',
    categoria: 'equipamento',
    cliente_nome: 'Cliente Teste',
    tecnico_nome: 'Tecnico Teste',
    criada_em: '2026-08-01 09:00:00',
    equipamento: 'Notebook',
    numero_serie: 'ABC123',
    acessorios: 'Carregador',
    estado_entrada: 'Riscado na tampa',
    endereco_atendimento: null,
    defeito_relatado: 'Nao liga',
    diagnostico: 'Fonte queimada',
    garantia_dias: 90,
    entregue_em: '2026-08-05 15:00:00',
    garantia_ate: '2026-11-03',
    venda_id: 7,
    itens: [{ produto_nome: 'Fonte', quantidade: 1, preco_unitario: 180 }],
    ...sobrepor
  }
}

const temQr = (html: string): boolean => html.includes('<div class="pix-qr">')

describe('comprovante de entrega', () => {
  it('leva o QR quando o cliente saiu devendo', () => {
    expect(temQr(gerarHtmlComprovanteEntregaOS(os({ saldo_em_aberto: 180 }), LOJA))).toBe(true)
  })

  it('NÃO leva o QR na segunda via, depois de o cliente já ter pago', () => {
    // Este é o caso que justifica consultar a venda na hora de imprimir em vez
    // de somar os itens da OS: no papel os dois dão 180, mas só a venda sabe
    // que o dinheiro entrou.
    expect(temQr(gerarHtmlComprovanteEntregaOS(os({ saldo_em_aberto: 0 }), LOJA))).toBe(false)
  })

  it('NÃO leva o QR quando quem chamou nem informou saldo', () => {
    // Campo opcional: ausente tem que significar "não cobre", nunca "cobre o
    // total". O silêncio precisa ser o lado seguro.
    expect(temQr(gerarHtmlComprovanteEntregaOS(os(), LOJA))).toBe(false)
  })

  it('NÃO leva o QR na entrega sem cobrança (cortesia ou garantia)', () => {
    const cortesia = os({ itens: [], venda_id: null, saldo_em_aberto: 0 })
    const html = gerarHtmlComprovanteEntregaOS(cortesia, LOJA)
    expect(html).toContain('ENTREGA SEM COBRANÇA')
    expect(temQr(html)).toBe(false)
  })

  it('cobra exatamente o saldo informado', () => {
    const html = gerarHtmlComprovanteEntregaOS(os({ saldo_em_aberto: 130 }), LOJA)
    expect(html).toContain('<div class="pix-valor">R$ 130,00</div>')
  })
})

describe('comprovante de entrada', () => {
  it('nunca leva QR — nesse momento não existe valor nenhum acordado', () => {
    // O aparelho acabou de chegar no balcão. Não há orçamento, não há dívida.
    const html = gerarHtmlComprovanteEntradaOS(os({ saldo_em_aberto: 180 }), LOJA)
    expect(temQr(html)).toBe(false)
    expect(html).toContain('COMPROVANTE DE ENTRADA')
  })
})

describe('orçamento (A4)', () => {
  const html = gerarHtmlOrcamentoOS(os(), LOJA)

  it('leva o QR com o total orçado', () => {
    expect(temQr(html)).toBe(true)
    expect(html).toContain('<div class="pix-valor">R$ 180,00</div>')
  })

  it('usa uma chamada própria, porque ali ainda não existe dívida', () => {
    expect(html).toContain('PAGAR ESTE ORÇAMENTO')
    expect(html).not.toContain('PAGUE COM PIX')
  })

  it('usa largura fixa, porque A4 não é bobina térmica', () => {
    // Na folha comum (300dpi ou mais) não faz sentido alinhar o desenho ao
    // ponto da cabeça térmica.
    expect(html).toContain('width:32mm')
  })

  it('não desenha a divisória tracejada, que só existe no cupom', () => {
    const bloco = html.slice(html.indexOf('pix-bloco') - 200, html.indexOf('pix-bloco'))
    expect(bloco).not.toContain('class="divisoria"')
  })

  it('some inteiro quando o orçamento é zerado', () => {
    expect(temQr(gerarHtmlOrcamentoOS(os({ itens: [] }), LOJA))).toBe(false)
  })

  it('some inteiro quando a loja não configurou o PIX', () => {
    expect(temQr(gerarHtmlOrcamentoOS(os(), { ...LOJA, pix_chave: '' }))).toBe(false)
  })

  it('leva o estilo do bloco junto, senão o QR sai do tamanho errado', () => {
    expect(html).toContain('.pix-bloco')
  })
})
