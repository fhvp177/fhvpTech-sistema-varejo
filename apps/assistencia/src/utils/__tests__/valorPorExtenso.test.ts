// O extenso do recibo.
//
// Num documento de quitação, quando o algarismo e o extenso discordam, vale o
// extenso. Ou seja: um erro aqui não vira um recibo errado, vira um recibo que
// diz outra coisa — e ninguém confere lendo, porque extenso é o campo que a
// pessoa bate o olho e assina.
//
// Cada bloco abaixo guarda uma regra que implementações caseiras erram. Para
// ver falhar, mexa em `grupoExtenso` ou em `juntarGrupos`: quase toda mudança
// derruba pelo menos um bloco.

import { describe, it, expect } from 'vitest'
import { valorPorExtenso, inteiroPorExtenso } from '../valorPorExtenso'

describe('os números que têm nome próprio', () => {
  it('de um a nove', () => {
    expect(inteiroPorExtenso(1)).toBe('um')
    expect(inteiroPorExtenso(9)).toBe('nove')
  })

  it('de dez a dezenove não seguem regra', () => {
    // "dez e sete" não existe: é "dezessete".
    expect(inteiroPorExtenso(10)).toBe('dez')
    expect(inteiroPorExtenso(14)).toBe('quatorze')
    expect(inteiroPorExtenso(17)).toBe('dezessete')
    expect(inteiroPorExtenso(19)).toBe('dezenove')
  })

  it('as dezenas levam "e" antes da unidade', () => {
    expect(inteiroPorExtenso(20)).toBe('vinte')
    expect(inteiroPorExtenso(34)).toBe('trinta e quatro')
    expect(inteiroPorExtenso(99)).toBe('noventa e nove')
  })
})

describe('cem muda de nome quando não está sozinho', () => {
  it('100 é "cem"', () => {
    expect(inteiroPorExtenso(100)).toBe('cem')
  })

  it('101 é "cento e um", não "cem e um"', () => {
    expect(inteiroPorExtenso(101)).toBe('cento e um')
    expect(inteiroPorExtenso(123)).toBe('cento e vinte e três')
  })

  it('as outras centenas não mudam', () => {
    expect(inteiroPorExtenso(200)).toBe('duzentos')
    expect(inteiroPorExtenso(500)).toBe('quinhentos')
    expect(inteiroPorExtenso(530)).toBe('quinhentos e trinta')
    expect(inteiroPorExtenso(999)).toBe('novecentos e noventa e nove')
  })
})

describe('mil não leva "um" na frente', () => {
  it('1000 é "mil"', () => {
    expect(inteiroPorExtenso(1000)).toBe('mil')
  })

  it('2000 leva', () => {
    expect(inteiroPorExtenso(2000)).toBe('dois mil')
  })

  it('milhão leva', () => {
    // A diferença com "mil" não é capricho: "um milhão" é a forma corrente,
    // "um mil" não.
    expect(inteiroPorExtenso(1_000_000)).toBe('um milhão')
    expect(inteiroPorExtenso(2_000_000)).toBe('dois milhões')
  })
})

describe('onde entra "e" e onde entra vírgula', () => {
  it('resto menor que cem cola com "e"', () => {
    expect(inteiroPorExtenso(1030)).toBe('mil e trinta')
    expect(inteiroPorExtenso(1_000_005)).toBe('um milhão e cinco')
  })

  it('centena redonda também cola com "e"', () => {
    expect(inteiroPorExtenso(1500)).toBe('mil e quinhentos')
  })

  it('★ o resto do modelo: 1530 não empilha dois "e"', () => {
    // "mil e quinhentos e trinta" é o erro clássico. A vírgula sumiu porque o
    // grupo do meio é "mil", que não pede pontuação.
    expect(inteiroPorExtenso(1530)).toBe('mil quinhentos e trinta')
  })

  it('número comprido usa vírgula só entre as escalas maiores', () => {
    // A vírgula separa milhão de mil, onde ela ajuda a ler. Entre o milhar e o
    // resto vale a mesma regra do 1530: espaço.
    expect(inteiroPorExtenso(1_234_567)).toBe(
      'um milhão, duzentos e trinta e quatro mil quinhentos e sessenta e sete'
    )
  })

  it('grupo zerado no meio não vira vazio', () => {
    expect(inteiroPorExtenso(1_000_100)).toBe('um milhão e cem')
    expect(inteiroPorExtenso(2_000_034)).toBe('dois milhões e trinta e quatro')
  })
})

describe('reais e centavos', () => {
  it('★ o valor do modelo do recibo', () => {
    expect(valorPorExtenso(1530.5)).toBe('mil quinhentos e trinta reais e cinquenta centavos')
  })

  it('singular de verdade', () => {
    expect(valorPorExtenso(1)).toBe('um real')
    expect(valorPorExtenso(0.01)).toBe('um centavo')
    expect(valorPorExtenso(1.01)).toBe('um real e um centavo')
  })

  it('só centavos', () => {
    expect(valorPorExtenso(0.5)).toBe('cinquenta centavos')
    expect(valorPorExtenso(0.71)).toBe('setenta e um centavos')
  })

  it('só reais não menciona centavos', () => {
    expect(valorPorExtenso(250)).toBe('duzentos e cinquenta reais')
  })

  it('"de reais" só quando a escala é a última palavra', () => {
    // "um milhão reais" não existe; "um milhão e quinhentos mil reais" sim.
    expect(valorPorExtenso(1_000_000)).toBe('um milhão de reais')
    expect(valorPorExtenso(1_500_000)).toBe('um milhão e quinhentos mil reais')
    expect(valorPorExtenso(1000)).toBe('mil reais')
  })
})

describe('o centavo que o ponto flutuante come', () => {
  it('1,07 não vira um real e seis centavos', () => {
    // 1.07 * 100 dá 106.99999999999999 em JavaScript. Sem arredondar antes de
    // truncar, o recibo sai com um centavo a menos — e o extenso, que é o que
    // vale, sai errado.
    expect(valorPorExtenso(1.07)).toBe('um real e sete centavos')
  })

  it('outros valores que costumam escorregar', () => {
    expect(valorPorExtenso(2.29)).toBe('dois reais e vinte e nove centavos')
    expect(valorPorExtenso(8.13)).toBe('oito reais e treze centavos')
    expect(valorPorExtenso(1234.56)).toBe(
      'mil duzentos e trinta e quatro reais e cinquenta e seis centavos'
    )
  })

  it('99 centavos arredondam para cima virando um real', () => {
    expect(valorPorExtenso(0.999)).toBe('um real')
  })
})

describe('entradas que não deveriam chegar aqui', () => {
  it('zero diz o que é, em vez de deixar o parêntese vazio', () => {
    expect(valorPorExtenso(0)).toBe('zero reais')
  })

  it('negativo e inválido devolvem vazio', () => {
    expect(valorPorExtenso(-5)).toBe('')
    expect(valorPorExtenso(Number.NaN)).toBe('')
    expect(valorPorExtenso(Number.POSITIVE_INFINITY)).toBe('')
  })
})
