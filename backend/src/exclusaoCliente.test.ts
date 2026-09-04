// Quando apagar um cadastro de cliente, e principalmente quando NÃO.
// node:test + node:assert (nativos), igual ao cotaNotas.test.ts.
// Rodar: npx tsx --test src/exclusaoCliente.test.ts
//
// O que estes testes seguram:
//   • NÚMERO RESERVADO CONTA, mesmo sem nota emitida. É o caso que se esquece:
//     um número pode ter sido reservado e a transmissão ter falhado — nenhuma
//     nota saiu, mas para a SEFAZ aquele número existe. Olhar só as emissões
//     deixaria passar justamente o caso mais confuso de resolver depois.
//   • A REGRA ERRA PARA O LADO DE RECUSAR. Um cadastro a mais no banco não
//     incomoda ninguém; uma sequência fiscal quebrada, sim — e não se conserta
//     com um segundo DELETE.
//   • RENOVAÇÃO, e não "tem data de pagamento", é o sinal de história. Todo
//     cliente nasce com data de pagamento; ler aquilo cru recusaria apagar o
//     cadastro recém-criado, que é o caso que a rota atende.
//   • A RECUSA DIZ O QUE FAZER no lugar. "Não pode" sozinho faz a pessoa tentar
//     de novo, ou pior, mexer no banco na mão — que é como um problema de
//     cadastro vira um problema fiscal.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  foiRenovado,
  impedimentoFiscal,
  motivoDaRecusa,
  podeApagar,
  type Impedimentos
} from './exclusaoCliente.ts'

const LIMPO: Impedimentos = {
  emissoes: 0,
  seriesUsadas: 0,
  renovado: false,
  temCnpj: false
}

// ── O engano recém-cometido pode ser desfeito ────────────────────────────────

test('cadastro que não produziu nada pode ser apagado', () => {
  assert.equal(podeApagar(LIMPO), true)
})

// ── O que já existe de verdade não se apaga ──────────────────────────────────

test('uma nota emitida basta para recusar', () => {
  assert.equal(podeApagar({ ...LIMPO, emissoes: 1 }), false)
})

test('número reservado conta, mesmo sem nota nenhuma emitida', () => {
  assert.equal(
    podeApagar({ ...LIMPO, seriesUsadas: 1 }),
    false,
    'número reservado sem emissão foi tratado como se não existisse'
  )
})

test('CNPJ emitente cadastrado basta para recusar', () => {
  // O sinal mais forte de "esta loja existe de verdade": alguém sentou,
  // configurou os dados fiscais e vinculou um CNPJ. Um cadastro criado por
  // engano nunca chega aí.
  //
  // ⚠️ É ele que cobre o vão da renovação: `/admin/cliente/:id/renovar` só
  // estende a validade, sem registrar pagamento, então uma loja antiga
  // renovada pela mão do admin não seria pega por `renovado`.
  assert.equal(podeApagar({ ...LIMPO, temCnpj: true }), false)
})

test('renovação paga basta para recusar', () => {
  assert.equal(podeApagar({ ...LIMPO, renovado: true }), false)
})

// ── O sinal de "tem história": renovação, não data de pagamento ──────────────
//
// TODO cliente nasce com `ultimoPagamentoEm` preenchido, gravado pela própria
// rota de cadastro. Ler aquele campo cru recusaria apagar o cadastro
// recém-criado — o caso que esta rota existe para atender. Foi a primeira
// versão desta regra, e estava errada.

test('cliente recém-cadastrado NÃO conta como renovado', () => {
  const agora = '2026-09-03T01:37:17.057Z'
  assert.equal(
    foiRenovado({ criadoEm: agora, ultimoPagamentoEm: agora }),
    false,
    'a data de pagamento posta no cadastro foi lida como renovação'
  )
})

test('nem quando os dois instantes vêm de chamadas separadas ao relógio', () => {
  // Como era ANTES desta leva: a rota de cadastro chamava `new Date()` duas
  // vezes, e os campos saíam com milissegundos de diferença. Sem tolerância,
  // todo cliente já existente seria lido como renovado — e nenhum engano
  // poderia ser desfeito.
  assert.equal(
    foiRenovado({
      criadoEm: '2026-09-03T01:37:17.057Z',
      ultimoPagamentoEm: '2026-09-03T01:37:17.061Z'
    }),
    false,
    'quatro milissegundos foram lidos como uma renovação'
  )
})

test('data ilegível erra para o lado de recusar', () => {
  // Recusar apagar um cadastro é reversível; apagar um que tinha história, não.
  assert.equal(foiRenovado({ criadoEm: 'nao-e-data', ultimoPagamentoEm: 'nem-isso' }), true)
})

