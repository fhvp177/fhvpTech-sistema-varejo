import { describe, it, expect } from 'vitest'

// Teste da migration 031 contra um SQLite DE VERDADE, rodando o código REAL da
// migration. O better-sqlite3 do repo é compilado pro ABI do Electron, então
// usamos o node:sqlite embutido do Node por trás de um adaptador com a mesma
// cara (prepare/run/get/exec/transaction) — mesmo truque dos testes da 028/030.
//
// O que está em jogo:
//  - o backfill de NCM (sem ele, loja com centenas de produtos não emite nota);
//  - o CFOP NÃO ser copiado da nota de entrada (erro fiscal silencioso);
//  - o banco garantir que uma venda nunca tenha duas notas vigentes.

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

import { aplicar031FiscalNfce } from '../031_fiscal_nfce'
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

// Só o mínimo que a 031 toca. `produtos` sem colunas fiscais (estado real de um
// banco na v1.28.x) e `vendas` porque nfce_emitidas referencia.
const SCHEMA = `
  CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    preco REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`

// A tabela da importação de XML (migration 028) só existe em quem já importou
// nota de fornecedor — por isso é opcional aqui.
const SCHEMA_NOTAS_ENTRADA = `
  CREATE TABLE notas_entrada_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER,
    descricao TEXT NOT NULL,
    ncm TEXT,
    cfop TEXT,
    unidade TEXT,
    quantidade REAL NOT NULL DEFAULT 1,
    custo_unitario REAL NOT NULL DEFAULT 0
  );
`

type ItemEntrada = {
  produto_id: number | null
  ncm?: string | null
  cfop?: string | null
  unidade?: string | null
}

