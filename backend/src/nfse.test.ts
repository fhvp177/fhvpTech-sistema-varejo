// Testes do montador de NFS-e. Usa node:test + node:assert (nativos, sem
// dependência) porque o backend não tem vitest e o montador é código puro.
// Rodar: npx tsx --test src/nfse.test.ts
//
// O foco é o que a prefeitura rejeita sem perdão — totais que não fecham no
// centavo — e o que o lojista não consegue adivinhar sozinho: o item da LC 116
// e a alíquota de ISS, que vêm do contador. Nesses casos a mensagem tem que
// nomear o serviço, senão vira "deu erro" ao telefone.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarPedidoNfse } from './nfse.ts'
import { ErroMontagem } from './nfce.ts'

const prestador = { cnpj: '11.222.333/0001-81', codigo_municipio: '2310258' }
const base = { prestador, ambiente: 'homologacao' as const, referencia: 'os1' }
const tomador = { nome: 'Maria de Fátima', cpf: '123.456.789-09' }

const servico = (over = {}) => ({
  nome: 'Formatação com backup',
  item_lista_servico: '14.02',
  aliquota_iss: 5,
  quantidade: 1,
  valor_unitario: 100,
  ...over
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rps = (p: Record<string, unknown>) => (p as any).rps
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const valores = (p: Record<string, unknown>) => (p as any).rps.servicos.valores

test('monta o pedido no formato que a ACBr espera', () => {
  const p = montarPedidoNfse({ ...base, venda: { servicos: [servico()], tomador } })
  assert.equal((p as { ambiente: string }).ambiente, 'homologacao')
  assert.equal(rps(p).referencia, 'os1')
  // CNPJ e IBGE vão sem máscara.
  assert.equal(rps(p).prestador.cpf_cnpj, '11222333000181')
  assert.equal(rps(p).servicos.codigo_municipio, '2310258')
  assert.equal(rps(p).tomador.cpf_cnpj, '12345678909')
  assert.equal(rps(p).tomador.nome_razao_social, 'Maria de Fátima')
})

test('totais fecham: bruto, desconto e líquido', () => {
  const p = montarPedidoNfse({
    ...base,
    venda: {
      servicos: [servico({ valor_unitario: 39.9, quantidade: 2 }), servico({ valor_unitario: 25 })],
      desconto: 5,
      tomador
    }
  })
  const v = valores(p)
  assert.equal(v.valor_servicos, 104.8) // 79.80 + 25.00
  assert.equal(v.desconto_incondicionado, 5)
  assert.equal(v.valor_unitario, 99.8) // já líquido do desconto
})

test('o centavo do rateio não some: desconto indivisível fecha na última linha', () => {
  // 0,01 de desconto sobre 3 linhas iguais não divide em 3 partes exatas.
  const p = montarPedidoNfse({
    ...base,
    venda: {
      servicos: [servico(), servico(), servico()],
      desconto: 0.01,
      tomador
    }
  })
  const v = valores(p)
  assert.equal(v.valor_servicos, 300)
  assert.equal(v.desconto_incondicionado, 0.01)
  assert.equal(v.valor_unitario, 299.99)
})

test('ISS é somado por linha, respeitando alíquotas diferentes', () => {
  // 100 a 5% = 5,00 · 200 a 2% = 4,00 → 9,00. Uma alíquota média sobre o total
  // daria outro número e a prefeitura recusaria.
  const p = montarPedidoNfse({
    ...base,
    venda: {
      servicos: [
        servico({ valor_unitario: 100, aliquota_iss: 5 }),
        servico({ nome: 'Assessoria', valor_unitario: 200, aliquota_iss: 2 })
      ],
      tomador
    }
  })
  assert.equal(valores(p).valor_iss, 9)
})

test('ISS retido preenche valor_iss_retido e desconta do líquido', () => {
  const p = montarPedidoNfse({
    ...base,
    prestador: { ...prestador, iss_retido: true },
    venda: { servicos: [servico({ valor_unitario: 100, aliquota_iss: 5 })], tomador }
  })
  assert.equal(rps(p).servicos.iss_retido, true)
  assert.equal(rps(p).servicos.responsavel_retencao, 1)
  assert.equal(valores(p).valor_iss_retido, 5)
  assert.equal(valores(p).valor_liquido, 95)
})

test('sem discriminação própria, lista os serviços (nunca vai vazia)', () => {
  const p = montarPedidoNfse({
    ...base,
    venda: {
      servicos: [servico({ nome: 'Limpeza', quantidade: 2 }), servico({ nome: 'Troca de tela' })],
      tomador
    }
  })
  assert.equal(rps(p).servicos.discriminacao, '2x Limpeza | Troca de tela')
})

test('discriminação própria (o defeito da OS) tem prioridade', () => {
  const p = montarPedidoNfse({
    ...base,
    venda: {
      servicos: [servico()],
      tomador,
      discriminacao: 'Notebook Dell — não ligava. Trocada a fonte.'
    }
  })
  assert.equal(rps(p).servicos.discriminacao, 'Notebook Dell — não ligava. Trocada a fonte.')
})

// ── O que precisa BARRAR antes de gastar crédito ─────────────────────────────

test('serviço sem item da LC 116 é barrado NOMEANDO o serviço', () => {
  assert.throws(
    () =>
      montarPedidoNfse({
        ...base,
        venda: { servicos: [servico({ nome: 'Visita técnica', item_lista_servico: '' })], tomador }
      }),
    (e: Error) => e instanceof ErroMontagem && e.message.includes('Visita técnica')
  )
})

test('item da LC 116 fora do formato é barrado', () => {
  assert.throws(
    () =>
      montarPedidoNfse({
        ...base,
        venda: { servicos: [servico({ item_lista_servico: 'conserto' })], tomador }
      }),
    (e: Error) => e instanceof ErroMontagem && e.message.includes('14.02')
  )
})

test('alíquota de ISS inválida é barrada', () => {
  for (const aliquota of [-1, 101, Number.NaN]) {
    assert.throws(
      () =>
        montarPedidoNfse({
          ...base,
          venda: { servicos: [servico({ aliquota_iss: aliquota })], tomador }
        }),
      ErroMontagem
    )
  }
})

test('venda sem cliente é barrada: a NFS-e exige tomador', () => {
  assert.throws(
    () =>
      montarPedidoNfse({
        ...base,
        venda: { servicos: [servico()], tomador: { nome: '  ' } }
      }),
    (e: Error) => e instanceof ErroMontagem && e.message.includes('cliente')
  )
})

test('venda sem serviço é barrada', () => {
  assert.throws(
    () => montarPedidoNfse({ ...base, venda: { servicos: [], tomador } }),
    ErroMontagem
  )
})

test('código IBGE incompleto é barrado com instrução de onde arrumar', () => {
  assert.throws(
    () =>
      montarPedidoNfse({
        ...base,
        prestador: { ...prestador, codigo_municipio: '2310' },
        venda: { servicos: [servico()], tomador }
      }),
    (e: Error) => e instanceof ErroMontagem && e.message.includes('7 dígitos')
  )
})

test('endereço do tomador só entra quando existe, sem campos vazios', () => {
  const semEndereco = montarPedidoNfse({ ...base, venda: { servicos: [servico()], tomador } })
  assert.equal(rps(semEndereco).tomador.endereco, undefined)

  const comEndereco = montarPedidoNfse({
    ...base,
    venda: {
      servicos: [servico()],
      tomador: {
        ...tomador,
        endereco: { logradouro: 'Rua A', numero: '10', cep: '62.770-000', bairro: '' }
      }
    }
  })
  const e = rps(comEndereco).tomador.endereco
  assert.equal(e.logradouro, 'Rua A')
  assert.equal(e.cep, '62770000')
  assert.equal('bairro' in e, false) // vazio não vai
})
