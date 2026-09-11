/**
 * A tabela `cobrancas` (migration 049).
 *
 * ── Por que uma guarda ESTRUTURAL, e não só de comportamento ─────────────────
 * A lógica da fila (`filaCobranca.test.ts`) prova que o sistema decide certo.
 * Mas decidir certo acontece ANTES de escrever no banco, e duas decisões
 * tomadas com a mesma leitura chegam as duas à conclusão "pode cobrar". Dois
 * cliques rápidos no mesmo botão são exatamente isso.
 *
 * O que fecha essa porta é a restrição do banco, não o raciocínio. Por isso o
 * teste mais importante daqui é o da referência repetida.
 *
 * Há um segundo motivo, já pago caro nesta casa: os dois drivers de SQLite
 * discordam em silêncio, e teste de comportamento não percebe coluna faltando
 * num INSERT. Conferir o formato da tabela é o que pega isso.
 */
import { describe, expect, it } from 'vitest'
import { aplicar049CobrancasMaquininha } from '../backup/migrations/049_cobrancas_maquininha'
import type Database from 'better-sqlite3'

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

/**
 * O `node:sqlite` dos testes não tem `transaction`, que o `better-sqlite3` da
 * loja tem. O adaptador empresta o que falta, sem mudar o que a migration faz.
 */
function bancoNovo(): Database.Database {
  const db = sqlite!.DatabaseSync
    ? new sqlite!.DatabaseSync(':memory:')
    : (null as never)

  const adaptado = db as unknown as Record<string, unknown>
  adaptado.transaction = (fn: () => void) => () => fn()

  // `cobrancas` aponta para `vendas`. A tabela de mentira existe só para o
  // vínculo ter para onde apontar.
  db.exec('CREATE TABLE vendas (id INTEGER PRIMARY KEY AUTOINCREMENT)')
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (nome TEXT PRIMARY KEY)')

  return db as unknown as Database.Database
}

/** As colunas que `filaLogica.ts` espera encontrar. */
const COLUNAS_ESPERADAS = [
  'id',
  'referencia',
  'provedor',
  'valor',
  'meio',
  'parcelas',
  'situacao',
  'id_externo',
  'bandeira',
  'autorizacao',
  'cnpj_credenciadora',
  'detalhe',
  'venda_id',
  'criada_em',
  'atualizada_em'
]

function inserir(
  db: Database.Database,
  referencia: string,
  extra: Record<string, unknown> = {}
): void {
  db.prepare(
    `INSERT INTO cobrancas (referencia, provedor, valor, meio, situacao)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    referencia,
    (extra.provedor as string) ?? 'pagbank',
    (extra.valor as number) ?? 100,
    (extra.meio as string) ?? 'credito',
    (extra.situacao as string) ?? 'aguardando'
  )
}

describe.skipIf(!sqlite)('a tabela de cobranças', () => {
  it('nasce com todas as colunas que a lógica da fila usa', () => {
    const db = bancoNovo()
    aplicar049CobrancasMaquininha(db)

    const colunas = (
      db.prepare('PRAGMA table_info(cobrancas)').all() as { name: string }[]
    ).map((c) => c.name)

    expect(colunas.sort()).toEqual([...COLUNAS_ESPERADAS].sort())
  })

  // ★ A trava de verdade contra cobrar duas vezes. Se este teste passar a
  // aceitar a segunda linha, dois cliques rápidos viram duas cobranças no
  // cartão do cliente.
  it('RECUSA uma segunda cobrança com a mesma referência', () => {
    const db = bancoNovo()
    aplicar049CobrancasMaquininha(db)

    inserir(db, 'ref-unica')

    expect(() => inserir(db, 'ref-unica')).toThrow(/UNIQUE|constraint/i)

    const quantas = db.prepare('SELECT COUNT(*) AS n FROM cobrancas').get() as { n: number }
    expect(quantas.n).toBe(1)
  })

  // ★ O defeito consertado na migration 046 não pode renascer numa tabela nova:
  // `CURRENT_TIMESTAMP` é UTC por definição no SQLite, o que no Brasil joga
  // toda cobrança três horas à frente e, das 21h em diante, para o dia seguinte.
  it('carimba a hora da LOJA, nunca a de Londres', () => {
    const db = bancoNovo()
    aplicar049CobrancasMaquininha(db)

    const criacao = (
      db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cobrancas'")
        .get() as { sql: string }
    ).sql

    expect(criacao).not.toMatch(/CURRENT_TIMESTAMP/i)
    expect(criacao).toMatch(/datetime\('now','localtime'\)/i)
  })

  it('só aceita situação e meio que a lógica conhece', () => {
    const db = bancoNovo()
    aplicar049CobrancasMaquininha(db)

    expect(() => inserir(db, 'a', { situacao: 'quase' })).toThrow(/constraint/i)
    expect(() => inserir(db, 'b', { meio: 'cheque' })).toThrow(/constraint/i)
  })

  it('rodar de novo não estraga nada', () => {
    const db = bancoNovo()
    aplicar049CobrancasMaquininha(db)
    inserir(db, 'ref-1')

    expect(() => aplicar049CobrancasMaquininha(db)).not.toThrow()

    const quantas = db.prepare('SELECT COUNT(*) AS n FROM cobrancas').get() as { n: number }
    expect(quantas.n).toBe(1)
  })
})
