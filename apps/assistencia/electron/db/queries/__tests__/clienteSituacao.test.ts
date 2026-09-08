/**
 * As etiquetas de situação do cliente.
 *
 * ── ⚠️ O que a escada tem de traiçoeiro ────────────────────────────────────
 * Não são cinco regras independentes: é uma ORDEM, e a ordem é a regra. Quem
 * trouxe dez aparelhos e sumiu há seis meses cai em duas delas ao mesmo tempo, e
 * o degrau que ganha decide se o dono vê "cliente fiel" ou "sumiu, corre atrás".
 *
 * Trocar a ordem não quebra nada, não dá erro, e continua devolvendo uma
 * etiqueta plausível para todo mundo. É o motivo de existirem aqui dois testes
 * que testam SÓ a precedência.
 *
 * ── Por que a conta não é gravada ───────────────────────────────────────────
 * A situação é refeita a cada consulta. Etiqueta gravada envelhece em silêncio:
 * um "Recorrente" que parou em março continuaria escrito assim para sempre, e a
 * oficina mandaria mensagem de fidelidade para quem sumiu.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

const seTiverSqlite = sqlite ? it : it.skip

type Adaptador = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown
    get: (...args: unknown[]) => unknown
    all: (...args: unknown[]) => unknown
  }
  transaction: (fn: (...a: never[]) => unknown) => (...args: never[]) => unknown
}

let banco: Adaptador | null = null

vi.mock('@fhvptech/core/electron/db/conexao', () => ({
  obterBancoDeDados: () => {
    if (!banco) throw new Error('banco de teste não inicializado')
    return banco
  }
}))

const { listarClientes } = await import('../clientes')

const SCHEMA = `
  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT,
    endereco TEXT,
    cpf TEXT,
    data_nascimento TEXT,
    tipo_pessoa TEXT NOT NULL DEFAULT 'fisica',
    cnpj TEXT,
    razao_social TEXT,
    observacao TEXT,
    data_cadastro TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    vendedor_id INTEGER,
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    total REAL NOT NULL,
    valor_pago REAL NOT NULL DEFAULT 0,
    status_pagamento TEXT DEFAULT 'pendente',
    cancelada INTEGER NOT NULL DEFAULT 0
  );
`

let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  db.exec(SCHEMA)
  banco = {
    exec: (sql) => db!.exec(sql),
    prepare: (sql) => {
      const st = db!.prepare(sql)
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: (...a: unknown[]) => st.run(...(a as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: (...a: unknown[]) => st.get(...(a as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all: (...a: unknown[]) => st.all(...(a as any[]))
      }
    },
    transaction:
      (fn) =>
      (...args) =>
        fn(...args)
  }
})

function cliente(id: number, nome: string): void {
  db!
    .prepare('INSERT INTO clientes (id, nome, telefone) VALUES (?, ?, ?)')
    .run(id, nome, '(88) 9.0000-0000')
}

/**
 * Uma compra há N dias.
 *
 * ⚠️ `date('now','localtime', ...)`: a data tem que ser a mesma referência que a
 * consulta usa. Com `'now'` seco aqui e localtime lá, um teste rodado à noite
 * mediria um dia a mais e só falharia depois das 21h — o defeito mais irritante
 * que um teste pode ter.
 */
function compraHa(clienteId: number, dias: number, total = 100): void {
  db!
    .prepare(
      `INSERT INTO vendas (cliente_id, vendedor_id, data, total, valor_pago, status_pagamento)
       VALUES (?, 1, datetime('now','localtime', ?), ?, ?, 'pago')`
    )
    .run(clienteId, `-${dias} days`, total, total)
}

const situacaoDe = (id: number): string => listarClientes().find((c) => c.id === id)!.situacao

