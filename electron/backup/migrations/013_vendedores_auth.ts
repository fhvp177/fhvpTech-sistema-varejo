import type Database from 'better-sqlite3'

// Hierarquia dono/vendedor — fase 1.
// - Adiciona `papel` ('dono' | 'vendedor'), `pin_hash` e `email` em vendedores.
// - Migra o vendedor cujo nome (após trim/lowercase) é exatamente 'dono' pra papel='dono',
//   copiando o PIN único atual (config.pin_sistema_hash) pra ele. Se não existir,
//   cria um vendedor 'Dono' automaticamente recebendo o PIN.
// - `config.pin_sistema_hash` permanece preenchido até a fase 5 (cleanup) pra não
//   quebrar nada caso o app abra numa versão intermediária.
export function aplicar013VendedoresAuth(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`ALTER TABLE vendedores ADD COLUMN papel TEXT NOT NULL DEFAULT 'vendedor'`)
    db.exec(`ALTER TABLE vendedores ADD COLUMN pin_hash TEXT`)
    db.exec(`ALTER TABLE vendedores ADD COLUMN email TEXT`)

    const pinHashAtual = (
      db.prepare("SELECT valor FROM config WHERE chave = 'pin_sistema_hash'").get() as
        | { valor: string }
        | undefined
    )?.valor

    const donoExistente = db
      .prepare("SELECT id FROM vendedores WHERE LOWER(TRIM(nome)) = 'dono' LIMIT 1")
      .get() as { id: number } | undefined

    if (donoExistente) {
      db.prepare(
        'UPDATE vendedores SET papel = ?, ativo = 1, pin_hash = COALESCE(?, pin_hash) WHERE id = ?'
      ).run('dono', pinHashAtual || null, donoExistente.id)
    } else {
      db.prepare(
        'INSERT INTO vendedores (nome, ativo, papel, pin_hash) VALUES (?, 1, ?, ?)'
      ).run('Dono', 'dono', pinHashAtual || null)
    }

    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('013_vendedores_auth')
  })()
}
