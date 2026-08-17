// Testes das regras da revenda. node:test + node:assert (nativos), igual ao
// nfce.test.ts — o backend não tem vitest e este código é puro.
// Rodar: npx tsx --test src/revenda.test.ts
//
// O foco é o que segura poder e dinheiro:
//   • o TETO (senão o revendedor renova a carteira por 10 anos e o bloqueio
//     vira enfeite);
//   • BLOQUEIO GANHA DE PAGAMENTO (senão ele se restaura pagando o PIX);
//   • e o caso mais perigoso de todos, que não é sobre revenda nenhuma:
//     CLIENTE ANTIGO, sem nenhum dos campos novos, PRECISA continuar renovando.
//     Se essa quebrar, a GN Modas para de renovar em produção.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  estadoRevendedor,
  podeEmitir,
  limitarAoTeto,
  montarClienteId,
  idValido,
  clienteBloqueado,
  podeDesbloquear,
  DIAS_DE_GRACA,
  type Revendedor
} from './revenda.ts'

const rev = (over: Partial<Revendedor> = {}): Revendedor => ({
  revendedorId: 'RV03',
  nome: 'Revenda Teste',
  criadoEm: '2026-01-01T00:00:00.000Z',
  validade: '2026-12-31',
  ...over
})

// 2026-06-15, meio do dia — bem dentro da validade padrão acima.
const AGORA = Date.parse('2026-06-15T12:00:00Z')
const dias = (n: number) => n * 86_400_000

// ── O caso que não pode quebrar em produção ────────────────────────────────

test('cliente antigo, sem nenhum campo novo, não está bloqueado', () => {
  // Os registros que já existem no Fly são JSON sem `bloqueadoPor`. Se
  // "ausência de informação" fosse lida como bloqueio, TODOS os clientes atuais
  // parariam de renovar — inclusive o único pagante.
  assert.equal(clienteBloqueado({}), false)
  assert.equal(clienteBloqueado({ bloqueadoPor: undefined }), false)
})

test('cliente direto da FHVP não tem teto e não ganha prefixo', () => {
  // Sem revendedor, nada muda em relação ao que o backend já faz hoje.
  const r = limitarAoTeto('2027-12-31', null)
  assert.equal(r.ok && r.expiracao, '2027-12-31')
  assert.equal(r.ok && r.cortada, false)
  assert.equal(montarClienteId(null, 'GNMODAS001'), 'GNMODAS001')
})

// ── O teto ────────────────────────────────────────────────────────────────

test('teto corta a validade que passa da do revendedor', () => {
  const r = limitarAoTeto('2027-06-30', rev({ validade: '2026-12-31' }))
  assert.equal(r.ok && r.expiracao, '2026-12-31')
  assert.equal(r.ok && r.cortada, true)
})

test('teto deixa passar o que cabe dentro da validade dele', () => {
  const r = limitarAoTeto('2026-07-15', rev({ validade: '2026-12-31' }))
  assert.equal(r.ok && r.expiracao, '2026-07-15')
  assert.equal(r.ok && r.cortada, false)
})

test('data igual à validade do revendedor passa (o teto é inclusivo)', () => {
  const r = limitarAoTeto('2026-12-31', rev({ validade: '2026-12-31' }))
  assert.equal(r.ok && r.expiracao, '2026-12-31')
  assert.equal(r.ok && r.cortada, false)
})

test('a tentativa de renovar a carteira por 10 anos morre no teto', () => {
  // O ataque que o teto existe para matar: na véspera do calote, esticar todo
  // mundo. Vira exatamente a validade dele, nem um dia a mais.
  const r = limitarAoTeto('2036-01-01', rev({ validade: '2026-12-31' }))
  assert.equal(r.ok && r.expiracao, '2026-12-31')
})

test('revendedor sem validade legível não emite nada', () => {
  // Na dúvida, recusa. Um revendedor mal cadastrado não pode virar chave eterna.
  for (const v of [undefined, '', 'depois', '31/12/2026']) {
    const r = limitarAoTeto('2026-07-15', rev({ validade: v as string }))
    assert.equal(r.ok, false, `validade ${JSON.stringify(v)} deveria recusar`)
  }
})

