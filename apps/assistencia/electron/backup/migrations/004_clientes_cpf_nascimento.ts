import type Database from 'better-sqlite3'

export function aplicar004ClientesCpfNascimento(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      ALTER TABLE clientes ADD COLUMN cpf TEXT;
      ALTER TABLE clientes ADD COLUMN data_nascimento TEXT;
    `)
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run(
      '004_clientes_cpf_nascimento',
    )
  })()
}
