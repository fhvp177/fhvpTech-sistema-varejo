import type Database from 'better-sqlite3'

// Hash gerado com bcrypt (12 rounds) — senha conhecida apenas pelo técnico.
// Para atualizar a senha: gere um novo hash com `npm run hash:gerar` e crie
// uma migration 004 com o novo valor.
const HASH_SENHA_RESTAURACAO =
  '$2b$12$OZoSNx1fZJA12026/V0U9.CyigFGQNHN4mjLrN9DE1jcdYa4TweMO'

export function aplicar003HashSenhaRestauracao(db: Database.Database): void {
  db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').run(
      'backup_hash_senha_restauracao',
      HASH_SENHA_RESTAURACAO,
    )
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run(
      '003_hash_senha_restauracao',
    )
  })()
}
