/**
 * Saber o que ainda vai rodar, ANTES de rodar.
 *
 * ── O que depende disto ──────────────────────────────────────────────────────
 * O servidor web usa esta resposta para decidir se guarda uma cópia do banco
 * antes de aplicar migrations. E a decisão tem dois lados, os dois caros:
 *
 * - Dizer "não há pendentes" quando há → a loja migra sem rede de proteção, e
 *   se a migration estragar algo não existe caminho de volta que não dependa de
 *   sorte. O `fly releases` devolve o código, nunca o esquema.
 * - Dizer "há pendentes" numa loja recém-criada → backup de banco vazio a cada
 *   loja nova. Não perde nada, mas enche o R2 de lixo e ensina a ignorar o
 *   aviso, que é como um alarme deixa de ser alarme.
 *
 * Por isso a função devolve DUAS coisas: o que falta, e quantas já rodaram.
 * A segunda é o que separa "banco em uso" de "banco que nasceu agora".
 */
import { describe, it, expect } from 'vitest'

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

import { executarMigrations, migrationsPendentes } from '@fhvptech/core/electron/db/migrations'
import type Database from 'better-sqlite3'

type Adaptador = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...a: unknown[]) => unknown
    get: (...a: unknown[]) => unknown
    all: (...a: unknown[]) => unknown
  }
}

function bancoNovo(): Adaptador {
  return new sqlite!.DatabaseSync(':memory:') as unknown as Adaptador
}

/** Migrations de mentira: só carimbam uma tabela, para o teste ver que rodaram. */
function migracao(nome: string): { nome: string; aplicar: (db: Database.Database) => void } {
  return {
    nome,
    aplicar: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS marcas (nome TEXT)`)
      db.prepare('INSERT INTO marcas (nome) VALUES (?)').run(nome)
    }
  }
}

const TRES = [migracao('001_uma'), migracao('002_outra'), migracao('003_terceira')]

describe.skipIf(!sqlite)('o que ainda falta rodar', () => {
  it('num banco novo, tudo está pendente e nada foi aplicado', () => {
    const db = bancoNovo() as unknown as Database.Database
    const { pendentes, jaAplicadas } = migrationsPendentes(db, TRES)

    expect(pendentes).toEqual(['001_uma', '002_outra', '003_terceira'])
    // Zero aplicadas é o sinal de "loja nova" — quem chama usa isto para NÃO
    // gastar um backup de banco vazio.
    expect(jaAplicadas).toBe(0)
  })

  it('depois de rodar, não sobra pendente', () => {
    const db = bancoNovo() as unknown as Database.Database
    executarMigrations(db, TRES)

    const { pendentes, jaAplicadas } = migrationsPendentes(db, TRES)
    expect(pendentes).toEqual([])
    expect(jaAplicadas).toBe(3)
  })

  /**
   * O caso que o servidor web enfrenta em toda atualização: banco em uso, e uma
   * migration nova chegando. É exatamente aqui que a cópia tem que sair.
   */
  it('num banco em uso, aponta só a nova — e diz que já havia histórico', () => {
    const db = bancoNovo() as unknown as Database.Database
    executarMigrations(db, TRES)

    const comNova = [...TRES, migracao('004_recem_chegada')]
    const { pendentes, jaAplicadas } = migrationsPendentes(db, comNova)

    expect(pendentes).toEqual(['004_recem_chegada'])
    expect(jaAplicadas, 'sem histórico, o servidor trataria como loja nova').toBeGreaterThan(0)
  })

  it('perguntar não aplica nada', () => {
    const db = bancoNovo() as unknown as Database.Database
    migrationsPendentes(db, TRES)
    migrationsPendentes(db, TRES)

    // A tabela `marcas` só nasce quando uma migration roda de verdade.
    const existe = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='marcas'`)
      .get()
    expect(existe, 'perguntar aplicou migration — o backup viria tarde demais').toBeUndefined()
  })

  it('a ordem é a da lista, não a do banco', () => {
    const db = bancoNovo() as unknown as Database.Database
    executarMigrations(db, [TRES[1]]) // roda só a do meio

    const { pendentes } = migrationsPendentes(db, TRES)
    expect(pendentes).toEqual(['001_uma', '003_terceira'])
  })
})
