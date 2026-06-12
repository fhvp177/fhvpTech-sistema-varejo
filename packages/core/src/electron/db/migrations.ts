import type Database from 'better-sqlite3'

// Runner genérico de migrations, compartilhado por todos os nichos. Recebe a
// lista de migrations do app (domínio) e aplica as ainda não registradas. As
// migrations de conteúdo (e a ordem) vivem em cada app — aqui fica só o motor.
export type Migration = {
  nome: string
  aplicar: (db: Database.Database) => void
}

export function executarMigrations(db: Database.Database, migrations: Migration[]): void {
  // Garante que a tabela de controle existe antes de qualquer verificação
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL,
      data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  for (const migration of migrations) {
    const jaAplicada = db
      .prepare('SELECT 1 FROM _migrations WHERE nome = ?')
      .get(migration.nome)

    if (!jaAplicada) {
      console.log(`[migrations] Aplicando: ${migration.nome}`)
      migration.aplicar(db)
      console.log(`[migrations] Concluído: ${migration.nome}`)
    }
  }
}
