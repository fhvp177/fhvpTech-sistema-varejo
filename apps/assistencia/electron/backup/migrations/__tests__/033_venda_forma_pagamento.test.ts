import { describe, it, expect } from 'vitest'

// Migration 033 contra SQLite real. Pequena, mas o ponto que ela protege não é:
// vendas antigas NÃO podem receber uma forma de pagamento chutada. Nulo aqui
// significa "não sabemos", que é a verdade — carimbar "dinheiro" em venda que
// pode ter sido no cartão viraria relatório mentiroso e nota fiscal errada.

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

import { aplicar033VendaFormaPagamento } from '../033_venda_forma_pagamento'
import type Database from 'better-sqlite3'

type Adaptador = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...a: unknown[]) => unknown
    get: (...a: unknown[]) => unknown
    all: (...a: unknown[]) => unknown
  }
  transaction: (fn: (...a: never[]) => unknown) => (...a: never[]) => unknown
}

function criarBanco(): Adaptador {
  const db = new sqlite!.DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL DEFAULT 0,
      status_pagamento TEXT DEFAULT 'pago'
    );
    CREATE TABLE _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO vendas (total) VALUES (100), (250);
  `)
  let p = 0
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const st = db.prepare(sql)
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
        db.exec(p === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
        p++
        try {
          const r = fn(...args)
          p--
          db.exec(p === 0 ? 'COMMIT' : `RELEASE ${sp}`)
          return r
        } catch (e) {
          p--
          db.exec(p === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
          throw e
        }
      }
  }
}

const aplicar = (db: Adaptador) =>
  aplicar033VendaFormaPagamento(db as unknown as Database.Database)

describe.runIf(sqlite)('aplicar033VendaFormaPagamento', () => {
  it('cria a coluna forma_pagamento', () => {
    const db = criarBanco()
    aplicar(db)
    const cols = (db.prepare('PRAGMA table_info(vendas)').all() as { name: string }[]).map(
      (c) => c.name
    )
    expect(cols).toContain('forma_pagamento')
  })

  it('vendas antigas ficam com NULL — nunca com um valor chutado', () => {
    const db = criarBanco()
    aplicar(db)
    const linhas = db.prepare('SELECT forma_pagamento FROM vendas').all() as {
      forma_pagamento: string | null
    }[]
    expect(linhas).toHaveLength(2)
    for (const l of linhas) expect(l.forma_pagamento).toBeNull()
  })

  it('é idempotente', () => {
    const db = criarBanco()
    aplicar(db)
    db.prepare("UPDATE vendas SET forma_pagamento = 'pix' WHERE id = 1").run()
    expect(() => aplicar(db)).not.toThrow()
    // Reaplicar não apaga o que já foi preenchido.
    const v = db.prepare('SELECT forma_pagamento FROM vendas WHERE id = 1').get() as {
      forma_pagamento: string | null
    }
    expect(v.forma_pagamento).toBe('pix')
    const n = db
      .prepare(`SELECT COUNT(*) AS n FROM _migrations WHERE nome = '033_venda_forma_pagamento'`)
      .get() as { n: number }
    expect(n.n).toBe(1)
  })
})
