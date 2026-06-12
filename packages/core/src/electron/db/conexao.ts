import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database | null = null

export function obterBancoDeDados(): Database.Database {
  if (!db) {
    throw new Error('Banco de dados não inicializado. Chame inicializarBancoDeDados() primeiro.')
  }
  return db
}

export function fecharBancoDeDados(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function inicializarBancoDeDados(aoInicializar?: (db: Database.Database) => void): void {
  const caminhoBanco = join(app.getPath('userData'), 'database.sqlite')

  db = new Database(caminhoBanco)

  // Melhora performance: WAL mode permite leituras simultâneas com escritas
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // O núcleo não conhece o schema de domínio: cada app injeta a criação das
  // suas tabelas (e o que mais precisar no boot) via este callback.
  aoInicializar?.(db)

  console.log(`Banco de dados inicializado em: ${caminhoBanco}`)
}
