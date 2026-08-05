// Transforma o texto do PIX no desenho do QR que vai pro papel, e decide
// SOZINHO se ele deve existir. Quem imprime só pergunta "tem QR pra este
// documento?" e recebe o desenho pronto ou um "não".
//
// ── Por que o tamanho é calculado, e não escolhido ───────────────────────────
//
// A cabeça térmica de 203dpi não sabe fazer cinza: cada ponto ou queima ou não
// queima. Um QR é uma grade de quadradinhos, e se a largura do desenho não for
// múltipla inteira do ponto da impressora, cada quadradinho cai em cima de uma
// fração de ponto — uns saem com 3 pontos de largura, outros com 4, a grade
// entorta e o celular do cliente não lê. Então em vez de chutar "uns 30mm",
// medimos: quantos quadradinhos o QR tem × quantos pontos queremos por
// quadradinho ÷ pontos por milímetro. O resultado é uma largura em que cada
// quadradinho cai certinho em cima de pontos inteiros.
//
// Isso é irmão do problema do traço fino já documentado no cupom: a 203dpi,
// detalhe que não se alinha ao ponto some ou vira borrão.

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import { montarBrCodePix, normalizarTextoPix, type TipoChavePix } from './pixBrCode'

/** Resolução da bobina térmica. 203dpi ÷ 25,4 = pontos por milímetro. */
const DPI_TERMICA = 203
const PONTOS_POR_MM = DPI_TERMICA / 25.4

/**
 * Pontos da impressora para cada quadradinho do QR. Com 4, cada quadradinho
 * mede meio milímetro — folgado para a câmera de qualquer celular e ainda
 * pequeno o bastante para o QR inteiro caber em ~28mm dos 68mm da bobina.
 * Abaixo de 3 começa a falhar em papel gasto ou com pouca tinta térmica.
 */
const PONTOS_POR_MODULO = 4

/**
 * Nível de correção de erro. "M" recupera ~15% do código danificado — é o que
 * segura cupom dobrado no bolso, amassado ou com a impressão já fraca. "L"
 * geraria um QR menor, mas cupom térmico desbota, e QR que não lê depois de uma
 * semana na carteira é pior que QR um pouco maior.
 */
const CORRECAO: 'L' | 'M' | 'Q' | 'H' = 'M'

export type QrPixPronto = {
  /** O `<svg>` pronto pra embutir no HTML do documento. */
  svg: string
  /** Largura calculada, em milímetros. */
  larguraMm: number
  /** Nome do recebedor, já normalizado — o mesmo que o cliente vê no banco. */
  beneficiario: string
  /** Valor que o cliente vai pagar, em reais. */
  valor: number
}

export type ParamsQrPix = {
  /** Chave PIX da loja. Vazia significa "o lojista não configurou": sem QR. */
  chave: string | null | undefined
  beneficiario: string
  cidade: string
  /** Quanto ainda falta pagar. Zero ou menos significa quitado: sem QR. */
  valorEmAberto: number
  tipo?: TipoChavePix
  /**
   * Largura fixa, em mm, para documento que não sai na bobina (o orçamento de
   * OS é A4, impresso a 300dpi ou mais, onde o alinhamento com o ponto da
   * térmica não faz sentido).
   */
  larguraMmFixa?: number
}

/**
 * Desenha o QR de um payload PIX já montado.
 *
 * Exportada à parte porque a tela de configuração precisa mostrar a prévia sem
 * ter uma venda na mão.
 */
export function desenharQrPix(payload: string, larguraMmFixa?: number): { svg: string; larguraMm: number } {
  const bruto = renderToStaticMarkup(
    createElement(QRCodeSVG, {
      value: payload,
      size: 256,
      level: CORRECAO,
      // A zona de silêncio que o padrão do QR exige. O papel em volta já é
      // branco, mas garantir aqui evita que uma divisória do cupom encoste no
      // código e confunda o leitor.
      marginSize: 4
    })
  )

  // Quantos quadradinhos o QR tem de lado (contando a margem branca). Vem do
  // viewBox, que é o próprio desenhista dizendo em que grade desenhou.
  const modulos = Number(/viewBox="0 0 (\d+)/.exec(bruto)?.[1] ?? 0)
  const larguraMm =
    larguraMmFixa ??
    Math.round(((modulos * PONTOS_POR_MODULO) / PONTOS_POR_MM) * 100) / 100

  // Troca o tamanho em pixels que a biblioteca escreveu por um tamanho em
  // milímetros — em papel, milímetro é a única unidade que quer dizer algo.
  const svg = bruto.replace(
    /^<svg height="\d+" width="\d+"/,
    `<svg style="width:${larguraMm}mm;height:${larguraMm}mm;display:block"`
  )

  return { svg, larguraMm }
}

/**
 * Decide se este documento leva QR e, se levar, devolve o desenho pronto.
 *
 * Devolve `null` sempre que houver qualquer dúvida — loja sem chave, dívida já
 * quitada, dados da loja incompletos, chave inválida. Documento sem QR é um
 * documento normal; documento com QR quebrado é dinheiro que não chega.
 */
export function qrPixParaDocumento(p: ParamsQrPix): QrPixPronto | null {
  const chave = (p.chave ?? '').trim()
  if (!chave) return null
  // Quitado (ou com troco) não leva QR: o cliente já pagou, e um convite a
  // pagar de novo impresso no comprovante dele é pedir pra receber duas vezes.
  //
  // Hoje o `montarBrCodePix` lá embaixo também recusaria valor zero, então esta
  // linha é cinto e suspensório — e é de propósito. Ela é a única que fala de
  // DOCUMENTO QUITADO; a de baixo fala de valor inválido pro padrão do PIX. No
  // dia em que existir "QR sem valor, o cliente digita" (um código fixo pro
  // balcão), aquela recusa some e só esta continua impedindo que o comprovante
  // de quem já pagou saia convidando a pagar de novo.
  if (!Number.isFinite(p.valorEmAberto) || p.valorEmAberto <= 0) return null

  const brcode = montarBrCodePix({
    chave,
    beneficiario: p.beneficiario,
    cidade: p.cidade,
    valor: p.valorEmAberto,
    tipo: p.tipo
  })
  if (!brcode.ok) return null

  // O desenho é a única etapa que pode ESTOURAR em vez de recusar educadamente
  // (é biblioteca de terceiro, e ela lança exceção quando não consegue montar o
  // código). Sem esta rede, a exceção subiria pelo gerador do documento e o
  // lojista ficaria sem conseguir imprimir NADA — cupom nenhum, por causa de um
  // enfeite no rodapé. O recurso do PIX pode falhar; a impressão do cupom, não.
  try {
    const { svg, larguraMm } = desenharQrPix(brcode.payload, p.larguraMmFixa)
    return {
      svg,
      larguraMm,
      beneficiario: normalizarTextoPix(p.beneficiario, 25),
      valor: p.valorEmAberto
    }
  } catch {
    return null
  }
}
