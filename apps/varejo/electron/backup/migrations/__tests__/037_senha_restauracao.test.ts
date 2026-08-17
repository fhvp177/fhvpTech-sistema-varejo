import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'

// A nova senha de restauração, contra um SQLite de verdade.
//
// ── O que está em jogo ───────────────────────────────────────────────────────
// Restaurar backup SOBRESCREVE o banco inteiro do cliente. A senha é o que
// separa isso de um acidente, e ela era COMPARTILHADA com o app de assistência
// técnica (que nasceu de uma cópia deste) — quem sabia a de um produto
// restaurava no outro.
//
// ⚠️ Esta troca alcança loja EM PRODUÇÃO: a senha antiga para de funcionar
// assim que o cliente atualizar.
//
// Um hash é opaco: olhar o arquivo não diz se a senha certa passa. Por isso o
// teste confere as DUAS pontas — a nova entra, a antiga não entra mais.
//
// ⚠️ A senha em texto vive AQUI e só aqui, porque um teste precisa dela para
// existir. Ela não está na migration (lá só há o hash) nem em nenhum outro
// lugar do repositório.

import { aplicar003HashSenhaRestauracao } from '../003_hash_senha_restauracao'
import { aplicar037SenhaRestauracao } from '../037_senha_restauracao'
import type Database from 'better-sqlite3'

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

const SENHA_NOVA = '132540Avp'
const SENHA_ANTIGA = '343761@Fhvp' // a herdada do outro produto

const CHAVE = 'backup_hash_senha_restauracao'

type Adaptador = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown
    get: (...args: unknown[]) => unknown
    all: (...args: unknown[]) => unknown
  }
  transaction: (fn: (...a: never[]) => unknown) => (...args: never[]) => unknown
}

function criarBanco(): {
  ad: Adaptador
  bruto: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']>
} {
  const db = new sqlite!.DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
  let profundidade = 0
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

const hashGravado = (db: ReturnType<typeof criarBanco>['bruto']): string =>
  (db.prepare('SELECT valor FROM config WHERE chave = ?').get(CHAVE) as { valor: string }).valor

describe.runIf(sqlite)('aplicar037SenhaRestauracao', () => {
  it('★ a senha nova abre a restauração', () => {
    const { ad, bruto } = criarBanco()
    aplicar037SenhaRestauracao(ad as unknown as Database.Database)
    expect(
      bcrypt.compareSync(SENHA_NOVA, hashGravado(bruto)),
      'o hash da migration não corresponde à senha combinada'
    ).toBe(true)
  })

  it('★ a senha antiga NÃO abre mais', () => {
    // O ponto da mudança. Se este teste passar a falhar, os dois produtos
    // voltaram a compartilhar a chave que sobrescreve o banco do cliente.
    const { ad, bruto } = criarBanco()
    aplicar037SenhaRestauracao(ad as unknown as Database.Database)
    expect(bcrypt.compareSync(SENHA_ANTIGA, hashGravado(bruto))).toBe(false)
  })

  it('substitui o valor que a 003 tinha gravado', () => {
    // A ordem real: a 003 vem primeiro (herdada do outro produto) e a at_004 por cima.
    // Se ela usasse INSERT OR IGNORE em vez de REPLACE, a senha antiga ficaria.
    const { ad, bruto } = criarBanco()
    aplicar003HashSenhaRestauracao(ad as unknown as Database.Database)
    const antes = hashGravado(bruto)
    expect(bcrypt.compareSync(SENHA_ANTIGA, antes)).toBe(true)

    aplicar037SenhaRestauracao(ad as unknown as Database.Database)
    expect(hashGravado(bruto), 'a at_004 não sobrescreveu a 003').not.toBe(antes)
    expect(bcrypt.compareSync(SENHA_NOVA, hashGravado(bruto))).toBe(true)
  })

  it('se registra e roda duas vezes sem estragar nada', () => {
    const { ad, bruto } = criarBanco()
    aplicar037SenhaRestauracao(ad as unknown as Database.Database)
    aplicar037SenhaRestauracao(ad as unknown as Database.Database)
    const n = bruto
      .prepare("SELECT COUNT(*) AS n FROM _migrations WHERE nome = '037_senha_restauracao'")
      .get() as { n: number }
    expect(n.n).toBe(1)
    expect(bcrypt.compareSync(SENHA_NOVA, hashGravado(bruto))).toBe(true)
  })
})
