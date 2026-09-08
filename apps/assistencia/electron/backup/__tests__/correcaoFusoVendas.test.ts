/**
 * A migration que acerta o fuso das vendas já gravadas.
 *
 * ── Por que ela existe ──────────────────────────────────────────────────────
 * `vendas.data` usava `CURRENT_TIMESTAMP`, que no SQLite é UTC. Toda venda
 * ficou três horas adiante do relógio da bancada, e as feitas depois das 21h
 * caíram no dia seguinte. O código novo grava em hora local; esta migration
 * acerta o que já estava no banco, para o histórico não ficar metade em cada
 * fuso.
 *
 * Na assistência a mistura era visível dentro de um fluxo só: `ordens_servico`
 * sempre gravou `criada_em` em hora local, e a venda que nasce da entrega da
 * OS ficava três horas adiante dela.
 *
 * ── ⚠️ Ela MOVE dados do cliente, e não tem desfazer ────────────────────────
 * É a única migration do sistema que reescreve valores já existentes em vez de
 * só criar coluna ou tabela. Por isso o teste cobre não apenas que ela converte,
 * mas os limites: o que ela NÃO pode encostar, e que não roda duas vezes.
 *
 * Um segundo passe deslocaria tudo mais três horas, e como não há marca de
 * origem na coluna, ninguém teria como saber depois quantas vezes ela rodou.
 */
import { describe, expect, it, beforeEach } from 'vitest'

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

const temSqlite = !!sqlite
const seTiverSqlite = temSqlite ? it : it.skip

let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE _migrations (nome TEXT PRIMARY KEY);
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data DATETIME DEFAULT CURRENT_TIMESTAMP,
      data_vencimento DATE,
      total REAL NOT NULL
    );
    CREATE TABLE ordens_servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      criada_em TEXT NOT NULL
    );
  `)
})

/**
 * A mesma instrução da migration.
 *
 * ⚠️ Reproduzida aqui em vez de importada: a migration recebe um
 * `better-sqlite3`, que é binário compilado para o Electron e não carrega no
 * runtime dos testes — a mesma limitação anotada em migrations.test.ts.
 */
function aplicar(): number {
  const r = db!.prepare("UPDATE vendas SET data = datetime(data, 'localtime')").run() as {
    changes: number | bigint
  }
  return Number(r.changes)
}

/** Diferença, em horas, entre a hora local desta máquina e UTC. */
function deslocamentoLocal(): number {
  const r = db!
    .prepare(
      "SELECT (julianday(datetime('now','localtime')) - julianday(datetime('now'))) * 24 AS h"
    )
    .get() as { h: number }
  return Math.round(r.h)
}

describe('a correção de fuso das vendas', () => {
  seTiverSqlite('★ converte a data gravada para a hora da loja', () => {
    /*
     * A conta é fechada em cima do deslocamento REAL da máquina, e não em cima
     * de −3 fixo. Escrever "23:17 vira 20:17" faria o teste passar só no Brasil
     * e reprovar na integração contínua, que roda em UTC — e um teste que
     * depende de onde roda não guarda nada.
     */
    db!.prepare("INSERT INTO vendas (data, total) VALUES ('2026-09-01 23:17:27', 100)").run()
    aplicar()

    const esperado = db!
      .prepare("SELECT datetime('2026-09-01 23:17:27', 'localtime') AS d")
      .get() as { d: string }
    const depois = db!.prepare('SELECT data FROM vendas').get() as { data: string }
    expect(depois.data).toBe(esperado.d)

    // E o sentido tem que ser o certo: no Brasil, para TRÁS.
    if (deslocamentoLocal() < 0) {
      expect(depois.data < '2026-09-01 23:17:27').toBe(true)
    }
  })

  seTiverSqlite('★ NÃO encosta em data_vencimento', () => {
    /*
     * Vencimento é data escolhida por alguém no formulário, não carimbo de
     * relógio: não tem hora para converter, e mexer nela mudaria o dia em que a
     * parcela vence — ou seja, a dívida do cliente.
     */
    db!
      .prepare(
        "INSERT INTO vendas (data, data_vencimento, total) VALUES ('2026-09-01 23:17:27', '2026-10-05', 100)"
      )
      .run()
    aplicar()
    const v = db!.prepare('SELECT data_vencimento FROM vendas').get() as {
      data_vencimento: string
    }
    expect(v.data_vencimento).toBe('2026-10-05')
  })

  seTiverSqlite('★ NÃO encosta na ordem de serviço', () => {
    /*
     * `ordens_servico.criada_em` nunca esteve errada: sempre foi gravada em
     * hora local. Convertê-la aqui empurraria para trás a única data do fluxo
     * que já estava certa, e a OS voltaria a discordar da venda dela — só que
     * agora para o outro lado.
     */
    db!.prepare("INSERT INTO ordens_servico (criada_em) VALUES ('2026-09-01 14:00:00')").run()
    aplicar()
    const os = db!.prepare('SELECT criada_em FROM ordens_servico').get() as {
      criada_em: string
    }
    expect(os.criada_em).toBe('2026-09-01 14:00:00')
  })

  seTiverSqlite('★ rodar de novo deslocaria TUDO outra vez', () => {
    /*
     * Este teste não protege o código: documenta por que a proteção precisa
     * existir fora dele. A instrução é um UPDATE cego, sem marca de origem na
     * coluna — quem impede o segundo passe é o registro em `_migrations`, e é
     * ele que o teste seguinte cobra.
     */
    db!.prepare("INSERT INTO vendas (data, total) VALUES ('2026-09-01 23:17:27', 100)").run()
    aplicar()
    const umaVez = (db!.prepare('SELECT data FROM vendas').get() as { data: string }).data
    aplicar()
    const duasVezes = (db!.prepare('SELECT data FROM vendas').get() as { data: string }).data

    if (deslocamentoLocal() !== 0) {
      expect(duasVezes, 'o segundo passe deslocou de novo, como esperado').not.toBe(umaVez)
    }
  })

  it('★ a migration se registra, e é isso que impede o segundo passe', () => {
    /*
     * Sem o `INSERT ... INTO _migrations`, o runner a aplicaria a cada abertura
     * do sistema e o histórico andaria três horas por dia, para sempre.
     */
    const fonte = new URL('../migrations/046_datas_das_vendas_em_hora_local.ts', import.meta.url)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const texto = require('fs').readFileSync(fonte, 'utf-8') as string

    expect(texto, 'a migration deixou de se registrar em _migrations')
      .toContain("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)")
    expect(texto, 'o UPDATE deixou de converter para hora local')
      .toContain("UPDATE vendas SET data = datetime(data, 'localtime')")
    expect(texto, 'a migration passou a mexer em outras colunas de data')
      .not.toMatch(/UPDATE (clientes|produtos|parcelas|ordens_servico)/)
  })
})
