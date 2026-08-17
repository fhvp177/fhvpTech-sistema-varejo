// Constrói um database.sqlite do varejo no estado "pós-boot": roda o MESMO
// criarTabelas e a MESMA lista de migrations que o app roda no main.ts, sem
// Electron. Assim o banco importado não é uma imitação do schema — é o schema.
//
// better-sqlite3 aqui não serve (o .node do repo está compilado pra ABI do
// Electron), então usamos o node:sqlite embutido no Node 22 por trás de um shim
// com a API que as migrations usam: exec / prepare / transaction / pragma.
import { DatabaseSync } from 'node:sqlite'
import type Database from 'better-sqlite3'
import { criarTabelas } from '../../apps/varejo/electron/db/schema'
import { MIGRATIONS } from '../../apps/varejo/electron/backup/migrations'
import { executarMigrations } from '@fhvptech/core/electron/db/migrations'

type Valor = string | number | bigint | null | Uint8Array

function normalizar(v: unknown): Valor {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString().replace('T', ' ').slice(0, 19)
  return v as Valor
}

/** Adapta o node:sqlite à superfície de API do better-sqlite3 que o app usa. */
export function abrirComoBetterSqlite(caminho: string): Database.Database {
  const db = new DatabaseSync(caminho)

  const shim = {
    exec: (sql: string) => db.exec(sql),

    prepare: (sql: string) => {
      const st = db.prepare(sql)
      return {
        run: (...args: unknown[]) => st.run(...args.map(normalizar)),
        get: (...args: unknown[]) => st.get(...args.map(normalizar)),
        all: (...args: unknown[]) => st.all(...args.map(normalizar)),
      }
    },

    // better-sqlite3 devolve uma função que executa o corpo dentro de uma
    // transação; as migrations chamam como db.transaction(fn)().
    transaction: (fn: (...a: unknown[]) => unknown) => {
      return (...args: unknown[]) => {
        // SQLite não aninha transação: se já há uma aberta, só executa o corpo.
        const jaAberta = db.isTransaction
        if (jaAberta) return fn(...args)
        db.exec('BEGIN')
        try {
          const r = fn(...args)
          db.exec('COMMIT')
          return r
        } catch (e) {
          try { db.exec('ROLLBACK') } catch { /* ignora */ }
          throw e
        }
      }
    },

    pragma: (texto: string, opcoes?: { simple?: boolean }) => {
      if (texto.includes('=')) return db.exec(`PRAGMA ${texto}`)
      const linhas = db.prepare(`PRAGMA ${texto}`).all() as Array<Record<string, unknown>>
      if (opcoes?.simple) {
        const primeira = linhas[0]
        return primeira ? (Object.values(primeira)[0] as unknown) : undefined
      }
      return linhas
    },

    close: () => db.close(),
  }

  return shim as unknown as Database.Database
}

/** Cria o banco vazio já no estado que o app deixaria depois do primeiro boot. */
export function criarBancoPosBoot(caminho: string): Database.Database {
  const db = abrirComoBetterSqlite(caminho)
  db.exec('PRAGMA foreign_keys = ON')
  criarTabelas(db)
  executarMigrations(db, MIGRATIONS)
  return db
}
