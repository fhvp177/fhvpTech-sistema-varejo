import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Terceira dimensão da OS: a CATEGORIA do que está sendo atendido. Equipamento
// (computador, notebook, impressora...) e sistema CFTV são bichos diferentes
// desde a abertura — um pede aparelho/série/senha, o outro pede local/escopo.
// Antes o CFTV vivia disfarçado num chip que trocava tipo+natureza; agora é
// cidadão do banco: o formulário se adapta por ela e relatórios futuros podem
// separar bancada de câmeras. Junta-se a tipo_atendimento (ONDE) e natureza
// (O QUÊ): categoria diz EM QUE.
export function aplicar030OsCategoria(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'ordens_servico', 'categoria', "TEXT NOT NULL DEFAULT 'equipamento'")
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('030_os_categoria')
  })()
}
