import type Database from 'better-sqlite3'

export function aplicar007ValorPago(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`ALTER TABLE vendas ADD COLUMN valor_pago REAL NOT NULL DEFAULT 0`)
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('007_valor_pago')
  })()
}
