import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Nasce o SERVIÇO como cidadão de 1ª classe (Fase 3 do nicho de assistência):
// produtos e serviços vivem na MESMA tabela e no mesmo carrinho — no cliente
// real, 6 de 31 vendas misturam mercadoria e mão de obra no mesmo ticket.
// Serviço não tem estoque: as escritas de estoque guardam `tipo != 'servico'`
// e a checagem de saldo na venda pula serviços.
//
// Primeira migration PRÓPRIA da assistência (001–026 são herdadas do varejo e
// mantidas idênticas). Num backup restaurado do varejo, tudo vira 'produto' —
// a reclassificação dos serviços-fantasma históricos é etapa da importação.
export function aplicar027ProdutoTipo(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'produtos', 'tipo', "TEXT NOT NULL DEFAULT 'produto'")
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('027_produto_tipo')
  })()
}
