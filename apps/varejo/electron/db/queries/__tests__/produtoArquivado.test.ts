/**
 * Arquivar produto: tirar do dia a dia sem apagar o passado.
 *
 * ── O que este arquivo prende ───────────────────────────────────────────────
 *
 *  1. ★ **Arquivar NÃO é excluir.** O produto continua existindo, com o mesmo
 *     id, e por isso a venda antiga dele continua de pé — com o item, o preço
 *     congelado, a comissão e a garantia. Era esta a razão de o sistema recusar
 *     a exclusão, e é o que o arquivamento preserva.
 *
 *  2. ★ **Some de onde se VENDE, fica onde se CONSULTA.** A lista do dia a dia
 *     não traz arquivado; a busca por código traz, marcado, para o caixa poder
 *     dizer "está arquivado" em vez de "não encontrado" — e para a importação
 *     de XML não cadastrar uma segunda ficha do mesmo item.
 *
 *  3. **O estoque não é mexido.** A peça arquivada que ainda está na prateleira
 *     continua sendo patrimônio da loja.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

type Adaptador = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown
    get: (...args: unknown[]) => unknown
    all: (...args: unknown[]) => unknown
  }
  transaction: (fn: (...a: never[]) => unknown) => (...args: never[]) => unknown
}

let banco: Adaptador | null = null

vi.mock('@fhvptech/core/electron/db/conexao', () => ({
  obterBancoDeDados: () => {
    if (!banco) throw new Error('banco de teste não inicializado')
    return banco
  }
}))

const { listarProdutos, arquivarProduto, buscarProdutoPorCodigoBarras, obterProdutoPorId } =
  await import('../produtos')

const SCHEMA = `
  CREATE TABLE fornecedores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
  CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_barras TEXT UNIQUE, referencia TEXT, nome TEXT NOT NULL, categoria TEXT,
    preco REAL NOT NULL, custo REAL NOT NULL DEFAULT 0, garantia_dias INTEGER,
    estoque INTEGER DEFAULT 0, reservado INTEGER NOT NULL DEFAULT 0,
    arquivado INTEGER NOT NULL DEFAULT 0,
    fornecedor_id INTEGER, data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE produto_variacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL, tamanho TEXT NOT NULL,
    codigo_barras TEXT UNIQUE NOT NULL, estoque INTEGER NOT NULL DEFAULT 0,
    reservado INTEGER NOT NULL DEFAULT 0
  );
`

const SEED = `
  INSERT INTO produtos (id, codigo_barras, referencia, nome, preco, estoque)
    VALUES (1, '7890000000001', '10', 'Cabo 5mm', 197, 5),
           (2, '7890000000002', '11', 'Cabo 6mm', 250, 3);
`

let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  db.exec(SCHEMA)
  db.exec(SEED)
  banco = {
    exec: (sql) => db!.exec(sql),
    prepare: (sql) => {
      const st = db!.prepare(sql)
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
      (...args) =>
        fn(...args)
  }
})

const seTiverSqlite = sqlite ? it : it.skip

describe('a lista do dia a dia', () => {
  seTiverSqlite('★ não traz o arquivado', () => {
    arquivarProduto(1)
    const nomes = listarProdutos().map((p) => p.nome)
    expect(nomes).toEqual(['Cabo 6mm'])
  })

  seTiverSqlite('traz quando alguém pede para ver', () => {
    arquivarProduto(1)
    expect(listarProdutos(true)).toHaveLength(2)
  })

  seTiverSqlite('reativar devolve para a lista', () => {
    arquivarProduto(1)
    arquivarProduto(1, false)
    expect(listarProdutos()).toHaveLength(2)
  })

  seTiverSqlite('★ o estoque NÃO é mexido ao arquivar', () => {
    // A peça continua na prateleira, e continua sendo patrimônio da loja.
    // Zerar aqui inventaria uma baixa que ninguém fez.
    arquivarProduto(1)
    const p = obterProdutoPorId(1)!
    expect(p.estoque).toBe(5)
    expect(p.arquivado).toBe(1)
  })
})

describe('a busca por código, que é a do caixa', () => {
  seTiverSqlite('★ ACHA o arquivado, marcado', () => {
    /*
     * ⚠️ Devolver "não encontrado" mandaria o operador cadastrar o mesmo item
     * de novo, e a loja terminaria com duas fichas do mesmo produto — que é o
     * problema que o arquivamento veio resolver. A recusa é da TELA, com o
     * nome do produto na frase; o dado tem que chegar lá.
     */
    arquivarProduto(1)
    const achado = buscarProdutoPorCodigoBarras('7890000000001')
    expect(achado).toBeDefined()
    expect(achado!.nome).toBe('Cabo 5mm')
    expect(achado!.arquivado).toBe(1)
  })

  seTiverSqlite('acha o arquivado também pela referência', () => {
    arquivarProduto(1)
    expect(buscarProdutoPorCodigoBarras('10')?.arquivado).toBe(1)
  })

  seTiverSqlite('produto normal continua vindo sem marca', () => {
    expect(buscarProdutoPorCodigoBarras('7890000000002')?.arquivado).toBe(0)
  })
})

describe('a operação em si', () => {
  seTiverSqlite('arquivar duas vezes não quebra nada', () => {
    arquivarProduto(1)
    arquivarProduto(1)
    expect(obterProdutoPorId(1)!.arquivado).toBe(1)
  })

  seTiverSqlite('produto que não existe dá erro, em vez de sumir calado', () => {
    expect(() => arquivarProduto(999)).toThrow(/não encontrado/i)
  })

  seTiverSqlite('★ arquivar um NÃO mexe no outro', () => {
    arquivarProduto(1)
    expect(obterProdutoPorId(2)!.arquivado).toBe(0)
  })
})
