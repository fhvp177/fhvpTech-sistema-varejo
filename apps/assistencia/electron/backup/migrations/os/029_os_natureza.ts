import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// A OS ganha uma segunda dimensão: a NATUREZA do serviço. Bancada×externo diz
// ONDE o trabalho acontece; conserto×instalação diz O QUE ele é. Sem isso, a
// instalação de CFTV não cabia no vocabulário ("defeito relatado", "em
// reparo") — o motor rodava, mas a língua era só de conserto. A natureza
// ajusta rótulos, comprovantes e documentos, e abre caminho pro relatório
// futuro de faturamento instalação × conserto.
export function aplicar029OsNatureza(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'ordens_servico', 'natureza', "TEXT NOT NULL DEFAULT 'conserto'")
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('029_os_natureza')
  })()
}
