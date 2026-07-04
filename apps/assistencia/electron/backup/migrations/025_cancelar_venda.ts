import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Cancelamento de venda (arquivamento com auditoria). A venda continua no banco,
// mas com `cancelada = 1` é excluída de TODOS os relatórios/somatórios (faturamento,
// dívidas, métricas). Guarda quem cancelou, quando e por quê. Idempotente.
//
// Só é permitido cancelar em dois estados seguros (regra na query/IPC, não aqui):
//   (A) venda "virgem" — nada recebido e nada devolvido → restaura estoque;
//   (B) venda integralmente devolvida → só arquiva (a devolução já acertou tudo).
export function aplicar025CancelarVenda(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'vendas', 'cancelada', 'INTEGER NOT NULL DEFAULT 0')
    adicionarColunaSeAusente(db, 'vendas', 'cancelada_em', 'TEXT')
    adicionarColunaSeAusente(db, 'vendas', 'cancelada_por_id', 'INTEGER')
    adicionarColunaSeAusente(db, 'vendas', 'cancelamento_motivo', 'TEXT')
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('025_cancelar_venda')
  })()
}
