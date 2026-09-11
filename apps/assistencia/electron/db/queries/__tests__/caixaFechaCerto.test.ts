/**
 * O caixa fecha certo: o livro e a gaveta contam a mesma história.
 *
 * ── Os três defeitos que este arquivo prende ────────────────────────────────
 * Descobertos em 11/09/2026, investigando o relato de que "o fechamento às
 * vezes não parece fazer sentido". Os três têm a mesma forma: uma operação
 * mexia no DINHEIRO DE VERDADE e não mexia no livro, ou o contrário.
 *
 *  1. **Receber dívida ou parcela não perguntava a FORMA.** O movimento nascia
 *     sem ela, e o fechamento agrupa o que não tem forma como dinheiro — um
 *     fiado quitado por PIX virava dinheiro esperado na gaveta.
 *  2. **Devolução em dinheiro não saía do livro.** A nota saía da gaveta e o
 *     sistema seguia esperando encontrá-la.
 *  3. **Estorno de recebimento não saía do livro.** O dinheiro voltava para a
 *     mão do cliente e continuava lançado.
 *
 * Nos três, o erro aparecia como FALTA (ou sobra) de valor exato, dias depois,
 * sem nada na tela ligando uma coisa à outra. Nenhum deles quebra tela, nenhum
 * deles aparece no typecheck, e nenhum deles dá erro no log.
 *
 * ── Por que testar pelo ESPERADO do fechamento ──────────────────────────────
 * É o número que o lojista confere contra a gaveta. Testar o movimento no livro
 * provaria que a linha foi gravada; testar o esperado prova que ela chega onde
 * a conta é feita, que é onde os três defeitos doíam.
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

const { criarVenda, registrarPagamentoParcial, pagarParcela, estornarRecebimento } =
  await import('../vendas')
const { registrarDevolucao } = await import('../devolucoes')
const { abrirTurno, fecharTurno } = await import('../turnos')

const SCHEMA = `
  CREATE TABLE vendedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
    ativo INTEGER NOT NULL DEFAULT 1,
    comissao_pct REAL
  );
  -- criarVenda carimba o percentual de comissão vigente na venda, e cai no
  -- padrão da loja quando o vendedor não tem o seu (ver migration 038).
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
    estoque INTEGER DEFAULT 0,
    -- ⚠️ Só existe nesta base: aqui peça e serviço dividem a mesma tabela, e
    -- todo caminho que mexe em estoque pergunta por esta coluna antes.
    tipo TEXT NOT NULL DEFAULT 'produto',
    -- Unidades apartadas para pedidos separados. A trava de estoque compara
    -- contra estoque menos reservado, entao a coluna precisa existir aqui: este
    -- schema e um espelho ESCRITO A MAO do real, e ja ficou para tras uma vez.
    -- (sem crase neste comentario: ele mora dentro de um template literal)
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
    custo_unitario REAL
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
    data TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    vendedor_id INTEGER NOT NULL,
    autorizado_por_id INTEGER,
    tipo TEXT NOT NULL CHECK(tipo IN ('credito','dinheiro')),
    valor_total REAL NOT NULL,
    motivo TEXT
  );
  CREATE TABLE itens_devolucao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    devolucao_id INTEGER NOT NULL,
    item_venda_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    quantidade INTEGER NOT NULL,
    valor_unitario_devolvido REAL NOT NULL,
    restocado INTEGER NOT NULL DEFAULT 1
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

  -- O livro-caixa. A venda lanca aqui DENTRO da propria transacao dela, entao
  -- sem estas tabelas nenhuma venda passa.
  --
  -- Isso e proposital e vale dizer: venda cujo dinheiro nao e registrado e pior
  -- que venda que nao acontece. Se o lancamento falha, a venda inteira volta
  -- atras em vez de gravar mercadoria saindo sem dinheiro entrando.
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
  CREATE TABLE pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, vendedor_id INTEGER NOT NULL,
    situacao TEXT NOT NULL DEFAULT 'separado',
    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    para_entrega INTEGER NOT NULL DEFAULT 0, endereco_entrega TEXT, observacao TEXT,
    desconto REAL NOT NULL DEFAULT 0, total REAL NOT NULL, venda_id INTEGER,
    concluido_em TEXT, cancelado_em TEXT, motivo_cancelamento TEXT
  );
  CREATE TABLE itens_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL, variacao_id INTEGER,
    quantidade INTEGER NOT NULL, preco_unitario REAL NOT NULL
  );
`

const SEED = `
  -- ⚠️ Esta loja de teste NÃO exige caixa aberto para vender.
  --
  -- Os testes daqui são sobre outra coisa (roteamento do livro-caixa, corrida
  -- por estoque), e exigir turno obrigaria cada um a abrir caixa antes de
  -- chegar ao que interessa. Fica declarado no fonte em vez de depender do
  -- padrão — que é LIGADO, e muda de significado se alguém mexer nele.
  INSERT INTO config (chave, valor) VALUES ('exigir_caixa_aberto', '0');
  INSERT INTO vendedores (id, nome) VALUES (1, 'Ana'), (2, 'Gerente');
  INSERT INTO clientes (id, nome, telefone) VALUES (1, 'Maria', '(88) 9.9999-9999');
  INSERT INTO produtos (id, nome, preco, estoque) VALUES (1, 'Anel de ouro', 1000, 3);
  INSERT INTO contas_financeiras (id, nome, tipo, saldo_inicial, padrao_recebimento, padrao_pagamento, forma_padrao)
    VALUES (1, 'Caixa da loja', 'caixa', 500, 1, 1, 'dinheiro');
  INSERT INTO contas_financeiras (id, nome, tipo, forma_padrao)
    VALUES (2, 'Banco', 'banco', 'pix');
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

/** Abre o Caixa da loja com R$ 100 de fundo e devolve o id do turno. */
const abrirCaixa = () => abrirTurno(1, 1, 100).id

