// A largura do DANFE que o backend repassa à ACBr.
// Rodar: npx tsx --test src/danfe.test.ts
//
// O app manda a largura que a cabeça térmica IMPRIME (72mm numa bobina de 80).
// Antes o backend reduzia qualquer valor a 58 ou 80: o app pedia 72, recebia 80
// e a nota saía cortada na direita, sem erro em lugar nenhum. Estes testes são
// a prova de que ele não "arredonda" mais a escolha de quem conhece a impressora.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { larguraDoDanfe, LARGURA_PADRAO_MM } from './danfe.ts'

test('★ a largura impressa passa inteira, sem virar 58 ou 80', () => {
  assert.equal(larguraDoDanfe('72'), 72)
  assert.equal(larguraDoDanfe('48'), 48)
})

test('a faixa da ACBr é de 40 a 80mm — fora dela, vale o padrão', () => {
  assert.equal(larguraDoDanfe('40'), 40)
  assert.equal(larguraDoDanfe('80'), 80)
  assert.equal(larguraDoDanfe('39'), LARGURA_PADRAO_MM)
  assert.equal(larguraDoDanfe('81'), LARGURA_PADRAO_MM)
})

test('pedido sem largura, ou com lixo no lugar dela, imprime no padrão', () => {
  // App antigo (que não manda largura) continua recebendo a nota de sempre.
  assert.equal(larguraDoDanfe(undefined), LARGURA_PADRAO_MM)
  assert.equal(larguraDoDanfe(''), LARGURA_PADRAO_MM)
  assert.equal(larguraDoDanfe('bobina'), LARGURA_PADRAO_MM)
  // A ACBr só aceita inteiro: 72,5mm não existe pra ela.
  assert.equal(larguraDoDanfe('72.5'), LARGURA_PADRAO_MM)
})
