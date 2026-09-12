/**
 * Transferência entre contas da própria loja.
 *
 * ── O que este arquivo prende ───────────────────────────────────────────────
 *
 *  1. ★ **Ela NUNCA é receita nem despesa.** É a mesma nota mudando de bolso.
 *     Contada como entrada, o mês apareceria faturando o que só saiu de outra
 *     conta da casa — e o lojista compraria em cima de um número inflado.
 *
 *  2. ★ **As duas pontas gravam JUNTAS.** Uma falha no meio deixaria dinheiro
 *     saindo de um lugar e não chegando em nenhum: some sem rastro de para onde
 *     foi, que é o pior estado possível.
 *
 *  3. **A soma do livro não muda.** Antes e depois da transferência, a loja tem
 *     o mesmo dinheiro. É o teste que prova que nada foi criado nem destruído.
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

const { transferir, listarTransferencias, mesesComTransferencia } = await import(
  '../transferencias'
)
const { listarContas } = await import('../financeiro')

const SCHEMA = `
  CREATE TABLE vendedores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1);
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
  CREATE TABLE turnos_caixa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_id INTEGER NOT NULL, aberto_por INTEGER NOT NULL, aberto_em TEXT NOT NULL,
    fundo_troco REAL NOT NULL DEFAULT 0, fechado_por INTEGER, fechado_em TEXT,
    confirmado_por INTEGER, confirmado_em TEXT, justificativa TEXT,
    fora_de_hora INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE transferencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_origem_id INTEGER NOT NULL,
    conta_destino_id INTEGER NOT NULL,
    valor REAL NOT NULL,
    observacao TEXT,
    vendedor_id INTEGER,
    criada_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`

const SEED = `
  INSERT INTO vendedores (id, nome) VALUES (1, 'Ana');
  INSERT INTO contas_financeiras (id, nome, tipo, saldo_inicial) VALUES (1, 'Caixa da loja', 'caixa', 500);
  INSERT INTO contas_financeiras (id, nome, tipo, saldo_inicial) VALUES (2, 'Banco', 'banco', 1000);
  INSERT INTO contas_financeiras (id, nome, tipo, saldo_inicial, ativa) VALUES (3, 'Conta velha', 'banco', 0, 0);
`

let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  db.exec(SCHEMA)
  db.exec(SEED)
  let p = 0
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
      (...args) => {
        const sp = `sp_${p}`
        db!.exec(p === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
        p++
        try {
          const r = fn(...args)
          p--
          db!.exec(p === 0 ? 'COMMIT' : `RELEASE ${sp}`)
          return r
        } catch (e) {
          p--
          db!.exec(p === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}`)
          throw e
        }
      }
  }
})

const seTiverSqlite = sqlite ? it : it.skip

const saldoDe = (id: number): number => listarContas(true).find((c) => c.id === id)!.saldo

const somaDoLivro = (): number =>
  +(
    (db!.prepare('SELECT COALESCE(SUM(valor),0) AS s FROM movimentos_financeiros').get() as {
      s: number
    }).s
  ).toFixed(2)

describe('o dinheiro muda de conta', () => {
  seTiverSqlite('★ sai de uma e entra na outra, no mesmo valor', () => {
    transferir({ conta_origem_id: 1, conta_destino_id: 2, valor: 300, vendedor_id: 1 })
    expect(saldoDe(1)).toBe(200)
    expect(saldoDe(2)).toBe(1300)
  })

  seTiverSqlite('★ a loja continua com o MESMO dinheiro', () => {
    // Nada foi criado nem destruído: a soma de tudo que entrou no livro é zero.
    transferir({ conta_origem_id: 1, conta_destino_id: 2, valor: 300 })
    expect(somaDoLivro()).toBe(0)
  })

  seTiverSqlite('★ os dois lançamentos levam o tipo "transferencia"', () => {
    /*
     * ⚠️ É o tipo que o resumo financeiro usa para classificar como movimento
     * INTERNO. Com outro tipo qualquer, a entrada no destino contaria como
     * receita do mês e o mês pareceria ter faturado o que só mudou de bolso.
     */
    transferir({ conta_origem_id: 1, conta_destino_id: 2, valor: 300 })
    const movs = db!
      .prepare('SELECT tipo, valor, conta_id FROM movimentos_financeiros ORDER BY id')
      .all() as Array<{ tipo: string; valor: number; conta_id: number }>
    expect(movs).toHaveLength(2)
    expect(movs.every((m) => m.tipo === 'transferencia')).toBe(true)
    expect(movs[0]).toMatchObject({ conta_id: 1, valor: -300 })
    expect(movs[1]).toMatchObject({ conta_id: 2, valor: 300 })
  })

  seTiverSqlite('a descrição diz de onde veio e para onde foi', () => {
    // Quem abre o extrato de uma conta só entende a linha sem procurar a outra
    // metade em outra tela.
    transferir({ conta_origem_id: 1, conta_destino_id: 2, valor: 50 })
    const descricoes = (
      db!.prepare('SELECT descricao FROM movimentos_financeiros ORDER BY id').all() as Array<{
        descricao: string
      }>
    ).map((m) => m.descricao)
    expect(descricoes[0]).toContain('Banco')
    expect(descricoes[1]).toContain('Caixa da loja')
  })

  seTiverSqlite('os dois movimentos apontam para a MESMA transferência', () => {
    const { id } = transferir({ conta_origem_id: 1, conta_destino_id: 2, valor: 50 })
    const ligados = db!
      .prepare(
        "SELECT COUNT(*) AS n FROM movimentos_financeiros WHERE origem_tipo = 'transferencia' AND origem_id = ?"
      )
      .get(id) as { n: number }
    expect(ligados.n).toBe(2)
  })
})

