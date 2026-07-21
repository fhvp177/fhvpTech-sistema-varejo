import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Preço de custo do produto, base pro cálculo de lucro/margem na dashboard.
// Idempotente via guard. Produtos existentes ficam com custo 0 até o gerente
// preencher — enquanto custo for 0, a dashboard mostra um aviso em vez de fingir
// margem de 100%.
export function aplicar020ProdutoCusto(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'produtos', 'custo', 'REAL NOT NULL DEFAULT 0')
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '020_produto_custo'
    )
  })()
}
