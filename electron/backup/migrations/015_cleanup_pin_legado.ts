import type Database from 'better-sqlite3'

// Hierarquia dono/vendedor — fase 5 (cleanup).
// Remove as chaves do "PIN único" antigo agora que cada vendedor tem seu PIN
// próprio. O hash já foi migrado pro vendedor dono pela 013_vendedores_auth.
// `ultima_validacao_pin_data` também perde sentido — toda abertura exige login.
export function aplicar015CleanupPinLegado(db: Database.Database): void {
  db.transaction(() => {
    db.prepare("DELETE FROM config WHERE chave = 'pin_sistema_hash'").run()
    db.prepare("DELETE FROM config WHERE chave = 'ultima_validacao_pin_data'").run()
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('015_cleanup_pin_legado')
  })()
}
