import type Database from 'better-sqlite3'

// Adiciona desconto monetário em vendas. O campo armazena o valor em R$ já
// convertido (mesmo quando o usuário entrar com %), simplificando relatórios.
// total continua representando o valor final (subtotal - desconto).
export function aplicar010DescontoVenda(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`ALTER TABLE vendas ADD COLUMN desconto REAL NOT NULL DEFAULT 0`)
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('010_desconto_venda')
  })()
}