function criarBanco(opcoes: {
  produtos?: Array<{ nome: string }>
  comNotasEntrada?: boolean
  itensEntrada?: ItemEntrada[]
}): Adaptador {
  const db = new sqlite!.DatabaseSync(':memory:')
  db.exec(SCHEMA)
  if (opcoes.comNotasEntrada ?? true) db.exec(SCHEMA_NOTAS_ENTRADA)

  const insProd = db.prepare('INSERT INTO produtos (nome) VALUES (?)')
  for (const p of opcoes.produtos ?? []) insProd.run(p.nome)

  if (opcoes.itensEntrada?.length) {
    const insItem = db.prepare(
      'INSERT INTO notas_entrada_itens (produto_id, descricao, ncm, cfop, unidade) VALUES (?, ?, ?, ?, ?)'
    )
    for (const i of opcoes.itensEntrada) {
      insItem.run(i.produto_id, 'item', i.ncm ?? null, i.cfop ?? null, i.unidade ?? null)
    }
  }

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

const aplicar = (db: Adaptador) => aplicar031FiscalNfce(db as unknown as Database.Database)

type ProdutoFiscal = {
  id: number
  nome: string
  ncm: string | null
  cfop: string | null
  cst_csosn: string | null
  origem: string | null
  unidade: string | null
}

const lerProdutos = (db: Adaptador) =>
  db.prepare('SELECT * FROM produtos ORDER BY id').all() as ProdutoFiscal[]

const colunas = (db: Adaptador, tabela: string) =>
  (db.prepare(`PRAGMA table_info(${tabela})`).all() as Array<{ name: string }>).map((c) => c.name)

describe.runIf(sqlite)('aplicar031FiscalNfce', () => {
  describe('campos fiscais no produto', () => {
    it('cria as colunas de tributação', () => {
      const db = criarBanco({ produtos: [{ nome: 'Blusa' }] })
      aplicar(db)
      const cols = colunas(db, 'produtos')
      for (const c of ['ncm', 'cfop', 'cst_csosn', 'origem', 'unidade']) {
        expect(cols).toContain(c)
      }
    })

    it('produto sem classificação nasce com NCM em branco, nunca chutado', () => {
      const db = criarBanco({ produtos: [{ nome: 'Cadastrado à mão' }] })
      aplicar(db)
      // NCM errado passa pela SEFAZ e vira passivo do lojista; em branco, a
      // emissão trava e ele VÊ o que falta. Em branco é o comportamento certo.
      expect(lerProdutos(db)[0].ncm).toBeNull()
    })

    it('origem e unidade ganham default utilizável', () => {
      const db = criarBanco({ produtos: [{ nome: 'Blusa' }] })
      aplicar(db)
      const p = lerProdutos(db)[0]
      expect(p.origem).toBe('0') // nacional
      expect(p.unidade).toBe('UN')
    })
  })

  describe('backfill pelas notas de entrada', () => {
    it('puxa o NCM que o fornecedor usou', () => {
      const db = criarBanco({
        produtos: [{ nome: 'Blusa' }],
        itensEntrada: [{ produto_id: 1, ncm: '61091000' }]
      })
      aplicar(db)
      expect(lerProdutos(db)[0].ncm).toBe('61091000')
    })

    it('entrada mais recente vence quando o fornecedor reclassifica', () => {
      const db = criarBanco({
        produtos: [{ nome: 'Blusa' }],
        itensEntrada: [
          { produto_id: 1, ncm: '61091000' },
          { produto_id: 1, ncm: '61099000' } // id maior = importada depois
        ]
      })
      aplicar(db)
      expect(lerProdutos(db)[0].ncm).toBe('61099000')
    })

    it('NÃO copia o CFOP da nota de entrada', () => {
      const db = criarBanco({
        produtos: [{ nome: 'Blusa' }],
        itensEntrada: [{ produto_id: 1, ncm: '61091000', cfop: '5102' }]
      })
      aplicar(db)
      // O CFOP da nota de entrada é o da operação do FORNECEDOR vendendo pra
      // loja — não o da loja vendendo pro consumidor. Copiar gera nota que a
      // SEFAZ autoriza e o Fisco contesta depois.
      expect(lerProdutos(db)[0].cfop).toBeNull()
    })

    it('puxa a unidade real do fornecedor por cima do default', () => {
      const db = criarBanco({
        produtos: [{ nome: 'Tecido' }],
        itensEntrada: [{ produto_id: 1, unidade: 'mt' }]
      })
      aplicar(db)
      expect(lerProdutos(db)[0].unidade).toBe('MT')
    })

    it('ignora item de entrada sem vínculo com produto', () => {
      const db = criarBanco({
        produtos: [{ nome: 'Blusa' }],
        itensEntrada: [{ produto_id: null, ncm: '61091000' }]
      })
      aplicar(db)
      expect(lerProdutos(db)[0].ncm).toBeNull()
    })

    it('ignora NCM vazio ou só com espaços', () => {
      const db = criarBanco({
        produtos: [{ nome: 'Blusa' }],
        itensEntrada: [{ produto_id: 1, ncm: '   ' }]
      })
      aplicar(db)
      expect(lerProdutos(db)[0].ncm).toBeNull()
    })

    it('não sobrescreve classificação que o contador já ajustou', () => {
      const db = criarBanco({
        produtos: [{ nome: 'Blusa' }],
        itensEntrada: [{ produto_id: 1, ncm: '61091000' }]
      })
      aplicar(db)
      // Contador corrige à mão...
      db.prepare('UPDATE produtos SET ncm = ? WHERE id = 1').run('62034200')
      // ...e a migration roda de novo (reinstalação, restauração de backup).
      aplicar(db)
      expect(lerProdutos(db)[0].ncm).toBe('62034200')
    })

    it('roda em banco que nunca importou XML de fornecedor', () => {
      const db = criarBanco({ produtos: [{ nome: 'Blusa' }], comNotasEntrada: false })
      expect(() => aplicar(db)).not.toThrow()
      expect(lerProdutos(db)[0].ncm).toBeNull()
    })
  })

  describe('livro de notas emitidas', () => {
    const prepararVenda = (db: Adaptador) => db.prepare('INSERT INTO vendas (total) VALUES (10)').run()

    const inserirNota = (
      db: Adaptador,
      dados: { venda: number; ref: string; numero: number; status: string }
    ) =>
      db
        .prepare(
          `INSERT INTO nfce_emitidas (venda_id, referencia, ambiente, serie, numero, status)
           VALUES (?, ?, 'homologacao', 1, ?, ?)`
        )
        .run(dados.venda, dados.ref, dados.numero, dados.status)

    it('impede duas notas vigentes para a mesma venda', () => {
      const db = criarBanco({})
      aplicar(db)
      prepararVenda(db)
      inserirNota(db, { venda: 1, ref: 'v1-t1', numero: 1, status: 'autorizado' })
      // A trava é do BANCO, não da confiança do código da aplicação.
      expect(() =>
        inserirNota(db, { venda: 1, ref: 'v1-t2', numero: 2, status: 'autorizado' })
      ).toThrow()
    })

    it('permite emitir de novo depois de rejeição', () => {
      const db = criarBanco({})
      aplicar(db)
      prepararVenda(db)
      inserirNota(db, { venda: 1, ref: 'v1-t1', numero: 1, status: 'rejeitado' })
      expect(() =>
        inserirNota(db, { venda: 1, ref: 'v1-t2', numero: 2, status: 'autorizado' })
      ).not.toThrow()
    })

    it('permite emitir de novo depois de cancelamento', () => {
      const db = criarBanco({})
      aplicar(db)
      prepararVenda(db)
      inserirNota(db, { venda: 1, ref: 'v1-t1', numero: 1, status: 'cancelado' })
      expect(() =>
        inserirNota(db, { venda: 1, ref: 'v1-t2', numero: 2, status: 'autorizado' })
      ).not.toThrow()
    })

    it('rejeita reenvio com a mesma referência', () => {
      const db = criarBanco({})
      aplicar(db)
      prepararVenda(db)
      prepararVenda(db)
      inserirNota(db, { venda: 1, ref: 'v1-t1', numero: 1, status: 'rejeitado' })
      // A referência é a chave de idempotência mandada pra ACBr: repetir faria a
      // API devolver o documento antigo em vez de emitir o novo.
      expect(() =>
        inserirNota(db, { venda: 2, ref: 'v1-t1', numero: 2, status: 'pendente' })
      ).toThrow()
    })

    it('recusa status fora do vocabulário da API', () => {
      const db = criarBanco({})
      aplicar(db)
      prepararVenda(db)
      expect(() =>
        inserirNota(db, { venda: 1, ref: 'v1-t1', numero: 1, status: 'inventado' })
      ).toThrow()
    })

    it('cria o contador de numeração por série', () => {
      const db = criarBanco({})
      aplicar(db)
      expect(colunas(db, 'nfce_numeracao')).toEqual(['serie', 'proximo_numero'])
    })
  })

  it('é idempotente — aplicar duas vezes não quebra nem duplica dados', () => {
    const db = criarBanco({
      produtos: [{ nome: 'Blusa' }],
      itensEntrada: [{ produto_id: 1, ncm: '61091000' }]
    })
    aplicar(db)
    expect(() => aplicar(db)).not.toThrow()
    expect(lerProdutos(db)[0].ncm).toBe('61091000')
    const carimbos = db
      .prepare(`SELECT COUNT(*) AS n FROM _migrations WHERE nome = '031_fiscal_nfce'`)
      .get() as { n: number }
    expect(carimbos.n).toBe(1)
  })
})
