/**
 * Garantia: a promessa que a loja faz e tem que cumprir.
 *
 * ── O que estes testes prendem ──────────────────────────────────────────────
 *
 *  1. ★ **Mudar o prazo padrão NÃO encurta garantia já vendida.** É o teste
 *     central do módulo. Sem o congelamento no item, baixar o padrão de 90 para
 *     30 dias encurtaria, no mesmo instante, a garantia de todo mundo que já
 *     comprou — inclusive de quem está com o cupom na mão dizendo noventa dias.
 *     Nada quebra, nada aparece no log, e a loja descobre no balcão.
 *
 *  2. **Zero é uma decisão, não é ausência.** Produto marcado com zero dias é
 *     produto vendido sem garantia de propósito. Um `||` no lugar do `??`
 *     leria esse zero como ausência de resposta e transformaria a escolha do
 *     lojista em noventa dias de promessa.
 *
 *  3. ★ **Fechar a garantia não mexe em dinheiro nem em estoque.** O desfecho
 *     registra a DECISÃO; a devolução continua saindo pela tela de devolução,
 *     que já lança crédito, baixa o livro-caixa e repõe a peça. Dois caminhos
 *     no mesmo dinheiro tirariam o caixa do lugar na primeira troca.
 *
 *  4. **Fora do prazo abre assim mesmo.** Barrar tiraria do lojista uma escolha
 *     que ele toma todo dia (cobrir por fora da regra para não perder cliente
 *     antigo), e a recusa ficaria sem registro nenhum.
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

const { criarVenda } = await import('../vendas')
const {
  buscarItensVendidos,
  itensDaVenda,
  abrirGarantia,
  fecharGarantia,
  reabrirGarantia,
  listarGarantias,
  garantiasDoItem,
  resumoGarantias,
  prazoPadraoDaLoja,
  definirPrazoPadraoDaLoja,
  prazoDoItem,
  somarDias,
  GARANTIA_PADRAO_DIAS
} = await import('../garantias')

/*
 * ⚠️ Espelho ESCRITO À MÃO do banco real. Ele existe porque `better-sqlite3` é
 * addon nativo compilado para o Electron e não carrega no runtime dos testes.
 *
 * Como este arquivo chama `criarVenda`, a tabela `vendas` e a `itens_venda`
 * precisam vir INTEIRAS: aquele INSERT lista todas as colunas. É isso que a
 * guarda `esquemasDeTesteAcompanham.test.ts` cobra, e é por isso que ela existe.
 */
