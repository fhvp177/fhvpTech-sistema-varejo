/**
 * O livro-caixa, o fechamento às cegas e a reserva de estoque.
 *
 * Estes três nasceram juntos em 2026-09-06 e são código de DINHEIRO: cada
 * asserção aqui corresponde a um jeito concreto de o lojista perder confiança
 * no sistema, e a maioria delas não quebraria nada visível se estivesse errada.
 *
 * ── Por que teste de comportamento, e não de estrutura ──────────────────────
 * Os erros que importam aqui são de CONTA, não de forma. "Lançou o total em vez
 * do que entrou de fato" compila, passa no typecheck, e só aparece semanas
 * depois como uma falta de caixa que ninguém explica.
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

const { criarVenda, pagarParcela } = await import('../vendas')
const { listarContas, extrato } = await import('../financeiro')
const { abrirTurno, fecharTurno, confirmarTurno, sangria, contagensDoTurno } = await import('../turnos')
const { criarPedido, cancelarPedido, concluirPedido } = await import('../pedidos')

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

const vendaAVista = (forma: string, extras: Record<string, unknown> = {}) =>
  criarVenda({
    cliente_id: 1,
    vendedor_id: 1,
    status_pagamento: 'pago',
    data_vencimento: null,
    forma_pagamento: forma,
    itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 1000 }],
    ...extras
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

describe('o dinheiro da venda chega ao livro', () => {
  seTiverSqlite('venda à vista lança o valor cheio, na conta da FORMA', () => {
    vendaAVista('dinheiro')
    const movs = extrato({ conta_id: 1 })
    expect(movs).toHaveLength(1)
    expect(movs[0].valor).toBe(1000)
    expect(movs[0].tipo).toBe('venda')
  })

  seTiverSqlite('★ a forma decide a conta: PIX não cai na gaveta', () => {
    // É assim que a loja pensa — o dinheiro fica na gaveta, o PIX cai no banco.
    // Sem isto o lojista escolheria a conta na mão em toda venda, e escolha
    // repetida vira escolha errada.
    vendaAVista('pix')
    expect(extrato({ conta_id: 1 })).toHaveLength(0)
    expect(extrato({ conta_id: 2 })).toHaveLength(1)
  })

  seTiverSqlite('★ CRÉDITO DA LOJA NÃO É DINHEIRO', () => {
    /*
     * ⚠️ A asserção mais importante deste arquivo.
     *
     * Numa venda de 1000 paga com 300 de crédito, `valor_pago` fica 1000 (a
     * venda está quitada) mas só 700 entraram na gaveta. Lançar 1000 faria o
     * fechamento acusar falta de 300 toda vez que alguém usasse crédito — e um
     * controle que acusa falta sem motivo é desligado na primeira semana.
     */
    db!.exec("INSERT INTO creditos_cliente (cliente_id, tipo, valor) VALUES (1, 'entrada', 300)")
    vendaAVista('dinheiro', { valor_credito_usado: 300 })

    const movs = extrato({ conta_id: 1 })
    expect(movs).toHaveLength(1)
    expect(movs[0].valor, 'lançou o total em vez do que entrou de verdade').toBe(700)
  })

  seTiverSqlite('★ venda com sinal lança SÓ o sinal', () => {
    // O resto é dívida, e dívida não é dinheiro na conta.
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pendente',
      data_vencimento: '2026-12-01',
      entrada: 200,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 1000 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const movs = extrato({ conta_id: 1 })
    expect(movs).toHaveLength(1)
    expect(movs[0].valor).toBe(200)
  })

  seTiverSqlite('★ parcela paga duas vezes lança UMA vez', () => {
    /*
     * Clique duplo acontece. Sem a guarda, o livro registraria o dinheiro duas
     * vezes e o fechamento acusaria uma sobra que ninguém conseguiria explicar
     * — e sobra inexplicada mina a confiança tanto quanto falta.
     */
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'parcelado',
      data_vencimento: '2026-12-01',
      num_parcelas: 2,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 1000 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const parcela = db!.prepare('SELECT id FROM parcelas LIMIT 1').get() as { id: number }
    pagarParcela(parcela.id)
    pagarParcela(parcela.id)

    const recebimentos = extrato({ conta_id: 1 }).filter((m) => m.tipo === 'recebimento')
    expect(recebimentos).toHaveLength(1)
  })

  seTiverSqlite('o saldo é DERIVADO, e parte do saldo inicial', () => {
    // Saldo guardado que erra uma vez erra para sempre; movimento faltando
    // aparece na lista.
    vendaAVista('dinheiro')
    const caixa = listarContas().find((c) => c.id === 1)!
    expect(caixa.saldo).toBe(1500) // 500 de saldo inicial + 1000
  })
})

