import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, statSync } from 'fs'
import { join } from 'path'

// Resolve qual pasta de dados (userData) o app deve usar no boot.
//
// Contexto do bug que isto conserta: até a 1.11.0 o Electron gravava em
// `%APPDATA%\sistema-rt` (o `name` do pacote). A 1.11.1 fixou o userData em
// "Sistema RT" achando que era esse o nome antigo — mas não era. Resultado:
// máquinas que pulavam de uma versão antiga direto pra 1.11.1+ passavam a abrir
// "Sistema RT" (vazia) e pareciam ter perdido tudo (pediam licença do zero).
//
// Solução SEM copiar nada (risco zero de perda): no boot, olhamos as pastas que
// o app já usou, vemos qual tem dados de verdade e apontamos o userData pra ela.
// - Só a pasta antiga tem dados  -> recupera (usa a antiga no lugar).
// - Já migrou e seguiu usando a nova -> mantém a nova.
// - Nenhuma tem dados (instalação nova) -> usa o padrão atual ("Sistema RT").
//
// Como nunca movemos/apagamos arquivos, no pior caso caímos no comportamento de
// hoje. Para renomear a pasta de fato (ex.: "FHVP Tech") bastaria pôr o novo nome
// como primeiro candidato — mas isso é cosmético e move todo mundo, então fica
// como decisão à parte.
const CANDIDATOS = ['Sistema RT', 'sistema-rt']

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
  const padrao = join(base, CANDIDATOS[0]) // destino oficial atual ("Sistema RT")

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
