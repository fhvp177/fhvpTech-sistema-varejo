/**
 * Tráfego pago e ROAS.
 *
 * ── O que estes testes prendem ──────────────────────────────────────────────
 *  1. **O rateio por dias.** A fatura do anúncio fecha por mês; o Painel filtra
 *     por janela. Errar a fração faz o investimento do período sair maior ou
 *     menor, e o ROAS inteiro sai errado sem nada parecer quebrado.
 *  2. **Zero apaga, não grava.** Canal com R$ 0,00 gravado entraria na lista de
 *     canais pagos com nada no denominador: a receita dele contaria e o ROAS do
 *     período inflaria.
 *  3. **Corrigir o valor não duplica.** O lojista volta nessa tela. Sem o
 *     UNIQUE, cada correção somaria e o ROAS despencaria sozinho.
 *  4. **Venda sem cliente não é atribuída.** Balcão anônimo não veio de anúncio
 *     nenhum que o sistema conheça; contá-la inflaria o retorno de toda loja
 *     que vende no balcão.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

type Adaptador = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown
    get: (...args: unknown[]) => unknown
    all: (...args: unknown[]) => unknown
  }
  transaction: (fn: (...a: never[]) => unknown) => (...args: never[]) => unknown
}

let banco: Adaptador | null = null

vi.mock('@fhvptech/core/electron/db/conexao', () => ({
  obterBancoDeDados: () => {
    if (!banco) throw new Error('banco de teste não inicializado')
    return banco
  }
}))

const { mesesDoPeriodo, investimentosDoMes, gravarInvestimentos, resumoTrafego } = await import(
  '../trafegoPago'
)

// Espelho à mão das migrations 044 e 050, com só o que estas consultas leem.
const SCHEMA = `
  CREATE TABLE origens_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE COLLATE NOCASE
  );
  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT,
    data_cadastro DATETIME,
    origem_id INTEGER REFERENCES origens_cliente(id)
  );
  CREATE TABLE vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    data DATETIME,
    total REAL NOT NULL,
    cancelada INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE investimentos_trafego (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mes TEXT NOT NULL,
    origem_id INTEGER NOT NULL REFERENCES origens_cliente(id) ON DELETE CASCADE,
    valor REAL NOT NULL DEFAULT 0,
    observacao TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(mes, origem_id)
  );
`

const SEED = `
  INSERT INTO origens_cliente (id, nome) VALUES (1, 'Instagram'), (2, 'Google'), (3, 'Indicação');
`

let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  db.exec(SCHEMA)
  db.exec(SEED)
  banco = {
    exec: (sql) => db!.exec(sql),
    prepare: (sql) => {
      const st = db!.prepare(sql)
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: (...a: unknown[]) => st.run(...(a as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: (...a: unknown[]) => st.get(...(a as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all: (...a: unknown[]) => st.all(...(a as any[]))
      }
    },
    transaction:
      (fn) =>
      (...args) =>
        fn(...args)
  }
})

const temSqlite = !!sqlite
const seTiverSqlite = temSqlite ? it : it.skip

function cliente(id: number, origemId: number | null, cadastro: string): void {
  db!
    .prepare(
      `INSERT INTO clientes (id, nome, telefone, data_cadastro, origem_id) VALUES (?, ?, '', ?, ?)`
    )
    .run(id, `Cliente ${id}`, cadastro, origemId)
}

function venda(clienteId: number | null, data: string, total: number, cancelada = 0): void {
  db!
    .prepare('INSERT INTO vendas (cliente_id, data, total, cancelada) VALUES (?, ?, ?, ?)')
    .run(clienteId, data, total, cancelada)
}

describe('mesesDoPeriodo — o rateio da fatura do anúncio', () => {
  it('um mês inteiro é fração 1', () => {
    expect(mesesDoPeriodo('2026-05-01', '2026-05-31')).toEqual([{ mes: '2026-05', fracao: 1 }])
  })

  it('meio mês é meio mês, contado nos dias DAQUELE mês', () => {
    // 15 dias de abril, que tem 30: metade.
    expect(mesesDoPeriodo('2026-04-16', '2026-04-30')).toEqual([{ mes: '2026-04', fracao: 0.5 }])
  })

  it('janela que atravessa a virada divide entre os dois meses', () => {
    /*
     * 20/04 a 19/05: 11 dias de abril (20 a 30) e 19 dias de maio (1 a 19).
     * A fração de abril é 11/30, a de maio é 19/31 — denominadores DIFERENTES,
     * porque é o mês que manda, não o período.
     */
    const r = mesesDoPeriodo('2026-04-20', '2026-05-19')
    expect(r).toHaveLength(2)
    expect(r[0].mes).toBe('2026-04')
    expect(r[0].fracao).toBeCloseTo(11 / 30, 10)
    expect(r[1].mes).toBe('2026-05')
    expect(r[1].fracao).toBeCloseTo(19 / 31, 10)
  })

  it('fevereiro tem 28 dias, e 29 no bissexto', () => {
    expect(mesesDoPeriodo('2026-02-01', '2026-02-28')[0].fracao).toBe(1)
    expect(mesesDoPeriodo('2024-02-01', '2024-02-29')[0].fracao).toBe(1)
    // 14 dias de fevereiro de 2026 (28 dias) é metade; de 2024 (29) não é.
    expect(mesesDoPeriodo('2026-02-01', '2026-02-14')[0].fracao).toBeCloseTo(0.5, 10)
    expect(mesesDoPeriodo('2024-02-01', '2024-02-14')[0].fracao).toBeCloseTo(14 / 29, 10)
  })

  it('um ano inteiro devolve os doze meses, todos cheios', () => {
    const r = mesesDoPeriodo('2026-01-01', '2026-12-31')
    expect(r).toHaveLength(12)
    expect(r.every((m) => m.fracao === 1)).toBe(true)
    expect(r[0].mes).toBe('2026-01')
    expect(r[11].mes).toBe('2026-12')
  })

  it('um dia só é um dia só', () => {
    const r = mesesDoPeriodo('2026-05-10', '2026-05-10')
    expect(r).toEqual([{ mes: '2026-05', fracao: 1 / 31 }])
  })

  it('período invertido ou mal formado devolve lista vazia, sem girar', () => {
    expect(mesesDoPeriodo('2026-05-10', '2026-05-01')).toEqual([])
    expect(mesesDoPeriodo('maio', '2026-05-01')).toEqual([])
    expect(mesesDoPeriodo('', '')).toEqual([])
  })
})

