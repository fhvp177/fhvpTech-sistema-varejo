import { describe, it, expect } from 'vitest'
import {
  avaliarExpressao,
  formatarExpressao,
  formatarNumero
} from '../calculadora'

// Atalho: o valor de uma conta que se espera dar certo.
const valor = (expressao: string): number => {
  const r = avaliarExpressao(expressao)
  if (!r.ok) throw new Error(`esperava sucesso em "${expressao}", veio: ${r.erro}`)
  return r.valor
}

describe('avaliarExpressao — o básico', () => {
  it('faz as quatro operações', () => {
    expect(valor('2+3')).toBe(5)
    expect(valor('10-4')).toBe(6)
    expect(valor('6*7')).toBe(42)
    expect(valor('10/4')).toBe(2.5)
  })

  it('respeita a precedência em vez de calcular na ordem digitada', () => {
    expect(valor('2+3*4')).toBe(14)
    expect(valor('10-2*3')).toBe(4)
    expect(valor('2*3+4*5')).toBe(26)
  })

  it('entende parênteses', () => {
    expect(valor('(2+3)*4')).toBe(20)
    expect(valor('2*(3+(4-1))')).toBe(12)
  })

  it('entende número negativo e sinal na frente', () => {
    expect(valor('-5+3')).toBe(-2)
    expect(valor('10*-2')).toBe(-20)
  })

  it('aceita espaços', () => {
    expect(valor(' 12 + 8 ')).toBe(20)
  })
})

describe('avaliarExpressao — separador decimal', () => {
  it('aceita vírgula e ponto como a mesma coisa', () => {
    expect(valor('10,5')).toBe(10.5)
    expect(valor('10.5')).toBe(10.5)
    expect(valor('10,5+10.5')).toBe(21)
  })

  it('recusa número com dois separadores', () => {
    const r = avaliarExpressao('1,5,2')
    expect(r.ok).toBe(false)
  })
})

describe('avaliarExpressao — porcentagem de loja', () => {
  it('soma e subtrai porcentagem SOBRE o valor da esquerda', () => {
    expect(valor('200+10%')).toBe(220)
    expect(valor('200-10%')).toBe(180)
    // O caso real do balcão: 10% de desconto numa peça de 89,90.
    expect(valor('89,90-10%')).toBe(80.91)
  })

  it('trata % como fração simples ao multiplicar ou dividir', () => {
    expect(valor('200*10%')).toBe(20)
    expect(valor('200/10%')).toBe(2000)
  })

  it('lê % sozinho como a fração pura', () => {
    expect(valor('50%')).toBe(0.5)
  })

  it('segue a conta depois da porcentagem', () => {
    expect(valor('200+10%+5')).toBe(225)
  })
})

describe('avaliarExpressao — erros com mensagem de gente', () => {
  it('recusa divisão por zero', () => {
    const r = avaliarExpressao('10/0')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/dividir por zero/i)
  })

  it('recusa conta pela metade', () => {
    expect(avaliarExpressao('2+').ok).toBe(false)
    expect(avaliarExpressao('*3').ok).toBe(false)
  })

  it('recusa parêntese aberto e não fechado', () => {
    const r = avaliarExpressao('(2+3')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/parêntese/i)
  })

  it('recusa expressão vazia', () => {
    expect(avaliarExpressao('   ').ok).toBe(false)
  })

  it('recusa caractere estranho', () => {
    expect(avaliarExpressao('2+a').ok).toBe(false)
  })
})

describe('avaliarExpressao — ponto flutuante', () => {
  it('não deixa vazar o 0,30000000000000004', () => {
    expect(valor('0,1+0,2')).toBe(0.3)
  })

  it('mantém precisão de dinheiro em conta encadeada', () => {
    expect(valor('1234,56*3')).toBe(3703.68)
  })
})

describe('formatarNumero', () => {
  it('agrupa o milhar', () => {
    expect(formatarNumero(1000000)).toBe('1.000.000')
    expect(formatarNumero(1234.56)).toBe('1.234,56')
  })

  it('usa vírgula decimal e não inventa casas', () => {
    expect(formatarNumero(0.5)).toBe('0,5')
    expect(formatarNumero(42)).toBe('42')
  })

  it('avisa em vez de mostrar Infinity', () => {
    expect(formatarNumero(Infinity)).toBe('Erro')
    expect(formatarNumero(NaN)).toBe('Erro')
  })
})

describe('formatarExpressao', () => {
  it('agrupa o milhar de cada número da conta', () => {
    expect(formatarExpressao('1000000+2500')).toBe('1.000.000+2.500')
  })

  it('preserva a vírgula que a pessoa acabou de digitar', () => {
    expect(formatarExpressao('10,')).toBe('10,')
    expect(formatarExpressao('1000,25')).toBe('1.000,25')
  })

  it('mostra os sinais de multiplicar e dividir', () => {
    expect(formatarExpressao('6*7')).toBe('6×7')
    expect(formatarExpressao('10/2')).toBe('10÷2')
  })

  it('não estraga a conta com porcentagem e parênteses', () => {
    expect(formatarExpressao('(2000+10%)')).toBe('(2.000+10%)')
  })
})
