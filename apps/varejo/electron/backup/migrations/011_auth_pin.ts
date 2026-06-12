import type Database from 'better-sqlite3'

// Configura o slot do PIN de bloqueio do sistema na tabela config.
// O hash em si é definido pelo lojista no primeiro uso (via UI), nunca aqui.
// auto_lock_minutos: 0 desativa o bloqueio por inatividade.
// ultima_validacao_pin_data: data (YYYY-MM-DD) da última vez que o PIN foi
// aceito; vazio = pendente. Permite a regra "pede uma vez por dia".
export function aplicar011AuthPin(db: Database.Database): void {
  db.transaction(() => {
    const ins = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)')
    ins.run('pin_sistema_hash', '')
    ins.run('auto_lock_minutos', '15')
    ins.run('ultima_validacao_pin_data', '')
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('011_auth_pin')
  })()
}
