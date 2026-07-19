import { describe, it, expect } from 'vitest'

// Teste da migration 030 contra um SQLite DE VERDADE, rodando o código REAL da
// migration. O better-sqlite3 do repo é compilado pro ABI do Electron, então
// usamos o node:sqlite embutido do Node por trás de um adaptador com a mesma
// cara (prepare/run/get/exec/transaction) — mesmo truque do teste da 028.
//
// O que está em jogo: até a v1.28.0, loja sem identidade preenchida imprimia no
// cupom os dados da 1ª loja do sistema (GN Modas). A migration preserva esses
// dados APENAS em quem já os imprimia legitimamente (banco anterior ao recurso
// de identidade configurável) — todo o resto tem que nascer em branco.

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

describe.runIf(sqlite)('aplicar030LojaIdentidadeLegada', () => {
  describe('preserva o legado de quem já imprimia esses dados', () => {
    it('banco anterior ao recurso (2026-05) recebe a identidade da 1ª loja', () => {
      const db = criarBanco({ dataMigrations: '2026-05-16 10:00:00' })
      aplicar(db)
      const cfg = lerConfig(db)
      expect(cfg.loja_nome).toBe('GN MODAS')
      expect(cfg.loja_cidade).toBe('Pacoti')
      expect(cfg.loja_cnpj).toBe('00.000.000/0001-00')
      expect(cfg.loja_configurada).toBe('1')
    })

    it('reconhece pelo cliente_id da licença mesmo sem data de migration', () => {
      const db = criarBanco({ dataMigrations: null, config: { cliente_id: 'GNMODAS001' } })
      aplicar(db)
      expect(lerConfig(db).loja_nome).toBe('GN MODAS')
    })

    it('é idempotente: rodar de novo não muda o que ficou gravado', () => {
      const db = criarBanco({ dataMigrations: '2026-05-16 10:00:00' })
      aplicar(db)
      aplicar(db)
      const cfg = lerConfig(db)
      expect(cfg.loja_nome).toBe('GN MODAS')
      expect(
        (db.prepare('SELECT COUNT(*) c FROM _migrations WHERE nome = ?')
          .get('030_loja_identidade_legada') as { c: number }).c
      ).toBe(1)
    })
  })

  describe('NÃO vaza a identidade dela pra mais ninguém', () => {
    it('instalação nova (migrations carimbadas hoje) nasce em branco', () => {
      const db = criarBanco({ dataMigrations: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      aplicar(db)
      const cfg = lerConfig(db)
      expect(Object.keys(cfg).filter((k) => k.startsWith('loja_'))).toEqual([])
      expect(cfg.loja_configurada).toBeUndefined()
    })

    it('banco importado de outro sistema (migrations em bloco) nasce em branco', () => {
      // É o caso do cliente migrado do GDOOR: o importador carimba as 29
      // migrations de uma vez, com data da importação.
      const db = criarBanco({ dataMigrations: '2026-07-17 11:55:57', config: { cliente_id: 'LOJA001' } })
      aplicar(db)
      expect(Object.keys(lerConfig(db)).filter((k) => k.startsWith('loja_'))).toEqual([])
    })

    it('banco da véspera do recurso ainda conta como legado; do dia seguinte, não', () => {
      const vespera = criarBanco({ dataMigrations: '2026-06-14 23:59:59' })
      aplicar(vespera)
      expect(lerConfig(vespera).loja_nome).toBe('GN MODAS')

      const depois = criarBanco({ dataMigrations: '2026-06-16 00:00:01' })
      aplicar(depois)
      expect(lerConfig(depois).loja_nome).toBeUndefined()
    })
  })

  describe('nunca atropela quem já preencheu os próprios dados', () => {
    it('loja já configurada é preservada intacta, mesmo em banco antigo', () => {
      const db = criarBanco({
        dataMigrations: '2026-05-16 10:00:00',
        config: { loja_configurada: '1', loja_nome: 'MERCADINHO DO ZÉ', loja_cidade: 'Fortaleza' }
      })
      aplicar(db)
      const cfg = lerConfig(db)
      expect(cfg.loja_nome).toBe('MERCADINHO DO ZÉ')
      expect(cfg.loja_cidade).toBe('Fortaleza')
    })
  })

  it('carimba a si mesma na _migrations', () => {
    const db = criarBanco({ dataMigrations: '2026-07-18 20:00:00' })
    aplicar(db)
    expect(
      (db.prepare('SELECT COUNT(*) c FROM _migrations WHERE nome = ?')
        .get('030_loja_identidade_legada') as { c: number }).c
    ).toBe(1)
  })
})