describe('o que não se aceita', () => {
  seTiverSqlite('★ mesma conta nos dois lados', () => {
    // O par se anularia, deixando duas linhas inúteis no extrato — e quem fez
    // ficaria achando que transferiu.
    expect(() => transferir({ conta_origem_id: 1, conta_destino_id: 1, valor: 100 })).toThrow(
      /duas contas diferentes/i
    )
    expect(somaDoLivro()).toBe(0)
  })

  seTiverSqlite('valor zero ou negativo', () => {
    for (const valor of [0, -50]) {
      expect(() => transferir({ conta_origem_id: 1, conta_destino_id: 2, valor })).toThrow(
        /maior que zero/i
      )
    }
  })

  seTiverSqlite('★ conta desativada não envia nem recebe', () => {
    // Ela existe só para o histórico ficar de pé. Movimentar nela criaria saldo
    // numa conta que o lojista tirou de circulação e nem vê na tela.
    expect(() => transferir({ conta_origem_id: 3, conta_destino_id: 1, valor: 10 })).toThrow(
      /desativada/i
    )
    expect(() => transferir({ conta_origem_id: 1, conta_destino_id: 3, valor: 10 })).toThrow(
      /desativada/i
    )
  })

  seTiverSqlite('conta que não existe', () => {
    expect(() => transferir({ conta_origem_id: 99, conta_destino_id: 1, valor: 10 })).toThrow(
      /origem n[ãa]o encontrada/i
    )
  })

  seTiverSqlite('★ recusa não deixa meia transferência para trás', () => {
    expect(() => transferir({ conta_origem_id: 1, conta_destino_id: 3, valor: 10 })).toThrow()
    const linhas = db!.prepare('SELECT COUNT(*) AS n FROM transferencias').get() as { n: number }
    expect(linhas.n).toBe(0)
    expect(somaDoLivro()).toBe(0)
  })
})

describe('o histórico', () => {
  seTiverSqlite('traz os nomes das duas contas e quem fez', () => {
    transferir({
      conta_origem_id: 1,
      conta_destino_id: 2,
      valor: 120,
      observacao: 'depósito do dia',
      vendedor_id: 1
    })
    const [t] = listarTransferencias()
    expect(t).toMatchObject({
      conta_origem_nome: 'Caixa da loja',
      conta_destino_nome: 'Banco',
      valor: 120,
      observacao: 'depósito do dia',
      vendedor_nome: 'Ana'
    })
  })

  seTiverSqlite('observação vazia vira nulo, não string em branco', () => {
    transferir({ conta_origem_id: 1, conta_destino_id: 2, valor: 10, observacao: '   ' })
    expect(listarTransferencias()[0].observacao).toBeNull()
  })

  seTiverSqlite('o mês da transferência aparece na lista de meses', () => {
    transferir({ conta_origem_id: 1, conta_destino_id: 2, valor: 10 })
    const meses = mesesComTransferencia()
    expect(meses).toHaveLength(1)
    expect(meses[0]).toMatch(/^\d{4}-\d{2}$/)
  })

  seTiverSqlite('filtrar por um mês sem nada devolve lista vazia', () => {
    transferir({ conta_origem_id: 1, conta_destino_id: 2, valor: 10 })
    expect(listarTransferencias('2020-01')).toEqual([])
  })
})
