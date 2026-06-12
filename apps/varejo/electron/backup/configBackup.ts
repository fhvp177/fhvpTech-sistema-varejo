import { obterBancoDeDados } from '../db/conexao'

export function lerConfig(chave: string): string {
  const db = obterBancoDeDados()
  const row = db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave) as
    | { valor: string }
    | undefined
  return row?.valor ?? ''
}

export function gravarConfig(chave: string, valor: string): void {
  const db = obterBancoDeDados()
  db.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').run(chave, valor)
}
