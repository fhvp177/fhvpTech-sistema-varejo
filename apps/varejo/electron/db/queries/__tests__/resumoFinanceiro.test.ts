/**
 * O mês fechado do dinheiro.
 *
 * ── O que estes testes prendem ──────────────────────────────────────────────
 * Todos os erros possíveis aqui são de CONTA, e nenhum deles quebra tela: o
 * painel mostraria um número redondo, com cara de exato, e errado.
 *
 *  1. **O estorno no lado errado.** Uma conta paga e estornada devolve dinheiro
 *     para a loja. Contado pelo sinal, ele vira RECEITA, e o mês parece ter
 *     faturado o que só deixou de gastar.
 *  2. **Sangria contada como despesa.** A loja que leva o caixa para o cofre
 *     toda noite apareceria com uma despesa do tamanho do faturamento.
 *  3. **O saldo inicial engolindo o dia 1.** A data no livro tem hora; comparar
 *     com o dia seco pelo lado errado do `<=` faz o mês abrir já com as vendas
 *     da manhã dentro, e o mesmo dinheiro aparece duas vezes na tela.
 *  4. **A conta não fechar.** saldo inicial + receitas − despesas + internas
 *     tem que dar o saldo final, senão o lojista soma na calculadora, acha
 *     outro número, e para de confiar no painel.
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

const { resumoFinanceiroMes, mesesComMovimento, ultimoDiaDoMes } = await import(
  '../resumoFinanceiro'
)

// Espelho à mão das migrations 027 e 039, com só o que esta consulta lê.
const SCHEMA = `
  CREATE TABLE contas_financeiras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'banco',
    banco TEXT, agencia TEXT, conta TEXT,
    saldo_inicial REAL NOT NULL DEFAULT 0,
    ativa INTEGER NOT NULL DEFAULT 1,
    padrao_recebimento INTEGER NOT NULL DEFAULT 0,
    padrao_pagamento INTEGER NOT NULL DEFAULT 0,
    forma_padrao TEXT,
    criada_em TEXT
  );
  CREATE TABLE movimentos_financeiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    valor REAL NOT NULL,
    tipo TEXT NOT NULL,
    descricao TEXT, forma_pagamento TEXT,
    origem_tipo TEXT, origem_id INTEGER,
    turno_id INTEGER, vendedor_id INTEGER,
    criado_em TEXT
  );
  CREATE TABLE contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    categoria TEXT,
    fornecedor_id INTEGER,
    valor_total REAL NOT NULL,
    valor_pago REAL NOT NULL DEFAULT 0,
    vencimento DATE,
    observacao TEXT,
    criada_em DATETIME,
    pago_em DATETIME
  );
`

const SEED = `
  INSERT INTO contas_financeiras (id, nome, tipo, saldo_inicial) VALUES (1, 'Caixa da loja', 'caixa', 1000);
  INSERT INTO contas_financeiras (id, nome, tipo, saldo_inicial) VALUES (2, 'Banco', 'banco', 0);
  INSERT INTO contas_pagar (id, descricao, categoria, valor_total) VALUES (1, 'Aluguel de maio', 'Aluguel', 2000);
  INSERT INTO contas_pagar (id, descricao, categoria, valor_total) VALUES (2, 'Energia de maio', 'Energia', 300);
  INSERT INTO contas_pagar (id, descricao, categoria, valor_total) VALUES (3, 'Sacolas', NULL, 80);
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

/** Lança direto no livro, do jeito que `lancarMovimento` lançaria. */
function mov(
  data: string,
  valor: number,
  tipo: string,
  origem?: { tipo: string; id: number },
  contaId = 1
): void {
  db!
    .prepare(
      `INSERT INTO movimentos_financeiros (conta_id, data, valor, tipo, origem_tipo, origem_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(contaId, data, valor, tipo, origem?.tipo ?? null, origem?.id ?? null)
}

describe('resumoFinanceiroMes — de que lado cada lançamento entra', () => {
  seTiverSqlite('venda e recebimento são receita; conta paga é despesa', () => {
    mov('2026-05-04 10:00:00', 500, 'venda', { tipo: 'venda', id: 1 })
    mov('2026-05-10 15:30:00', 200, 'recebimento', { tipo: 'parcela', id: 1 })
    mov('2026-05-05 09:00:00', -2000, 'despesa', { tipo: 'conta_pagar', id: 1 })

    const r = resumoFinanceiroMes('2026-05')
    expect(r.receitas).toBe(700)
    expect(r.despesas).toBe(2000)
    expect(r.resultado).toBe(-1300)
  })

  seTiverSqlite('estorno de conta paga ABATE despesa, não vira receita', () => {
    /*
     * ⚠️ O teste que mais importa deste arquivo. Pelo sinal, os 2000 que
     * voltaram seriam receita, e o mês fecharia com 2000 de faturamento que
     * nunca existiu — com a despesa do aluguel ainda lá, cheia.
     */
    mov('2026-05-05 09:00:00', -2000, 'despesa', { tipo: 'conta_pagar', id: 1 })
    mov('2026-05-06 09:00:00', 2000, 'estorno', { tipo: 'conta_pagar', id: 1 })

    const r = resumoFinanceiroMes('2026-05')
    expect(r.receitas).toBe(0)
    expect(r.despesas).toBe(0)
    expect(r.resultado).toBe(0)
  })

  seTiverSqlite('estorno de recebimento ABATE receita, não vira despesa', () => {
    mov('2026-05-04 10:00:00', 500, 'venda', { tipo: 'venda', id: 1 })
    mov('2026-05-07 10:00:00', -500, 'estorno', { tipo: 'venda', id: 1 })

    const r = resumoFinanceiroMes('2026-05')
    expect(r.receitas).toBe(0)
    expect(r.despesas).toBe(0)
  })

  seTiverSqlite('sangria e suprimento ficam fora de receita e de despesa', () => {
    /*
     * A loja que leva o caixa para o cofre toda noite teria uma "despesa" do
     * tamanho do faturamento, mês após mês.
     */
    mov('2026-05-04 10:00:00', 1000, 'venda', { tipo: 'venda', id: 1 })
    mov('2026-05-04 19:00:00', -900, 'sangria')
    mov('2026-05-05 08:00:00', 100, 'suprimento')

    const r = resumoFinanceiroMes('2026-05')
    expect(r.receitas).toBe(1000)
    expect(r.despesas).toBe(0)
    expect(r.movimentacoes_internas).toBe(-800)
  })

  seTiverSqlite('★ transferência entre contas não vira faturamento nem despesa', () => {
    /*
     * ⚠️ É a mesma nota mudando de bolso. Contada como entrada, a loja que
     * deposita o caixa no banco todo dia apareceria faturando DUAS vezes cada
     * venda — uma na venda e outra no depósito. Quem olha esse número decide
     * compra em cima dele.
     *
     * As duas pontas se anulam na linha de movimentação interna, como já
     * acontece com sangria e suprimento.
     */
    mov('2026-05-04 10:00:00', 1000, 'venda', { tipo: 'venda', id: 1 })
    mov('2026-05-04 18:00:00', -700, 'transferencia', { tipo: 'transferencia', id: 1 })
    mov('2026-05-04 18:00:00', 700, 'transferencia', { tipo: 'transferencia', id: 1 }, 2)

    const r = resumoFinanceiroMes('2026-05')
    expect(r.receitas).toBe(1000)
    expect(r.despesas).toBe(0)
    expect(r.movimentacoes_internas).toBe(0)
  })

  seTiverSqlite('retirada lançada na mão é despesa; aporte é receita', () => {
    mov('2026-05-04 10:00:00', 3000, 'aporte')
    mov('2026-05-20 10:00:00', -700, 'ajuste')

    const r = resumoFinanceiroMes('2026-05')
    expect(r.receitas).toBe(3000)
    expect(r.despesas).toBe(700)
  })
})

describe('resumoFinanceiroMes — os saldos e o fechamento da conta', () => {
  seTiverSqlite('o saldo inicial NÃO engole o dia 1 do mês', () => {
    /*
     * As contas começam com 1000. A venda das 10h do dia 1 é DO mês: ela não
     * pode aparecer no saldo de abertura, senão os mesmos 500 apareceriam duas
     * vezes na tela, no saldo de abertura e na linha de receitas.
     */
    mov('2026-05-01 10:00:00', 500, 'venda', { tipo: 'venda', id: 1 })

    const r = resumoFinanceiroMes('2026-05')
    expect(r.saldo_inicial).toBe(1000)
    expect(r.receitas).toBe(500)
    expect(r.saldo_final).toBe(1500)
  })

  seTiverSqlite('lançamento gravado SEM hora no dia 1 também é do mês', () => {
    /*
     * ⚠️ É este caso que obriga o `<` no saldo inicial, e não o `<=`.
     *
     * Hoje todo lançamento nasce com hora (`datetime('now','localtime')`), e
     * enquanto for assim os dois operadores dão o mesmo resultado: em texto,
     * '2026-05-01 10:00:00' já é MAIOR que '2026-05-01'.
     *
     * A linha sem hora existe do mesmo jeito — vem de banco restaurado e de
     * importação de cliente antigo. Com `<=`, ela cairia dentro do "antes do
     * mês" e o mês abriria contando dinheiro que é dele.
     */
    db!
      .prepare(
        `INSERT INTO movimentos_financeiros (conta_id, data, valor, tipo) VALUES (1, '2026-05-01', 500, 'venda')`
      )
      .run()

    const r = resumoFinanceiroMes('2026-05')
    expect(r.saldo_inicial).toBe(1000)
    expect(r.receitas).toBe(500)
    expect(r.saldo_final).toBe(1500)
  })

  seTiverSqlite('o último dia do mês entra inteiro, até as 23h', () => {
    // Com o filtro no dia seco, tudo o que aconteceu depois da meia-noite do
    // dia 31 ficaria de fora — e o dia 31 é dia de movimento em loja.
    mov('2026-05-31 23:40:00', 250, 'venda', { tipo: 'venda', id: 1 })

    const r = resumoFinanceiroMes('2026-05')
    expect(r.receitas).toBe(250)
    expect(r.por_dia[30].receitas).toBe(250)
  })

  seTiverSqlite('a conta do painel fecha: inicial + receitas − despesas + internas', () => {
    mov('2026-04-28 10:00:00', 400, 'venda', { tipo: 'venda', id: 1 }) // mês anterior
    mov('2026-05-04 10:00:00', 1500, 'venda', { tipo: 'venda', id: 1 })
    mov('2026-05-05 09:00:00', -2000, 'despesa', { tipo: 'conta_pagar', id: 1 })
    mov('2026-05-06 09:00:00', -300, 'despesa', { tipo: 'conta_pagar', id: 2 })
    mov('2026-05-10 19:00:00', -500, 'sangria')
    mov('2026-06-02 10:00:00', 999, 'venda', { tipo: 'venda', id: 1 }) // mês seguinte

    const r = resumoFinanceiroMes('2026-05')
    expect(r.saldo_inicial).toBe(1400) // 1000 de saldo inicial + 400 de abril
    const fechamento =
      r.saldo_inicial + r.receitas - r.despesas + r.movimentacoes_internas
    expect(+fechamento.toFixed(2)).toBe(r.saldo_final)
    // E o mês seguinte não entrou: 1400 + 1500 − 2300 − 500 = 100
    expect(r.saldo_final).toBe(100)
  })

  seTiverSqlite('mês sem nenhum lançamento não inventa movimento', () => {
    mov('2026-05-04 10:00:00', 1500, 'venda', { tipo: 'venda', id: 1 })

    const r = resumoFinanceiroMes('2026-07')
    expect(r.lancamentos).toBe(0)
    expect(r.receitas).toBe(0)
    expect(r.despesas).toBe(0)
    expect(r.despesas_por_categoria).toEqual([])
    // O saldo continua existindo: a loja tem dinheiro parado mesmo num mês parado.
    expect(r.saldo_inicial).toBe(2500)
    expect(r.saldo_final).toBe(2500)
  })
})

describe('resumoFinanceiroMes — despesas por categoria', () => {
  seTiverSqlite('agrupa pela categoria da conta a pagar, da maior para a menor', () => {
    mov('2026-05-05 09:00:00', -2000, 'despesa', { tipo: 'conta_pagar', id: 1 }) // Aluguel
    mov('2026-05-06 09:00:00', -300, 'despesa', { tipo: 'conta_pagar', id: 2 }) // Energia
    mov('2026-05-07 09:00:00', -150, 'despesa', { tipo: 'conta_pagar', id: 2 }) // Energia de novo

    const r = resumoFinanceiroMes('2026-05')
    expect(r.despesas_por_categoria).toEqual([
      { categoria: 'Aluguel', total: 2000, lancamentos: 1 },
      { categoria: 'Energia', total: 450, lancamentos: 2 }
    ])
  })

  seTiverSqlite('conta sem categoria e saída sem conta são linhas DIFERENTES', () => {
    /*
     * Uma é conta cadastrada com o campo em branco; a outra nunca teve campo
     * para preencher. Juntá-las esconderia que existe dinheiro saindo por fora
     * das contas a pagar.
     */
    mov('2026-05-05 09:00:00', -80, 'despesa', { tipo: 'conta_pagar', id: 3 }) // sem categoria
    mov('2026-05-08 09:00:00', -40, 'ajuste')

    const r = resumoFinanceiroMes('2026-05')
    const nomes = r.despesas_por_categoria.map((c) => c.categoria)
    expect(nomes).toEqual(['Sem categoria', 'Outras saídas'])
  })

  seTiverSqlite('"Outras saídas" vai para o fim mesmo sendo a maior', () => {
    mov('2026-05-05 09:00:00', -5000, 'ajuste')
    mov('2026-05-06 09:00:00', -300, 'despesa', { tipo: 'conta_pagar', id: 2 })

    const r = resumoFinanceiroMes('2026-05')
    expect(r.despesas_por_categoria.map((c) => c.categoria)).toEqual([
      'Energia',
      'Outras saídas'
    ])
  })

  seTiverSqlite('categoria totalmente estornada some da lista', () => {
    // "Aluguel: R$ 0,00" sugeriria que o aluguel foi de graça neste mês.
    mov('2026-05-05 09:00:00', -2000, 'despesa', { tipo: 'conta_pagar', id: 1 })
    mov('2026-05-06 09:00:00', 2000, 'estorno', { tipo: 'conta_pagar', id: 1 })
    mov('2026-05-07 09:00:00', -300, 'despesa', { tipo: 'conta_pagar', id: 2 })

    const r = resumoFinanceiroMes('2026-05')
    expect(r.despesas_por_categoria).toEqual([
      { categoria: 'Energia', total: 300, lancamentos: 1 }
    ])
  })

  seTiverSqlite('a soma das categorias bate com a linha de despesas', () => {
    mov('2026-05-05 09:00:00', -2000, 'despesa', { tipo: 'conta_pagar', id: 1 })
    mov('2026-05-06 09:00:00', -300, 'despesa', { tipo: 'conta_pagar', id: 2 })
    mov('2026-05-07 09:00:00', -80, 'despesa', { tipo: 'conta_pagar', id: 3 })
    mov('2026-05-08 09:00:00', -40, 'ajuste')

    const r = resumoFinanceiroMes('2026-05')
    const soma = r.despesas_por_categoria.reduce((s, c) => s + c.total, 0)
    expect(+soma.toFixed(2)).toBe(r.despesas)
  })
})

describe('resumoFinanceiroMes — o mês dia a dia', () => {
  seTiverSqlite('sai o mês inteiro, com os dias parados em zero', () => {
    /*
     * Um gráfico só com os dias que tiveram movimento mente sobre o ritmo da
     * loja: três vendas em três segundas viram três barras coladas, como se
     * tivessem sido três dias seguidos de movimento.
     */
    mov('2026-02-10 10:00:00', 100, 'venda', { tipo: 'venda', id: 1 })

    const r = resumoFinanceiroMes('2026-02')
    expect(r.por_dia).toHaveLength(28)
    expect(r.por_dia[0]).toEqual({ dia: '2026-02-01', receitas: 0, despesas: 0 })
    expect(r.por_dia[9]).toEqual({ dia: '2026-02-10', receitas: 100, despesas: 0 })
  })

  seTiverSqlite('a soma dos dias bate com os totais do topo', () => {
    mov('2026-05-04 10:00:00', 1500, 'venda', { tipo: 'venda', id: 1 })
    mov('2026-05-04 18:00:00', 200, 'recebimento', { tipo: 'parcela', id: 1 })
    mov('2026-05-05 09:00:00', -2000, 'despesa', { tipo: 'conta_pagar', id: 1 })
    mov('2026-05-20 19:00:00', -500, 'sangria')

    const r = resumoFinanceiroMes('2026-05')
    const somaRec = r.por_dia.reduce((s, d) => s + d.receitas, 0)
    const somaDesp = r.por_dia.reduce((s, d) => s + d.despesas, 0)
    expect(+somaRec.toFixed(2)).toBe(r.receitas)
    expect(+somaDesp.toFixed(2)).toBe(r.despesas)
  })
})

describe('resumoFinanceiroMes — conta por conta e lista de meses', () => {
  seTiverSqlite('separa entradas, saídas e saldo de cada conta', () => {
    mov('2026-05-04 10:00:00', 500, 'venda', { tipo: 'venda', id: 1 }, 1)
    mov('2026-05-04 10:00:00', 800, 'venda', { tipo: 'venda', id: 2 }, 2)
    mov('2026-05-05 09:00:00', -300, 'despesa', { tipo: 'conta_pagar', id: 2 }, 2)

    const r = resumoFinanceiroMes('2026-05')
    const caixa = r.por_conta.find((c) => c.conta_id === 1)!
    const bancoConta = r.por_conta.find((c) => c.conta_id === 2)!
    expect(caixa).toMatchObject({ entradas: 500, saidas: 0, saldo_final: 1500 })
    expect(bancoConta).toMatchObject({ entradas: 800, saidas: 300, saldo_final: 500 })
  })

  seTiverSqlite('os meses com movimento vêm do mais novo para o mais velho', () => {
    mov('2026-03-04 10:00:00', 10, 'venda', { tipo: 'venda', id: 1 })
    mov('2026-05-04 10:00:00', 10, 'venda', { tipo: 'venda', id: 1 })
    mov('2026-05-09 10:00:00', 10, 'venda', { tipo: 'venda', id: 1 })
    mov('2025-12-31 10:00:00', 10, 'venda', { tipo: 'venda', id: 1 })

    expect(mesesComMovimento()).toEqual(['2026-05', '2026-03', '2025-12'])
  })

  seTiverSqlite('mês fora do formato é recusado antes de tocar o banco', () => {
    expect(() => resumoFinanceiroMes('2026-13')).toThrow(/Mês inválido/)
    expect(() => resumoFinanceiroMes('maio')).toThrow(/Mês inválido/)
    expect(() => resumoFinanceiroMes('')).toThrow(/Mês inválido/)
  })
})

describe('ultimoDiaDoMes', () => {
  it('acerta fevereiro, bissexto e os meses de 30 e 31', () => {
    expect(ultimoDiaDoMes('2026-02')).toBe('2026-02-28')
    expect(ultimoDiaDoMes('2024-02')).toBe('2024-02-29')
    expect(ultimoDiaDoMes('2026-04')).toBe('2026-04-30')
    expect(ultimoDiaDoMes('2026-12')).toBe('2026-12-31')
    expect(ultimoDiaDoMes('2026-01')).toBe('2026-01-31')
  })
})
