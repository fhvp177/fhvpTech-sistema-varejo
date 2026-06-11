import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from './_util'

// Campo livre de observação no cadastro de cliente (ex.: "compra todo dia 10",
// preferências, combinados). Pesquisável na tela de clientes. Nullable — clientes
// existentes ficam com NULL. Idempotente via guard (consistência com 008).
export function aplicar018ClientesObservacao(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'clientes', 'observacao', 'TEXT')
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '018_clientes_observacao'
    )
  })()
}