const SCHEMA = `
  CREATE TABLE vendedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
    ativo INTEGER NOT NULL DEFAULT 1,
    comissao_pct REAL
  );
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT,
    endereco TEXT,
    cpf TEXT,
    tipo_pessoa TEXT NOT NULL DEFAULT 'fisica',
    cnpj TEXT,
    razao_social TEXT
  );
  CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_barras TEXT UNIQUE,
    nome TEXT NOT NULL,
    preco REAL NOT NULL,
    custo REAL NOT NULL DEFAULT 0,
    garantia_dias INTEGER,
    estoque INTEGER DEFAULT 0,
    reservado INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE produto_variacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    tamanho TEXT NOT NULL,
    codigo_barras TEXT UNIQUE NOT NULL,
    estoque INTEGER NOT NULL DEFAULT 0,
    reservado INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    vendedor_id INTEGER,
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    total REAL NOT NULL,
    desconto REAL NOT NULL DEFAULT 0,
    entrada REAL NOT NULL DEFAULT 0,
    valor_pago REAL NOT NULL DEFAULT 0,
    status_pagamento TEXT DEFAULT 'pendente',
    data_vencimento DATE,
    num_parcelas INTEGER,
    forma_pagamento TEXT,
    cancelada INTEGER NOT NULL DEFAULT 0,
    comissao_pct REAL,
    observacao TEXT,
    turno_id INTEGER,
    cancelada_em TEXT,
    cancelada_por_id INTEGER,
    cancelamento_motivo TEXT
  );
  CREATE TABLE itens_venda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    variacao_id INTEGER,
    quantidade INTEGER NOT NULL,
    preco_unitario REAL NOT NULL,
    custo_unitario REAL,
    garantia_dias INTEGER
  );
  CREATE TABLE parcelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    valor REAL NOT NULL,
    data_vencimento TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente'
  );
  CREATE TABLE devolucoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL,
    valor_total REAL NOT NULL
  );
  CREATE TABLE creditos_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('entrada','uso','ajuste')),
    valor REAL NOT NULL,
    devolucao_id INTEGER,
    venda_id INTEGER,
    data_expiracao DATE
  );
  CREATE TABLE contas_financeiras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'banco',
    banco TEXT, agencia TEXT, conta TEXT,
    saldo_inicial REAL NOT NULL DEFAULT 0,
    ativa INTEGER NOT NULL DEFAULT 1,
    padrao_recebimento INTEGER NOT NULL DEFAULT 0,
    padrao_pagamento INTEGER NOT NULL DEFAULT 0,
    forma_padrao TEXT,
    criada_em TEXT
  );
  CREATE TABLE movimentos_financeiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    valor REAL NOT NULL,
    tipo TEXT NOT NULL,
    descricao TEXT, forma_pagamento TEXT,
    origem_tipo TEXT, origem_id INTEGER,
    turno_id INTEGER, vendedor_id INTEGER,
    criado_em TEXT
  );
  CREATE TABLE turnos_caixa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_id INTEGER NOT NULL,
    aberto_por INTEGER NOT NULL,
    aberto_em TEXT NOT NULL,
    fundo_troco REAL NOT NULL DEFAULT 0,
    fechado_por INTEGER, fechado_em TEXT,
    confirmado_por INTEGER, confirmado_em TEXT,
    justificativa TEXT,
    fora_de_hora INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE contagens_turno (
    id INTEGER PRIMARY KEY AUTOINCREMENT, turno_id INTEGER NOT NULL,
    forma TEXT NOT NULL, valor_contado REAL NOT NULL, valor_esperado REAL NOT NULL
  );
  CREATE TABLE garantias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_venda_id INTEGER NOT NULL,
    venda_id INTEGER NOT NULL,
    aberta_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    aberta_por INTEGER,
    defeito TEXT NOT NULL,
    situacao TEXT NOT NULL DEFAULT 'aberta'
      CHECK(situacao IN ('aberta','resolvida','recusada')),
    desfecho TEXT
      CHECK(desfecho IS NULL OR desfecho IN
        ('troca','conserto','devolucao','sem_defeito','fora_do_prazo')),
    observacao TEXT,
    dentro_do_prazo INTEGER NOT NULL DEFAULT 1,
    fechada_em TEXT,
    fechada_por INTEGER
  );
`

const SEED = `
  -- Esta loja de teste não exige caixa aberto: os testes daqui são sobre
  -- garantia, e abrir turno em cada um só afastaria do que interessa.
  INSERT INTO config (chave, valor) VALUES ('exigir_caixa_aberto', '0');
  INSERT INTO config (chave, valor) VALUES ('garantia_padrao_dias', '90');
  INSERT INTO vendedores (id, nome) VALUES (1, 'Ana'), (2, 'Gerente');
  INSERT INTO clientes (id, nome, telefone) VALUES (1, 'Maria Souza', '(88) 9.9999-1234');
  INSERT INTO clientes (id, nome, telefone) VALUES (2, 'João Lima', '(88) 9.8888-4321');
  -- Produto SEM prazo próprio: herda o padrão da loja.
  INSERT INTO produtos (id, codigo_barras, nome, preco, estoque)
    VALUES (1, '7890000000017', 'Liquidificador', 200, 10);
  -- Produto com prazo PRÓPRIO, maior que o da loja.
  INSERT INTO produtos (id, codigo_barras, nome, preco, estoque, garantia_dias)
    VALUES (2, '7890000000024', 'Furadeira', 500, 10, 365);
  -- Produto com prazo ZERO: vendido sem garantia, de propósito.
  INSERT INTO produtos (id, codigo_barras, nome, preco, estoque, garantia_dias)
    VALUES (3, '7890000000031', 'Ponta de estoque', 30, 10, 0);
  INSERT INTO contas_financeiras (id, nome, tipo, saldo_inicial, padrao_recebimento, padrao_pagamento, forma_padrao)
    VALUES (1, 'Caixa da loja', 'caixa', 0, 1, 1, 'dinheiro');
`

