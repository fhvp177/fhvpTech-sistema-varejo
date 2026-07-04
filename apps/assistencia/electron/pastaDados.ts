import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, statSync } from 'fs'
import { join } from 'path'

// Resolve qual pasta de dados (userData) o app deve usar no boot.
//
// No varejo esta lista tem as pastas legadas ("Sistema RT"/"sistema-rt") por
// causa do histórico de instalações antigas. A assistência técnica nasceu do
// zero: só existe UMA pasta candidata, a dela — e ela NUNCA pode apontar pras
// pastas do varejo, senão um PC com os dois apps abriria o banco errado.
// O mecanismo (escolher a pasta com dados de verdade) fica mantido pra
// sobreviver a um eventual rename futuro sem repetir o bug do varejo.
const CANDIDATOS = ['FHVP Tech Assistencia']

// Conta registros "de negócio" num banco candidato. Banco ausente, ilegível ou
// recém-criado (sem produtos/clientes/vendas) conta 0 = "sem dados".
function contarRegistros(caminhoBanco: string): number {
  try {
    const db = new Database(caminhoBanco, { readonly: true, fileMustExist: true })
    try {
      const r = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM produtos)
                + (SELECT COUNT(*) FROM clientes)
                + (SELECT COUNT(*) FROM vendas) AS n`
        )
        .get() as { n: number } | undefined
      return r?.n ?? 0
    } finally {
      db.close()
    }
  } catch {
    return 0
  }
}

export function resolverPastaDados(): string {
  const base = app.getPath('appData')
  const padrao = join(base, CANDIDATOS[0]) // destino oficial ("FHVP Tech Assistencia")

  try {
    const comDados = CANDIDATOS.map((nome) => join(base, nome))
      .map((pasta) => ({ pasta, banco: join(pasta, 'database.sqlite') }))
      .filter(({ banco }) => existsSync(banco) && contarRegistros(banco) > 0)
      .map(({ pasta, banco }) => ({ pasta, mtime: statSync(banco).mtimeMs }))

    if (comDados.length > 0) {
      // Entre as pastas COM dados, usa a de banco modificado mais recentemente —
      // a que o cliente realmente estava usando.
      comDados.sort((a, b) => b.mtime - a.mtime)
      return comDados[0].pasta
    }
  } catch {
    // Qualquer imprevisto: cai no padrão (comportamento de hoje), nunca trava o boot.
  }

  return padrao
}
