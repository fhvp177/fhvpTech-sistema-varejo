/**
 * O dinheiro da OS entregue entra no MESMO caixa da venda de balcão.
 *
 * ── Por que isto é uma decisão, e não um detalhe ────────────────────────────
 * No varejo a venda nasce num lugar só: o PDV. Aqui existem dois — o balcão e a
 * entrega da ordem de serviço — e o conserto é a maior parte do que a oficina
 * recebe.
 *
 * Se a entrega de OS não passasse pelo caixa, o fechamento do dia contaria só a
 * venda de balcão e fecharia faltando justamente o dinheiro principal. Todo dia.
 * O operador contaria a gaveta certa e o sistema o acusaria de sobra.
 *
 * ── ⚠️ Por que a guarda lê o código ─────────────────────────────────────────
 * O comportamento em si já está preso em `livroCaixa.test.ts`, que prova que
 * `criarVenda` recusa sem caixa quando a oficina exige e lança o movimento no
 * turno. O que pode se perder sem ninguém notar é o ELO: a tela que sabe qual é
 * o aparelho, o campo que atravessa a fronteira, e o repasse ao `criarVenda`.
 *
 * Quebrar qualquer um dos três não dá erro de compilação nem deixa outro teste
 * vermelho — a OS continua sendo entregue, e o dinheiro dela é que some da
 * conferência. Por isso os três são cobrados aqui, um por asserção.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ORDENS = readFileSync(join(AQUI, '..', 'ordens.ts'), 'utf-8')
const TELA = readFileSync(
  join(AQUI, '..', '..', '..', '..', 'src', 'pages', 'OrdensServico.tsx'),
  'utf-8'
)

describe('a entrega de OS entra no caixa', () => {
  it('★ o fechamento da OS aceita o caixa de quem entrega', () => {
    expect(ORDENS, 'o campo do caixa sumiu do contrato de fechamento da OS').toMatch(
      /DadosFechamentoOS = \{[\s\S]*?caixa_id\?: number \| null[\s\S]*?\n\}/
    )
  })

  it('★ e o repassa para a venda, em vez de deixar cair em nulo', () => {
    /*
     * ⚠️ Sem esta linha a venda da OS nasce sem turno mesmo com a oficina
     * exigindo caixa — e, pior, PASSA: `criarVenda` só recusa quando não há
     * caixa nenhum, então o dinheiro entraria fora de qualquer conferência sem
     * nada reclamar.
     */
    expect(ORDENS, 'a venda da OS parou de receber o caixa da entrega').toContain(
      'caixa_id: dados.caixa_id ?? null'
    )
  })

  it('★ a tela manda o caixa do aparelho, e nos dois caminhos de entrega', () => {
    /*
     * São dois: a entrega com cobrança e a sem cobrança (cortesia/garantia). A
     * segunda não gera venda e o campo é ignorado — mas os dois caminhos mandam
     * o mesmo, para não deixar um par que se comporta diferente esperando quem
     * mexer nisto depois.
     */
    expect(TELA, 'a tela deixou de saber em qual caixa este aparelho está').toContain(
      'useCaixaDoAparelho()'
    )
    const chamada = TELA.slice(
      TELA.indexOf('window.api.os.fechar('),
      TELA.indexOf('setSalvando(false)', TELA.indexOf('window.api.os.fechar('))
    )
    expect(chamada.length, 'a fatia da chamada ficou vazia — a varredura quebrou').toBeGreaterThan(
      100
    )
    const quantos = chamada.split('caixa_id').length - 1
    expect(quantos, 'um dos dois caminhos de entrega parou de mandar o caixa').toBe(2)
  })

  it('★ o código de erro do caixa é traduzido antes de chegar à tela', () => {
    // `CAIXA_FECHADO` é código de fronteira, não frase. Com o cliente esperando
    // o aparelho, a mensagem precisa dizer o que fazer.
    expect(TELA).toContain("resp.error === 'CAIXA_FECHADO'")
    expect(TELA).toMatch(/Abra o caixa em Financeiro/)
  })
})
