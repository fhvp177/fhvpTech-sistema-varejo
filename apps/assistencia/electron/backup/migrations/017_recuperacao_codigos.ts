import type Database from 'better-sqlite3'

// Recuperação de PIN do gerente por email.
// Guarda o código de 6 dígitos como HASH bcrypt (nunca em claro), com validade
// e contador de tentativas. O código é gerado e validado LOCALMENTE; o backend
// Fly só envia o email. 1 código ativo por vendedor (o novo apaga o anterior).
export function aplicar017RecuperacaoCodigos(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS recuperacao_codigos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendedor_id INTEGER NOT NULL,
        codigo_hash TEXT NOT NULL,
        expira_em TEXT NOT NULL,
        tentativas INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (vendedor_id) REFERENCES vendedores(id) ON DELETE CASCADE
      )
    `)
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_recuperacao_vendedor ON recuperacao_codigos(vendedor_id)`
    )
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '017_recuperacao_codigos'
    )
  })()
}
