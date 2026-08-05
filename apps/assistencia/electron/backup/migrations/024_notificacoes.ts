import type Database from 'better-sqlite3'

// Caixa de entrada do sino de notificações. O conteúdo é detectado "ao vivo"
// (recalculado do banco a cada olhada), mas cada aviso novo é GRAVADO aqui uma
// vez — assim o gerente não perde nada que apareceu enquanto estava ausente.
// Dedup por (chave, assinatura): o mesmo alerta com o mesmo valor não duplica;
// quando o valor muda (ex.: de "2 vencem hoje" para "3"), entra uma linha nova.
export function aplicar024Notificacoes(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notificacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chave TEXT NOT NULL,
        assinatura TEXT NOT NULL,
        tipo TEXT NOT NULL,
        severidade TEXT NOT NULL,
        titulo TEXT NOT NULL,
        descricao TEXT,
        rota TEXT,
        acao TEXT,
        criada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        lida INTEGER NOT NULL DEFAULT 0,
        dispensada INTEGER NOT NULL DEFAULT 0
      )
    `)
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_notificacoes_chave_assinatura
       ON notificacoes (chave, assinatura)`
    )
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('024_notificacoes')
  })()
}
