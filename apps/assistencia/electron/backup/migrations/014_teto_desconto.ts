import type Database from 'better-sqlite3'

// Hierarquia gerente/vendedor — fase 3.
// Define o teto de desconto (em %) que um vendedor pode aplicar numa venda
// sem precisar do PIN do gerente. Default 10% — ajustável em Configurações.
export function aplicar014TetoDesconto(db: Database.Database): void {
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)').run(
      'teto_desconto_vendedor_pct',
      '10'
    )
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('014_teto_desconto')
  })()
}
