// O pedaço do documento que convida o cliente a pagar por PIX: o QR, quanto é,
// e pra quem vai. Fica num arquivo só porque três documentos diferentes o
// imprimem (cupom de venda, comprovante de OS e orçamento) e um bloco que
// diverge entre eles é um bloco que vai divergir errado.
//
// ── Por que o nome do recebedor sai impresso ─────────────────────────────────
//
// Não é enfeite. Trocar o QR colado no balcão por outro é o golpe mais comum
// com PIX no Brasil, e um QR impresso em papel é igualmente trocável. O cliente
// não tem como conferir olhando o desenho — quadradinho preto é tudo igual.
// Com o nome impresso ao lado, ele compara com o que o app do banco mostra
// antes de confirmar: se não bater, o papel foi adulterado. É a mesma defesa
// que o próprio app do banco usa, trazida pro papel.

import type { QrPixPronto } from '@fhvptech/core/lib/qrCodePix'

const escapar = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const fmt = (valor: number): string =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Estilos do bloco. Tudo em `em`, nunca em px: o mesmo bloco sai numa bobina de
 * 68mm com fonte de 11px e numa folha A4 com fonte bem maior. Preso em px, ele
 * sairia ilegível num dos dois.
 */
export const CSS_PIX = `
    .pix-bloco { text-align: center; margin: 8px 0 4px; }
    .pix-titulo { font-weight: bold; font-size: 1.1em; margin-bottom: 2px; }
    .pix-qr svg { margin: 3px auto; }
    .pix-valor { font-weight: bold; font-size: 1.1em; }
    .pix-para { font-size: 0.95em; }
    .pix-conferir { font-size: 0.85em; margin-top: 2px; line-height: 1.25; }`

export type OpcoesBlocoPix = {
  /** Chamada do bloco. O orçamento usa outra, porque lá ainda não há dívida. */
  titulo?: string
  /**
   * Desenha a linha tracejada acima do bloco. Ligada pros comprovantes de
   * bobina, que separam tudo assim; desligada pro A4, que nem tem essa classe.
   */
  divisoria?: boolean
}

/**
 * Monta o bloco, ou string vazia quando não há QR pra mostrar. Devolver vazio é
 * proposital: quem chama concatena sem precisar de `if`, e documento sem QR
 * continua sendo um documento normal.
 */
export function blocoPixHtml(pix: QrPixPronto | null, opcoes: OpcoesBlocoPix = {}): string {
  if (!pix) return ''
  const { titulo = 'PAGUE COM PIX', divisoria = true } = opcoes
  return `
  ${divisoria ? '<div class="divisoria"></div>' : ''}
  <div class="pix-bloco">
    <div class="pix-titulo">${escapar(titulo)}</div>
    <div class="pix-qr">${pix.svg}</div>
    <div class="pix-valor">R$ ${fmt(pix.valor)}</div>
    <div class="pix-para">Recebedor: ${escapar(pix.beneficiario)}</div>
    <div class="pix-conferir">Confira este nome no app do banco antes de confirmar.</div>
  </div>`
}
