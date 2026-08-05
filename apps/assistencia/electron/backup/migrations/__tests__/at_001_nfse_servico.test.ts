import { describe, it, expect } from 'vitest'

// Teste da migration at_001 contra um SQLite DE VERDADE, rodando o código REAL.
// O better-sqlite3 do repo é compilado pro ABI do Electron e não carrega no
// runtime dos testes, então usamos o node:sqlite embutido do Node por trás de um
// adaptador com a mesma cara — mesmo truque dos testes das migrations 030-035.
//
// O que está em jogo: esta migration abre o caminho da NFS-e. Ela precisa (a)
// dar aos serviços os campos que o município exige, sem tocar no que a SEFAZ
// exige dos produtos, e (b) criar um livro de notas SEPARADO do da NFC-e —
// porque numa venda mista as duas notas coexistem e o índice único de lá só
// admite uma nota vigente por venda.

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

import { aplicarAt001NfseServico } from '../os/at_001_nfse_servico'
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

// Schema mínimo no estado ANTERIOR a esta migration: produtos já com `tipo`
// (migration 027) e com os campos da NFC-e (031), e vendas pra amarrar a FK.
const SCHEMA = `
  CREATE TABLE vendas (id INTEGER PRIMARY KEY AUTOINCREMENT, total REAL NOT NULL DEFAULT 0);
  CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'produto',
    preco REAL NOT NULL DEFAULT 0,
    ncm TEXT, cfop TEXT, cst_csosn TEXT
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
    INSERT INTO produtos (id, nome, tipo, preco, ncm) VALUES (1, 'Fonte 19V', 'produto', 80, '85044090');
    INSERT INTO produtos (id, nome, tipo, preco) VALUES (2, 'Formatacao', 'servico', 120);
    INSERT INTO vendas (id, total) VALUES (1, 200);
  `)

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

const aplicar = (ad: Adaptador) => aplicarAt001NfseServico(ad as unknown as Database.Database)

const colunas = (db: ReturnType<typeof criarBanco>['bruto'], tabela: string): string[] =>
  (db.prepare(`PRAGMA table_info(${tabela})`).all() as Array<{ name: string }>).map((c) => c.name)

describe.runIf(sqlite)('aplicarAt001NfseServico', () => {
  it('adiciona os campos que o MUNICÍPIO exige do serviço', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const cols = colunas(bruto, 'produtos')
    expect(cols).toContain('item_lista_servico')
    expect(cols).toContain('aliquota_iss')
    expect(cols).toContain('codigo_tributacao_municipio')
    expect(cols).toContain('codigo_cnae')
  })

  it('não mexe no que a SEFAZ exige do produto', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const cols = colunas(bruto, 'produtos')
    expect(cols).toContain('ncm')
    expect(cols).toContain('cfop')
    // E o dado que já existia continua lá.
    const p = bruto.prepare('SELECT ncm FROM produtos WHERE id = 1').get() as { ncm: string }
    expect(p.ncm).toBe('85044090')
  })

  it('os campos novos nascem vazios — nada é chutado', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const s = bruto
      .prepare('SELECT item_lista_servico, aliquota_iss FROM produtos WHERE id = 2')
      .get() as { item_lista_servico: string | null; aliquota_iss: number | null }
    expect(s.item_lista_servico).toBeNull()
    expect(s.aliquota_iss).toBeNull()
  })

  it('cria a tabela nfse_emitidas, SEPARADA da nfce_emitidas', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const cols = colunas(bruto, 'nfse_emitidas')
    expect(cols).toContain('referencia')
    expect(cols).toContain('codigo_verificacao')
    expect(cols).toContain('link_url')
    // A NFS-e não tem "chave de acesso" — isso é da NFC-e.
    expect(cols).not.toContain('chave')
  })

  it('aceita o vocabulário de status da PREFEITURA e recusa o da SEFAZ', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const inserir = (status: string) =>
      bruto
        .prepare(
          `INSERT INTO nfse_emitidas (venda_id, referencia, ambiente, status)
           VALUES (1, 's1-t${status}', 'homologacao', ?)`
        )
        .run(status)

    expect(() => inserir('autorizada')).not.toThrow()
    expect(() => inserir('negada')).not.toThrow()
    // 'autorizado' (masculino) é o vocabulário da SEFAZ e não vale aqui.
    expect(() => inserir('autorizado')).toThrow()
  })

  it('admite UMA nota de serviço vigente por venda, mas deixa reemitir após recusa', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const inserir = (ref: string, status: string) =>
      bruto
        .prepare(
          `INSERT INTO nfse_emitidas (venda_id, tentativa, referencia, ambiente, status)
           VALUES (1, ?, ?, 'homologacao', ?)`
        )
        .run(ref.length, ref, status)

    inserir('s1-t1', 'autorizada')
    // Segunda vigente na MESMA venda: barrada pelo índice único parcial.
    expect(() => inserir('s1-t22', 'autorizada')).toThrow()
    // Já uma tentativa recusada não conta como vigente — dá pra tentar de novo.
    expect(() => inserir('s1-t333', 'negada')).not.toThrow()
  })

  it('é idempotente: rodar duas vezes não quebra nem duplica o carimbo', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    expect(() => aplicar(ad)).not.toThrow()
    const c = bruto
      .prepare('SELECT COUNT(*) c FROM _migrations WHERE nome = ?')
      .get('at_001_nfse_servico') as { c: number }
    expect(c.c).toBe(1)
  })
})
