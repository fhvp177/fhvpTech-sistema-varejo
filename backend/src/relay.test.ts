// Testes do ponto de encontro do multicaixa (relay.ts).
// Rodar: npx tsx --test src/relay.test.ts
//
// Usa node:test + node:assert, como o resto do backend, e o `app.request()` do
// Hono — não precisa abrir porta de verdade.
//
// O foco é o que separa este servidor de um buraco de segurança:
//   1. só a loja que tem a chave recebe as chamadas dela;
//   2. os bytes atravessam sem serem tocados nem interpretados;
//   3. loja indisponível responde na hora, em vez de pendurar quem chamou.

// ⚠️ Antes de qualquer import que puxe o db.ts, que abre o banco no import.
process.env.DB_PATH = `${process.env.TEMP ?? '/tmp'}/relay-teste-${Date.now()}.db`

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { gravarCliente } from './db.ts'
import { gerarChaveLicenca } from './licenca.ts'
import { limparRelay, registrarRotasRelay } from './relay.ts'

const SEGREDO = 'segredo-de-teste-abcdefghijklmnop'
const LOJA = 'LOJATESTE001'

/** Data futura, para a licença estar ativa. */
const AMANHA = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

function montarApp(): Hono {
  const app = new Hono()
  registrarRotasRelay(app, SEGREDO)
  return app
}

async function chaveDaLoja(clienteId = LOJA): Promise<string> {
  return gerarChaveLicenca(SEGREDO, clienteId, AMANHA)
}

beforeEach(() => {
  limparRelay()
  gravarCliente({
    clienteId: LOJA,
    nome: 'Loja de Teste',
    validadeAtual: AMANHA
  } as never)
})

// ─── Quem pode se pendurar ───────────────────────────────────────────────────

test('recusa loja sem chave', async () => {
  const r = await montarApp().request('/relay/ouvir', {
    method: 'POST',
    body: JSON.stringify({ clienteId: LOJA })
  })

  assert.equal(r.status, 401)
})

test('recusa chave com HMAC errado', async () => {
  // Só o clienteId não pode bastar: quem o conhecesse se penduraria aqui e
  // RECEBERIA as chamadas destinadas àquela loja.
  const r = await montarApp().request('/relay/ouvir', {
    method: 'POST',
    body: JSON.stringify({ clienteId: LOJA, chave: `${LOJA}:${AMANHA}:0000000000000000` })
  })

  assert.equal(r.status, 401)
})

test('recusa chave de outra loja', async () => {
  const chaveDeOutra = await chaveDaLoja('OUTRALOJA999')

  const r = await montarApp().request('/relay/ouvir', {
    method: 'POST',
    body: JSON.stringify({ clienteId: LOJA, chave: chaveDeOutra })
  })

  assert.equal(r.status, 401)
})

test('recusa loja que não existe no banco', async () => {
  const r = await montarApp().request('/relay/ouvir', {
    method: 'POST',
    body: JSON.stringify({ clienteId: 'INEXISTENTE', chave: await chaveDaLoja('INEXISTENTE') })
  })

  assert.equal(r.status, 404)
})

test('recusa loja com licença vencida', async () => {
  const ontem = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
  gravarCliente({ clienteId: 'VENCIDA001', nome: 'Vencida', validadeAtual: ontem } as never)

  const r = await montarApp().request('/relay/ouvir', {
    method: 'POST',
    body: JSON.stringify({ clienteId: 'VENCIDA001', chave: await chaveDaLoja('VENCIDA001') })
  })

  assert.equal(r.status, 403)
})

// ─── O caminho completo ──────────────────────────────────────────────────────

/** Dá tempo do pedido pendurado chegar a se registrar antes de a chamada sair. */
const respira = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))