let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  db.exec(SCHEMA)
  db.exec(SEED)
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
          db!.exec(p === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}`)
          throw e
        }
      }
  }
})

const temSqlite = !!sqlite
const seTiverSqlite = temSqlite ? it : it.skip

/** Uma venda à vista de um produto. Devolve o id da venda. */
function vender(produtoId: number, clienteId: number | null = 1): number {
  return criarVenda({
    cliente_id: clienteId,
    vendedor_id: 1,
    status_pagamento: 'pago',
    data_vencimento: null,
    forma_pagamento: 'dinheiro',
    itens: [{ produto_id: produtoId, quantidade: 1, preco_unitario: 100 }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).id
}

/** Recua a data de uma venda para simular compra antiga. */
function envelhecerVenda(vendaId: number, dias: number): void {
  db!
    .prepare(`UPDATE vendas SET data = datetime('now','localtime', '-' || ? || ' days') WHERE id = ?`)
    .run(dias, vendaId)
}

// ─── A escada do prazo, sem banco ────────────────────────────────────────────

describe('prazoDoItem — a escada, degrau por degrau', () => {
  it('o prazo congelado no item ganha de todos', () => {
    expect(prazoDoItem(45, 365, 90)).toBe(45)
  })

  it('sem prazo no item, vale o do produto', () => {
    expect(prazoDoItem(null, 365, 90)).toBe(365)
  })

  it('sem prazo no item nem no produto, vale o da loja', () => {
    expect(prazoDoItem(null, null, 90)).toBe(90)
  })

  it('★ ZERO é um degrau legítimo, não é ausência', () => {
    /*
     * Produto marcado com zero dias é produto vendido SEM garantia de propósito
     * (ponta de estoque, liquidação). Com `||` no lugar de `??`, o zero seria
     * lido como ausência de resposta: cairia para o degrau de baixo e a loja
     * passaria a prometer noventa dias numa peça que ela decidiu vender sem
     * garantia nenhuma.
     */
    expect(prazoDoItem(0, 365, 90)).toBe(0)
    expect(prazoDoItem(null, 0, 90)).toBe(0)
  })
})

describe('somarDias', () => {
  it('soma no calendário, atravessando mês e ano', () => {
    expect(somarDias('2026-01-20', 30)).toBe('2026-02-19')
    expect(somarDias('2026-12-20', 30)).toBe('2027-01-19')
    // Fevereiro de 2024 tem 29 dias.
    expect(somarDias('2024-02-01', 29)).toBe('2024-03-01')
  })

  it('aceita data com hora e devolve só o dia', () => {
    expect(somarDias('2026-05-10 22:41:00', 90)).toBe('2026-08-08')
  })
})

// ─── O congelamento, que é o coração do módulo ───────────────────────────────

describe('a venda congela o prazo', () => {
  seTiverSqlite('o item nasce com o prazo que valia no dia da compra', () => {
    const vendaId = vender(1) // produto sem prazo próprio: cai no padrão 90
    const item = db!
      .prepare('SELECT garantia_dias FROM itens_venda WHERE venda_id = ?')
      .get(vendaId) as { garantia_dias: number }
    expect(item.garantia_dias).toBe(90)
  })

  seTiverSqlite('o prazo do PRODUTO ganha do padrão da loja na hora de congelar', () => {
    const vendaId = vender(2) // Furadeira, 365 dias
    const item = db!
      .prepare('SELECT garantia_dias FROM itens_venda WHERE venda_id = ?')
      .get(vendaId) as { garantia_dias: number }
    expect(item.garantia_dias).toBe(365)
  })

  seTiverSqlite('produto sem garantia congela ZERO, e não o padrão da loja', () => {
    const vendaId = vender(3) // Ponta de estoque, 0 dias
    const item = db!
      .prepare('SELECT garantia_dias FROM itens_venda WHERE venda_id = ?')
      .get(vendaId) as { garantia_dias: number }
    expect(item.garantia_dias).toBe(0)
  })

  seTiverSqlite(
    '★ baixar o prazo padrão NÃO encurta a garantia de quem já comprou',
    () => {
      /*
       * O teste que justifica a coluna congelada existir.
       *
       * Sem ela, a consulta leria o padrão de hoje, e a garantia do cliente que
       * comprou na semana passada encolheria de 90 para 30 dias no instante em
       * que o lojista mexesse na configuração. Ele estaria com o cupom na mão
       * dizendo noventa dias, e o sistema diria trinta.
       */
      const vendaId = vender(1)
      const antes = itensDaVenda(vendaId)[0]
      expect(antes.garantia_dias).toBe(90)

      definirPrazoPadraoDaLoja(30)

      const depois = itensDaVenda(vendaId)[0]
      expect(depois.garantia_dias).toBe(90)
      expect(depois.garantia_ate).toBe(antes.garantia_ate)

      // E a venda NOVA já sai com o prazo novo: a mudança vale para frente.
      const vendaNova = vender(1)
      expect(itensDaVenda(vendaNova)[0].garantia_dias).toBe(30)
    }
  )

  seTiverSqlite('mudar o prazo do produto também não mexe no passado', () => {
    const vendaId = vender(2) // congela 365
    db!.prepare('UPDATE produtos SET garantia_dias = 7 WHERE id = 2').run()
    expect(itensDaVenda(vendaId)[0].garantia_dias).toBe(365)
  })
})

// ─── A consulta do balcão ────────────────────────────────────────────────────

describe('consulta: isto ainda está na garantia?', () => {
  seTiverSqlite('calcula até quando vale e quantos dias faltam', () => {
    const vendaId = vender(1) // 90 dias
    envelhecerVenda(vendaId, 10)

    const item = itensDaVenda(vendaId)[0]
    expect(item.garantia_dias).toBe(90)
    expect(item.dias_restantes).toBe(80)
    expect(item.garantia_ate).toBe(somarDias(item.data_venda, 90))
  })

  seTiverSqlite('dias restantes fica NEGATIVO depois de vencer', () => {
    const vendaId = vender(1)
    envelhecerVenda(vendaId, 100)
    expect(itensDaVenda(vendaId)[0].dias_restantes).toBe(-10)
  })

  seTiverSqlite('produto sem garantia não tem data de fim, e nem deve ter', () => {
    // `garantia_ate` nulo é o que faz a tela escrever "sem garantia" em vez de
    // uma data igual à da compra, que pareceria uma garantia de um dia.
    const vendaId = vender(3)
    const item = itensDaVenda(vendaId)[0]
    expect(item.garantia_dias).toBe(0)
    expect(item.garantia_ate).toBeNull()
    expect(item.dias_restantes).toBeNull()
  })

  seTiverSqlite('venda anterior ao módulo cai no padrão e avisa que é estimativa', () => {
    /*
     * ⚠️ `itens_venda.garantia_dias` nulo é venda de ANTES da migration 051, e
     * não "sem garantia". A tela precisa do sinal para não afirmar uma data que
     * ninguém prometeu.
     */
    const vendaId = vender(1)
    db!.prepare('UPDATE itens_venda SET garantia_dias = NULL WHERE venda_id = ?').run(vendaId)

    const item = itensDaVenda(vendaId)[0]
    expect(item.prazo_estimado).toBe(true)
    expect(item.garantia_dias).toBe(90)

    // Já a venda nova, congelada, não é estimativa nenhuma.
    expect(itensDaVenda(vender(1))[0].prazo_estimado).toBe(false)
  })
})

describe('busca: como a pergunta chega no balcão', () => {
  seTiverSqlite('acha pelo número da venda', () => {
    const vendaId = vender(1)
    const achados = buscarItensVendidos(String(vendaId))
    expect(achados).toHaveLength(1)
    expect(achados[0].venda_id).toBe(vendaId)
  })

  seTiverSqlite('acha pelo nome do cliente, sem exigir acerto exato', () => {
    vender(1, 1) // Maria Souza
    expect(buscarItensVendidos('maria').map((i) => i.cliente_nome)).toEqual(['Maria Souza'])
    expect(buscarItensVendidos('souza')).toHaveLength(1)
  })

  seTiverSqlite('acha pelo telefone digitado SEM a pontuação', () => {
    /*
     * O telefone é gravado com máscara ("(88) 9.9999-1234"), e ninguém digita a
     * máscara na busca. Sem limpar os dois lados, procurar "99991234" não
     * acharia o próprio cliente que está na frente do balcão.
     */
    vender(1, 1)
    expect(buscarItensVendidos('9999')).toHaveLength(1)
  })

  seTiverSqlite('acha pelo nome do produto e pelo código de barras', () => {
    vender(2)
    expect(buscarItensVendidos('furad')).toHaveLength(1)
    expect(buscarItensVendidos('7890000000024')).toHaveLength(1)
  })

  seTiverSqlite('venda CANCELADA continua aparecendo, marcada', () => {
    /*
     * Sumir da busca faria o atendente dizer "não achei essa compra" para uma
     * venda que existiu e foi desfeita, e a conversa com o cliente começaria
     * errada.
     */
    const vendaId = vender(1)
    db!.prepare('UPDATE vendas SET cancelada = 1 WHERE id = ?').run(vendaId)

    const achados = buscarItensVendidos(String(vendaId))
    expect(achados).toHaveLength(1)
    expect(achados[0].venda_cancelada).toBe(1)
  })

  seTiverSqlite('busca vazia não devolve a loja inteira', () => {
    vender(1)
    expect(buscarItensVendidos('')).toEqual([])
    expect(buscarItensVendidos('   ')).toEqual([])
  })
})

// ─── O atendimento ───────────────────────────────────────────────────────────

describe('abrir atendimento de garantia', () => {
  seTiverSqlite('dentro do prazo abre marcado como dentro do prazo', () => {
    const vendaId = vender(1)
    const item = itensDaVenda(vendaId)[0]
    const r = abrirGarantia({
      item_venda_id: item.item_venda_id,
      defeito: 'Não liga',
      vendedor_id: 1
    })
    expect(r.dentro_do_prazo).toBe(true)
    expect(garantiasDoItem(item.item_venda_id)[0].dentro_do_prazo).toBe(1)
  })

  seTiverSqlite('★ fora do prazo ABRE assim mesmo, marcado como fora', () => {
    /*
     * Barrar aqui tiraria do lojista uma escolha que ele toma todo dia no
     * balcão: cobrir por fora da regra para não perder um cliente antigo. E a
     * recusa, quando ele decide recusar, ficaria sem registro nenhum.
     */
    const vendaId = vender(1)
    envelhecerVenda(vendaId, 200)
    const item = itensDaVenda(vendaId)[0]

    const r = abrirGarantia({
      item_venda_id: item.item_venda_id,
      defeito: 'Parou de funcionar',
      vendedor_id: 1
    })
    expect(r.dentro_do_prazo).toBe(false)
    expect(garantiasDoItem(item.item_venda_id)[0].dentro_do_prazo).toBe(0)
  })

  seTiverSqlite('produto vendido sem garantia abre fora do prazo', () => {
    const vendaId = vender(3) // zero dias
    const item = itensDaVenda(vendaId)[0]
    const r = abrirGarantia({
      item_venda_id: item.item_venda_id,
      defeito: 'Veio com defeito',
      vendedor_id: 1
    })
    expect(r.dentro_do_prazo).toBe(false)
  })

  seTiverSqlite('venda cancelada não abre garantia', () => {
    const vendaId = vender(1)
    const item = itensDaVenda(vendaId)[0]
    db!.prepare('UPDATE vendas SET cancelada = 1 WHERE id = ?').run(vendaId)

    expect(() =>
      abrirGarantia({ item_venda_id: item.item_venda_id, defeito: 'x', vendedor_id: 1 })
    ).toThrow(/cancelada/i)
  })

  seTiverSqlite('defeito em branco é recusado', () => {
    const vendaId = vender(1)
    const item = itensDaVenda(vendaId)[0]
    expect(() =>
      abrirGarantia({ item_venda_id: item.item_venda_id, defeito: '   ', vendedor_id: 1 })
    ).toThrow(/Descreva/)
  })

  seTiverSqlite('item que não existe é recusado', () => {
    expect(() => abrirGarantia({ item_venda_id: 999, defeito: 'x', vendedor_id: 1 })).toThrow(
      /não encontrado/
    )
  })

  seTiverSqlite('o item passa a contar quantos atendimentos já teve', () => {
    const vendaId = vender(1)
    const item = itensDaVenda(vendaId)[0]
    expect(item.atendimentos).toBe(0)

    abrirGarantia({ item_venda_id: item.item_venda_id, defeito: 'Não liga', vendedor_id: 1 })
    expect(itensDaVenda(vendaId)[0].atendimentos).toBe(1)
  })
})

describe('fechar atendimento de garantia', () => {
  function abrirUm(): number {
    const vendaId = vender(1)
    const item = itensDaVenda(vendaId)[0]
    return abrirGarantia({
      item_venda_id: item.item_venda_id,
      defeito: 'Não liga',
      vendedor_id: 1
    }).id
  }

  seTiverSqlite('troca, conserto e devolução RESOLVEM', () => {
    for (const desfecho of ['troca', 'conserto', 'devolucao']) {
      const id = abrirUm()
      fecharGarantia(id, desfecho, 2)
      const g = listarGarantias().find((x) => x.id === id)!
      expect(g.situacao).toBe('resolvida')
      expect(g.desfecho).toBe(desfecho)
      expect(g.fechada_em).toBeTruthy()
    }
  })

  seTiverSqlite('sem defeito e fora do prazo RECUSAM', () => {
    /*
     * A separação importa no relatório: loja com muitas TROCAS tem problema de
     * produto; loja com muitas RECUSAS tem problema de expectativa na venda.
     * Jogar tudo em "fechada" apagaria a diferença.
     */
    for (const desfecho of ['sem_defeito', 'fora_do_prazo']) {
      const id = abrirUm()
      fecharGarantia(id, desfecho, 2)
      expect(listarGarantias().find((x) => x.id === id)!.situacao).toBe('recusada')
    }
  })

  seTiverSqlite('★ fechar NÃO mexe em dinheiro nem em estoque', () => {
    /*
     * Nem com desfecho `devolucao`. O dinheiro sai pela tela de devolução, que
     * já lança o crédito, baixa o livro-caixa e repõe a peça. Um segundo
     * caminho mexendo no mesmo dinheiro tiraria o caixa do lugar na primeira
     * troca registrada nos dois lugares.
     */
    const vendaId = vender(1)
    const item = itensDaVenda(vendaId)[0]
    const id = abrirGarantia({
      item_venda_id: item.item_venda_id,
      defeito: 'Não liga',
      vendedor_id: 1
    }).id

    const antes = {
      estoque: (db!.prepare('SELECT estoque FROM produtos WHERE id = 1').get() as { estoque: number })
        .estoque,
      movimentos: (
        db!.prepare('SELECT COUNT(*) AS n FROM movimentos_financeiros').get() as { n: number }
      ).n,
      devolucoes: (db!.prepare('SELECT COUNT(*) AS n FROM devolucoes').get() as { n: number }).n,
      creditos: (db!.prepare('SELECT COUNT(*) AS n FROM creditos_cliente').get() as { n: number })
        .n,
      valorPago: (
        db!.prepare('SELECT valor_pago FROM vendas WHERE id = ?').get(vendaId) as {
          valor_pago: number
        }
      ).valor_pago
    }

    fecharGarantia(id, 'devolucao', 2, 'Dinheiro devolvido no caixa')

    const depois = {
      estoque: (db!.prepare('SELECT estoque FROM produtos WHERE id = 1').get() as { estoque: number })
        .estoque,
      movimentos: (
        db!.prepare('SELECT COUNT(*) AS n FROM movimentos_financeiros').get() as { n: number }
      ).n,
      devolucoes: (db!.prepare('SELECT COUNT(*) AS n FROM devolucoes').get() as { n: number }).n,
      creditos: (db!.prepare('SELECT COUNT(*) AS n FROM creditos_cliente').get() as { n: number })
        .n,
      valorPago: (
        db!.prepare('SELECT valor_pago FROM vendas WHERE id = ?').get(vendaId) as {
          valor_pago: number
        }
      ).valor_pago
    }

    expect(depois).toEqual(antes)
  })

  seTiverSqlite('fechar duas vezes é recusado', () => {
    const id = abrirUm()
    fecharGarantia(id, 'troca', 2)
    expect(() => fecharGarantia(id, 'conserto', 2)).toThrow(/já foi encerrado/)
  })

  seTiverSqlite('desfecho inventado é recusado', () => {
    const id = abrirUm()
    expect(() => fecharGarantia(id, 'jogou fora', 2)).toThrow(/Desfecho inválido/)
  })

  seTiverSqlite('a observação de fechamento não apaga a que já existia', () => {
    const vendaId = vender(1)
    const item = itensDaVenda(vendaId)[0]
    const id = abrirGarantia({
      item_venda_id: item.item_venda_id,
      defeito: 'Não liga',
      observacao: 'Cliente trouxe a caixa original',
      vendedor_id: 1
    }).id

    fecharGarantia(id, 'conserto', 2, '   ')
    expect(listarGarantias().find((x) => x.id === id)!.observacao).toBe(
      'Cliente trouxe a caixa original'
    )
  })

  seTiverSqlite('reabrir volta para aberta e limpa o desfecho', () => {
    const id = abrirUm()
    fecharGarantia(id, 'troca', 2)
    reabrirGarantia(id)

    const g = listarGarantias().find((x) => x.id === id)!
    expect(g.situacao).toBe('aberta')
    expect(g.desfecho).toBeNull()
    expect(g.fechada_em).toBeNull()
    expect(() => reabrirGarantia(id)).toThrow(/já está aberto/)
  })
})

describe('listagem e resumo', () => {
  seTiverSqlite('as abertas vêm primeiro, mesmo sendo mais antigas', () => {
    const primeira = (() => {
      const item = itensDaVenda(vender(1))[0]
      return abrirGarantia({ item_venda_id: item.item_venda_id, defeito: 'A', vendedor_id: 1 }).id
    })()
    const segunda = (() => {
      const item = itensDaVenda(vender(1))[0]
      return abrirGarantia({ item_venda_id: item.item_venda_id, defeito: 'B', vendedor_id: 1 }).id
    })()
    fecharGarantia(segunda, 'troca', 2)

    expect(listarGarantias()[0].id).toBe(primeira)
  })

  seTiverSqlite('o filtro por situação devolve só aquele grupo', () => {
    const item = itensDaVenda(vender(1))[0]
    const id = abrirGarantia({ item_venda_id: item.item_venda_id, defeito: 'A', vendedor_id: 1 }).id
    fecharGarantia(id, 'sem_defeito', 2)

    expect(listarGarantias('aberta')).toHaveLength(0)
    expect(listarGarantias('recusada')).toHaveLength(1)
    expect(listarGarantias('resolvida')).toHaveLength(0)
  })

  seTiverSqlite('o resumo conta abertas, fora do prazo e o giro de 30 dias', () => {
    // Uma aberta dentro do prazo.
    const a = itensDaVenda(vender(1))[0]
    abrirGarantia({ item_venda_id: a.item_venda_id, defeito: 'A', vendedor_id: 1 })

    // Uma aberta FORA do prazo.
    const vendaVelha = vender(1)
    envelhecerVenda(vendaVelha, 200)
    const b = itensDaVenda(vendaVelha)[0]
    abrirGarantia({ item_venda_id: b.item_venda_id, defeito: 'B', vendedor_id: 1 })

    // Uma resolvida e uma recusada, as duas hoje.
    const c = itensDaVenda(vender(1))[0]
    const idC = abrirGarantia({ item_venda_id: c.item_venda_id, defeito: 'C', vendedor_id: 1 }).id
    fecharGarantia(idC, 'troca', 2)
    const d = itensDaVenda(vender(1))[0]
    const idD = abrirGarantia({ item_venda_id: d.item_venda_id, defeito: 'D', vendedor_id: 1 }).id
    fecharGarantia(idD, 'sem_defeito', 2)

    expect(resumoGarantias()).toEqual({
      abertas: 2,
      fora_do_prazo_abertas: 1,
      resolvidas_30d: 1,
      recusadas_30d: 1
    })
  })

  seTiverSqlite('loja sem nenhuma garantia devolve zeros, e não nulos', () => {
    // `SUM` sobre tabela vazia devolve NULL no SQLite, e um NULL chegando na
    // tela vira "null aberta(s)" no lugar de "0 aberta(s)".
    expect(resumoGarantias()).toEqual({
      abertas: 0,
      fora_do_prazo_abertas: 0,
      resolvidas_30d: 0,
      recusadas_30d: 0
    })
  })
})

describe('o prazo padrão da loja', () => {
  seTiverSqlite('lê o que está gravado', () => {
    expect(prazoPadraoDaLoja()).toBe(90)
  })

  seTiverSqlite('cai no prazo legal quando a configuração está ausente ou suja', () => {
    db!.prepare("DELETE FROM config WHERE chave = 'garantia_padrao_dias'").run()
    expect(prazoPadraoDaLoja()).toBe(GARANTIA_PADRAO_DIAS)

    db!.prepare("INSERT INTO config (chave, valor) VALUES ('garantia_padrao_dias', 'noventa')").run()
    expect(prazoPadraoDaLoja()).toBe(GARANTIA_PADRAO_DIAS)
  })

  seTiverSqlite('aceita zero: a loja pode decidir não dar garantia nenhuma', () => {
    definirPrazoPadraoDaLoja(0)
    expect(prazoPadraoDaLoja()).toBe(0)
  })

  seTiverSqlite('recusa número quebrado, negativo ou absurdo', () => {
    expect(() => definirPrazoPadraoDaLoja(-1)).toThrow(/0 a 3650/)
    expect(() => definirPrazoPadraoDaLoja(5000)).toThrow(/0 a 3650/)
    expect(() => definirPrazoPadraoDaLoja(30.5)).toThrow(/0 a 3650/)
  })
})
