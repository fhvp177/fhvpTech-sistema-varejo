/**
 * O vocabulário de forma de pagamento.
 *
 * `ehFormaAVista` decide o que vem PRÉ-MARCADO no modal da nota fiscal, e é aí
 * que ela vira crítica: marcar de leve uma forma errada faz o operador
 * confirmar sem ler, e a nota sai pra SEFAZ dizendo que uma venda no cartão foi
 * em dinheiro. Por isso a função é restritiva de propósito — na dúvida, não
 * marca nada e obriga a escolha consciente.
 */
import { describe, expect, it } from 'vitest'
import { FORMAS_A_VISTA, LABEL_FORMA, ehFormaAVista, rotuloForma } from '../formaPagamento'

describe('ehFormaAVista', () => {
  it.each(['dinheiro', 'debito', 'credito', 'pix'])('aceita %s', (v) => {
    expect(ehFormaAVista(v)).toBe(true)
  })

  it('aceita com espaço e caixa trocada', () => {
    expect(ehFormaAVista('  PIX ')).toBe(true)
  })

  // O caso que mais importa. 'crediario' e 'credito_loja' são formas VÁLIDAS no
  // banco, mas não estão na lista do modal. Se passassem por aqui, o modal
  // guardaria um valor que nenhum botão representa: nada apareceria marcado na
  // tela e mesmo assim o "Emitir" ficaria liberado — emitindo crediário numa
  // venda à vista sem ninguém ter escolhido isso.
  it.each(['crediario', 'credito_loja'])('recusa %s, que não é escolha do caixa', (v) => {
    expect(ehFormaAVista(v)).toBe(false)
  })

  it('recusa vazio, null e indefinido — venda antiga não pré-marca nada', () => {
    expect(ehFormaAVista(null)).toBe(false)
    expect(ehFormaAVista(undefined)).toBe(false)
    expect(ehFormaAVista('')).toBe(false)
    expect(ehFormaAVista('   ')).toBe(false)
  })

  it('recusa qualquer coisa fora da lista', () => {
    expect(ehFormaAVista('boleto')).toBe(false)
  })
})

describe('rotuloForma', () => {
  it('traduz as formas conhecidas', () => {
    expect(rotuloForma('pix')).toBe('PIX')
    expect(rotuloForma('credito_loja')).toBe('Crédito da loja')
    expect(rotuloForma('crediario')).toBe('Crediário')
  })

  it('devolve null no desconhecido em vez de chutar', () => {
    expect(rotuloForma(null)).toBeNull()
    expect(rotuloForma('boleto')).toBeNull()
  })
})

describe('coerência do vocabulário', () => {
  // Se alguém acrescentar uma forma na lista do caixa e esquecer o rótulo, a
  // tela mostraria `undefined` num botão.
  it('toda forma escolhível tem rótulo', () => {
    for (const f of FORMAS_A_VISTA) {
      expect(LABEL_FORMA[f.valor], `sem rótulo: ${f.valor}`).toBeTruthy()
    }
  })

  it('não tem valor repetido', () => {
    const valores = FORMAS_A_VISTA.map((f) => f.valor)
    expect(new Set(valores).size).toBe(valores.length)
  })
})
