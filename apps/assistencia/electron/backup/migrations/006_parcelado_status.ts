import type Database from 'better-sqlite3'

// Recria a tabela vendas com 'parcelado' no CHECK constraint de status_pagamento.
// SQLite não permite ALTER de CHECK constraints, então usa o padrão de recriação segura.
// PRAGMA foreign_keys deve ser definido fora de transações — funciona assim no better-sqlite3.
export function aplicar006ParceladoStatus(db: Database.Database): void {
  db.exec(`PRAGMA foreign_keys = OFF`)

  db.transaction(() => {
    db.exec(`
      CREATE TABLE vendas_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        data DATETIME DEFAULT CURRENT_TIMESTAMP,
        total REAL NOT NULL,
        status_pagamento TEXT CHECK(status_pagamento IN ('pago','pendente','inadimplente','parcelado')) DEFAULT 'pendente',
        data_vencimento DATE,
        num_parcelas INTEGER,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
      )
    `)

    db.exec(`
      INSERT INTO vendas_new (id, cliente_id, data, total, status_pagamento, data_vencimento, num_parcelas)
      SELECT id, cliente_id, data, total, status_pagamento, data_vencimento, num_parcelas
      FROM vendas
    `)

    db.exec(`DROP TABLE vendas`)
    db.exec(`ALTER TABLE vendas_new RENAME TO vendas`)

    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('006_parcelado_status')
  })()

  db.exec(`PRAGMA foreign_keys = ON`)
}
