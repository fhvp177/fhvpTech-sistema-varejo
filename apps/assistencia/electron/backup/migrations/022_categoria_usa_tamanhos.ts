import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Flag por categoria: produtos desta categoria usam grade de tamanhos (P/M/G/GG).
// É o que decide se o checkbox "tem tamanhos" aparece no cadastro de produto.
// Default 0 (sem tamanhos) — assim perfumes, brinquedos etc. não veem a opção.
//
// Em bancos já existentes, liga a categoria padrão "Roupas" (o caso típico de
// quem usa grade) pra preservar o comportamento atual. Roda uma única vez (o
// runner pula migration já registrada), então nunca atropela uma escolha que o
// lojista faça depois na tela de categorias.
export function aplicar022CategoriaUsaTamanhos(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'categorias', 'usa_tamanhos', 'INTEGER NOT NULL DEFAULT 0')
    db.prepare("UPDATE categorias SET usa_tamanhos = 1 WHERE nome = 'Roupas' COLLATE NOCASE").run()
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '022_categoria_usa_tamanhos'
    )
  })()
}
