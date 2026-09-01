/**
 * Comissão: a conta tem que fechar com o que o vendedor confere no papel.
 *
 * ── O que estes testes prendem ──────────────────────────────────────────────
 * O erro aqui nunca aparece como erro. Ninguém vê exceção, nenhuma tela quebra:
 * sai um número, o gerente paga, e a diferença só é descoberta quando o vendedor
 * refaz a conta na calculadora do celular. Por isso os casos abaixo cobrem menos
 * "o cálculo funciona" e mais as três formas de ele mentir em silêncio —
 * devolução ignorada, venda cancelada somada, e percentual do presente
 * reescrevendo o passado.
 *
 * O schema vem da MIGRATION de verdade, e não de um CREATE TABLE copiado: erro
 * de DDL aparece aqui, e não na máquina do cliente.
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
  detalheComissao,
  registrarPagamentoComissao,
  estornarPagamentoComissao,
  listarPagamentosComissao,
  definirComissaoPadrao,
  obterComissaoPadrao,
  comissoesConfiguradas,
  limitesDoMes,
  validarPct
} = await import('../comissoes')

const { aplicar038Comissoes } = await import('../../../backup/migrations/038_comissoes')

// Só o que o módulo encosta. As colunas `comissao_pct` de propósito NÃO estão
// aqui — quem as cria é a migration, que é justamente o que se quer exercitar.
const SCHEMA_BASE = `
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
  INSERT INTO clientes (id, nome) VALUES (1, 'Maria Souza');
  INSERT INTO vendedores (id, nome) VALUES (1, 'João'), (2, 'Ana'), (9, 'Gerente');
`

let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  db.exec(SCHEMA_BASE)

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
})

const rodar = sqlite ? describe : describe.skip

const MES = { inicio: '2026-08-01', fim: '2026-08-31' }

type VendaFake = {
  id?: number
  vendedor_id?: number | null
  total: number
  data?: string
  cancelada?: number
  comissao_pct?: number | null
}

let proximoId = 100
function venda(v: VendaFake): number {
  const id = v.id ?? proximoId++
  banco!
    .prepare(
      `INSERT INTO vendas (id, cliente_id, vendedor_id, data, total, cancelada, comissao_pct)
       VALUES (?, 1, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      v.vendedor_id === undefined ? 1 : v.vendedor_id,
      v.data ?? '2026-08-15 10:00:00',
      v.total,
      v.cancelada ?? 0,
      v.comissao_pct ?? null
    )
  return id
}

function devolver(vendaId: number, valor: number): void {
  banco!
    .prepare('INSERT INTO devolucoes (venda_id, valor_total) VALUES (?, ?)')
    .run(vendaId, valor)
}

function pctDoVendedor(id: number, pct: number | null): void {
  banco!.prepare('UPDATE vendedores SET comissao_pct = ? WHERE id = ?').run(pct, id)
}

const linhaDe = (nome: string) =>
  resumoComissoes(MES.inicio, MES.fim).find((l) => l.vendedor_nome === nome)

rodar('o cálculo', () => {
  beforeEach(() => pctDoVendedor(1, 3))

  it('aplica o percentual sobre o total da venda', () => {
    venda({ total: 1000 })
    expect(linhaDe('João')!.valor_comissao).toBe(30)
  })

  it('o desconto já vem embutido no total, sem regra própria', () => {
    // A venda de 1000 com 100 de desconto é gravada com total = 900 (migration
    // 010). Se um dia alguém "consertar" isso somando o desconto de volta, a
    // comissão passa a premiar quem dá desconto — e este teste fica vermelho.
    venda({ total: 900 })
    expect(linhaDe('João')!.base).toBe(900)
    expect(linhaDe('João')!.valor_comissao).toBe(27)
  })

  it('devolução abate a base', () => {
    const v = venda({ total: 1000 })
    devolver(v, 200)
    const l = linhaDe('João')!
    expect(l.base).toBe(800)
    expect(l.valor_comissao).toBe(24)
  })

  it('devolução total zera a comissão daquela venda, sem ficar negativa', () => {
    const v = venda({ total: 1000 })
    devolver(v, 1000)
    expect(linhaDe('João')!.valor_comissao).toBe(0)
  })

  it('devolução acima do total não gera base negativa', () => {
    // Não deveria acontecer, mas se acontecer não pode virar comissão NEGATIVA
    // abatendo a de outra venda — isso apagaria dinheiro devido de verdade.
    const v = venda({ total: 100 })
    devolver(v, 250)
    expect(linhaDe('João')!.base).toBe(0)
    expect(linhaDe('João')!.valor_comissao).toBe(0)
  })

  it('venda cancelada não entra', () => {
    venda({ total: 1000 })
    venda({ total: 5000, cancelada: 1 })
    expect(linhaDe('João')!.qtd_vendas).toBe(1)
    expect(linhaDe('João')!.valor_comissao).toBe(30)
  })

  it('venda fora do período não entra', () => {
    venda({ total: 1000, data: '2026-07-31 23:00:00' })
    venda({ total: 500, data: '2026-09-01 08:00:00' })
    expect(linhaDe('João')).toBeUndefined()
  })

  it('arredonda por venda, e a soma das linhas bate com o total', () => {
    venda({ total: 33.33 })
    venda({ total: 33.33 })
    venda({ total: 33.33 })
    const total = linhaDe('João')!.valor_comissao
    const somaDetalhe = +detalheComissao(1, MES.inicio, MES.fim)
      .reduce((s, v) => s + v.valor_comissao, 0)
      .toFixed(2)
    expect(somaDetalhe).toBe(total)
  })

  it('mês sem venda devolve lista vazia, não erro', () => {
    expect(resumoComissoes('2026-01-01', '2026-01-31')).toEqual([])
  })
})

rodar('qual percentual vale', () => {
  it('o carimbado na venda ganha do percentual atual do vendedor', () => {
    // O caso que o desenho inteiro existe pra proteger: a venda saiu a 3%, o
    // vendedor foi promovido pra 5% depois. O mês passado continua valendo 3%.
    venda({ total: 1000, comissao_pct: 3 })
    pctDoVendedor(1, 5)
    expect(linhaDe('João')!.valor_comissao).toBe(30)
  })

  it('venda sem carimbo (anterior à migration) cai no percentual atual', () => {
    venda({ total: 1000, comissao_pct: null })
    pctDoVendedor(1, 4)
    expect(linhaDe('João')!.valor_comissao).toBe(40)
  })

  it('vendedor sem percentual próprio usa o padrão da loja', () => {
    definirComissaoPadrao(2.5)
    venda({ total: 1000, comissao_pct: null })
    expect(linhaDe('João')!.valor_comissao).toBe(25)
  })

  it('percentual ZERO no vendedor não é o mesmo que "sem percentual"', () => {
    // Distinção que segura acordo individual: NULL = "segue a loja", 0 = "esta
    // pessoa não ganha comissão". Se os dois virassem a mesma coisa, subir o
    // padrão da loja passaria a pagar quem foi explicitamente zerado.
    definirComissaoPadrao(10)
    pctDoVendedor(1, 0)
    venda({ total: 1000, comissao_pct: null })
    expect(linhaDe('João')!.valor_comissao).toBe(0)
  })

  it('marca percentual misto quando o período tem carimbos diferentes', () => {
    pctDoVendedor(1, 3)
    venda({ total: 1000, comissao_pct: 3 })
    venda({ total: 1000, comissao_pct: 5 })
    const l = linhaDe('João')!
    expect(l.pct_misto).toBe(1)
    expect(l.valor_comissao).toBe(80)
  })

  it('não marca misto quando todas as vendas têm o mesmo percentual', () => {
    pctDoVendedor(1, 3)
    venda({ total: 1000, comissao_pct: 3 })
    venda({ total: 500, comissao_pct: 3 })
    expect(linhaDe('João')!.pct_misto).toBe(0)
  })
})

rodar('venda sem vendedor', () => {
  it('aparece na base para explicar a diferença, mas não comissiona ninguém', () => {
    definirComissaoPadrao(10)
    venda({ total: 1000, vendedor_id: null })
    const l = linhaDe('Sem vendedor')!
    expect(l.base).toBe(1000)
    expect(l.valor_comissao).toBe(0)
    expect(l.comissionavel).toBe(0)
  })

  it('não pode ser fechada para pagamento', () => {
    definirComissaoPadrao(10)
    venda({ total: 1000, vendedor_id: null })
    // Não existe vendedor a quem pagar — o fechamento tem que recusar antes de
    // gravar qualquer coisa.
    expect(() =>
      registrarPagamentoComissao({
        vendedor_id: 0,
        periodo_inicio: MES.inicio,
        periodo_fim: MES.fim,
        pago_por_id: 9
      })
    ).toThrow(/Vendedor não encontrado/)
  })
})

rodar('detalhamento', () => {
  it('mostra venda a venda com cliente, devolução e comissão', () => {
    pctDoVendedor(1, 3)
    const v = venda({ id: 501, total: 1000 })
    devolver(v, 100)
    const [linha] = detalheComissao(1, MES.inicio, MES.fim)
    expect(linha.venda_id).toBe(501)
    expect(linha.cliente_nome).toBe('Maria Souza')
    expect(linha.total).toBe(1000)
    expect(linha.devolvido).toBe(100)
    expect(linha.base).toBe(900)
    expect(linha.valor_comissao).toBe(27)
  })

  it('o ramo "sem vendedor" também abre, e sem quebrar por parâmetro sobrando', () => {
    venda({ total: 400, vendedor_id: null })
    const linhas = detalheComissao(null, MES.inicio, MES.fim)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].valor_comissao).toBe(0)
  })
})

rodar('percentual — validação', () => {
  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])('recusa %s', (v) => {
    expect(() => validarPct(v as number)).toThrow()
  })

  it('aceita as pontas e arredonda em 2 casas', () => {
    expect(validarPct(0)).toBe(0)
    expect(validarPct(100)).toBe(100)
    expect(validarPct(3.456)).toBe(3.46)
  })

  it('padrão da loja começa em zero e sobrevive à ida e volta', () => {
    expect(obterComissaoPadrao()).toBe(0)
    definirComissaoPadrao(4.5)
    expect(obterComissaoPadrao()).toBe(4.5)
  })
})

rodar('quando a aba aparece', () => {
  it('não aparece em loja que nunca configurou nada', () => {
    expect(comissoesConfiguradas()).toBe(false)
  })

  it('aparece com padrão da loja definido', () => {
    definirComissaoPadrao(3)
    expect(comissoesConfiguradas()).toBe(true)
  })

  it('aparece com percentual em algum vendedor, mesmo sem padrão da loja', () => {
    pctDoVendedor(2, 5)
    expect(comissoesConfiguradas()).toBe(true)
  })

  it('continua aparecendo depois de zerar tudo, se já houve pagamento', () => {
    // Senão o histórico do que já foi pago some da vista junto com o percentual,
    // e o gerente perde o registro contábil sem ter apagado nada.
    pctDoVendedor(1, 3)
    venda({ total: 1000, comissao_pct: 3 })
    registrarPagamentoComissao({
      vendedor_id: 1,
      periodo_inicio: MES.inicio,
      periodo_fim: MES.fim,
      pago_por_id: 9
    })
    pctDoVendedor(1, null)
    definirComissaoPadrao(0)
    expect(comissoesConfiguradas()).toBe(true)
  })
})

rodar('limitesDoMes', () => {
  it.each([
    ['2026-08', '2026-08-01', '2026-08-31'],
    ['2026-02', '2026-02-01', '2026-02-28'],
    ['2028-02', '2028-02-01', '2028-02-29'],
    ['2026-04', '2026-04-01', '2026-04-30']
  ])('%s vai de %s a %s', (mes, inicio, fim) => {
    expect(limitesDoMes(mes)).toEqual({ inicio, fim })
  })

  it.each(['2026-13', '2026', 'agosto', '2026-00'])('recusa %s', (mes) => {
    expect(() => limitesDoMes(mes)).toThrow(/Mês inválido/)
  })
})

rodar('histórico de pagamentos', () => {
  it('guarda quem pagou, quando e sobre qual base', () => {
    pctDoVendedor(1, 3)
    venda({ total: 1000, comissao_pct: 3 })
    registrarPagamentoComissao({
      vendedor_id: 1,
      periodo_inicio: MES.inicio,
      periodo_fim: MES.fim,
      pago_por_id: 9,
      observacao: '  pago em dinheiro  '
    })
    const [p] = listarPagamentosComissao()
    expect(p.vendedor_nome).toBe('João')
    expect(p.valor_base).toBe(1000)
    expect(p.valor_comissao).toBe(30)
    expect(p.qtd_vendas).toBe(1)
    expect(p.pago_por_nome).toBe('Gerente')
    expect(p.observacao).toBe('pago em dinheiro')
  })

  it('estorno some do histórico', () => {
    pctDoVendedor(1, 3)
    venda({ total: 1000, comissao_pct: 3 })
    const { id } = registrarPagamentoComissao({
      vendedor_id: 1,
      periodo_inicio: MES.inicio,
      periodo_fim: MES.fim,
      pago_por_id: 9
    })
    estornarPagamentoComissao(id)
    expect(listarPagamentosComissao()).toEqual([])
  })

  it('estornar o que não existe é erro, não silêncio', () => {
    expect(() => estornarPagamentoComissao(999)).toThrow(/não encontrado/)
  })
})
