import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Referência do produto: um código CURTO e único pra achar o produto rápido
// quando não tem leitor na mão — o balconista digita "10" em vez do EAN de 13
// dígitos ou do nome inteiro. Numerada automaticamente no cadastro (próximo
// número livre), mas editável: tem loja que prefere usar a referência do
// catálogo do fornecedor ("AZ-15").
//
// Os produtos que já existem ganham o próprio id como referência inicial — é
// estável, único e a numeração nova continua de onde ela parou. TEXT (não
// INTEGER) porque referência com letra é válida; o índice único é NOCASE
// ("az-15" e "AZ-15" são a mesma) e parcial porque produto sem referência
// (não deveria existir, mas...) não pode travar os outros.
export function aplicar029ProdutoReferencia(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'produtos', 'referencia', 'TEXT')
    db.exec(`UPDATE produtos SET referencia = CAST(id AS TEXT) WHERE referencia IS NULL`)
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_referencia
      ON produtos(referencia COLLATE NOCASE) WHERE referencia IS NOT NULL
    `)
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('029_produto_referencia')
  })()
}
