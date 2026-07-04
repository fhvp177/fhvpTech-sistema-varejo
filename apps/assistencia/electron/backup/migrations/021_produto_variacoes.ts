import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Grade de tamanhos do produto (vestuário). Cria a tabela produto_variacoes e a
// coluna itens_venda.variacao_id, e libera o codigo_barras do produto para ficar
// NULL — porque num produto de grade quem carrega o código bipável é cada tamanho,
// não o produto. Produtos simples (sem grade) seguem com código/estoque próprios.
//
// Idempotente: tabela/índice via IF NOT EXISTS, coluna via guard, e o rebuild de
// produtos só acontece se codigo_barras ainda estiver NOT NULL. Como o runner só
// chama esta migration uma vez (registro em _migrations), o rebuild roda no máximo
// uma vez; o guard é cinto-e-suspensório caso uma execução anterior tenha falhado
// no meio (o pre-update backup cobre o risco maior).
export function aplicar021ProdutoVariacoes(db: Database.Database): void {
  // 1) Tabela de variações + índice, e 2) coluna variacao_id em itens_venda.
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS produto_variacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER NOT NULL,
        tamanho TEXT NOT NULL,
        codigo_barras TEXT UNIQUE NOT NULL,
        estoque INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_variacoes_produto ON produto_variacoes(produto_id);
    `)
    adicionarColunaSeAusente(db, 'itens_venda', 'variacao_id', 'INTEGER')
  })()

  // 3) Reconstrói produtos para tornar codigo_barras NUL-ável (SQLite não faz
  // DROP NOT NULL via ALTER). Só se ainda estiver NOT NULL.
  const colCodigo = (
    db.prepare(`PRAGMA table_info(produtos)`).all() as Array<{ name: string; notnull: number }>
  ).find((c) => c.name === 'codigo_barras')

  if (colCodigo && colCodigo.notnull === 1) {
    // foreign_keys não pode ser alterado dentro de transação. Desliga durante o
    // rebuild e restaura o estado anterior depois.
    const fkAntes = db.pragma('foreign_keys', { simple: true })
    db.pragma('foreign_keys = OFF')
    try {
      db.transaction(() => {
        // Mesmas colunas de produtos NESTE ponto da cadeia (custo já veio na 020),
        // mudando só codigo_barras: TEXT UNIQUE (sem NOT NULL).
        db.exec(`
          CREATE TABLE produtos_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_barras TEXT UNIQUE,
            nome TEXT NOT NULL,
            categoria TEXT,
            preco REAL NOT NULL,
            custo REAL NOT NULL DEFAULT 0,
            estoque INTEGER DEFAULT 0,
            fornecedor_id INTEGER,
            data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
          );
        `)
        db.exec(`
          INSERT INTO produtos_new
            (id, codigo_barras, nome, categoria, preco, custo, estoque, fornecedor_id, data_cadastro)
          SELECT id, codigo_barras, nome, categoria, preco, custo, estoque, fornecedor_id, data_cadastro
          FROM produtos;
        `)
        db.exec(`DROP TABLE produtos;`)
        db.exec(`ALTER TABLE produtos_new RENAME TO produtos;`)
      })()
    } finally {
      if (fkAntes === 1) db.pragma('foreign_keys = ON')
    }
  }

  db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('021_produto_variacoes')
}
