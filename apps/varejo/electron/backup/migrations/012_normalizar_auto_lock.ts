import type Database from 'better-sqlite3'

// Normaliza auto_lock_minutos para o conjunto de opções exposto pela UI:
// 0 (Desativado), 15, 30, 60, 120. Valores entre 1 e 14 (legado: 5, 10) viram 15.
// O valor 0 é preservado — é uma escolha válida do usuário (Desativado).
export function aplicar012NormalizarAutoLock(db: Database.Database): void {
  db.transaction(() => {
    db.prepare(
      `UPDATE config SET valor = '15'
       WHERE chave = 'auto_lock_minutos'
         AND CAST(valor AS INTEGER) BETWEEN 1 AND 14`
    ).run()
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('012_normalizar_auto_lock')
  })()
}