test('a graça NÃO estica o que ele entrega ao lojista', () => {
  // Ele continua operando por alguns dias após vencer, mas o que ele emite
  // continua limitado à validade crua — senão a graça viraria renovação.
  const r = limitarAoTeto('2026-12-31', rev({ validade: '2026-06-14' }))
  assert.equal(r.ok && r.expiracao, '2026-06-14')
})

// ── Bloqueio ganha de pagamento ───────────────────────────────────────────

test('revendedor bloqueado COM validade em dia continua bloqueado', () => {
  // O furo que isto fecha: sem esta regra ele paga o PIX de sempre, o webhook
  // estende a validade, e ele se desbloqueia sozinho por R$100.
  const r = rev({ validade: '2026-12-31', bloqueado: true })
  assert.equal(estadoRevendedor(r, AGORA), 'bloqueado')
  assert.equal(podeEmitir(r, AGORA), false)
})

test('desbloquear exige a mão certa', () => {
  // O revendedor desfaz o que ele trancou; o que a FHVP trancou, não.
  assert.equal(podeDesbloquear('revendedor', 'revendedor'), true)
  assert.equal(podeDesbloquear('revendedor', 'fhvp'), false)
  assert.equal(podeDesbloquear('fhvp', 'revendedor'), true)
  assert.equal(podeDesbloquear('fhvp', 'fhvp'), true)
})

// ── Estados no tempo ──────────────────────────────────────────────────────

test('dentro da validade está ativo', () => {
  assert.equal(estadoRevendedor(rev(), AGORA), 'ativo')
  assert.equal(podeEmitir(rev(), AGORA), true)
})

test('venceu ontem: fica na graça e continua emitindo', () => {
  // Atraso bancário de sexta não pode parar a carteira dele até segunda.
  const r = rev({ validade: '2026-06-14' })
  assert.equal(estadoRevendedor(r, AGORA), 'em_graca')
  assert.equal(podeEmitir(r, AGORA), true)
})

test('passada a graça, para de emitir', () => {
  const r = rev({ validade: '2026-06-14' })
  const depois = AGORA + dias(DIAS_DE_GRACA + 1)
  assert.equal(estadoRevendedor(r, depois), 'vencido')
  assert.equal(podeEmitir(r, depois), false)
})

test('revendedor sem validade nenhuma não emite', () => {
  assert.equal(estadoRevendedor(rev({ validade: undefined }), AGORA), 'vencido')
  assert.equal(podeEmitir(rev({ validade: undefined }), AGORA), false)
})

// ── Colisão de clienteId (o que quebraria a numeração da NFC-e) ───────────

test('cliente de revendedor nasce prefixado', () => {
  assert.equal(montarClienteId('RV03', 'LOJA001'), 'RV03-LOJA001')
})

test('dois revendedores com o MESMO nome de loja não colidem', () => {
  // Sem isto, os dois dividiriam o contador de `nfce_numero` e emitiriam nota
  // fiscal com número repetido — problema com a SEFAZ, não com o software.
  assert.notEqual(montarClienteId('RV03', 'LOJA001'), montarClienteId('RV07', 'LOJA001'))
})

test('normaliza caixa e espaço, como o resto do sistema já faz', () => {
  assert.equal(montarClienteId(' rv03 ', ' loja001 '), 'RV03-LOJA001')
})

test('id recusa o que estragaria o prefixo', () => {
  for (const bom of ['RV03', 'LOJA001', 'AB']) assert.equal(idValido(bom), true, bom)
  // hífen no sufixo tornaria o prefixo ambíguo; os demais são lixo de digitação.
  for (const ruim of ['RV-03', 'A', '', 'LOJA 001', 'LOJA_1', 'x'.repeat(21)]) {
    assert.equal(idValido(ruim), false, ruim)
  }
})
