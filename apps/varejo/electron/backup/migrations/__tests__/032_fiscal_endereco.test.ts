import { describe, it, expect } from 'vitest'

// Migration 032 contra SQLite real (node:sqlite), mesmo padrão das 028/030/031.
//
// O que está em jogo: o pré-preenchimento do endereço estruturado da nota a
// partir do endereço em texto livre. A regra de ouro é que ele SÓ acontece
// quando a separação é perfeita; na dúvida, deixa em branco — melhor o lojista
// digitar do que emitir nota com endereço palpitado.

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

import { aplicar032FiscalEndereco } from '../032_fiscal_endereco'
import type Database from 'better-sqlite3'

type Adaptador = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown
    get: (...args: unknown[]) => unknown
    all: (...args: unknown[]) => unknown
  }
  transaction: (fn: (...a: never[]) => unknown) => (...args: never[]) => unknown
}

const SCHEMA = `
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  CREATE TABLE _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`

function criarBanco(config: Record<string, string> = {}): Adaptador {
  const db = new sqlite!.DatabaseSync(':memory:')
  db.exec(SCHEMA)
  const ins = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?)')
  for (const [k, v] of Object.entries(config)) ins.run(k, v)

  let profundidade = 0
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
        const sp = `sp_${profundidade}`
        db.exec(profundidade === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
        profundidade++
        try {
          const r = fn(...args)
          profundidade--
          db.exec(profundidade === 0 ? 'COMMIT' : `RELEASE ${sp}`)
          return r
        } catch (e) {
          profundidade--
          db.exec(profundidade === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
          throw e
        }
      }
  }
}

const aplicar = (db: Adaptador) => aplicar032FiscalEndereco(db as unknown as Database.Database)

const ler = (db: Adaptador, chave: string): string | null => {
  const r = db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave) as
    | { valor: string }
    | undefined
  return r ? r.valor : null
}

describe.runIf(sqlite)('aplicar032FiscalEndereco', () => {
  it('pré-preenche quando a separação é perfeita', () => {
    const db = criarBanco({ loja_endereco: 'Rua das Flores, 123 - Centro' })
    aplicar(db)
    expect(ler(db, 'fiscal_endereco_logradouro')).toBe('Rua das Flores')
    expect(ler(db, 'fiscal_endereco_numero')).toBe('123')
    expect(ler(db, 'fiscal_endereco_bairro')).toBe('Centro')
  })

  it('deixa em branco quando a separação não remonta idêntico', () => {
    // "Rua X, 123, Centro" separa bem em partes, mas remonta com travessão —
    // diferente do original. Na dúvida, não preenche: o lojista digita.
    const db = criarBanco({ loja_endereco: 'Rua X, 123, Centro' })
    aplicar(db)
    expect(ler(db, 'fiscal_endereco_logradouro')).toBeNull()
    expect(ler(db, 'fiscal_endereco_numero')).toBeNull()
    expect(ler(db, 'fiscal_endereco_bairro')).toBeNull()
  })

  it('preenche o endereço legado REAL da 1ª loja (sem número, e é ok)', () => {
    const db = criarBanco({
      loja_endereco: 'Praça Claudemiro Lopes Bezerra - Mercado Central'
    })
    aplicar(db)
    expect(ler(db, 'fiscal_endereco_logradouro')).toBe('Praça Claudemiro Lopes Bezerra')
    expect(ler(db, 'fiscal_endereco_bairro')).toBe('Mercado Central')
    // Número não foi inventado — fica vazio pra loja preencher.
    expect(ler(db, 'fiscal_endereco_numero')).toBe('')
  })

  it('não faz nada quando não há endereço na loja', () => {
    const db = criarBanco({})
    aplicar(db)
    expect(ler(db, 'fiscal_endereco_logradouro')).toBeNull()
  })

  it('nunca sobrescreve o que o lojista já ajustou', () => {
    const db = criarBanco({
      loja_endereco: 'Rua das Flores, 123 - Centro',
      fiscal_endereco_logradouro: 'Avenida Corrigida',
      fiscal_endereco_numero: '999'
    })
    aplicar(db)
    expect(ler(db, 'fiscal_endereco_logradouro')).toBe('Avenida Corrigida')
    expect(ler(db, 'fiscal_endereco_numero')).toBe('999')
  })

  it('é idempotente', () => {
    const db = criarBanco({ loja_endereco: 'Rua das Flores, 123 - Centro' })
    aplicar(db)
    expect(() => aplicar(db)).not.toThrow()
    expect(ler(db, 'fiscal_endereco_logradouro')).toBe('Rua das Flores')
    const n = db
      .prepare(`SELECT COUNT(*) AS n FROM _migrations WHERE nome = '032_fiscal_endereco'`)
      .get() as { n: number }
    expect(n.n).toBe(1)
  })
})
