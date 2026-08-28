/**
 * Ler dinheiro digitado errado é o defeito mais caro que uma tela de empréstimo
 * pode ter — e o mais silencioso.
 *
 * ── O erro que este teste prende (aconteceu de verdade, aqui) ───────────────
 * A primeira versão de `paraNumero` tirava os pontos do texto, tratando-os como
 * separador de milhar ("1.234,56" → 1234,56). Parece razoável em pt-BR. Só que
 * os campos de valor desta tela são `type="number"`, e o navegador entrega o
 * valor com PONTO decimal: "600.00". Resultado: 600,00 virava **60000** — cem
 * vezes o valor — creditado direto no saldo do cliente.
 *
 * Nada apareceria na tela: sem erro, sem validação estourando, só um número
 * errado gravado. Por isso a leitura tem teste próprio.
 */
import { describe, it, expect } from 'vitest'
import { paraNumero } from '../Emprestimos'

describe('leitura de valor digitado', () => {
  it('lê o ponto como decimal, que é o que o campo type=number entrega', () => {
    expect(paraNumero('600.00')).toBe(600)
    expect(paraNumero('1234.5')).toBe(1234.5)
    expect(paraNumero('0.01')).toBe(0.01)
  })

  it('aceita vírgula também, para teclado que insiste nela', () => {
    expect(paraNumero('600,50')).toBe(600.5)
  })

  it('vazio e lixo viram NaN, para a validação recusar', () => {
    expect(paraNumero('')).toBeNaN()
    expect(paraNumero('   ')).toBeNaN()
    expect(paraNumero('abc')).toBeNaN()
  })

  it('ignora espaço em volta', () => {
    expect(paraNumero('  250.75  ')).toBe(250.75)
  })
})
