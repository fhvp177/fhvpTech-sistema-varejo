import { describe, it, expect } from 'vitest'

// Migration 035 contra SQLite real. O que ela protege: notas emitidas ANTES da
// NF-e existir são todas NFC-e, e precisam continuar sendo tratadas como tal —
// se virassem 55 por acidente, imprimir uma nota antiga bateria no endereço
// errado da ACBr.

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

import { aplicar035NotaModelo } from '../035_nota_modelo'
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
  // Tabela como era ANTES da NF-e: sem coluna de modelo.
  db.exec(`
    CREATE TABLE nfce_emitidas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      tentativa INTEGER NOT NULL DEFAULT 1,
      referencia TEXT NOT NULL UNIQUE,
      ambiente TEXT NOT NULL,
      serie INTEGER NOT NULL,
      numero INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente'
    );
    CREATE TABLE _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO nfce_emitidas (venda_id, referencia, ambiente, serie, numero, status)
      VALUES (1, 'v1-t1', 'producao', 1, 5, 'autorizado');
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

const aplicar = (db: Adaptador) => aplicar035NotaModelo(db as unknown as Database.Database)

describe.runIf(sqlite)('aplicar035NotaModelo', () => {
  it('cria a coluna modelo', () => {
    const db = criarBanco()
    aplicar(db)
    const cols = (db.prepare('PRAGMA table_info(nfce_emitidas)').all() as { name: string }[]).map(
      (c) => c.name
    )
    expect(cols).toContain('modelo')
  })

  it('notas já emitidas continuam sendo NFC-e (65)', () => {
    const db = criarBanco()
    aplicar(db)
    const n = db.prepare('SELECT modelo FROM nfce_emitidas WHERE referencia = ?').get('v1-t1') as {
      modelo: number
    }
    expect(n.modelo).toBe(65)
  })

  it('é idempotente e não altera o que já foi marcado', () => {
    const db = criarBanco()
    aplicar(db)
    db.prepare("UPDATE nfce_emitidas SET modelo = 55 WHERE referencia = 'v1-t1'").run()
    expect(() => aplicar(db)).not.toThrow()
    const n = db.prepare('SELECT modelo FROM nfce_emitidas WHERE referencia = ?').get('v1-t1') as {
      modelo: number
    }
    expect(n.modelo).toBe(55)
  })
})