describe('gravarInvestimentos — o que entra no livro do anúncio', () => {
  seTiverSqlite('grava por canal e devolve com todas as origens na lista', () => {
    gravarInvestimentos('2026-05', [
      { origem_id: 1, valor: 300 },
      { origem_id: 2, valor: 150.5 }
    ])

    const linhas = investimentosDoMes('2026-05')
    expect(linhas).toHaveLength(3) // as três origens, mesmo a sem investimento
    expect(linhas.find((l) => l.origem_nome === 'Instagram')!.valor).toBe(300)
    expect(linhas.find((l) => l.origem_nome === 'Google')!.valor).toBe(150.5)
    expect(linhas.find((l) => l.origem_nome === 'Indicação')!.valor).toBe(0)
  })

  seTiverSqlite('★ os canais já lançados sobem para o topo da lista', () => {
    /*
     * A lista são as ORIGENS DE CLIENTE da loja, e nem todas são pagas —
     * "Indicação" convive com "Instagram". Vendo quatro campos em ordem
     * alfabética, o lojista perguntou "por que tenho que informar em 4
     * cantos?". Com os pagos em cima, a tela responde sozinha.
     */
    gravarInvestimentos('2026-05', [{ origem_id: 3, valor: 200 }])

    const linhas = investimentosDoMes('2026-05')
    expect(linhas[0].origem_nome).toBe('Indicação')
    // Os sem valor seguem em ordem alfabética, logo abaixo.
    expect(linhas.slice(1).map((l) => l.origem_nome)).toEqual(['Google', 'Instagram'])
  })

  seTiverSqlite('cada canal diz quantos clientes vieram por ele', () => {
    // É o que faz o lojista reconhecer a linha. Não entra em conta nenhuma.
    cliente(1, 1, '2026-05-02')
    cliente(2, 1, '2026-05-03')
    cliente(3, 2, '2026-05-04')

    const linhas = investimentosDoMes('2026-05')
    expect(linhas.find((l) => l.origem_nome === 'Instagram')!.clientes).toBe(2)
    expect(linhas.find((l) => l.origem_nome === 'Google')!.clientes).toBe(1)
    expect(linhas.find((l) => l.origem_nome === 'Indicação')!.clientes).toBe(0)
  })

  seTiverSqlite('corrigir o valor SUBSTITUI, nunca soma', () => {
    /*
     * ⚠️ O lojista volta nessa tela. Sem o UNIQUE mais o ON CONFLICT, a segunda
     * gravação viraria uma linha nova: o investimento do mês dobraria e o ROAS
     * cairia pela metade sem nada ter acontecido.
     */
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 300 }])
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 450 }])

    const linhas = investimentosDoMes('2026-05')
    expect(linhas.find((l) => l.origem_id === 1)!.valor).toBe(450)
    const { n } = db!
      .prepare('SELECT COUNT(*) AS n FROM investimentos_trafego')
      .get() as { n: number }
    expect(n).toBe(1)
  })

  seTiverSqlite('valor zero APAGA a linha em vez de gravar zero', () => {
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 300 }])
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 0 }])

    const { n } = db!
      .prepare('SELECT COUNT(*) AS n FROM investimentos_trafego')
      .get() as { n: number }
    expect(n).toBe(0)
  })

  seTiverSqlite('valor negativo é recusado', () => {
    expect(() => gravarInvestimentos('2026-05', [{ origem_id: 1, valor: -10 }])).toThrow(
      /não pode ser negativo/
    )
  })

  seTiverSqlite('mês fora do formato é recusado', () => {
    expect(() => gravarInvestimentos('2026-13', [{ origem_id: 1, valor: 10 }])).toThrow(
      /Mês inválido/
    )
    expect(() => investimentosDoMes('maio')).toThrow(/Mês inválido/)
  })
})

