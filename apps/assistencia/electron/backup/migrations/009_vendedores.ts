import type Database from 'better-sqlite3'

// Adiciona suporte a vendedores (funcionários que realizam vendas).
// - vendedores: cadastro com nome único; ativo permite desativar sem excluir
//   (preserva histórico de vendas mesmo quando o vendedor não atende mais).
// - vendas.vendedor_id: vínculo opcional para vendas pré-existentes (NULL),
//   passa a ser exigido pelo backend a partir desta versão.
export function aplicar009Vendedores(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vendedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
        ativo INTEGER NOT NULL DEFAULT 1,
        data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    db.exec(`ALTER TABLE vendas ADD COLUMN vendedor_id INTEGER REFERENCES vendedores(id)`)
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('009_vendedores')
  })()
}
