import type Database from 'better-sqlite3'

// Adiciona uma coluna só se ela ainda não existir na tabela. Torna as migrations
// de ALTER idempotentes: evita "duplicate column name" quando a coluna já veio
// do schema.ts (criação de DB novo) ou de uma aplicação parcial anterior.
//
// `tabela`/`coluna`/`definicaoSql` são literais fixos das migrations (nunca
// entrada do usuário), então a interpolação no SQL é segura — e PRAGMA/ALTER
// não aceitam o nome da tabela/coluna como parâmetro vinculado de qualquer forma.
export function adicionarColunaSeAusente(
  db: Database.Database,
  tabela: string,
  coluna: string,
  definicaoSql: string
): void {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[]
  if (colunas.some((c) => c.name === coluna)) return
  db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicaoSql}`)
}
