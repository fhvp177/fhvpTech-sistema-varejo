import { describe, it, expect } from 'vitest'

// A migration que acrescenta o estado ao recibo, contra um SQLite de verdade.
//
// O que está em jogo é a compatibilidade com quem JÁ tem a tabela: o banco de
// desenvolvimento já rodou a at_002 e tem recibos emitidos sem estado. A coluna
// precisa entrar sem apagar nada e sem exigir valor — recibo antigo continua
// imprimindo só a cidade, porque foi assim que ele foi assinado.

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

import { aplicarAt002Recibos } from '../os/at_002_recibos'
import { aplicarAt003ReciboUf } from '../os/at_003_recibo_uf'
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
  CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
  CREATE TABLE _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`

function criarBanco(): {
  ad: Adaptador
  bruto: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']>
} {
  const db = new sqlite!.DatabaseSync(':memory:')
  db.exec(SCHEMA)

  let profundidade = 0
  const ad: Adaptador = {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const st = db.prepare(sql)
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: (...args: unknown[]) => st.run(...(args as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: (...args: unknown[]) => st.get(...(args as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all: (...args: unknown[]) => st.all(...(args as any[]))
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
  return { ad, bruto: db }
}

const colunas = (db: ReturnType<typeof criarBanco>['bruto']): string[] =>
  (db.prepare('PRAGMA table_info(recibos)').all() as Array<{ name: string }>).map((c) => c.name)

describe.runIf(sqlite)('aplicarAt003ReciboUf', () => {
  it('acrescenta a coluna do estado', () => {
    const { ad, bruto } = criarBanco()
    aplicarAt002Recibos(ad as unknown as Database.Database)
    expect(colunas(bruto), 'a at_002 já tinha uf?').not.toContain('uf')

    aplicarAt003ReciboUf(ad as unknown as Database.Database)
    expect(colunas(bruto)).toContain('uf')
  })

  it('★ recibo já emitido continua lá, e sem estado', () => {
    // O caso real: o banco de dev já tem recibos da at_002. Eles não podem
    // sumir nem ganhar um estado inventado — foram assinados só com a cidade.
    const { ad, bruto } = criarBanco()
    aplicarAt002Recibos(ad as unknown as Database.Database)
    bruto
      .prepare(
        `INSERT INTO recibos (numero, valor, recebedor_nome, pagador_nome, referente, cidade, data_recibo)
         VALUES (1, 100, 'Loja', 'Maria', 'servico', 'Pacoti', '2026-08-16')`
      )
      .run()

    aplicarAt003ReciboUf(ad as unknown as Database.Database)

    const r = bruto.prepare('SELECT cidade, uf FROM recibos WHERE numero = 1').get() as {
      cidade: string
      uf: string | null
    }
    expect(r.cidade, 'o recibo antigo sumiu').toBe('Pacoti')
    expect(r.uf, 'inventaram um estado para um recibo já assinado').toBeNull()
  })

  it('se registra e roda duas vezes sem estragar nada', () => {
    const { ad, bruto } = criarBanco()
    aplicarAt002Recibos(ad as unknown as Database.Database)
    aplicarAt003ReciboUf(ad as unknown as Database.Database)
    aplicarAt003ReciboUf(ad as unknown as Database.Database)

    const registro = bruto
      .prepare("SELECT COUNT(*) AS n FROM _migrations WHERE nome = 'at_003_recibo_uf'")
      .get() as { n: number }
    expect(registro.n).toBe(1)
    expect(colunas(bruto).filter((c) => c === 'uf')).toHaveLength(1)
  })
})
