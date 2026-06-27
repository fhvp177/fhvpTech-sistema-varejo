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
      // O runner carimba a migration como aplicada. As migrations atuais também
      // se carimbam por dentro (INSERT OR IGNORE), o que é redundante mas inócuo;
      // garantir o registro AQUI é a rede de segurança contra uma migration nova
      // que esqueça essa linha e, sem isso, re-rodaria em todo boot pra sempre.
      db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(migration.nome)
      console.log(`[migrations] Concluído: ${migration.nome}`)
    }
  }
}