describe('a escada de situações do cliente', () => {
  seTiverSqlite('cadastrado e nunca comprou é "sem compras"', () => {
    cliente(1, 'Nunca voltou')
    expect(situacaoDe(1)).toBe('sem_compras')
  })

  seTiverSqlite('uma compra recente é "novo"', () => {
    cliente(1, 'Estreante')
    compraHa(1, 10)
    expect(situacaoDe(1)).toBe('novo')
  })

  seTiverSqlite('três compras é "recorrente"', () => {
    cliente(1, 'Fiel')
    compraHa(1, 60)
    compraHa(1, 30)
    compraHa(1, 5)
    expect(situacaoDe(1)).toBe('recorrente')
  })

  seTiverSqlite('★ quem sumiu depois de aparecer muito é INATIVO, não recorrente', () => {
    /*
     * O degrau que mais importa da escada inteira.
     *
     * Este cliente satisfaz "três compras ou mais" com folga. Se "recorrente"
     * viesse antes de "inativo", ele apareceria como cliente fiel — e é
     * exatamente o contrário: trouxe cinco aparelhos e sumiu há mais de meio
     * ano. É o cliente que o dono precisa achar na lista para correr atrás.
     */
    cliente(1, 'Sumiu')
    for (const dias of [400, 380, 360, 340, 320]) compraHa(1, dias)
    expect(situacaoDe(1)).toBe('inativo')
  })

  seTiverSqlite('★ quem voltou depois do sumiço é REATIVADO, não recorrente', () => {
    /*
     * O segundo degrau que depende só da ordem.
     *
     * Cinco visitas antigas e uma agora: pelo número, é recorrente. Mas ficou um
     * ano parado no meio, e quem acabou de voltar merece tratamento diferente
     * de quem nunca parou. Marcá-lo de recorrente esconderia a única informação
     * nova sobre ele.
     */
    cliente(1, 'Voltou')
    for (const dias of [500, 480, 460]) compraHa(1, dias)
    compraHa(1, 3)
    expect(situacaoDe(1)).toBe('reativado')
  })

  seTiverSqlite('quem só teve um vão ANTIGO já se restabeleceu: recorrente', () => {
    /*
     * O contrário do teste acima, e o que impede a regra de "reativado" de
     * grudar para sempre. Sumiu, voltou há muito tempo, e desde então aparece
     * normalmente — é recorrente, não um eterno reativado.
     */
    cliente(1, 'Voltou faz tempo')
    compraHa(1, 500)
    compraHa(1, 150) // a volta, mas fora da janela de "recente"
    compraHa(1, 60)
    compraHa(1, 20)
    expect(situacaoDe(1)).toBe('recorrente')
  })

  seTiverSqlite('venda cancelada não conta como compra', () => {
    // Senão uma venda estornada deixaria o cliente marcado como comprador para
    // sempre.
    cliente(1, 'Cancelou')
    compraHa(1, 5)
    db!.prepare('UPDATE vendas SET cancelada = 1').run()
    expect(situacaoDe(1)).toBe('sem_compras')
  })

  seTiverSqlite('a contagem e o total acompanham a etiqueta', () => {
    cliente(1, 'Maria')
    compraHa(1, 30, 150)
    compraHa(1, 10, 250)
    const c = listarClientes()[0]
    expect(c.num_compras).toBe(2)
    expect(c.total_comprado).toBe(400)
  })
})

describe('a etiqueta chega à tela', () => {
  /*
   * ⚠️ Os testes acima provam que a conta está certa — não que alguém a mostre.
   * A tela podia parar de desenhar a etiqueta e todos eles seguiriam verdes.
   */
  const TELA = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'src', 'pages', 'Clientes.tsx'),
    'utf-8'
  )

  it('★ a lista desenha a etiqueta e deixa filtrar por ela', () => {
    expect(TELA, 'o mapa de etiquetas sumiu da tela').toContain('const SITUACAO: Record<SituacaoCliente')
    expect(TELA, 'a etiqueta deixou de ser desenhada na linha do cliente').toContain(
      '{SITUACAO[c.situacao].rotulo}'
    )
    expect(TELA, 'o filtro por situação sumiu').toContain('setFiltroSituacao(ligada ? null : s)')
    expect(TELA, 'o filtro parou de cortar a lista').toContain(
      'if (filtroSituacao && c.situacao !== filtroSituacao) return false'
    )
  })

  it('★ a situação continua CALCULADA, nunca gravada', () => {
    /*
     * A guarda contra o atalho tentador: criar uma coluna `situacao` na tabela
     * e preenchê-la. Ficaria mais rápido e estaria errado na semana seguinte.
     */
    const consulta = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'clientes.ts'),
      'utf-8'
    )
    expect(consulta, 'apareceu escrita de situação no cadastro do cliente').not.toMatch(
      /(INSERT INTO clientes[\s\S]{0,400}situacao|UPDATE clientes SET[\s\S]{0,200}situacao)/
    )
    expect(consulta, 'a situação deixou de ser derivada na consulta').toContain('END AS situacao')
  })
})
