// Testes do montador de NFC-e. Usa node:test + node:assert (nativos, sem
// dependência) porque o backend não tem vitest e o montador é código puro.
// Rodar: npx tsx --test src/nfce.test.ts
//
// O foco é o que a SEFAZ rejeita sem perdão: totais que não fecham no centavo,
// e produto sem classificação fiscal.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarPedidoNfce, ErroMontagem } from './nfce.ts'

const emitente = { cnpj: '11222333000181', uf: 'SP', codigo_municipio: '3550308', crt: 1 as const }
const base = { emitente, serie: 1, numero: 1, ambiente: 'homologacao' as const, referencia: 'v1' }
const item = (over = {}) => ({
  nome: 'Produto', ncm: '61091000', cfop: '5102', cst_csosn: '102',
  origem: '0', unidade: 'UN', quantidade: 1, valor_unitario: 10, ...over
})

// atalho pra navegar o payload sem brigar com tipos
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inf = (p: Record<string, unknown>) => (p as any).infNFe

test('totais batem: vNF = vProd - vDesc', () => {
  const p = montarPedidoNfce({
    ...base,
    venda: {
      itens: [item({ quantidade: 2, valor_unitario: 39.9 }), item({ valor_unitario: 25 })],
      desconto: 5,
      pagamentos: [{ tPag: '01', valor: 99.8 }]
    }
  })
  const t = inf(p).total.ICMSTot
  assert.equal(t.vProd, 104.8)
  assert.equal(t.vDesc, 5)
  assert.equal(t.vNF, 99.8)
})

test('desconto rateado fecha exatamente com o total (sem centavo perdido)', () => {
  // 3 itens de valores irregulares + desconto que não divide redondo: o
  // clássico caso onde arredondar por item deixa 1 centavo sobrando.
  const p = montarPedidoNfce({
    ...base,
    venda: {
      itens: [
        item({ valor_unitario: 10 }),
        item({ valor_unitario: 20 }),
        item({ valor_unitario: 3.33 })
      ],
      desconto: 3.33,
      pagamentos: [{ tPag: '01', valor: 29.99 }]
    }
  })
  const det = inf(p).det
  const somaDescItens = det.reduce((s: number, d: { prod: { vDesc?: number } }) => s + (d.prod.vDesc ?? 0), 0)
  // A soma dos descontos por item tem que igualar o desconto total, ou a SEFAZ
  // rejeita a nota.
  assert.equal(Math.round(somaDescItens * 100) / 100, 3.33)
  assert.equal(inf(p).total.ICMSTot.vDesc, 3.33)
})

test('sem desconto, nenhum item carrega vDesc', () => {
  const p = montarPedidoNfce({
    ...base,
    venda: { itens: [item()], pagamentos: [{ tPag: '01', valor: 10 }] }
  })
  assert.equal(inf(p).det[0].prod.vDesc, undefined)
  assert.equal(inf(p).total.ICMSTot.vDesc, 0)
})

test('pagamento omitido vira dinheiro à vista pelo total', () => {
  const p = montarPedidoNfce({
    ...base,
    venda: { itens: [item({ valor_unitario: 42 })], pagamentos: [] }
  })
  assert.deepEqual(inf(p).pag.detPag, [{ tPag: '01', vPag: 42 }])
})

test('produto sem NCM é barrado com mensagem que nomeia o produto', () => {
  assert.throws(
    () =>
      montarPedidoNfce({
        ...base,
        venda: { itens: [item({ nome: 'Camiseta Azul', ncm: '' })], pagamentos: [] }
      }),
    (e: unknown) => e instanceof ErroMontagem && /Camiseta Azul/.test((e as Error).message)
  )
})

test('produto sem CFOP é barrado', () => {
  assert.throws(
    () => montarPedidoNfce({ ...base, venda: { itens: [item({ cfop: '' })], pagamentos: [] } }),
    ErroMontagem
  )
})

test('Regime Normal (CRT 3) é recusado por enquanto', () => {
  assert.throws(
    () =>
      montarPedidoNfce({
        ...base,
        emitente: { ...emitente, crt: 3 },
        venda: { itens: [item()], pagamentos: [] }
      }),
    (e: unknown) => e instanceof ErroMontagem && /Simples/.test((e as Error).message)
  )
})

test('UF inválida do emitente é recusada', () => {
  assert.throws(
    () =>
      montarPedidoNfce({
        ...base,
        emitente: { ...emitente, uf: 'XX' },
        venda: { itens: [item()], pagamentos: [] }
      }),
    ErroMontagem
  )
})

test('CPF do consumidor entra no dest; sem ele, não há dest', () => {
  const comCpf = montarPedidoNfce({
    ...base,
    venda: { itens: [item()], pagamentos: [], consumidor: { cpf: '111.444.777-35' } }
  })
  assert.equal(inf(comCpf).dest.CPF, '11144477735')

  const semCpf = montarPedidoNfce({ ...base, venda: { itens: [item()], pagamentos: [] } })
  assert.equal(inf(semCpf).dest, undefined)
})

test('campos-chave do ide para NFC-e presencial', () => {
  const p = montarPedidoNfce({ ...base, venda: { itens: [item()], pagamentos: [] } })
  const ide = inf(p).ide
  assert.equal(ide.mod, 65) // NFC-e
  assert.equal(ide.tpAmb, 2) // homologação
  assert.equal(ide.indFinal, 1) // consumidor final
  assert.equal(ide.indPres, 1) // presencial
  assert.equal(ide.cUF, 35) // SP
})
