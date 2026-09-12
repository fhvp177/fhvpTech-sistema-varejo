/**
 * Categorias de conta a pagar.
 *
 * ── O que este arquivo prende ───────────────────────────────────────────────
 *
 *  1. ★ **Renomear PROPAGA.** A conta guarda o nome, não um id. Sem propagar,
 *     renomear partiria o histórico em dois — as contas antigas com o nome
 *     velho e as novas com o novo — e o relatório de despesas mostraria a mesma
 *     despesa em duas linhas, que é o problema que este cadastro veio resolver.
 *
 *  2. ★ **Excluir NÃO apaga conta nenhuma.** As despesas continuam no livro,
 *     com valor e data; elas só perdem a etiqueta.
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

const {
  listarCategoriasConta,
  criarCategoriaConta,
  atualizarCategoriaConta,
  deletarCategoriaConta
} = await import('../categoriasConta')

const SCHEMA = `
  CREATE TABLE categorias_conta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE COLLATE NOCASE
  );
  CREATE TABLE contas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    categoria TEXT,
    valor_total REAL NOT NULL,
    vencimento TEXT NOT NULL
  );
`

const SEED = `
  INSERT INTO categorias_conta (nome) VALUES ('Energia'), ('Aluguel');
  INSERT INTO contas_pagar (descricao, categoria, valor_total, vencimento)
    VALUES ('Conta de luz', 'Energia', 300, '2026-05-10'),
           ('Luz da loja 2', 'energia', 150, '2026-05-10'),
           ('Ponto comercial', 'Aluguel', 2000, '2026-05-05');
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

const categoriaDa = (descricao: string): string | null =>
  (
    db!.prepare('SELECT categoria FROM contas_pagar WHERE descricao = ?').get(descricao) as {
      categoria: string | null
    }
  ).categoria

describe('a lista', () => {
  seTiverSqlite('conta quantas contas usam cada categoria', () => {
    const cats = listarCategoriasConta()
    expect(cats.find((c) => c.nome === 'Energia')!.contas_count).toBe(2)
    expect(cats.find((c) => c.nome === 'Aluguel')!.contas_count).toBe(1)
  })

  seTiverSqlite('★ "energia" e "Energia" contam como a MESMA', () => {
    // O lojista digitou das duas formas antes de existir cadastro. Contadas
    // separadas, o relatório de despesas mostraria a mesma conta em duas linhas.
    expect(listarCategoriasConta().find((c) => c.nome === 'Energia')!.contas_count).toBe(2)
  })

  seTiverSqlite('vem em ordem de nome', () => {
    expect(listarCategoriasConta().map((c) => c.nome)).toEqual(['Aluguel', 'Energia'])
  })
})

describe('criar', () => {
  seTiverSqlite('aceita nome novo', () => {
    criarCategoriaConta('  Internet  ')
    expect(listarCategoriasConta().map((c) => c.nome)).toContain('Internet')
  })

  seTiverSqlite('recusa nome vazio', () => {
    expect(() => criarCategoriaConta('   ')).toThrow(/vazio/i)
  })

  seTiverSqlite('recusa repetida, mesmo com outra grafia', () => {
    expect(() => criarCategoriaConta('energia')).toThrow()
  })
})

describe('renomear', () => {
  seTiverSqlite('★ PROPAGA o nome novo para as contas que a usam', () => {
    const energia = listarCategoriasConta().find((c) => c.nome === 'Energia')!
    atualizarCategoriaConta(energia.id, 'Energia elétrica')

    expect(categoriaDa('Conta de luz')).toBe('Energia elétrica')
    // e alcança também a que estava escrita em minúsculas
    expect(categoriaDa('Luz da loja 2')).toBe('Energia elétrica')
    // sem encostar nas outras
    expect(categoriaDa('Ponto comercial')).toBe('Aluguel')
  })

  seTiverSqlite('recusa nome vazio', () => {
    const c = listarCategoriasConta()[0]
    expect(() => atualizarCategoriaConta(c.id, '  ')).toThrow(/vazio/i)
  })

  seTiverSqlite('categoria que não existe dá erro', () => {
    expect(() => atualizarCategoriaConta(999, 'Nova')).toThrow(/não encontrada/i)
  })
})

describe('excluir', () => {
  seTiverSqlite('★ as CONTAS continuam, só ficam sem categoria', () => {
    // São despesas pagas, com valor e data: elas seguem no livro e no relatório
    // do mês. O que se perde é a etiqueta.
    const energia = listarCategoriasConta().find((c) => c.nome === 'Energia')!
    deletarCategoriaConta(energia.id)

    const quantas = db!.prepare('SELECT COUNT(*) AS n FROM contas_pagar').get() as { n: number }
    expect(quantas.n).toBe(3)
    expect(categoriaDa('Conta de luz')).toBeNull()
    expect(categoriaDa('Luz da loja 2')).toBeNull()
    expect(categoriaDa('Ponto comercial')).toBe('Aluguel')
  })

  seTiverSqlite('categoria que não existe não quebra', () => {
    expect(() => deletarCategoriaConta(999)).not.toThrow()
  })
})
