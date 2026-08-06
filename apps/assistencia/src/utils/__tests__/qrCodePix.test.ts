// O QR só existe no papel — não dá pra "olhar se ficou bom" num teste. O que dá
// pra provar é o que decide se ele sai nítido ou some: o tamanho de cada
// quadradinho em relação ao ponto da impressora, e a REGRA de quando desenhar.
//
// A regra é a parte com dinheiro em jogo: QR num comprovante de venda já paga
// convida o cliente a pagar duas vezes.

import { describe, it, expect } from 'vitest'
import { desenharQrPix, qrPixParaDocumento } from '@fhvptech/core/lib/qrCodePix'
import { montarBrCodePix } from '@fhvptech/core/lib/pixBrCode'

const CHAVE = '123e4567-e12b-12d1-a456-426655440000'
const LOJA = { chave: CHAVE, beneficiario: 'Loja do Joao', cidade: 'Sao Paulo' }

const payloadExemplo = (): string => {
  const r = montarBrCodePix({ ...LOJA, valor: 150 })
  if (!r.ok) throw new Error(r.erro)
  return r.payload
}

describe('desenho do QR', () => {
  const { svg, larguraMm } = desenharQrPix(payloadExemplo())

  it('sai como SVG, e não como imagem esticada', () => {
    // Bitmap esticado a 203dpi vira borrão. SVG é rasterizado pelo Chromium já
    // na resolução da impressora.
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('shape-rendering="crispEdges"')
  })

  it('é medido em milímetros, que é o que quer dizer algo no papel', () => {
    expect(svg).toContain(`width:${larguraMm}mm`)
    expect(svg).toContain(`height:${larguraMm}mm`)
    expect(svg).not.toMatch(/^<svg height="\d+" width="\d+"/)
  })

  it('deixa cada quadradinho em cima de pontos inteiros da impressora', () => {
    // Esta é a conta que impede a grade de entortar. 203dpi = 7,992 pontos/mm;
    // se a largura total não for múltipla de (módulos × 4 pontos), uns
    // quadradinhos saem com 3 pontos e outros com 4.
    const modulos = Number(/viewBox="0 0 (\d+)/.exec(svg)![1])
    const pontosPorMm = 203 / 25.4
    const pontosPorModulo = (larguraMm * pontosPorMm) / modulos
    expect(pontosPorModulo).toBeCloseTo(4, 1)
  })

  it('cabe com folga na bobina de 80mm', () => {
    // O corpo do cupom tem 68mm. QR maior que isso não é cortado: ele
    // simplesmente não é impresso pela cabeça térmica.
    expect(larguraMm).toBeGreaterThan(15)
    expect(larguraMm).toBeLessThan(45)
  })

  it('guarda a zona de silêncio que o padrão do QR exige', () => {
    // Sem a margem branca em volta, leitor nenhum acha o código. Os 8 módulos
    // (4 de cada lado) precisam estar DENTRO do desenho — não dá pra contar com
    // o papel, porque a divisória do cupom pode encostar.
    const modulos = Number(/viewBox="0 0 (\d+)/.exec(svg)![1])
    const semMargem = Number(
      /viewBox="0 0 (\d+)/.exec(
        renderToStaticMarkupSemMargem(payloadExemplo())
      )![1]
    )
    expect(modulos - semMargem).toBe(8)
  })

  it('aceita largura fixa para documento que não é bobina', () => {
    // O orçamento de OS é A4, impresso a 300dpi ou mais: lá o alinhamento com o
    // ponto da térmica não quer dizer nada.
    const a4 = desenharQrPix(payloadExemplo(), 30)
    expect(a4.larguraMm).toBe(30)
    expect(a4.svg).toContain('width:30mm')
  })
})

// Reproduz o desenho sem margem só pra medir a diferença no teste acima.
function renderToStaticMarkupSemMargem(payload: string): string {
  const { createElement } = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { QRCodeSVG } = require('qrcode.react')
  return renderToStaticMarkup(
    createElement(QRCodeSVG, { value: payload, size: 256, level: 'M', marginSize: 0 })
  )
}

describe('a regra de quando o QR aparece', () => {
  const comSaldo = { ...LOJA, valorACobrar: 150 }

  it('desenha quando há valor a cobrar', () => {
    const r = qrPixParaDocumento(comSaldo)
    expect(r).not.toBeNull()
    expect(r!.valor).toBe(150)
    expect(r!.beneficiario).toBe('Loja do Joao')
  })

  it.each([
    ['não há o que cobrar', { valorACobrar: 0 }],
    ['sobrou troco', { valorACobrar: -5 }],
    ['o lojista não configurou a chave', { chave: '' }],
    ['a chave é só espaço em branco', { chave: '   ' }],
    ['a chave não existe', { chave: null }],
    ['a chave está inválida', { chave: 'chave que nao existe' }],
    ['falta o nome da loja', { beneficiario: '' }],
    ['falta a cidade da loja', { cidade: '' }],
    ['o valor não é número', { valorACobrar: Number.NaN }]
  ])('não desenha quando %s', (_motivo, extra) => {
    expect(qrPixParaDocumento({ ...comSaldo, ...extra })).toBeNull()
  })

  it('cobra exatamente o valor que o documento mandou cobrar', () => {
    // Quem decide o número é o documento: numa venda de 200 com 150 já pagos
    // ele manda 50, e o QR tem que pedir 50. Arredondar, somar ou "corrigir"
    // aqui é o erro caro deste recurso.
    const r = qrPixParaDocumento({ ...LOJA, valorACobrar: 200 - 150 })
    expect(r!.valor).toBe(50)
    expect(r!.svg).toContain('<svg')
  })

  it('o valor cobrado é mesmo o que entra no texto do PIX', () => {
    // Prova que o QR desenhado corresponde ao payload com aquele valor — não
    // adianta a regra estar certa e o desenho ser de outro valor.
    const r = qrPixParaDocumento({ ...LOJA, valorACobrar: 50 })
    const esperado = montarBrCodePix({ ...LOJA, valor: 50 })
    expect(esperado.ok).toBe(true)
    expect(r!.svg).toBe(desenharQrPix((esperado as { payload: string }).payload).svg)
  })
})
