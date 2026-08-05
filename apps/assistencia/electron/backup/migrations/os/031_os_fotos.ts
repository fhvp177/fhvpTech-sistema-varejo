import type Database from 'better-sqlite3'

// Registro fotográfico da OS — as fotos que ilustram o laudo técnico (placa
// queimada, tela trincada, instalação concluída). Vivem NO BANCO (data URL
// JPEG já redimensionado pelo renderer, ~300-600KB cada): assim entram no
// mesmo backup do resto e restauram junto. Teto de fotos por OS e de tamanho
// por foto ficam na camada de escrita (ordens.ts), não no schema.
export function aplicar031OsFotos(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS os_fotos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        os_id INTEGER NOT NULL,
        nome TEXT,
        dados TEXT NOT NULL,
        criada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (os_id) REFERENCES ordens_servico(id)
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_os_fotos_os ON os_fotos (os_id)`)
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('031_os_fotos')
  })()
}