/** Fecha contando `contado` em espécie e devolve o esperado por forma. */
function fechar(turnoId: number, contado: number): Record<string, number> {
  const r = fecharTurno(turnoId, 1, [{ forma: 'dinheiro', valor_contado: contado }])
  return Object.fromEntries(r.contagens.map((c) => [c.forma, c.valor_esperado]))
}

/** Venda a prazo de R$ 300 no cliente 1 — nasce devendo tudo. */
const vendaAPrazo = () =>
  criarVenda({
    cliente_id: 1,
    vendedor_id: 1,
    caixa_id: 1,
    status_pagamento: 'pendente',
    data_vencimento: '2026-12-31',
    itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 300 }]
  }).id

describe('o esperado do fechamento segue o dinheiro de verdade', () => {
  seTiverSqlite('★ dívida quitada por PIX NÃO vira dinheiro esperado na gaveta', () => {
    const turno = abrirCaixa()
    const venda = vendaAPrazo()

    registrarPagamentoParcial(venda, 300, 'pix', 1)

    const esperado = fechar(turno, 100)
    // A gaveta tem só o fundo. Antes do conserto o PIX entrava aqui e o caixa
    // fechava com R$ 300 de falta, todo dia em que alguém quitasse um fiado.
    expect(esperado.dinheiro).toBe(100)
    expect(esperado.pix).toBe(300)
  })

  seTiverSqlite('dívida quitada em espécie entra na gaveta, como sempre entrou', () => {
    const turno = abrirCaixa()
    const venda = vendaAPrazo()

    registrarPagamentoParcial(venda, 300, 'dinheiro', 1)

    expect(fechar(turno, 400).dinheiro).toBe(400)
  })

  seTiverSqlite('★ devolução em dinheiro SAI do esperado', () => {
    const turno = abrirCaixa()
    const venda = criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      caixa_id: 1,
      forma_pagamento: 'dinheiro',
      status_pagamento: 'pago',
      data_vencimento: null,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 300 }]
    })
    // Fundo 100 + venda 300 = 400 na gaveta.
    const itemId = (
      banco!.prepare('SELECT id FROM itens_venda WHERE venda_id = ?').get(venda.id) as {
        id: number
      }
    ).id

    registrarDevolucao({
      venda_id: venda.id,
      vendedor_id: 1,
      autorizado_por_id: 2,
      tipo: 'dinheiro',
      caixa_id: 1,
      itens: [{ item_venda_id: itemId, quantidade: 1, restocar: true }]
    })

    // Os R$ 300 voltaram para a mão do cliente: sobra o fundo.
    expect(fechar(turno, 100).dinheiro).toBe(100)
  })

  seTiverSqlite('devolução em CRÉDITO não mexe na gaveta — nada saiu dela', () => {
    const turno = abrirCaixa()
    const venda = criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      caixa_id: 1,
      forma_pagamento: 'dinheiro',
      status_pagamento: 'pago',
      data_vencimento: null,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 300 }]
    })
    const itemId = (
      banco!.prepare('SELECT id FROM itens_venda WHERE venda_id = ?').get(venda.id) as {
        id: number
      }
    ).id

    registrarDevolucao({
      venda_id: venda.id,
      vendedor_id: 1,
      tipo: 'credito',
      cliente_id: 1,
      caixa_id: 1,
      itens: [{ item_venda_id: itemId, quantidade: 1, restocar: true }]
    })

    expect(fechar(turno, 400).dinheiro).toBe(400)
  })

  seTiverSqlite('★ estornar o recebimento tira o dinheiro do esperado', () => {
    const turno = abrirCaixa()
    const venda = vendaAPrazo()
    registrarPagamentoParcial(venda, 300, 'dinheiro', 1)

    estornarRecebimento(venda)

    // O dinheiro voltou para o cliente e a venda reabriu: a gaveta tem o fundo.
    expect(fechar(turno, 100).dinheiro).toBe(100)
  })

  seTiverSqlite('parcela paga por cartão não é esperada na gaveta', () => {
    const turno = abrirCaixa()
    const venda = criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      caixa_id: 1,
      status_pagamento: 'parcelado',
      data_vencimento: '2026-12-31',
      num_parcelas: 2,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 300 }]
    }).id
    const parcela = (
      banco!.prepare('SELECT id FROM parcelas WHERE venda_id = ? ORDER BY numero').get(venda) as {
        id: number
      }
    ).id

    pagarParcela(parcela, 'credito', 1)

    const esperado = fechar(turno, 100)
    expect(esperado.dinheiro).toBe(100)
    expect(esperado.credito).toBe(150)
  })
})
