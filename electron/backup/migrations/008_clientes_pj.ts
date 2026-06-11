import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from './_util'

// Adiciona suporte a clientes pessoa jurídica (PJ).
// - tipo_pessoa: discrimina PF de PJ. Default 'fisica' preserva os clientes existentes.
// - cnpj e razao_social: campos exclusivos de PJ; ficam NULL para PF.
//
// Idempotente: em instalações novas essas colunas já vêm do schema.ts, então o
// guard pula o ALTER em vez de estourar "duplicate column name".
export function aplicar008ClientesPj(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'clientes', 'tipo_pessoa', "TEXT NOT NULL DEFAULT 'fisica'")
    adicionarColunaSeAusente(db, 'clientes', 'cnpj', 'TEXT')
    adicionarColunaSeAusente(db, 'clientes', 'razao_social', 'TEXT')
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('008_clientes_pj')
  })()
}
