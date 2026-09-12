/**
 * O custo e o lucro de cada dia, no Painel.
 *
 * ── Para que serve, e por que isso muda o rigor ─────────────────────────────
 * O lojista separa todo dia o dinheiro de comprar de volta o que vendeu, e usa
 * ESTE número para saber quanto mandar para a conta de reposição. Errar aqui
 * não é um gráfico feio: é ele mandando menos do que devia e gastando o dinheiro
 * da mercadoria achando que era lucro.
 *
 * ── O que este arquivo prende ───────────────────────────────────────────────
 *
 *  1. ★ **O custo entra no dia da VENDA.** Faturamento e custo têm que cair no
 *     mesmo balde; separados, o dia mostraria receita sem custo e vice-versa.
 *
 *  2. ★ **Vale o custo CONGELADO no item**, não o preço de compra de hoje.
 *     Senão o lucro do passado inteiro muda quando o fornecedor reajusta.
 *
 *  3. ★ **Produto sem custo é DENUNCIADO.** Ele entra como zero e infla o
 *     lucro; sem o aviso, o gráfico mente calado justamente para quem confia
 *     nele para separar dinheiro.
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

const { obterMetricasDashboard } = await import('../dashboard')

const SCHEMA = `
  CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, telefone TEXT, data_nascimento TEXT, data_cadastro TEXT);
  CREATE TABLE vendedores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, categoria TEXT,
    preco REAL NOT NULL, custo REAL NOT NULL DEFAULT 0, estoque INTEGER DEFAULT 0,
    reservado INTEGER NOT NULL DEFAULT 0, arquivado INTEGER NOT NULL DEFAULT 0,
    data_cadastro TEXT
  );
  CREATE TABLE produto_variacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER NOT NULL,
    tamanho TEXT, codigo_barras TEXT, estoque INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, vendedor_id INTEGER,
    data TEXT NOT NULL, total REAL NOT NULL, desconto REAL NOT NULL DEFAULT 0,
    entrada REAL NOT NULL DEFAULT 0, valor_pago REAL NOT NULL DEFAULT 0,
    status_pagamento TEXT DEFAULT 'pago', data_vencimento TEXT, num_parcelas INTEGER,
    forma_pagamento TEXT, cancelada INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE itens_venda (
    id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL, variacao_id INTEGER,
    quantidade INTEGER NOT NULL, preco_unitario REAL NOT NULL, custo_unitario REAL
  );
  CREATE TABLE parcelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER NOT NULL, numero INTEGER NOT NULL,
    valor REAL NOT NULL, data_vencimento TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendente'
  );
  CREATE TABLE devolucoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER NOT NULL,
    valor_total REAL NOT NULL, data TEXT
  );
  CREATE TABLE contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT, descricao TEXT NOT NULL, categoria TEXT,
    valor_total REAL NOT NULL, valor_pago REAL NOT NULL DEFAULT 0,
    vencimento TEXT NOT NULL, pago_em TEXT
  );
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
`

const SEED = `
  INSERT INTO vendedores (id, nome) VALUES (1, 'Ana');
  INSERT INTO clientes (id, nome) VALUES (1, 'Maria');
  -- custo 60 no cadastro; o item guarda o custo do dia da venda
  INSERT INTO produtos (id, nome, preco, custo, estoque) VALUES (1, 'Cabo', 200, 60, 10);
  -- este nunca teve custo preenchido: é o que infla o lucro em silêncio
  INSERT INTO produtos (id, nome, preco, custo, estoque) VALUES (2, 'Fonte', 100, 0, 10);
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

const seTiverSqlite = sqlite ? it : it.skip

/** Uma venda com um item, na data dada. `custoItem` null = sem custo congelado. */
function venda(
  id: number,
  data: string,
  produtoId: number,
  qtd: number,
  preco: number,
  custoItem: number | null
): void {
  db!
    .prepare('INSERT INTO vendas (id, cliente_id, vendedor_id, data, total) VALUES (?, 1, 1, ?, ?)')
    .run(id, data, qtd * preco)
  db!
    .prepare(
      `INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario, custo_unitario)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, produtoId, qtd, preco, custoItem)
}

const MAIO = {
  inicio_atual: '2026-05-01',
  fim_atual: '2026-05-31',
  inicio_anterior: '2026-04-01',
  fim_anterior: '2026-04-30'
}

const doDia = (rotulo: string) =>
  obterMetricasDashboard(MAIO).serie_temporal.find((p) => p.rotulo === rotulo)!

describe('o custo de cada dia', () => {
  seTiverSqlite('★ cai no dia da VENDA, junto com o faturamento dela', () => {
    venda(1, '2026-05-04 10:00:00', 1, 2, 200, 60)
    const dia = doDia('04/05')
    expect(dia.total).toBe(400)
    expect(dia.custo).toBe(120)
    expect(dia.lucro).toBe(280)
  })

  seTiverSqlite('★ usa o custo CONGELADO no item, não o do cadastro de hoje', () => {
    /*
     * A peça custou 50 no dia em que foi vendida; hoje o cadastro diz 60. O
     * lucro daquele dia não pode mudar porque o fornecedor reajustou depois.
     */
    venda(1, '2026-05-04 10:00:00', 1, 1, 200, 50)
    expect(doDia('04/05').custo).toBe(50)
  })

  seTiverSqlite('venda antiga sem custo congelado cai no custo do cadastro', () => {
    // Vendas anteriores à migration 043 não têm como saber. O cadastro é o
    // plano B, e é melhor que zero.
    venda(1, '2026-05-04 10:00:00', 1, 1, 200, null)
    expect(doDia('04/05').custo).toBe(60)
  })

  seTiverSqlite('dias diferentes não se misturam', () => {
    venda(1, '2026-05-04 10:00:00', 1, 1, 200, 60)
    venda(2, '2026-05-05 10:00:00', 1, 2, 200, 60)
    expect(doDia('04/05').custo).toBe(60)
    expect(doDia('05/05').custo).toBe(120)
  })

  seTiverSqlite('★ venda cancelada sai do custo E do faturamento', () => {
    venda(1, '2026-05-04 10:00:00', 1, 1, 200, 60)
    venda(2, '2026-05-04 11:00:00', 1, 5, 200, 60)
    db!.prepare('UPDATE vendas SET cancelada = 1 WHERE id = 2').run()
    const dia = doDia('04/05')
    expect(dia.total).toBe(200)
    expect(dia.custo).toBe(60)
  })

  seTiverSqlite('★ o lucro é sempre faturamento menos custo, inclusive negativo', () => {
    // Vendeu abaixo do custo (desconto grande). O dia tem que aparecer no
    // vermelho, não zerado — esconder daria um dia que parece normal e não foi.
    venda(1, '2026-05-04 10:00:00', 1, 1, 40, 60)
    const dia = doDia('04/05')
    expect(dia.lucro).toBe(-20)
  })
})

describe('★ o aviso de produto sem custo', () => {
  seTiverSqlite('conta as PEÇAS vendidas sem custo, não os produtos', () => {
    // Dez peças de um produto sem custo pesam dez vezes mais no buraco do que
    // uma peça de outro.
    venda(1, '2026-05-04 10:00:00', 2, 10, 100, null)
    const m = obterMetricasDashboard(MAIO)
    expect(m.itens_sem_custo).toBe(10)
    expect(m.faturamento_sem_custo).toBe(1000)
  })

  seTiverSqlite('custo zero CONGELADO no item também conta', () => {
    // Não basta olhar o cadastro: a venda pode ter congelado zero.
    venda(1, '2026-05-04 10:00:00', 1, 1, 200, 0)
    expect(obterMetricasDashboard(MAIO).itens_sem_custo).toBe(1)
  })

  seTiverSqlite('loja com todo custo preenchido não recebe aviso', () => {
    venda(1, '2026-05-04 10:00:00', 1, 3, 200, 60)
    expect(obterMetricasDashboard(MAIO).itens_sem_custo).toBe(0)
  })

  seTiverSqlite('venda cancelada não acusa custo faltando', () => {
    venda(1, '2026-05-04 10:00:00', 2, 4, 100, null)
    db!.prepare('UPDATE vendas SET cancelada = 1 WHERE id = 1').run()
    expect(obterMetricasDashboard(MAIO).itens_sem_custo).toBe(0)
  })

  seTiverSqlite('★ o produto sem custo entra no gráfico como lucro cheio', () => {
    /*
     * Este teste documenta o comportamento que o aviso existe para explicar:
     * a peça sem custo aparece como se fosse toda lucro. É por isso que o aviso
     * fica ACIMA do gráfico, e não num rodapé.
     */
    venda(1, '2026-05-04 10:00:00', 2, 1, 100, null)
    const dia = doDia('04/05')
    expect(dia.custo).toBe(0)
    expect(dia.lucro).toBe(100)
    expect(obterMetricasDashboard(MAIO).itens_sem_custo).toBe(1)
  })
})