describe('resumoTrafego — o ROAS', () => {
  seTiverSqlite('ROAS atribuído usa só o faturamento de quem veio do canal', () => {
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 1000 }])
    cliente(1, 1, '2026-05-02') // veio do Instagram
    cliente(2, 3, '2026-05-02') // veio de indicação, canal não pago
    venda(1, '2026-05-10 10:00:00', 3000)
    venda(2, '2026-05-11 10:00:00', 5000)

    const r = resumoTrafego('2026-05-01', '2026-05-31')
    expect(r.investimento).toBe(1000)
    expect(r.receita_atribuida).toBe(3000)
    expect(r.roas_atribuido).toBe(3)
    // O geral pega a loja inteira: 8000 ÷ 1000.
    expect(r.receita_total).toBe(8000)
    expect(r.roas_geral).toBe(8)
  })

  seTiverSqlite('venda de balcão, sem cliente, NÃO é atribuída a canal nenhum', () => {
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 500 }])
    cliente(1, 1, '2026-05-02')
    venda(1, '2026-05-10 10:00:00', 1000)
    venda(null, '2026-05-12 10:00:00', 9000) // balcão anônimo

    const r = resumoTrafego('2026-05-01', '2026-05-31')
    expect(r.receita_atribuida).toBe(1000)
    expect(r.roas_atribuido).toBe(2)
    // Mas ela conta no geral, que é o faturamento da loja.
    expect(r.receita_total).toBe(10000)
  })

  seTiverSqlite('venda cancelada não entra em lado nenhum', () => {
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 500 }])
    cliente(1, 1, '2026-05-02')
    venda(1, '2026-05-10 10:00:00', 1000)
    venda(1, '2026-05-11 10:00:00', 7000, 1) // cancelada

    const r = resumoTrafego('2026-05-01', '2026-05-31')
    expect(r.receita_atribuida).toBe(1000)
    expect(r.receita_total).toBe(1000)
  })

  seTiverSqlite('canal sem investimento no período fica de fora da conta', () => {
    /*
     * A indicação traz cliente e traz dinheiro, mas não custou nada: colocá-la
     * no numerador do ROAS faria o anúncio levar crédito pelo boca a boca.
     */
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 200 }])
    cliente(1, 1, '2026-05-02')
    cliente(2, 3, '2026-05-02')
    venda(1, '2026-05-10 10:00:00', 600)
    venda(2, '2026-05-10 10:00:00', 4000)

    const r = resumoTrafego('2026-05-01', '2026-05-31')
    expect(r.canais.map((c) => c.origem_nome)).toEqual(['Instagram'])
    expect(r.receita_atribuida).toBe(600)
  })

  seTiverSqlite('sem investimento nenhum, o ROAS é zero e não divide por zero', () => {
    cliente(1, 1, '2026-05-02')
    venda(1, '2026-05-10 10:00:00', 1000)

    const r = resumoTrafego('2026-05-01', '2026-05-31')
    expect(r.investimento).toBe(0)
    expect(r.roas_atribuido).toBe(0)
    expect(r.roas_geral).toBe(0)
    expect(r.custo_por_cliente).toBe(0)
    expect(r.canais).toEqual([])
  })

  seTiverSqlite('o investimento é rateado quando a janela atravessa a virada', () => {
    /*
     * R$ 300 em abril (30 dias) e R$ 620 em maio (31 dias). A janela de 20/04 a
     * 19/05 pega 11 dias de abril e 19 de maio:
     *   300 × 11/30 = 110,00
     *   620 × 19/31 = 380,00
     *   total       = 490,00
     */
    gravarInvestimentos('2026-04', [{ origem_id: 1, valor: 300 }])
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 620 }])

    const r = resumoTrafego('2026-04-20', '2026-05-19')
    expect(r.investimento).toBe(490)
    expect(r.canais[0].investimento).toBe(490)
  })

  seTiverSqlite('custo por cliente novo usa só quem se cadastrou no período', () => {
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 600 }])
    cliente(1, 1, '2026-05-02')
    cliente(2, 1, '2026-05-20')
    cliente(3, 1, '2026-03-01') // cliente antigo do mesmo canal

    const r = resumoTrafego('2026-05-01', '2026-05-31')
    expect(r.clientes_novos_atribuidos).toBe(2)
    expect(r.custo_por_cliente).toBe(300)
  })

  seTiverSqlite('conta quantos clientes estão sem origem, para a tela poder avisar', () => {
    /*
     * É o aviso que separa "o anúncio não funciona" de "ninguém preencheu de
     * onde o cliente veio". Sem ele, o ROAS zerado seria lido como fracasso.
     */
    gravarInvestimentos('2026-05', [{ origem_id: 1, valor: 100 }])
    cliente(1, null, '2026-05-02')
    cliente(2, null, '2026-05-03')
    cliente(3, 1, '2026-05-04')

    const r = resumoTrafego('2026-05-01', '2026-05-31')
    expect(r.clientes_sem_origem).toBe(2)
  })

  seTiverSqlite('canais saem ordenados pelo maior gasto', () => {
    gravarInvestimentos('2026-05', [
      { origem_id: 1, valor: 100 },
      { origem_id: 2, valor: 900 }
    ])

    const r = resumoTrafego('2026-05-01', '2026-05-31')
    expect(r.canais.map((c) => c.origem_nome)).toEqual(['Google', 'Instagram'])
  })
})
