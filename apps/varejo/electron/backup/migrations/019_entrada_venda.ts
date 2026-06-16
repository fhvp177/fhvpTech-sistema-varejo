import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Valor de entrada pago no ato da venda (parcelada ou a prazo). O total da venda
// permanece o valor cheio — a entrada apenas reduz o que é financiado e já entra
// como valor_pago. Assim os relatórios continuam somando o total real da venda.
// Idempotente via guard (consistência com 018). Vendas existentes ficam com 0.
export function aplicar019EntradaVenda(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'vendas', 'entrada', 'REAL NOT NULL DEFAULT 0')
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '019_entrada_venda'
    )
  })()
}
