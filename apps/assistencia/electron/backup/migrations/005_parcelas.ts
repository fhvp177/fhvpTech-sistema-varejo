import type Database from 'better-sqlite3'

export function aplicar005Parcelas(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`ALTER TABLE vendas ADD COLUMN num_parcelas INTEGER`)
    db.exec(`
      CREATE TABLE IF NOT EXISTS parcelas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER NOT NULL REFERENCES vendas(id),
        numero INTEGER NOT NULL,
        valor REAL NOT NULL,
        data_vencimento TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendente'
      )
    `)
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('005_parcelas')
  })()
}
