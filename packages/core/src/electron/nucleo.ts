import type Database from 'better-sqlite3'
import type { Migration } from './db/migrations'

// Ganchos de domínio que o núcleo precisa mas não conhece. Cada app (nicho)
// registra os seus uma única vez no boot, via configurarNucleo(), ANTES de
// inicializar banco e backup. Mantém o núcleo agnóstico ao domínio: o motor de
// backup, restauração e DB vive aqui; o schema, as migrations e a licença são
// de cada nicho e entram por aqui.
export type ConfigNucleo = {
  // Cria as tabelas do app no banco recém-aberto (schema de domínio).
  criarTabelas: (db: Database.Database) => void
  // Lista de migrations do app, na ordem de aplicação.
  migrations: Migration[]
  // Status da licença; o núcleo só consome o clienteId (para identificar backups).
  validarLicenca: () => { clienteId?: string }
}

let config: ConfigNucleo | null = null

export function configurarNucleo(c: ConfigNucleo): void {
  config = c
}

export function obterConfigNucleo(): ConfigNucleo {
  if (!config) {
    throw new Error(
      'Núcleo não configurado: chame configurarNucleo() no boot antes de usar banco/backup.'
    )
  }
  return config
}