test('uma renovação logo depois do cadastro TAMBÉM conta', () => {
  // A folga existe só para absorver o vão entre duas linhas de código. Larga
  // demais, ela engoliria uma renovação de verdade feita minutos depois — e o
  // cliente poderia ser apagado como se nada tivesse acontecido.
  assert.equal(
    foiRenovado({
      criadoEm: '2026-09-03T01:37:17.057Z',
      ultimoPagamentoEm: '2026-09-03T01:37:27.057Z'
    }),
    true,
    'dez segundos depois foi lido como o mesmo momento'
  )
})

test('mas um pagamento posterior conta', () => {
  assert.equal(
    foiRenovado({ criadoEm: '2026-09-03T01:37:17.057Z', ultimoPagamentoEm: '2026-10-03T12:00:00.000Z' }),
    true
  )
})

test('cliente sem data de pagamento nenhuma não conta como renovado', () => {
  assert.equal(foiRenovado({ criadoEm: '2026-09-03T01:37:17.057Z' }), false)
})

test('qualquer combinação de impedimentos também recusa', () => {
  assert.equal(
    podeApagar({ emissoes: 3, seriesUsadas: 1, renovado: true, temCnpj: true }),
    false
  )
})

// ── A recusa explica o que fazer no lugar ────────────────────────────────────

test('a recusa diz qual é o impedimento', () => {
  const m = motivoDaRecusa('NETO', {
    emissoes: 12,
    seriesUsadas: 1,
    renovado: false,
    temCnpj: false
  })
  assert.ok(m.includes('NETO'))
  assert.ok(m.includes('12 nota(s)'))
  assert.ok(m.includes('1 série(s)'))
})

test('e não menciona o que não está acontecendo', () => {
  const m = motivoDaRecusa('NETO', { ...LIMPO, renovado: true })
  assert.ok(m.includes('renovação já paga'))
  assert.ok(!m.includes('nota(s) fiscal(is)'), 'inventou uma emissão que não existe')
})

test('a recusa aponta a saída certa: bloquear a renovação', () => {
  const m = motivoDaRecusa('NETO', { ...LIMPO, emissoes: 1 })
  assert.ok(m.includes('bloqueie a renovação'), 'a recusa não diz o que fazer no lugar')
})

test('e explica por que, em vez de só proibir', () => {
  const m = motivoDaRecusa('NETO', { ...LIMPO, emissoes: 1 })
  assert.ok(m.includes('SEFAZ'))
})

// ── A linha da exclusão forçada ────────────────────────────────────────────
//
// Forçar derruba a trava COMERCIAL (renovação paga) e só ela. O que é fiscal
// continua recusado com ou sem insistência. Se esta separação cair, apagar um
// cadastro que emitiu nota libera a numeração da NFC-e para recomeçar do 1 num
// cadastro futuro de mesmo id, e nota com número repetido vira problema com a
// SEFAZ, não com o software.

test('★ nota emitida é impedimento FISCAL: força nenhuma alcança', () => {
  assert.equal(
    impedimentoFiscal({ emissoes: 1, seriesUsadas: 0, renovado: false, temCnpj: false }),
    true
  )
})

test('★ número de série reservado também, mesmo sem nota transmitida', () => {
  // O número foi RESERVADO: para a SEFAZ ele existe, ainda que a transmissão
  // tenha falhado. É o caso mais fácil de subestimar.
  assert.equal(
    impedimentoFiscal({ emissoes: 0, seriesUsadas: 1, renovado: false, temCnpj: false }),
    true
  )
})

test('★ CNPJ vinculado também: a loja configurou dados fiscais de verdade', () => {
  assert.equal(
    impedimentoFiscal({ emissoes: 0, seriesUsadas: 0, renovado: false, temCnpj: true }),
    true
  )
})

test('★ renovação paga NÃO é fiscal: é a única coisa que a força derruba', () => {
  assert.equal(
    impedimentoFiscal({ emissoes: 0, seriesUsadas: 0, renovado: true, temCnpj: false }),
    false
  )
})

test('cadastro limpo não tem impedimento de espécie nenhuma', () => {
  const limpo = { emissoes: 0, seriesUsadas: 0, renovado: false, temCnpj: false }
  assert.equal(impedimentoFiscal(limpo), false)
  assert.equal(podeApagar(limpo), true)
})

test('a força não é atalho: sem ela, renovação continua impedindo', () => {
  assert.equal(
    podeApagar({ emissoes: 0, seriesUsadas: 0, renovado: true, temCnpj: false }),
    false
  )
})
