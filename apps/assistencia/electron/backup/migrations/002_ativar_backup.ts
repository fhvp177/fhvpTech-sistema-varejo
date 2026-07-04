import type Database from 'better-sqlite3'

export function aplicar002AtivarBackup(db: Database.Database): void {
  db.transaction(() => {
    db.prepare("UPDATE config SET valor = '1' WHERE chave = 'backup_ativo'").run()
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('002_ativar_backup')
  })()
}
