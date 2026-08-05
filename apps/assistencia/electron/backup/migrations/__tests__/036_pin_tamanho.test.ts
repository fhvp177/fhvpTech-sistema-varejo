import { describe, it, expect } from 'vitest'

// Migration 036 + a regra que ela sustenta: a tela de login confirmar sozinha,
// sem Enter, quando o PIN chega no tamanho daquela pessoa.
//
// O que está em jogo é maior que uma conveniência. O PIN aqui tem de 4 a 6
// dígitos, escolhidos por quem cadastra. Se a tela confirmasse num tamanho
// FIXO, quem tem PIN de 6 teria os 4 primeiros enviados como se fossem o PIN
// inteiro — tentativa errada a cada digitação, e o bloqueio de 5 tentativas
// trancaria essa pessoa para fora do sistema sem ela entender o motivo.
//
// Por isso o tamanho é por pessoa, nasce NULO (não dá pra deduzir do hash) e é
// aprendido no primeiro login que der certo.

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

import { aplicar036PinTamanho } from '../036_pin_tamanho'
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
  CREATE TABLE vendedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    papel TEXT NOT NULL DEFAULT 'vendedor',
    pin_hash TEXT
  );
  CREATE TABLE _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`

function criarBanco(): { ad: Adaptador; bruto: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> } {
  const db = new sqlite!.DatabaseSync(':memory:')
  db.exec(SCHEMA)
  db.exec(`
    INSERT INTO vendedores (id, nome, papel, pin_hash)
      VALUES (1, 'GERENTE', 'dono', '$2b$12$hashfake'),
             (2, 'TECNICO', 'vendedor', '$2b$12$outrohash');
  `)
  let prof = 0
  const ad: Adaptador = {
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
        const sp = `sp_${prof}`
        db.exec(prof === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
        prof++
        try {
          const r = fn(...args)
          prof--
          db.exec(prof === 0 ? 'COMMIT' : `RELEASE ${sp}`)
          return r
        } catch (e) {
          prof--
          db.exec(prof === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
          throw e
        }
      }
  }
  return { ad, bruto: db }
}

const aplicar = (ad: Adaptador) => aplicar036PinTamanho(ad as unknown as Database.Database)

describe.runIf(sqlite)('aplicar036PinTamanho', () => {
  it('cria a coluna pin_tamanho', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const cols = (bruto.prepare('PRAGMA table_info(vendedores)').all() as Array<{ name: string }>)
      .map((c) => c.name)
    expect(cols).toContain('pin_tamanho')
  })

  // O ponto mais importante do arquivo.
  it('quem já existia nasce SEM tamanho — nada é chutado a partir do hash', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const linhas = bruto.prepare('SELECT id, pin_tamanho FROM vendedores').all() as Array<{
      id: number
      pin_tamanho: number | null
    }>
    // Um valor chutado aqui faria a tela confirmar no dígito errado e, com o
    // bloqueio de 5 tentativas, trancaria a pessoa para fora do sistema.
    for (const l of linhas) expect(l.pin_tamanho).toBeNull()
  })

  it('não mexe no hash de ninguém', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const g = bruto.prepare('SELECT pin_hash FROM vendedores WHERE id = 1').get() as {
      pin_hash: string
    }
    expect(g.pin_hash).toBe('$2b$12$hashfake')
  })

  it('é idempotente: rodar de novo não quebra nem duplica o carimbo', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    expect(() => aplicar(ad)).not.toThrow()
    const c = bruto
      .prepare('SELECT COUNT(*) c FROM _migrations WHERE nome = ?')
      .get('036_pin_tamanho') as { c: number }
    expect(c.c).toBe(1)
  })

  // A semântica de "aprender no primeiro login": só grava quando ainda é nulo,
  // pra nunca atropelar o tamanho que veio junto com uma troca de PIN.
  it('o aprendizado não sobrescreve um tamanho já conhecido', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const aprender = (id: number, t: number) =>
      bruto
        .prepare('UPDATE vendedores SET pin_tamanho = ? WHERE id = ? AND pin_tamanho IS NULL')
        .run(t, id)

    aprender(1, 6)
    aprender(1, 4) // um login posterior não pode rebaixar o que já se sabe
    const g = bruto.prepare('SELECT pin_tamanho FROM vendedores WHERE id = 1').get() as {
      pin_tamanho: number
    }
    expect(g.pin_tamanho).toBe(6)
  })
})
