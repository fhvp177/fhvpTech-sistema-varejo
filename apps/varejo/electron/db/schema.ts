import type Database from 'better-sqlite3'

const CATEGORIAS_PADRAO = ['Roupas', 'Brinquedos', 'Perfumes', 'Acessórios', 'Diversos']

// Cria todas as tabelas se ainda não existirem
export function criarTabelas(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE COLLATE NOCASE
    );

    CREATE TABLE IF NOT EXISTS fornecedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cnpj TEXT,
      telefone TEXT,
      email TEXT,
      endereco TEXT
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_barras TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      categoria TEXT,
      preco REAL NOT NULL,
      estoque INTEGER DEFAULT 0,
      fornecedor_id INTEGER,
      data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      endereco TEXT,
      tipo_pessoa TEXT NOT NULL DEFAULT 'fisica',
      cnpj TEXT,
      razao_social TEXT,
      data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      data DATETIME DEFAULT CURRENT_TIMESTAMP,
      total REAL NOT NULL,
      status_pagamento TEXT CHECK(status_pagamento IN ('pago','pendente','inadimplente','parcelado')) DEFAULT 'pendente',
      data_vencimento DATE,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );

    CREATE TABLE IF NOT EXISTS itens_venda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      produto_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL,
      preco_unitario REAL NOT NULL,
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    CREATE TABLE IF NOT EXISTS licenca (
      id INTEGER PRIMARY KEY,
      chave TEXT NOT NULL,
      data_expiracao DATE NOT NULL,
      ativo BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS layouts_etiqueta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      colunas INTEGER NOT NULL,
      linhas INTEGER NOT NULL,
      largura_etiqueta_mm REAL NOT NULL,
      altura_etiqueta_mm REAL NOT NULL,
      margem_topo_mm REAL DEFAULT 0,
      margem_esquerda_mm REAL DEFAULT 0,
      espacamento_h_mm REAL DEFAULT 0,
      espacamento_v_mm REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      destinatario TEXT NOT NULL,
      assunto TEXT NOT NULL,
      corpo TEXT NOT NULL,
      enviado BOOLEAN DEFAULT 0,
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
      data_envio DATETIME
    );
  `)

  semearCategorias(db)
}

// Garante que toda categoria em uso pelos produtos esteja cadastrada.
// Em bancos novos, adiciona também as categorias padrão.
function semearCategorias(db: Database.Database): void {
  const inserir = db.prepare('INSERT OR IGNORE INTO categorias (nome) VALUES (?)')
  const transacao = db.transaction(() => {
    const emUso = db
      .prepare("SELECT DISTINCT categoria AS nome FROM produtos WHERE categoria IS NOT NULL AND categoria != ''")
      .all() as Array<{ nome: string }>
    for (const { nome } of emUso) inserir.run(nome)

    const total = db.prepare('SELECT COUNT(*) AS n FROM categorias').get() as { n: number }
    if (total.n === 0) {
      for (const nome of CATEGORIAS_PADRAO) inserir.run(nome)
    }
  })
  transacao()
}
