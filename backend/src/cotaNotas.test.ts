// Testes da cota mensal de notas fiscais.
// node:test + node:assert (nativos), igual ao revenda.test.ts.
// Rodar: npx tsx --test src/cotaNotas.test.ts
//
// O que estes testes seguram:
//   • LOJA SEM COTA CONTINUA EMITINDO. É o caso perigoso: o campo `teto` nasce
//     ausente em toda loja que já existe, e ler "ausente" como "zero" pararia a
//     emissão de nota de todo mundo no primeiro deploy. É o 1º teste do arquivo
//     pelo mesmo motivo que o "cliente antigo" é o 1º do revenda.test.ts.
//   • O TETO NÃO BLOQUEIA por padrão — é régua, não cancela. Bloquear sem
//     ninguém pedir transformaria um cliente que cresceu num chamado urgente.
//   • O EXCEDENTE é contado mesmo sem bloqueio, porque no atacado ele é a base
//     de cobrança (R$0,50 por nota acima de 50 no Pro de revendedor).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avaliarCota,
  valorExcedenteCentavos,
  cotaPadrao,
  COTA_PADRAO_VAREJO,
  COTA_PADRAO_ATACADO_PRO,
  PRECO_CENTAVOS_NOTA_EXCEDENTE
} from './cotaNotas.js'

// ── O caso que não pode quebrar em produção ──────────────────────────────────

test('loja SEM cota definida emite normalmente', () => {
  const s = avaliarCota(9999, undefined)
  assert.equal(s.podeEmitir, true)
  assert.equal(s.teto, null)
  assert.equal(s.restantes, null)
  assert.equal(s.excedentes, 0)
})

test('cota null é o mesmo que ausente — nunca vira zero', () => {
  const s = avaliarCota(500, null)
  assert.equal(s.podeEmitir, true)
  assert.equal(s.teto, null)
})

test('cota ZERO é diferente de ausente: essa loja não emite quando bloqueia', () => {
  const semCota = avaliarCota(1, null, true)
  assert.equal(semCota.podeEmitir, true)
  const cotaZero = avaliarCota(0, 0, true)
  assert.equal(cotaZero.podeEmitir, false)
})

// ── Régua, não cancela ───────────────────────────────────────────────────────

test('estourar a cota NÃO impede de emitir por padrão', () => {
  const s = avaliarCota(130, 100)
  assert.equal(s.podeEmitir, true)
  assert.equal(s.excedentes, 30)
  assert.equal(s.restantes, 0)
})

test('só bloqueia quando alguém liga o bloqueio de propósito', () => {
  const s = avaliarCota(130, 100, true)
  assert.equal(s.podeEmitir, false)
  assert.match(s.motivo ?? '', /130 de 100/)
})

test('bloqueio fecha ao ATINGIR a cota, não uma nota depois', () => {
  // A 100ª nota é a última que cabe; a 101ª é a que não pode sair. Com
  // `emitidas === 100` a próxima já estouraria, então a porta fecha aqui.
  assert.equal(avaliarCota(99, 100, true).podeEmitir, true)
  assert.equal(avaliarCota(100, 100, true).podeEmitir, false)
})

// ── Contas ───────────────────────────────────────────────────────────────────

test('dentro da cota não há excedente e restantes desconta', () => {
  const s = avaliarCota(30, 100)
  assert.equal(s.excedentes, 0)
  assert.equal(s.restantes, 70)
})

test('restantes nunca fica negativo', () => {
  assert.equal(avaliarCota(180, 100).restantes, 0)
})

test('contagem inválida vira zero em vez de propagar lixo', () => {
  for (const ruim of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
    assert.equal(avaliarCota(ruim as number, 100).emitidas, 0)
  }
})

// ── Excedente é dinheiro ─────────────────────────────────────────────────────

test('excedente vira centavos a R$0,50 a nota', () => {
  assert.equal(PRECO_CENTAVOS_NOTA_EXCEDENTE, 50)
  assert.equal(valorExcedenteCentavos(30), 1500)
  assert.equal(valorExcedenteCentavos(1), 50)
})

test('sem excedente não se cobra nada', () => {
  assert.equal(valorExcedenteCentavos(0), 0)
  assert.equal(valorExcedenteCentavos(-4), 0)
  assert.equal(valorExcedenteCentavos(Number.NaN), 0)
})

test('o preço por nota é parametrizável sem mexer na regra', () => {
  assert.equal(valorExcedenteCentavos(10, 30), 300)
})

// ── Cota padrão por origem do cliente ────────────────────────────────────────

test('cliente direto no Pro recebe a cota de varejo', () => {
  assert.equal(cotaPadrao({ plano: 'pro', ehDeRevendedor: false }), COTA_PADRAO_VAREJO)
  assert.equal(COTA_PADRAO_VAREJO, 100)
})

test('cliente de revendedor no Pro recebe a cota de atacado', () => {
  // 50, e não 100: no atacado o Pro custa R$60 e 100 notas custariam R$24 de
  // crédito, deixando menos que um Básico de R$50. A cota menor é o que
  // desinverte o incentivo — decidido 2026-09-01.
  assert.equal(cotaPadrao({ plano: 'pro', ehDeRevendedor: true }), COTA_PADRAO_ATACADO_PRO)
  assert.equal(COTA_PADRAO_ATACADO_PRO, 50)
})

test('loja no Básico não tem cota — o plano não emite nota', () => {
  assert.equal(cotaPadrao({ plano: 'basico', ehDeRevendedor: false }), null)
  assert.equal(cotaPadrao({ plano: 'basico', ehDeRevendedor: true }), null)
})

test('plano ausente cai no varejo, que é o caso de todo cliente atual', () => {
  assert.equal(cotaPadrao({ ehDeRevendedor: false }), COTA_PADRAO_VAREJO)
})

// ── A conta que motivou tudo isto ────────────────────────────────────────────

test('a conta do atacado fecha: Pro de revendedor rende mais que um Básico', () => {
  // R$60 de atacado, 50 notas inclusas a R$0,24 de custo = R$12 → sobram R$48.
  // Um cliente de 100 notas paga 60 + 50 excedentes × R$0,50 = R$85, custa R$24
  // de crédito, e deixa R$61 — acima dos R$50 de um Básico. Este teste é a
  // aritmética da decisão comercial, não do código: se alguém mexer na cota ou
  // no preço do excedente, é aqui que o incentivo volta a inverter.
  const custoPorNotaCentavos = 24

  const cota = COTA_PADRAO_ATACADO_PRO
  const mensalidadeAtacadoCentavos = 6000

  const noLimite = avaliarCota(cota, cota)
  const sobraNoLimite =
    mensalidadeAtacadoCentavos +
    valorExcedenteCentavos(noLimite.excedentes) -
    cota * custoPorNotaCentavos
  assert.equal(sobraNoLimite, 4800)

  const emCem = avaliarCota(100, cota)
  const sobraEmCem =
    mensalidadeAtacadoCentavos +
    valorExcedenteCentavos(emCem.excedentes) -
    100 * custoPorNotaCentavos
  assert.equal(emCem.excedentes, 50)
  assert.equal(sobraEmCem, 6100)

  // O que importa: quanto mais notas, MELHOR para a FHVP — não pior.
  assert.ok(sobraEmCem > sobraNoLimite)
  assert.ok(sobraEmCem > 5000, 'tem que render mais que um Básico de atacado')
})