test('entrega a chamada ao computador da loja e devolve a resposta', async () => {
  const app = montarApp()
  const chave = await chaveDaLoja()
  const pedido = new Uint8Array([1, 2, 3, 250, 0, 255])
  const resposta = new Uint8Array([9, 8, 7])

  // O computador da loja se pendura primeiro.
  const ouvindo = app.request('/relay/ouvir', {
    method: 'POST',
    body: JSON.stringify({ clienteId: LOJA, chave })
  })
  await respira()

  // O caixa adicional chama.
  const chamando = app.request('/relay/chamar', {
    method: 'POST',
    headers: { 'X-Loja': LOJA, 'X-Terminal': 'terminal-1' },
    body: pedido
  })

  const recebido = await ouvindo
  assert.equal(recebido.status, 200)
  assert.equal(recebido.headers.get('X-Terminal'), 'terminal-1')
  const id = recebido.headers.get('X-Chamada')!
  // Os bytes chegam idênticos: o servidor não interpreta nem reembala nada.
  assert.deepEqual(new Uint8Array(await recebido.arrayBuffer()), pedido)

  await app.request('/relay/responder', {
    method: 'POST',
    headers: { 'X-Loja': LOJA, 'X-Chave': chave, 'X-Chamada': id },
    body: resposta
  })

  const devolvida = await chamando
  assert.equal(devolvida.status, 200)
  assert.deepEqual(new Uint8Array(await devolvida.arrayBuffer()), resposta)
})

/**
 * O caso que a primeira versão destes testes expôs, e que era um defeito de
 * verdade — não só do teste.
 *
 * O computador da loja fica pendurado, recebe "nada por enquanto" ao fim do
 * tempo e se pendura de novo. Nesse vaivém não há ninguém ouvindo por uma ida e
 * volta de rede. Uma chamada que caia exatamente aí precisa ESPERAR o próximo
 * pendurar — antes ela recebia "loja indisponível" com a loja no ar.
 */
test('segura a chamada que cai no intervalo entre um pendurar e outro', async () => {
  const app = montarApp()
  const chave = await chaveDaLoja()
  const pedido = new Uint8Array([42])

  // A loja aparece e larga — como faz ao receber 204 e antes de se repender.
  const primeiro = app.request('/relay/ouvir', {
    method: 'POST',
    body: JSON.stringify({ clienteId: LOJA, chave })
  })
  await respira()

  // Chamada chega com ninguém ouvindo.
  const chamando = app.request('/relay/chamar', {
    method: 'POST',
    headers: { 'X-Loja': LOJA, 'X-Terminal': 't1' },
    body: pedido
  })
  await respira()

  // O primeiro pendurado leva a chamada da fila.
  const recebido = await primeiro
  assert.equal(recebido.status, 200)
  assert.deepEqual(new Uint8Array(await recebido.arrayBuffer()), pedido)

  await app.request('/relay/responder', {
    method: 'POST',
    headers: {
      'X-Loja': LOJA,
      'X-Chave': chave,
      'X-Chamada': recebido.headers.get('X-Chamada')!
    },
    body: new Uint8Array([1])
  })
  assert.equal((await chamando).status, 200)
})

// ─── Loja indisponível ───────────────────────────────────────────────────────

test('avisa na hora quando o computador da loja não está disponível', async () => {
  // Sem ninguém ouvindo, pendurar o caixa adicional por 30 segundos seria pior
  // que dizer logo o que está acontecendo.
  const r = await montarApp().request('/relay/chamar', {
    method: 'POST',
    headers: { 'X-Loja': LOJA, 'X-Terminal': 't1' },
    body: new Uint8Array([1])
  })

  assert.equal(r.status, 503)
})

test('recusa chamada sem loja e chamada vazia', async () => {
  const app = montarApp()

  assert.equal(
    (await app.request('/relay/chamar', { method: 'POST', body: new Uint8Array([1]) })).status,
    400
  )
  assert.equal(
    (
      await app.request('/relay/chamar', {
        method: 'POST',
        headers: { 'X-Loja': LOJA },
        body: new Uint8Array(0)
      })
    ).status,
    400
  )
})

// ─── Resposta fora de hora ───────────────────────────────────────────────────

test('descarta resposta de chamada que ninguém espera mais', async () => {
  const app = montarApp()
  const chave = await chaveDaLoja()

  const r = await app.request('/relay/responder', {
    method: 'POST',
    headers: { 'X-Loja': LOJA, 'X-Chave': chave, 'X-Chamada': 'nao-existe' },
    body: new Uint8Array([1])
  })

  // Não é erro: o caixa adicional já desistiu e refazer não é decisão daqui.
  assert.equal(r.status, 200)
  assert.equal(((await r.json()) as { aproveitada: boolean }).aproveitada, false)
})

test('recusa resposta de quem não provou ser a loja', async () => {
  const r = await montarApp().request('/relay/responder', {
    method: 'POST',
    headers: { 'X-Loja': LOJA, 'X-Chave': 'chave-inventada', 'X-Chamada': 'x' },
    body: new Uint8Array([1])
  })

  assert.equal(r.status, 401)
})
