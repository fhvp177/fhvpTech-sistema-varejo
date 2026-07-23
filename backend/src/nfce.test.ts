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

test('CSOSN 102 usa o grupo ICMSSN102', () => {
  const p = montarPedidoNfce({
    ...base,
    venda: { itens: [item({ cst_csosn: '102' })], pagamentos: [{ tPag: '01', valor: 10 }] }
  })
  const icms = inf(p).det[0].imposto.ICMS
  assert.ok(icms.ICMSSN102, 'esperava grupo ICMSSN102')
  assert.equal(icms.ICMSSN102.CSOSN, '102')
})

test('CSOSN 500 usa o grupo ICMSSN500 (ICMS já retido por ST), não ICMSSN102', () => {
  const p = montarPedidoNfce({
    ...base,
    venda: { itens: [item({ cst_csosn: '500' })], pagamentos: [{ tPag: '01', valor: 10 }] }
  })
  const icms = inf(p).det[0].imposto.ICMS
  assert.ok(icms.ICMSSN500, 'esperava grupo ICMSSN500')
  assert.equal(icms.ICMSSN500.CSOSN, '500')
  assert.equal(icms.ICMSSN102, undefined)
})

test('CSOSN sem grupo suportado (ex.: 900) é recusado com mensagem clara', () => {
  assert.throws(
    () =>
      montarPedidoNfce({
        ...base,
        venda: { itens: [item({ cst_csosn: '900' })], pagamentos: [{ tPag: '01', valor: 10 }] }
      }),
    (e: unknown) => e instanceof ErroMontagem && /CSOSN 900/.test((e as Error).message)
  )
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

test('NCM com comprimento errado (nem 8 nem 2 dígitos) é barrado nomeando o produto', () => {
  assert.throws(
    () =>
      montarPedidoNfce({
        ...base,
        venda: { itens: [item({ nome: 'Caneta Azul', ncm: '9608100' })], pagamentos: [] }
      }),
    (e: unknown) =>
      e instanceof ErroMontagem && /Caneta Azul/.test((e as Error).message) && /8 dígitos/.test((e as Error).message)
  )
})

test('NCM de 8 dígitos passa (formato válido)', () => {
  const p = montarPedidoNfce({
    ...base,
    venda: { itens: [item({ ncm: '96081000' })], pagamentos: [{ tPag: '01', valor: 10 }] }
  })
  assert.equal(inf(p).det[0].prod.NCM, '96081000')
})

test('CFOP com comprimento errado é barrado', () => {
  assert.throws(
    () =>
      montarPedidoNfce({
        ...base,
        venda: { itens: [item({ nome: 'Caneta', cfop: '510' })], pagamentos: [] }
      }),
    (e: unknown) => e instanceof ErroMontagem && /CFOP inválido/.test((e as Error).message)
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

// ─── NF-e (modelo 55): venda para outra empresa ───────────────────────────────

const destinatario = {
  cnpj: '11444777000161',
  nome: 'CLIENTE EMPRESA LTDA',
  logradouro: 'Avenida Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
  cep: '01310300',
  codigo_municipio: '3550308',
  indicador_ie: '9' as const
}

test('NF-e muda o que precisa mudar em relação à NFC-e', () => {
  const p = montarPedidoNfce({
    ...base,
    modelo: 55,
    venda: { itens: [item()], pagamentos: [], destinatario }
  })
  const ide = inf(p).ide
  assert.equal(ide.mod, 55) // NF-e
  assert.equal(ide.tpImp, 1) // DANFE retrato (A4), não bobina
  assert.equal(ide.indFinal, 0) // venda para empresa não é consumo final
  assert.equal(inf(p).dest.xNome, 'CLIENTE EMPRESA LTDA')
  assert.equal(inf(p).dest.enderDest.cMun, '3550308')
})

test('NF-e sem destinatário é barrada', () => {
  assert.throws(
    () => montarPedidoNfce({ ...base, modelo: 55, venda: { itens: [item()], pagamentos: [] } }),
    ErroMontagem
  )
})

test('destinatário incompleto diz exatamente o que falta', () => {
  assert.throws(
    () =>
      montarPedidoNfce({
        ...base,
        modelo: 55,
        venda: {
          itens: [item()],
          pagamentos: [],
          destinatario: { ...destinatario, bairro: '', codigo_municipio: '' }
        }
      }),
    (e: unknown) =>
      e instanceof ErroMontagem &&
      /bairro/.test((e as Error).message) &&
      /IBGE/.test((e as Error).message)
  )
})

test('contribuinte de ICMS sem Inscrição Estadual é contradição barrada', () => {
  // A SEFAZ rejeitaria; melhor explicar antes de gastar a tentativa.
  assert.throws(
    () =>
      montarPedidoNfce({
        ...base,
        modelo: 55,
        venda: {
          itens: [item()],
          pagamentos: [],
          destinatario: { ...destinatario, indicador_ie: '1', inscricao_estadual: '' }
        }
      }),
    (e: unknown) => e instanceof ErroMontagem && /Inscrição Estadual/.test((e as Error).message)
  )
})

test('venda para fora do estado é marcada como interestadual', () => {
  const p = montarPedidoNfce({
    ...base,
    modelo: 55,
    venda: {
      itens: [item()],
      pagamentos: [],
      destinatario: { ...destinatario, uf: 'RJ', cidade: 'Rio de Janeiro', codigo_municipio: '3304557' }
    }
  })
  assert.equal(inf(p).ide.idDest, 2) // 2 = interestadual
})

test('CNPJ do destinatário vai limpo, sem máscara', () => {
  const p = montarPedidoNfce({
    ...base,
    modelo: 55,
    venda: {
      itens: [item()],
      pagamentos: [],
      destinatario: { ...destinatario, cnpj: '11.444.777/0001-61' }
    }
  })
  assert.equal(inf(p).dest.CNPJ, '11444777000161')
})
