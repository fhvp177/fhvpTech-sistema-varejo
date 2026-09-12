/**
 * Como cada venda se chama na tela.
 *
 * ── O que este arquivo prende ───────────────────────────────────────────────
 *
 *  1. ★ **"Com sinal" é calculado, não gravado.** Vem de `entrada > 0`. É por
 *     isso que não existe uma condição de pagamento nova para ele: o nome tem
 *     que acompanhar o fato, inclusive quando o fato muda (estorno).
 *
 *  2. ★ **Atraso ganha de tudo.** Venda atrasada que teve sinal continua
 *     lendo-se "Inadimplente": é a etiqueta que manda cobrar, e trocá-la por
 *     uma palavra simpática esconderia a cobrança.
 *
 *  3. **O nome curto não carrega valor.** Nas listas, a coluna de dinheiro já
 *     mostra o que falta. Só o detalhe da venda leva o saldo junto.
 */
import { describe, it, expect } from 'vitest'
import { rotuloVenda, rotuloVendaComSaldo, type VendaParaRotulo } from '../rotuloVenda'

/*
 * ⚠️ `toLocaleString` com moeda separa "R$" do número com espaço NÃO-QUEBRÁVEL
 * (U+00A0), não com espaço comum. Comparar com um espaço digitado aqui produz a
 * falha mais confusa que existe: duas strings idênticas na tela, e o teste
 * dizendo que são diferentes. Normalizar antes de comparar deixa a asserção
 * legível sem esconder o que o código devolve.
 */
const semNbsp = (s: string): string => s.replace(/\u00a0/g, ' ')

const venda = (extra: Partial<VendaParaRotulo> = {}): VendaParaRotulo => ({
  status_pagamento: 'pendente',
  num_parcelas: null,
  entrada: 0,
  total: 250,
  valor_pago: 0,
  ...extra
})

describe('o nome curto, da lista', () => {
  it('★ venda a prazo COM sinal se chama "Com sinal"', () => {
    expect(rotuloVenda(venda({ entrada: 20, valor_pago: 20 }))).toBe('Com sinal')
  })

  it('★ venda a prazo SEM sinal se chama "A prazo"', () => {
    // Quem vende fiado puro precisa se reconhecer aqui. Chamar tudo de "com
    // sinal" faria a vendedora duvidar da opção certa.
    expect(rotuloVenda(venda())).toBe('A prazo')
  })

  it('★ atrasada continua "Inadimplente", mesmo tendo tido sinal', () => {
    expect(
      rotuloVenda(venda({ status_pagamento: 'inadimplente', entrada: 20, valor_pago: 20 }))
    ).toBe('Inadimplente')
  })

  it('paga é "Pago"', () => {
    expect(rotuloVenda(venda({ status_pagamento: 'pago', valor_pago: 250 }))).toBe('Pago')
  })

  it('parcelada diz quantas parcelas', () => {
    expect(rotuloVenda(venda({ status_pagamento: 'parcelado', num_parcelas: 3 }))).toBe(
      'Parcelado (3x)'
    )
    expect(
      rotuloVenda(venda({ status_pagamento: 'pago', num_parcelas: 3, valor_pago: 250 }))
    ).toBe('Pago (3x)')
  })

  it('parcelada atrasada chama pela cobrança, não pelo número de parcelas', () => {
    expect(
      rotuloVenda(venda({ status_pagamento: 'inadimplente', num_parcelas: 3 }))
    ).toBe('Inadimplente')
  })

  it('★ nenhum nome curto carrega valor em dinheiro', () => {
    // As duas listas já mostram o que falta na coluna do lado, com a palavra
    // "restante". Repetir come a largura do nome do cliente em 360px.
    for (const v of [
      venda({ entrada: 20, valor_pago: 20 }),
      venda(),
      venda({ status_pagamento: 'inadimplente' }),
      venda({ status_pagamento: 'parcelado', num_parcelas: 2 })
    ]) {
      expect(rotuloVenda(v)).not.toMatch(/R\$/)
    }
  })
})

describe('o nome com saldo, do detalhe', () => {
  it('★ mostra o que falta', () => {
    const r = rotuloVendaComSaldo(venda({ entrada: 20, valor_pago: 20 }))
    expect(semNbsp(r)).toBe('Com sinal · falta R$ 230,00')
  })

  it('venda quitada não anuncia saldo', () => {
    expect(rotuloVendaComSaldo(venda({ status_pagamento: 'pago', valor_pago: 250 }))).toBe('Pago')
  })

  it('★ resíduo negativo de centavo não vira "falta -R$ 0,01"', () => {
    // Acontece no rateio das parcelas: a soma paga passa o total por um centavo.
    expect(rotuloVendaComSaldo(venda({ valor_pago: 250.01, entrada: 20 }))).toBe('Com sinal')
  })

  it('a prazo sem sinal também mostra o saldo', () => {
    expect(semNbsp(rotuloVendaComSaldo(venda({ total: 180 })))).toBe('A prazo · falta R$ 180,00')
  })
})
