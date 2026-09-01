/**
 * O fechamento da comissão não pode pagar o mesmo dia duas vezes.
 *
 * ── O cenário real ──────────────────────────────────────────────────────────
 * O gerente fecha e paga 01 a 31/08. Semana seguinte, distraído — ou porque o
 * vendedor pediu um adiantamento no meio do mês — ele fecha 15/08 a 15/09. A
 * segunda quinzena de agosto sai do caixa DUAS vezes.
 *
 * Nada nesse caminho dá erro: os dois períodos são válidos, os dois têm vendas,
 * as duas contas estão certas isoladamente. O dinheiro simplesmente sai a mais,
 * e o rastro fica em duas linhas que ninguém cruza. É exatamente o tipo de
 * defeito que só aparece na conciliação do fim do ano.
 *
 * A trava é uma condição de sobreposição de intervalos, e este arquivo existe
 * para que ela nunca seja afrouxada por engano — nem apertada demais, que é o
 * erro gêmeo: bloquear a segunda quinzena depois de pagar a primeira tornaria o
 * adiantamento impossível e o gerente acabaria contornando o sistema.
 *
 * ── Se ficar vermelho ───────────────────────────────────────────────────────
 * NÃO relaxar a asserção. A condição correta é a canônica de sobreposição:
 *   novo.inicio <= existente.fim  E  novo.fim >= existente.inicio
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

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

const {
  resumoComissoes,
  registrarPagamentoComissao,
  estornarPagamentoComissao,
  listarPagamentosComissao
} = await import('../comissoes')

const { aplicar038Comissoes } = await import('../../../backup/migrations/038_comissoes')


let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  // A coluna comissao_pct é usada já no seed, então a migration roda antes dele.
  db.exec(`
    CREATE TABLE _migrations (nome TEXT PRIMARY KEY);
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
    CREATE TABLE vendedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      papel TEXT NOT NULL DEFAULT 'vendedor'
    );
    CREATE TABLE vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      vendedor_id INTEGER,
      data DATETIME,
      total REAL NOT NULL,
      cancelada INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE devolucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      valor_total REAL NOT NULL
    );
  `)

  let p = 0
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
      (...args) => {
        const sp = `sp_${p}`
        db!.exec(p === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
        p++
        try {
          const r = fn(...args)
          p--
          db!.exec(p === 0 ? 'COMMIT' : `RELEASE ${sp}`)
          return r
        } catch (e) {
          p--
          db!.exec(p === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
          throw e
        }
      }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aplicar038Comissoes(banco as any)

  db.exec(`
    INSERT INTO clientes (id, nome) VALUES (1, 'Maria Souza');
    INSERT INTO vendedores (id, nome, comissao_pct)
      VALUES (1, 'João', 10), (2, 'Ana', 10), (9, 'Gerente', 0);
  `)
})

const rodar = sqlite ? describe : describe.skip

let proximoId = 100
function venda(total: number, dia: string, vendedorId = 1): number {
  const id = proximoId++
  banco!
    .prepare(
      `INSERT INTO vendas (id, cliente_id, vendedor_id, data, total, cancelada, comissao_pct)
       VALUES (?, 1, ?, ?, ?, 0, 10)`
    )
    .run(id, vendedorId, `${dia} 10:00:00`, total)
  return id
}

const fechar = (inicio: string, fim: string, vendedorId = 1) =>
  registrarPagamentoComissao({
    vendedor_id: vendedorId,
    periodo_inicio: inicio,
    periodo_fim: fim,
    pago_por_id: 9
  })

rodar('a trava contra pagar duas vezes', () => {
  beforeEach(() => {
    // Vendas espalhadas por agosto e começo de setembro.
    venda(1000, '2026-08-05')
    venda(1000, '2026-08-20')
    venda(1000, '2026-09-05')
  })

  it('o primeiro fechamento passa', () => {
    const r = fechar('2026-08-01', '2026-08-31')
    expect(r.valor_comissao).toBe(200)
  })

  it('recusa o MESMO período de novo', () => {
    fechar('2026-08-01', '2026-08-31')
    expect(() => fechar('2026-08-01', '2026-08-31')).toThrow(/já foi paga/)
  })

  it('recusa um período que ENGLOBA o já pago', () => {
    fechar('2026-08-01', '2026-08-31')
    expect(() => fechar('2026-07-01', '2026-09-30')).toThrow(/já foi paga/)
  })

  it('recusa um período CONTIDO no já pago', () => {
    fechar('2026-08-01', '2026-08-31')
    expect(() => fechar('2026-08-10', '2026-08-20')).toThrow(/já foi paga/)
  })

  it('recusa o período que começa DENTRO e termina depois — o caso da vida real', () => {
    fechar('2026-08-01', '2026-08-31')
    expect(() => fechar('2026-08-15', '2026-09-15')).toThrow(/já foi paga/)
  })

  it('recusa o período que começa antes e termina DENTRO', () => {
    fechar('2026-08-01', '2026-08-31')
    expect(() => fechar('2026-07-15', '2026-08-05')).toThrow(/já foi paga/)
  })

  it('recusa quando encosta em um único dia', () => {
    // A ponta é o caso que um `<` no lugar de `<=` deixaria passar.
    fechar('2026-08-01', '2026-08-31')
    expect(() => fechar('2026-08-31', '2026-09-30')).toThrow(/já foi paga/)
  })

  it('a mensagem diz de quem, de quando e quando foi pago', () => {
    fechar('2026-08-01', '2026-08-31')
    expect(() => fechar('2026-08-15', '2026-09-15')).toThrow(
      /João de 01\/08\/2026 a 31\/08\/2026/
    )
  })

  it('nada é gravado quando o fechamento é recusado', () => {
    fechar('2026-08-01', '2026-08-31')
    expect(() => fechar('2026-08-15', '2026-09-15')).toThrow()
    expect(listarPagamentosComissao()).toHaveLength(1)
  })
})

rodar('o que a trava NÃO pode bloquear', () => {
  beforeEach(() => {
    venda(1000, '2026-08-05')
    venda(1000, '2026-08-20')
    venda(1000, '2026-08-25', 2)
  })

  it('quinzenas seguidas do mesmo vendedor — o adiantamento do meio do mês', () => {
    // Apertar a trava demais é o erro gêmeo: se a segunda quinzena fosse
    // recusada, o gerente contornaria o sistema e o registro perderia o sentido.
    fechar('2026-08-01', '2026-08-15')
    expect(() => fechar('2026-08-16', '2026-08-31')).not.toThrow()
    expect(listarPagamentosComissao()).toHaveLength(2)
  })

  it('o mesmo período para vendedores diferentes', () => {
    fechar('2026-08-01', '2026-08-31', 1)
    expect(() => fechar('2026-08-01', '2026-08-31', 2)).not.toThrow()
  })

  it('o mês seguinte', () => {
    fechar('2026-08-01', '2026-08-31')
    venda(500, '2026-09-10')
    expect(() => fechar('2026-09-01', '2026-09-30')).not.toThrow()
  })
})

rodar('estorno reabre o período', () => {
  it('depois de estornar, o mesmo período fecha de novo', () => {
    venda(1000, '2026-08-05')
    const { id } = fechar('2026-08-01', '2026-08-31')
    estornarPagamentoComissao(id)
    expect(() => fechar('2026-08-01', '2026-08-31')).not.toThrow()
  })
})

rodar('o valor pago é o apurado aqui dentro', () => {
  it('grava o recalculado, e o resumo passa a mostrar o período como pago', () => {
    venda(1000, '2026-08-05')
    fechar('2026-08-01', '2026-08-31')
    const linha = resumoComissoes('2026-08-01', '2026-08-31').find((l) => l.vendedor_id === 1)!
    expect(linha.pagamento_id).not.toBeNull()
    expect(linha.valor_pago_comissao).toBe(100)
    expect(linha.pago_em).toBeTruthy()
  })

  it('devolução lançada DEPOIS não reescreve o que já saiu do caixa', () => {
    // O registro do pagamento é histórico, não uma fórmula viva. Se ele se
    // recalculasse, o relatório de um mês fechado passaria a discordar do
    // dinheiro que realmente saiu — e o gerente não teria como provar o que
    // pagou. A apuração de hoje muda; o pagamento registrado, não.
    const v = venda(1000, '2026-08-05')
    fechar('2026-08-01', '2026-08-31')

    banco!
      .prepare('INSERT INTO devolucoes (venda_id, valor_total) VALUES (?, ?)')
      .run(v, 400)

    const [pago] = listarPagamentosComissao()
    expect(pago.valor_comissao).toBe(100)
    expect(pago.valor_base).toBe(1000)

    // Já a apuração de hoje reflete a devolução — é assim que o gerente
    // descobre que pagou a mais e acerta no mês seguinte.
    const linha = resumoComissoes('2026-08-01', '2026-08-31').find((l) => l.vendedor_id === 1)!
    expect(linha.valor_comissao).toBe(60)
  })

  it('recusa fechar período sem comissão nenhuma', () => {
    expect(() => fechar('2026-08-01', '2026-08-31')).toThrow(/Não há comissão a pagar/)
  })

  it('recusa período invertido', () => {
    venda(1000, '2026-08-05')
    expect(() => fechar('2026-08-31', '2026-08-01')).toThrow(/não pode ser depois/)
  })

  it('recusa data fora do formato', () => {
    expect(() => fechar('31/08/2026', '2026-08-01')).toThrow(/Período inválido/)
  })
})
