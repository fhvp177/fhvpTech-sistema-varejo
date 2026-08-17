import { describe, it, expect } from 'vitest'

// Teste da migration at_002 contra um SQLite DE VERDADE, rodando o código REAL.
// O better-sqlite3 do repo é compilado pro ABI do Electron e não carrega no
// runtime dos testes, então usamos o node:sqlite embutido do Node por trás de um
// adaptador com a mesma cara — mesmo truque das outras migrations.
//
// O que está em jogo aqui é a tabela onde vivem documentos que a loja entrega
// na mão do cliente. As duas garantias que o resto do sistema assume:
//   • `numero` é ÚNICO — dois recibos com o mesmo número tornam os dois
//     discutíveis;
//   • `valor > 0` no próprio banco, não só na validação da query, porque o
//     recibo declara ter recebido uma quantia.

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

import { aplicarAt002Recibos } from '../os/at_002_recibos'
import type Database from 'better-sqlite3'

type Adaptador = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown
    get: (...args: unknown[]) => unknown
    all: (...args: unknown[]) => unknown
  }
  transaction: (fn: (...a: never[]) => unknown) => (...args: never[]) => unknown
}

// Estado ANTERIOR: só o que a migration encosta (a FK de clientes) e o livro
// de migrations.
const SCHEMA = `
  CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
  CREATE TABLE _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`

function criarBanco(): {
  ad: Adaptador
  bruto: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']>
} {
  const db = new sqlite!.DatabaseSync(':memory:')
  db.exec(SCHEMA)
  db.exec("INSERT INTO clientes (id, nome) VALUES (1, 'Maria Francisca');")

  let profundidade = 0
  const ad: Adaptador = {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const st = db.prepare(sql)
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: (...args: unknown[]) => st.run(...(args as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: (...args: unknown[]) => st.get(...(args as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all: (...args: unknown[]) => st.all(...(args as any[]))
      }
    },
    transaction:
      (fn) =>
      (...args) => {
        const sp = `sp_${profundidade}`
        db.exec(profundidade === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
        profundidade++
        try {
          const r = fn(...args)
          profundidade--
          db.exec(profundidade === 0 ? 'COMMIT' : `RELEASE ${sp}`)
          return r
        } catch (e) {
          profundidade--
          db.exec(profundidade === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
          throw e
        }
      }
  }
  return { ad, bruto: db }
}

const aplicar = (ad: Adaptador) => aplicarAt002Recibos(ad as unknown as Database.Database)

const inserir = (
  db: ReturnType<typeof criarBanco>['bruto'],
  numero: number,
  valor = 100
): void => {
  db.prepare(
    `INSERT INTO recibos (numero, valor, recebedor_nome, pagador_nome, referente, data_recibo)
     VALUES (?, ?, 'Loja', 'Maria', 'servico', '2026-08-16')`
  ).run(numero, valor)
}

describe.runIf(sqlite)('aplicarAt002Recibos', () => {
  it('cria a tabela com os campos das duas partes', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    const cols = (
      bruto.prepare('PRAGMA table_info(recibos)').all() as Array<{ name: string }>
    ).map((c) => c.name)
    for (const c of [
      'numero',
      'valor',
      'recebedor_nome',
      'recebedor_documento',
      'recebedor_rg',
      'pagador_nome',
      'pagador_documento',
      'pagador_rg',
      'pagador_cliente_id',
      'referente',
      'cidade',
      'data_recibo',
      'observacao',
      'cancelado',
      'cancelado_motivo'
    ]) {
      expect(cols, `faltou a coluna ${c}`).toContain(c)
    }
  })

  it('★ o banco recusa dois recibos com o mesmo número', () => {
    // A tranca que sobrevive a qualquer erro de quem chama.
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    inserir(bruto, 1)
    expect(() => inserir(bruto, 1), 'número duplicado passou').toThrow(/UNIQUE/i)
  })

  it('o banco recusa valor zero ou negativo', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    expect(() => inserir(bruto, 1, 0)).toThrow(/CHECK/i)
    expect(() => inserir(bruto, 2, -5)).toThrow(/CHECK/i)
  })

  it('nasce como não cancelado', () => {
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    inserir(bruto, 1)
    const r = bruto.prepare('SELECT cancelado FROM recibos WHERE numero = 1').get() as {
      cancelado: number
    }
    expect(r.cancelado).toBe(0)
  })

  it('se registra e roda duas vezes sem estragar nada', () => {
    // O runner casa por nome, mas uma migration que não é idempotente quebra
    // quem restaura um backup antigo por cima de um banco já migrado.
    const { ad, bruto } = criarBanco()
    aplicar(ad)
    inserir(bruto, 1)
    aplicar(ad)

    const registro = bruto
      .prepare("SELECT COUNT(*) AS n FROM _migrations WHERE nome = 'at_002_recibos'")
      .get() as { n: number }
    expect(registro.n).toBe(1)

    const sobrou = bruto.prepare('SELECT COUNT(*) AS n FROM recibos').get() as { n: number }
    expect(sobrou.n, 'a segunda aplicação apagou o que já existia').toBe(1)
  })
})
