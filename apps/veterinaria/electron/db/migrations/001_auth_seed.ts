import type Database from 'better-sqlite3'

// Auth — semente inicial.
// - Define o auto-lock padrão (15 min) na config.
// - Cria um usuário 'Dono' (papel='dono', ativo=1) SEM PIN. O lojista define o
//   PIN no 1º acesso pela tela de login (fluxo "primeiro uso"), nunca aqui.
// As tabelas (usuarios, config) são criadas por criarTabelas (schema.ts) antes
// desta migration rodar.
export function aplicar001AuthSeed(db: Database.Database): void {
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)').run(
      'auto_lock_minutos',
      '15'
    )

    const temDono = db
      .prepare("SELECT 1 FROM usuarios WHERE papel = 'dono' LIMIT 1")
      .get()
    if (!temDono) {
      db.prepare("INSERT INTO usuarios (nome, ativo, papel) VALUES ('Dono', 1, 'dono')").run()
    }

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('001_auth_seed')
  })()
}