describe('fechamento de caixa às cegas', () => {
  seTiverSqlite('★ nada revela o esperado antes de fechar', async () => {
    /*
     * ⚠️ Esta é a guarda que faz o "às cegas" ser real e não uma promessa da
     * tela. Se existisse uma função que devolvesse o esperado de um turno
     * ABERTO, bastaria alguém chamá-la antes de digitar — e aí não se conta, se
     * confere: o número bate sempre e a quebra nunca aparece.
     */
    const turnos = await import('../turnos')
    const nomes = Object.keys(turnos)
    const suspeitas = nomes.filter((n) => /esperad|previst|conferenc/i.test(n))
    expect(suspeitas, 'apareceu função que revela o esperado cedo demais').toEqual([])
  })

  seTiverSqlite('★ o esperado inclui o fundo de troco', () => {
    // Sem somá-lo, toda abertura de caixa pareceria uma sobra do tamanho do
    // troco — e o operador aprenderia a ignorar a diferença.
    const { id } = abrirTurno(1, 1, 300)
    vendaAVista('dinheiro')
    const r = fecharTurno(id, 1, [{ forma: 'dinheiro', valor_contado: 1300 }])
    expect(r.diferenca_dinheiro).toBe(0)
  })

  seTiverSqlite('★ a diferença aparece quando falta dinheiro', () => {
    const { id } = abrirTurno(1, 1, 0)
    vendaAVista('dinheiro')
    const r = fecharTurno(id, 1, [{ forma: 'dinheiro', valor_contado: 950 }])
    expect(r.diferenca_dinheiro).toBe(-50)
  })

  seTiverSqlite('a sangria sai do esperado da gaveta', () => {
    const { id } = abrirTurno(1, 1, 0)
    vendaAVista('dinheiro')
    sangria(1, 1, 400, 'Depósito no banco')
    const r = fecharTurno(id, 1, [{ forma: 'dinheiro', valor_contado: 600 }])
    expect(r.diferenca_dinheiro).toBe(0)
  })

  seTiverSqlite('★ o esperado fica CONGELADO no fechamento', () => {
    /*
     * Um estorno lançado semanas depois mudaria a conta e faria um turno já
     * conferido "descobrir" uma diferença que ninguém viu na época. O relatório
     * de ontem tem que continuar dizendo o que dizia ontem.
     */
    const { id } = abrirTurno(1, 1, 0)
    vendaAVista('dinheiro')
    fecharTurno(id, 1, [{ forma: 'dinheiro', valor_contado: 1000 }])

    // dinheiro entrando depois, no mesmo turno já fechado
    db!.exec(
      `INSERT INTO movimentos_financeiros (conta_id, data, valor, tipo, forma_pagamento, turno_id)
       VALUES (1, '2026-09-06 20:00:00', 999, 'ajuste', 'dinheiro', ${id})`
    )
    const congelado = contagensDoTurno(id).find((c) => c.forma === 'dinheiro')!
    expect(congelado.valor_esperado, 'o esperado foi recalculado depois do fechamento').toBe(1000)
  })

  seTiverSqlite('★ turno confirmado não se altera mais', () => {
    const { id } = abrirTurno(1, 1, 0)
    fecharTurno(id, 1, [{ forma: 'dinheiro', valor_contado: 0 }])
    confirmarTurno(id, 2, null)
    expect(() => confirmarTurno(id, 2, null)).toThrow(/confirmado/i)
  })

  seTiverSqlite('não se confirma turno que ainda está aberto', () => {
    const { id } = abrirTurno(1, 1, 0)
    expect(() => confirmarTurno(id, 2, null)).toThrow(/ainda não foi fechado/i)
  })

  seTiverSqlite('★ a MESMA gaveta não abre dois turnos', () => {
    // Duas contagens brigando pelo mesmo dinheiro nunca fecham: uma sobra
    // exatamente o que a outra falta, e não há como saber qual estava certa.
    abrirTurno(1, 1, 0)
    expect(() => abrirTurno(1, 1, 0)).toThrow(/este caixa já está aberto/i)
  })

  seTiverSqlite('★ mas DOIS caixas podem estar abertos ao mesmo tempo', () => {
    /*
     * Decisão do dono em 06/09: a loja pode ter mais de um caixa físico. Caixa 1
     * e Caixa 2 operam juntos, cada um com a própria gaveta e a própria contagem.
     */
    db!.exec("INSERT INTO contas_financeiras (id, nome, tipo) VALUES (3, 'Caixa 2', 'caixa')")
    abrirTurno(1, 1, 0)
    expect(() => abrirTurno(3, 1, 0)).not.toThrow()
  })

  seTiverSqlite('★ não se abre turno numa conta bancária', () => {
    // Banco não tem gaveta para contar. Deixar abrir criaria um turno que nunca
    // fecha certo e não significa nada.
    expect(() => abrirTurno(2, 1, 0)).toThrow(/não numa conta bancária/i)
  })
})

