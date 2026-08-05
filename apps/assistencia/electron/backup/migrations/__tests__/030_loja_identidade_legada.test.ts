import { describe, it, expect } from 'vitest'

// Teste da migration 030 contra um SQLite DE VERDADE, rodando o código REAL da
// migration. O better-sqlite3 do repo é compilado pro ABI do Electron, então
// usamos o node:sqlite embutido do Node por trás de um adaptador com a mesma
// cara (prepare/run/get/exec/transaction) — mesmo truque do teste da 028.
//
// O que está em jogo AQUI é o oposto do varejo. Lá esta migration preserva a
// identidade da 1ª loja do sistema (GN Modas) nos bancos que já a imprimiam
// legitimamente. Na assistência ela é NO-OP de propósito: gravar aqueles dados
// num app de assistência técnica seria vazar a identidade de um cliente pro
// sistema de outro (ver o comentário na própria migration).
//
// Estes testes existem pra travar esse no-op. Se um dia alguém "consertar" a
// diferença copiando a versão do varejo por cima, eles ficam vermelhos.

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

import { aplicar030LojaIdentidadeLegada } from '../030_loja_identidade_legada'
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

// Monta um banco no estado que interessa: quando as migrations anteriores foram
// carimbadas e o que já existe em config.
function criarBanco(opcoes: {
  dataMigrations: string | null
  config?: Record<string, string>
}): Adaptador {
  const db = new sqlite!.DatabaseSync(':memory:')
  db.exec(SCHEMA)

  const ins = db.prepare('INSERT INTO _migrations (nome, data_aplicacao) VALUES (?, ?)')
  for (const nome of ['001_modulo_backup', '015_cleanup_pin_legado', '029_produto_referencia']) {
    ins.run(nome, opcoes.dataMigrations)
  }
  const cfg = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?)')
  for (const [chave, valor] of Object.entries(opcoes.config ?? {})) cfg.run(chave, valor)

  let profundidade = 0
  return {
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
}

const aplicar = (db: Adaptador) => aplicar030LojaIdentidadeLegada(db as unknown as Database.Database)

const lerConfig = (db: Adaptador) =>
  Object.fromEntries(
    (db.prepare('SELECT chave, valor FROM config').all() as Array<{ chave: string; valor: string }>)
      .map((r) => [r.chave, r.valor])
  )

describe.runIf(sqlite)('aplicar030LojaIdentidadeLegada (no-op na assistência)', () => {
  // Os cenários abaixo são exatamente os que, NO VAREJO, gravariam a identidade
  // legada. Aqui todos têm que terminar sem nenhuma chave `loja_*`.
  const CENARIOS_QUE_NO_VAREJO_GRAVARIAM: Array<[string, Parameters<typeof criarBanco>[0]]> = [
    ['banco anterior ao recurso (2026-05)', { dataMigrations: '2026-05-16 10:00:00' }],
    ['banco da véspera do corte', { dataMigrations: '2026-06-14 23:59:59' }],
    [
      'banco com o cliente_id da 1ª loja',
      { dataMigrations: null, config: { cliente_id: 'GNMODAS001' } }
    ]
  ]

  for (const [nome, opcoes] of CENARIOS_QUE_NO_VAREJO_GRAVARIAM) {
    it(`${nome}: NÃO recebe a identidade de outra loja`, () => {
      const db = criarBanco(opcoes)
      aplicar(db)
      const cfg = lerConfig(db)
      expect(Object.keys(cfg).filter((k) => k.startsWith('loja_'))).toEqual([])
      expect(cfg.loja_nome).toBeUndefined()
      expect(cfg.loja_configurada).toBeUndefined()
    })
  }

  it('instalação nova nasce em branco', () => {
    const db = criarBanco({
      dataMigrations: new Date().toISOString().slice(0, 19).replace('T', ' ')
    })
    aplicar(db)
    expect(Object.keys(lerConfig(db)).filter((k) => k.startsWith('loja_'))).toEqual([])
  })

  it('não atropela quem já preencheu os próprios dados', () => {
    const db = criarBanco({
      dataMigrations: '2026-05-16 10:00:00',
      config: { loja_configurada: '1', loja_nome: 'CENTRAL DA INFORMÁTICA', loja_cidade: 'Fortaleza' }
    })
    aplicar(db)
    const cfg = lerConfig(db)
    expect(cfg.loja_nome).toBe('CENTRAL DA INFORMÁTICA')
    expect(cfg.loja_cidade).toBe('Fortaleza')
  })

  // A razão de a migration continuar na lista: o nome carimbado é o que impede
  // um banco vindo do varejo de rodar a versão de lá alguma vez.
  it('carimba a si mesma na _migrations', () => {
    const db = criarBanco({ dataMigrations: '2026-07-18 20:00:00' })
    aplicar(db)
    expect(
      (db.prepare('SELECT COUNT(*) c FROM _migrations WHERE nome = ?')
        .get('030_loja_identidade_legada') as { c: number }).c
    ).toBe(1)
  })

  it('é idempotente: rodar de novo não duplica o carimbo nem grava nada', () => {
    const db = criarBanco({ dataMigrations: '2026-05-16 10:00:00' })
    aplicar(db)
    aplicar(db)
    expect(Object.keys(lerConfig(db)).filter((k) => k.startsWith('loja_'))).toEqual([])
    expect(
      (db.prepare('SELECT COUNT(*) c FROM _migrations WHERE nome = ?')
        .get('030_loja_identidade_legada') as { c: number }).c
    ).toBe(1)
  })
})
