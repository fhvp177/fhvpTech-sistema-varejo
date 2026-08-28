/**
 * A conta do acordo: capital + juros = total a receber.
 *
 * ── Por que ela merece teste próprio ────────────────────────────────────────
 * O número que sai daqui é o que a pessoa VÊ na prévia antes de confirmar, o que
 * é GRAVADO como total do empréstimo, e o que sai IMPRESSO no comprovante que as
 * duas partes assinam. Se a prévia e o gravado divergirem por um centavo, o
 * papel na mão do cliente e o saldo no sistema deixam de bater — e a discussão
 * acontece meses depois, sem ninguém saber quem está certo.
 *
 * É a única multiplicação de dinheiro do módulo. O resto é soma e subtração.
 */
import { describe, it, expect } from 'vitest'
import { calcularAcordo } from '../Emprestimos'

describe('a conta do acordo', () => {
  it('percentual redondo: 500 a 20% dá 600', () => {
    expect(calcularAcordo(500, 20, 'percentual')).toEqual({ capital: 500, juros: 100, total: 600 })
  })

  it('em reais, o número digitado é o juros', () => {
    expect(calcularAcordo(500, 150, 'reais')).toEqual({ capital: 500, juros: 150, total: 650 })
  })

  it('capital com fração de centavo é arredondado ANTES da conta', () => {
    // O backend arredonda o capital para centavos ao gravar. Se a prévia
    // calculasse sobre o valor cru, o total impresso no comprovante sairia
    // diferente do total do sistema — e ninguém saberia explicar a diferença.
    const r = calcularAcordo(333.333, 10, 'percentual')
    expect(r.capital).toBe(333.33)
    expect(r.juros).toBe(33.33)
    expect(r.total).toBe(366.66)
  })

  it('arredonda o juros para centavos antes de somar', () => {
    // 333 × 7,5% = 24,975. Se o arredondamento acontecesse só no total, a prévia
    // mostraria 357,98 e o comprovante poderia sair com outro número.
    const r = calcularAcordo(333, 7.5, 'percentual')
    expect(r.juros).toBe(24.98)
    expect(r.total).toBe(357.98)
    // E o total é exatamente capital + juros arredondado — sem fração perdida.
    expect(r.total).toBe(+(333 + r.juros).toFixed(2))
  })

  it('não gera dízima solta no total', () => {
    // 0.1 + 0.2 === 0.30000000000000004 é o clássico do ponto flutuante; um
    // total assim viraria "R$ 300,00000000000006" no banco.
    const r = calcularAcordo(1000, 3.33, 'percentual')
    expect(r.total).toBe(1033.3)
    expect(Number.isInteger(r.total * 100)).toBe(true)
  })

  it('sem juros: o total é o próprio capital', () => {
    expect(calcularAcordo(500, 0, 'percentual')).toEqual({ capital: 500, juros: 0, total: 500 })
  })

  it('campo de juros vazio (NaN) conta como zero, não estraga o total', () => {
    // O campo é opcional: quem não digita nada está fazendo um empréstimo sem
    // juros, e a prévia tem que mostrar o capital — nunca "R$ NaN".
    expect(calcularAcordo(500, NaN, 'percentual')).toEqual({ capital: 500, juros: 0, total: 500 })
    expect(calcularAcordo(500, NaN, 'reais')).toEqual({ capital: 500, juros: 0, total: 500 })
  })

  it('capital ainda não digitado devolve zero, sem quebrar a prévia', () => {
    expect(calcularAcordo(NaN, 20, 'percentual')).toEqual({ capital: 0, juros: 0, total: 0 })
  })

  it('juros negativo é ignorado, não vira desconto escondido', () => {
    // Devolver menos do que pegou é possível, mas por ABATIMENTO lançado no
    // extrato — com data e motivo. Um juros negativo aqui produziria um acordo
    // menor que o capital sem deixar rastro nenhum de por quê.
    expect(calcularAcordo(500, -50, 'reais')).toEqual({ capital: 500, juros: 0, total: 500 })
  })
})