describe('pedido separado e a reserva de estoque', () => {
  const pedidoDeUmAnel = () =>
    criarPedido({
      cliente_id: 1,
      vendedor_id: 1,
      para_entrega: true,
      endereco_entrega: 'Rua X, 10',
      observacao: null,
      itens: [{ produto_id: 1, quantidade: 3, preco_unitario: 1000 }]
    })

  seTiverSqlite('★ separar reserva sem baixar o estoque', () => {
    // A peça AINDA É DA LOJA até alguém pagar. Baixar aqui apagaria isso.
    pedidoDeUmAnel()
    const p = db!.prepare('SELECT estoque, reservado FROM produtos WHERE id = 1').get() as {
      estoque: number
      reservado: number
    }
    expect(p.estoque).toBe(3)
    expect(p.reservado).toBe(3)
  })

  seTiverSqlite('★ peça reservada não pode ser vendida no balcão', () => {
    // É o defeito que o cliente descobriria na porta de casa.
    pedidoDeUmAnel()
    expect(() => vendaAVista('dinheiro')).toThrow(/estoque insuficiente/i)
  })

  seTiverSqlite('★ cancelar solta a reserva, e NÃO vira devolução', () => {
    /*
     * Não houve venda, então não pode aparecer no histórico como mercadoria
     * devolvida — o relatório de devoluções ficaria inflado com peças que nunca
     * saíram vendidas.
     */
    const { id } = pedidoDeUmAnel()
    cancelarPedido(id, 'Cliente desistiu na porta')
    const p = db!.prepare('SELECT estoque, reservado FROM produtos WHERE id = 1').get() as {
      estoque: number
      reservado: number
    }
    expect(p.estoque).toBe(3)
    expect(p.reservado).toBe(0)
    const devolucoes = db!.prepare('SELECT COUNT(*) AS n FROM devolucoes').get() as { n: number }
    expect(devolucoes.n).toBe(0)
  })

  seTiverSqlite('★ concluir solta a reserva E baixa o estoque, sem sobrar reserva', () => {
    /*
     * ⚠️ Se a reserva não fosse solta antes da venda, a própria peça reservada
     * seria recusada por falta de estoque. E se fosse solta fora da transação,
     * uma falha no meio deixaria a peça reservada e vendida ao mesmo tempo.
     */
    const { id } = pedidoDeUmAnel()
    concluirPedido(id, {
      vendedor_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'pix'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const p = db!.prepare('SELECT estoque, reservado FROM produtos WHERE id = 1').get() as {
      estoque: number
      reservado: number
    }
    expect(p.estoque).toBe(0)
    expect(p.reservado).toBe(0)
  })

  seTiverSqlite('★ o preço vem do PEDIDO, não da etiqueta de hoje', () => {
    // O cliente paga na porta o que foi combinado na loja.
    const { id } = criarPedido({
      cliente_id: 1,
      vendedor_id: 1,
      para_entrega: false,
      endereco_entrega: null,
      observacao: null,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 800 }]
    })
    db!.exec('UPDATE produtos SET preco = 1500 WHERE id = 1')
    const venda = concluirPedido(id, {
      vendedor_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'dinheiro'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    expect(venda.total).toBe(800)
  })

  seTiverSqlite('pedido concluído não pode ser cancelado por fora', () => {
    const { id } = pedidoDeUmAnel()
    concluirPedido(id, {
      vendedor_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'dinheiro'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    expect(() => cancelarPedido(id, 'tarde demais')).toThrow(/já virou venda/i)
  })

  seTiverSqlite('não se separa mais do que existe', () => {
    pedidoDeUmAnel()
    expect(() =>
      criarPedido({
        cliente_id: 1,
        vendedor_id: 1,
        para_entrega: false,
        endereco_entrega: null,
        observacao: null,
        itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 1000 }]
      })
    ).toThrow(/sem estoque disponível/i)
  })
})
