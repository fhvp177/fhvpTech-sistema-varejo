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

const {
  criarVenda,
  pagarParcela,
  registrarPagamentoParcial,
  recebimentosDaVenda,
  estornarRecebimento,
  permiteParcelamento,
  definirPermissaoParcelamento,
  promoverVendasVencidas,
  aReceberSemPrazo,
  cancelarVenda
} = await import('../vendas')
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
    garantia_dias INTEGER,
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
    -- Sinal recebido ao separar (migration 053). Sem esta coluna o pedido com
    -- sinal nem insere, e o defeito volta calado.
    sinal REAL NOT NULL DEFAULT 0,
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

describe('a exigência de caixa aberto', () => {
  /*
   * ⚠️ A regra vale no BANCO, e não só na tela.
   *
   * O segundo caixa fala pelo mesmo canal, e um renderer de versão anterior não
   * sabe do interruptor. Antes, o guarda só existia quando a tela mandava o
   * caixa — bastava não mandar para a venda passar sem turno e o dinheiro ficar
   * fora de toda conferência.
   */
  const ligarExigencia = () =>
    db!
      .prepare("INSERT OR REPLACE INTO config (chave, valor) VALUES ('exigir_caixa_aberto', '1')")
      .run()

  seTiverSqlite('★ ligada, recusa venda que não informa o caixa', () => {
    ligarExigencia()
    expect(() => vendaAVista('dinheiro')).toThrow('CAIXA_FECHADO')
  })

  seTiverSqlite('★ ligada, recusa venda em caixa sem turno aberto', () => {
    ligarExigencia()
    expect(() => vendaAVista('dinheiro', { caixa_id: 1 })).toThrow('CAIXA_FECHADO')
  })

  seTiverSqlite('ligada, aceita quando o turno está aberto', () => {
    ligarExigencia()
    abrirTurno(1, 1, 0)
    expect(() => vendaAVista('dinheiro', { caixa_id: 1 })).not.toThrow()
  })

  seTiverSqlite('★ desligada, a venda sem caixa passa', () => {
    // O caso do cliente que já operava sem caixa antes de o recurso existir.
    expect(() => vendaAVista('dinheiro')).not.toThrow()
  })
})

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

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * EM QUAL CONTA O DINHEIRO ENTRA
 *
 * Pedido do lojista em 12/09/2026: "vamos precisar colocar na hora de receber o
 * valor pago por uma venda, onde aquele dinheiro dessa venda ou parcela vai
 * entrar, em qual banco ele vai entrar".
 *
 * Antes disso o sistema ADIVINHAVA, por uma escada de três degraus: a conta
 * casada com a forma de pagamento, senão a marcada como padrão de recebimento,
 * senão qualquer ativa. Numa loja com dois bancos recebendo PIX, não havia como
 * dizer qual deles recebeu.
 *
 * ⚠️ A trava que estes testes protegem é a exceção: DINHEIRO EM ESPÉCIE ignora
 * a escolha e vai para a gaveta do operador, sempre. Ela vive no banco e não na
 * tela, porque o canal é falado por string e quem chama pode ser um segundo
 * caixa de versão anterior.
 */
describe('em qual conta o dinheiro entra', () => {
  const contaDo = (descricao: string): number | undefined =>
    (
      db!
        .prepare(
          "SELECT conta_id FROM movimentos_financeiros WHERE descricao LIKE ? ORDER BY id DESC LIMIT 1"
        )
        .get(`%${descricao}%`) as { conta_id: number } | undefined
    )?.conta_id

  seTiverSqlite('a venda no PIX entra na conta escolhida, e não na sugerida', () => {
    // A conta 2 (Banco) é a casada com PIX; a 1 é o caixa. Escolhendo a 1 para
    // um PIX, o sistema tem que obedecer — é o caso de dois bancos recebendo.
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'pix',
      conta_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 1000 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    expect(contaDo('Venda #')).toBe(1)
  })

  seTiverSqlite('sem escolha, continua caindo na escada de sempre', () => {
    // Quem não escolhe tem exatamente o comportamento que sempre teve.
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'pix',
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 1000 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    // Conta 2 é a que tem forma_padrao = 'pix'.
    expect(contaDo('Venda #')).toBe(2)
  })

  seTiverSqlite('★ ESPÉCIE ignora a conta escolhida e vai para a gaveta', () => {
    /*
     * O teste central. Mandar a nota para o banco faria o banco ganhar dinheiro
     * que nunca chegou nele E o fechamento acusar sobra na gaveta, todo dia.
     */
    // Venda com caixa carimbado exige turno aberto — é a regra da casa.
    abrirTurno(1, 1, 0)
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'dinheiro',
      caixa_id: 1,
      conta_id: 2,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 1000 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    expect(contaDo('Venda #')).toBe(1)
  })

  seTiverSqlite('★ recebimento de dívida: escolha vale, espécie não', () => {
    const aPrazo = () =>
      criarVenda({
        cliente_id: 1,
        vendedor_id: 1,
        status_pagamento: 'pendente',
        data_vencimento: '2026-12-31',
        itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 1000 }]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

    const comEscolha = aPrazo()
    registrarPagamentoParcial(comEscolha.id, 100, 'pix', 1, 2)
    expect(contaDo(`Recebimento da venda #${comEscolha.id}`)).toBe(2)

    const emEspecie = aPrazo()
    registrarPagamentoParcial(emEspecie.id, 100, 'dinheiro', 1, 2)
    expect(contaDo(`Recebimento da venda #${emEspecie.id}`)).toBe(1)
  })

  seTiverSqlite('★ baixa de parcela: escolha vale, espécie não', () => {
    const parcelada = () =>
      criarVenda({
        cliente_id: 1,
        vendedor_id: 1,
        status_pagamento: 'parcelado',
        data_vencimento: '2026-12-31',
        num_parcelas: 2,
        itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 1000 }]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

    const v1 = parcelada()
    const p1 = db!
      .prepare('SELECT id FROM parcelas WHERE venda_id = ? ORDER BY numero LIMIT 1')
      .get(v1.id) as { id: number }
    pagarParcela(p1.id, 'pix', 1, 2)
    expect(contaDo(`Parcela`)).toBe(2)

    const v2 = parcelada()
    const p2 = db!
      .prepare('SELECT id FROM parcelas WHERE venda_id = ? ORDER BY numero LIMIT 1')
      .get(v2.id) as { id: number }
    pagarParcela(p2.id, 'dinheiro', 1, 2)
    expect(contaDo(`Parcela`)).toBe(1)
  })

  seTiverSqlite('conta escolhida não muda o TURNO: ele continua sendo o do caixa', () => {
    /*
     * ⚠️ O PIX cai no banco, mas pertence ao turno do CAIXA onde a venda foi
     * feita. Sem isso, com dois caixas abertos, metade das vendas cairia no
     * turno errado e o erro só apareceria no fechamento.
     */
    abrirTurno(1, 1, 0)
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'pix',
      caixa_id: 1,
      conta_id: 2,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 1000 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const mov = db!
      .prepare(
        "SELECT conta_id, turno_id FROM movimentos_financeiros WHERE tipo = 'venda' ORDER BY id DESC LIMIT 1"
      )
      .get() as { conta_id: number; turno_id: number | null }
    expect(mov.conta_id).toBe(2)
    expect(mov.turno_id).not.toBeNull()
  })
})
/**
 * O SINAL da venda a prazo: com que meio ele foi pago, e onde ele entra.
 *
 * ── O defeito que estes testes prendem ──────────────────────────────────────
 * A tela nao perguntava a forma quando a condicao nao era "a vista", entao o
 * sinal ia ao livro carimbado como "crediario". A trava que manda especie para
 * a gaveta compara a forma com a palavra "dinheiro" e nao reconhecia aquilo:
 * o sinal pago em notas era lancado na conta padrao de recebimento, que numa
 * loja com banco cadastrado e o banco. As notas ficavam na gaveta e o sistema
 * anotava no banco, todo dia, sem nada na tela ligando uma coisa a outra.
 *
 * ⚠️ A loja destes testes tem o BANCO como padrao de recebimento, que e a
 * configuracao onde o defeito aparece. Com o caixa como padrao ele se esconde:
 * o destino errado calhava de ser o certo.
 */
describe('o sinal da venda a prazo', () => {
  const comBancoComoPadrao = (): void => {
    db!.exec(`
      UPDATE contas_financeiras SET padrao_recebimento = 0 WHERE id = 1;
      UPDATE contas_financeiras SET padrao_recebimento = 1 WHERE id = 2;
    `)
  }

  const vendaAPrazoComSinal = (extras: Record<string, unknown> = {}) =>
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pendente',
      data_vencimento: '2026-12-31',
      entrada: 185,
      caixa_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 370 }],
      ...extras
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

  const movimentoDaVenda = (vendaId: number) =>
    db!
      .prepare(
        `SELECT conta_id, valor, forma_pagamento, turno_id
           FROM movimentos_financeiros
          WHERE origem_tipo = 'venda' AND origem_id = ?
          ORDER BY id DESC LIMIT 1`
      )
      .get(vendaId) as
      | { conta_id: number; valor: number; forma_pagamento: string | null; turno_id: number | null }
      | undefined

  seTiverSqlite('★ sinal em especie cai na GAVETA, mesmo com banco como padrao', () => {
    comBancoComoPadrao()
    abrirTurno(1, 1, 0)
    const venda = vendaAPrazoComSinal({ forma_entrada: 'dinheiro' })
    const mov = movimentoDaVenda(venda.id)!
    expect(mov.conta_id).toBe(1)
    expect(mov.valor).toBe(185)
    expect(mov.forma_pagamento).toBe('dinheiro')
  })

  seTiverSqlite('sinal no PIX vai para a conta escolhida', () => {
    comBancoComoPadrao()
    abrirTurno(1, 1, 0)
    const venda = vendaAPrazoComSinal({ forma_entrada: 'pix', conta_id: 2 })
    const mov = movimentoDaVenda(venda.id)!
    expect(mov.conta_id).toBe(2)
    expect(mov.forma_pagamento).toBe('pix')
  })

  seTiverSqlite('★ sinal em especie IGNORA a conta escolhida', () => {
    // Mesma regra da venda a vista: a nota esta na gaveta daquele operador, e a
    // trava mora no banco de dados justamente porque a tela pode nao existir.
    abrirTurno(1, 1, 0)
    const venda = vendaAPrazoComSinal({ forma_entrada: 'dinheiro', conta_id: 2 })
    expect(movimentoDaVenda(venda.id)!.conta_id).toBe(1)
  })

  seTiverSqlite('sem forma declarada, o sinal e tratado como especie', () => {
    /*
     * ⚠️ A presuncao e deliberada. Sinal nasce no balcao, e especie e a
     * suposicao que a loja consegue DESMENTIR: se o dinheiro nao estiver na
     * gaveta, a contagem do fechamento acusa no mesmo dia. Supor banco erra em
     * silencio, e nenhuma conferencia percebe.
     */
    comBancoComoPadrao()
    abrirTurno(1, 1, 0)
    const venda = vendaAPrazoComSinal()
    const mov = movimentoDaVenda(venda.id)!
    expect(mov.conta_id).toBe(1)
    expect(mov.forma_pagamento).toBe('dinheiro')
  })

  seTiverSqlite('★ a VENDA continua sendo crediario, mesmo com o sinal no PIX', () => {
    // As duas perguntas convivem e nao podem se atropelar: a venda a prazo e
    // crediario no relatorio; o sinal e o meio pelo qual o dinheiro entrou hoje.
    abrirTurno(1, 1, 0)
    const venda = vendaAPrazoComSinal({ forma_entrada: 'pix', conta_id: 2 })
    const gravada = db!
      .prepare('SELECT forma_pagamento FROM vendas WHERE id = ?')
      .get(venda.id) as { forma_pagamento: string }
    expect(gravada.forma_pagamento).toBe('crediario')
    expect(movimentoDaVenda(venda.id)!.forma_pagamento).toBe('pix')
  })

  seTiverSqlite('forma de sinal invalida e recusada', () => {
    abrirTurno(1, 1, 0)
    expect(() => vendaAPrazoComSinal({ forma_entrada: 'boleto' })).toThrow(/inv[áa]lida/i)
  })

  seTiverSqlite('venda a prazo SEM sinal nao lanca nada no livro', () => {
    abrirTurno(1, 1, 0)
    const venda = vendaAPrazoComSinal({ entrada: 0, forma_entrada: null })
    expect(movimentoDaVenda(venda.id)).toBeUndefined()
  })

  seTiverSqlite('o sinal pertence ao turno do caixa, mesmo caindo no banco', () => {
    abrirTurno(1, 1, 0)
    const venda = vendaAPrazoComSinal({ forma_entrada: 'pix', conta_id: 2 })
    const mov = movimentoDaVenda(venda.id)!
    expect(mov.conta_id).toBe(2)
    expect(mov.turno_id).not.toBeNull()
  })
})

/**
 * O historico de recebimentos de UMA venda.
 *
 * ⚠️ Nao ha tabela nova: o livro-caixa ja carimba `origem_tipo`/`origem_id`
 * desde a migration 039, e uma segunda tabela daria duas verdades sobre o mesmo
 * dinheiro. O que estes testes prendem e que a leitura ache TUDO — inclusive o
 * que saiu.
 */
describe('historico de recebimentos da venda', () => {
  seTiverSqlite('★ traz o sinal e o saldo, cada um com sua forma e sua conta', () => {
    abrirTurno(1, 1, 0)
    const venda = criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pendente',
      data_vencimento: '2026-12-31',
      entrada: 185,
      forma_entrada: 'pix',
      conta_id: 2,
      caixa_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 370 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    registrarPagamentoParcial(venda.id, 185, 'dinheiro', 1, null)

    const linhas = recebimentosDaVenda(venda.id)
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toMatchObject({
      valor: 185,
      tipo: 'venda',
      forma_pagamento: 'pix',
      conta_nome: 'Banco'
    })
    expect(linhas[1]).toMatchObject({
      valor: 185,
      tipo: 'recebimento',
      forma_pagamento: 'dinheiro',
      conta_nome: 'Caixa da loja'
    })
  })

  seTiverSqlite('★ o estorno aparece na lista, negativo', () => {
    // Esconder os negativos daria uma lista que soma mais do que a venda
    // recebeu: bonita e errada.
    abrirTurno(1, 1, 0)
    const venda = criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pendente',
      data_vencimento: '2026-12-31',
      entrada: 185,
      forma_entrada: 'dinheiro',
      caixa_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 370 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    estornarRecebimento(venda.id)

    const linhas = recebimentosDaVenda(venda.id)
    expect(linhas).toHaveLength(2)
    expect(linhas[1].tipo).toBe('estorno')
    expect(linhas[1].valor).toBe(-185)
  })

  seTiverSqlite('a baixa de parcela entra com o NUMERO da parcela', () => {
    abrirTurno(1, 1, 0)
    const venda = criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'parcelado',
      data_vencimento: '2026-12-31',
      num_parcelas: 2,
      caixa_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 400 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const parcela2 = db!
      .prepare('SELECT id FROM parcelas WHERE venda_id = ? AND numero = 2')
      .get(venda.id) as { id: number }
    pagarParcela(parcela2.id, 'pix', 1, 2)

    const linhas = recebimentosDaVenda(venda.id)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].origem_tipo).toBe('parcela')
    expect(linhas[0].parcela_numero).toBe(2)
    expect(linhas[0].conta_nome).toBe('Banco')
  })

  seTiverSqlite('venda sem lancamento nenhum devolve lista vazia, nao erro', () => {
    abrirTurno(1, 1, 0)
    const venda = criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pendente',
      data_vencimento: '2026-12-31',
      caixa_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 370 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    expect(recebimentosDaVenda(venda.id)).toEqual([])
  })

  seTiverSqlite('★ venda cujo id colide com o id de uma PARCELA nao vira parcela', () => {
    /*
     * ⚠️ `parcelas.id` e `vendas.id` sao duas contagens independentes, entao
     * elas se cruzam o tempo todo: aqui a venda 2 nasce quando ja existe a
     * parcela 2. Se o LEFT JOIN casar so por `p.id = m.origem_id`, sem exigir
     * que a origem seja 'parcela', o sinal da venda 2 sai na tela como
     * "Parcela 2" — de uma parcela de OUTRA venda, que nem foi paga.
     *
     * Este teste existe porque a mutacao que tira essa guarda ficou VERDE na
     * primeira rodada: a lista tinha o numero certo de linhas, so o rotulo e que
     * estava mentindo.
     */
    abrirTurno(1, 1, 0)
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'parcelado',
      data_vencimento: '2026-12-31',
      num_parcelas: 2,
      caixa_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 400 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const segunda = criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pendente',
      data_vencimento: '2026-12-31',
      entrada: 50,
      forma_entrada: 'dinheiro',
      caixa_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 370 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    // A armadilha so existe se os numeros realmente coincidirem.
    const parcelaHomonima = db!
      .prepare('SELECT numero FROM parcelas WHERE id = ?')
      .get(segunda.id) as { numero: number } | undefined
    expect(parcelaHomonima).toBeDefined()

    const linhas = recebimentosDaVenda(segunda.id)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].origem_tipo).toBe('venda')
    expect(linhas[0].parcela_numero).toBeNull()
  })

  seTiverSqlite('nao mistura o dinheiro de OUTRA venda', () => {
    // `origem_id` sozinho nao identifica nada: a parcela 7 e a venda 7 tem o
    // mesmo numero. O par com `origem_tipo` e o que separa as duas.
    abrirTurno(1, 1, 0)
    const umaEOutra = [370, 500].map((preco) =>
      criarVenda({
        cliente_id: 1,
        vendedor_id: 1,
        status_pagamento: 'pendente',
        data_vencimento: '2026-12-31',
        entrada: 50,
        forma_entrada: 'dinheiro',
        caixa_id: 1,
        itens: [{ produto_id: 1, quantidade: 1, preco_unitario: preco }]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    )
    for (const v of umaEOutra) {
      const linhas = recebimentosDaVenda(v.id)
      expect(linhas).toHaveLength(1)
      expect(linhas[0].valor).toBe(50)
    }
  })
})

/**
 * O interruptor do parcelamento e a venda a prazo SEM data.
 *
 * Os dois vieram do mesmo pedido: simplificar o balcao de uma loja sem cobrar a
 * conta das outras.
 */
describe('condicoes de pagamento por loja', () => {
  seTiverSqlite('★ loja que nunca respondeu OFERECE parcelamento', () => {
    // O padrao de quem nunca respondeu jamais pode mudar o comportamento de uma
    // loja que ja opera: crediario parcelado e o meio de vida de muita delas.
    db!.exec("DELETE FROM config WHERE chave = 'permitir_parcelamento'")
    expect(permiteParcelamento()).toBe(true)
  })

  seTiverSqlite('desligar e religar vale na hora, sem cache', () => {
    definirPermissaoParcelamento(false)
    expect(permiteParcelamento()).toBe(false)
    definirPermissaoParcelamento(true)
    expect(permiteParcelamento()).toBe(true)
  })

  seTiverSqlite('★ desligado, a venda parcelada que JA existe continua inteira', () => {
    /*
     * Desligar o parcelamento e decisao sobre o que a loja OFERECE daqui pra
     * frente. As parcelas ja combinadas sao divida de cliente: sumir com elas
     * seria esconder do lojista dinheiro que ele tem a receber.
     */
    abrirTurno(1, 1, 0)
    const venda = criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'parcelado',
      data_vencimento: '2026-12-31',
      num_parcelas: 2,
      caixa_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 400 }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    definirPermissaoParcelamento(false)

    const parcelas = db!
      .prepare('SELECT id, status FROM parcelas WHERE venda_id = ? ORDER BY numero')
      .all(venda.id) as Array<{ id: number; status: string }>
    expect(parcelas).toHaveLength(2)
    // e continua recebendo
    pagarParcela(parcelas[0].id, 'dinheiro', 1, null)
    const depois = db!
      .prepare('SELECT valor_pago FROM vendas WHERE id = ?')
      .get(venda.id) as { valor_pago: number }
    expect(depois.valor_pago).toBe(200)
  })
})

describe('venda a prazo sem data de vencimento', () => {
  const aPrazoSemData = (extras: Record<string, unknown> = {}) =>
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pendente',
      data_vencimento: null,
      caixa_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 370 }],
      ...extras
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

  seTiverSqlite('e aceita, e nasce devendo o total', () => {
    abrirTurno(1, 1, 0)
    const venda = aPrazoSemData()
    const gravada = db!
      .prepare('SELECT data_vencimento, total, valor_pago, status_pagamento FROM vendas WHERE id = ?')
      .get(venda.id) as { data_vencimento: string | null; total: number; valor_pago: number; status_pagamento: string }
    expect(gravada.data_vencimento).toBeNull()
    expect(gravada.total - gravada.valor_pago).toBe(370)
    expect(gravada.status_pagamento).toBe('pendente')
  })

  seTiverSqlite('★ NUNCA vira atrasada, porque nao ha prazo para vencer', () => {
    // Marcar de inadimplente uma venda sem prazo seria acusar o cliente de
    // furar um combinado que ninguem fez.
    //
    // ⚠️ A protecao e DUPLA, e de proposito: alem do filtro explicito
    // `data_vencimento IS NOT NULL`, a comparacao `date(NULL) < date('now')`
    // nunca e verdadeira em SQL. Tirar o filtro sozinho nao quebra nada — o
    // que quebra, e este teste pega, e enfiar um COALESCE numa data de 1900.
    abrirTurno(1, 1, 0)
    const venda = aPrazoSemData()
    promoverVendasVencidas()
    const depois = db!
      .prepare('SELECT status_pagamento FROM vendas WHERE id = ?')
      .get(venda.id) as { status_pagamento: string }
    expect(depois.status_pagamento).toBe('pendente')
  })

  seTiverSqlite('★ aparece no total em aberto SEM PRAZO', () => {
    // Esta soma e o que impede o dinheiro de sumir da vista do dono: a venda sem
    // data sai de toda conta ancorada em vencimento.
    abrirTurno(1, 1, 0)
    aPrazoSemData()
    expect(aReceberSemPrazo()).toBe(370)
  })

  seTiverSqlite('★ venda COM data nao entra nessa soma', () => {
    abrirTurno(1, 1, 0)
    aPrazoSemData({ data_vencimento: '2026-12-31' })
    expect(aReceberSemPrazo()).toBe(0)
  })

  seTiverSqlite('o sinal abate do que fica sem prazo', () => {
    abrirTurno(1, 1, 0)
    aPrazoSemData({ entrada: 70, forma_entrada: 'dinheiro' })
    expect(aReceberSemPrazo()).toBe(300)
  })

  seTiverSqlite('venda cancelada sai da soma', () => {
    abrirTurno(1, 1, 0)
    const venda = aPrazoSemData()
    cancelarVenda(venda.id, 2, 'cliente desistiu')
    expect(aReceberSemPrazo()).toBe(0)
  })

  seTiverSqlite('quitada sai da soma', () => {
    abrirTurno(1, 1, 0)
    const venda = aPrazoSemData()
    registrarPagamentoParcial(venda.id, 370, 'dinheiro', 1, null)
    expect(aReceberSemPrazo()).toBe(0)
  })
})
/**
 * O SINAL do pedido separado — o dinheiro que entra antes de a venda existir.
 *
 * ── O que estes testes prendem ──────────────────────────────────────────────
 *
 *  1. ★ **O dinheiro entra HOJE, no caixa de hoje.** A peça só sai na entrega,
 *     mas a nota entrou na gaveta agora, e é a contagem de hoje que descobre
 *     diferença.
 *
 *  2. ★ **E entra UMA VEZ SÓ.** Na entrega, o livro recebe apenas o que falta.
 *     Somar o sinal de novo faria a loja aparecer recebendo o dobro, e o
 *     fechamento do dia da entrega acusaria sobra do tamanho do sinal.
 *
 *  3. ★ **Cancelou, o sinal volta** — na mesma conta e na mesma forma. Sem
 *     isso o livro guardaria um dinheiro que já voltou para a mão do cliente.
 *
 * ⚠️ Antes disto existir, a tela do PDV aceitava o valor do sinal e o botão
 * "Separar pedido" o DESCARTAVA em silêncio.
 */
describe('o sinal do pedido separado', () => {
  const comBancoComoPadrao = (): void => {
    db!.exec(`
      UPDATE contas_financeiras SET padrao_recebimento = 0 WHERE id = 1;
      UPDATE contas_financeiras SET padrao_recebimento = 1 WHERE id = 2;
    `)
  }

  const pedidoComSinal = (extras: Record<string, unknown> = {}) =>
    criarPedido({
      cliente_id: 1,
      vendedor_id: 1,
      para_entrega: false,
      endereco_entrega: null,
      observacao: null,
      caixa_id: 1,
      itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 200 }],
      ...extras
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

  const movimentosDoPedido = (id: number) =>
    db!
      .prepare(
        `SELECT conta_id, valor, tipo, forma_pagamento
           FROM movimentos_financeiros
          WHERE origem_tipo = 'pedido' AND origem_id = ?
          ORDER BY id`
      )
      .all(id) as Array<{ conta_id: number; valor: number; tipo: string; forma_pagamento: string | null }>

  const totalNoLivro = (): number =>
    +(
      (db!.prepare('SELECT COALESCE(SUM(valor), 0) AS s FROM movimentos_financeiros').get() as {
        s: number
      }).s
    ).toFixed(2)

  seTiverSqlite('★ o sinal entra no livro no ato de separar', () => {
    abrirTurno(1, 1, 0)
    const { id } = pedidoComSinal({ sinal: 100, sinal_forma: 'debito', conta_id: 2 })
    const movs = movimentosDoPedido(id)
    expect(movs).toHaveLength(1)
    expect(movs[0]).toMatchObject({ valor: 100, conta_id: 2, forma_pagamento: 'debito' })
  })

  seTiverSqlite('★ sinal em especie cai na GAVETA, mesmo com banco como padrao', () => {
    // Mesma trava da venda: a nota esta na gaveta daquele operador, e a escolha
    // de conta e ignorada. Um segundo caminho com regra propria daria duas
    // respostas para a mesma pergunta.
    comBancoComoPadrao()
    abrirTurno(1, 1, 0)
    const { id } = pedidoComSinal({ sinal: 100, sinal_forma: 'dinheiro', conta_id: 2 })
    expect(movimentosDoPedido(id)[0].conta_id).toBe(1)
  })

  seTiverSqlite('pedido sem sinal nao lanca nada', () => {
    abrirTurno(1, 1, 0)
    const { id } = pedidoComSinal()
    expect(movimentosDoPedido(id)).toHaveLength(0)
  })

  seTiverSqlite('sinal igual ou maior que o total e recusado', () => {
    abrirTurno(1, 1, 0)
    expect(() => pedidoComSinal({ sinal: 200, sinal_forma: 'pix' })).toThrow(/n[ãa]o pode ser igual/i)
  })

  seTiverSqlite('★ forma invalida derruba o pedido INTEIRO', () => {
    /*
     * ⚠️ A validação acontece antes de gravar de propósito. Se o pedido fosse
     * criado e só o lançamento falhasse, sobraria uma peça reservada e um
     * dinheiro recebido sem registro nenhum — o pior dos dois mundos.
     */
    abrirTurno(1, 1, 0)
    const antes = (db!.prepare('SELECT COUNT(*) n FROM pedidos').get() as { n: number }).n
    expect(() => pedidoComSinal({ sinal: 50, sinal_forma: 'boleto' })).toThrow(/inv[áa]lida/i)
    const depois = (db!.prepare('SELECT COUNT(*) n FROM pedidos').get() as { n: number }).n
    expect(depois).toBe(antes)
    // e a peça não ficou reservada
    const reservado = (db!.prepare('SELECT reservado FROM produtos WHERE id = 1').get() as {
      reservado: number
    }).reservado
    expect(reservado).toBe(0)
  })

  seTiverSqlite('★ na entrega, o livro recebe SO o que falta', () => {
    // O teste que impede o dinheiro de ser contado duas vezes.
    abrirTurno(1, 1, 0)
    const { id } = pedidoComSinal({ sinal: 100, sinal_forma: 'pix', conta_id: 2 })
    expect(totalNoLivro()).toBe(100)

    concluirPedido(id, {
      vendedor_id: 1,
      caixa_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'dinheiro'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    // 100 do sinal + 100 na entrega = 200, o total do pedido. Nem mais, nem menos.
    expect(totalNoLivro()).toBe(200)
  })

  seTiverSqlite('★ a venda nasce sabendo que o sinal ja foi pago', () => {
    abrirTurno(1, 1, 0)
    const { id } = pedidoComSinal({ sinal: 60, sinal_forma: 'pix', conta_id: 2 })
    const venda = concluirPedido(id, {
      vendedor_id: 1,
      caixa_id: 1,
      status_pagamento: 'pendente',
      data_vencimento: '2026-12-31',
      forma_entrada: 'pix'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const gravada = db!
      .prepare('SELECT total, entrada, valor_pago FROM vendas WHERE id = ?')
      .get(venda.id) as { total: number; entrada: number; valor_pago: number }
    expect(gravada.total).toBe(200)
    expect(gravada.entrada).toBe(60)
    expect(gravada.valor_pago).toBe(60)
    // e o livro continua com 60 só: a entrega não recebeu nada ainda
    expect(totalNoLivro()).toBe(60)
  })

  seTiverSqlite('★ o historico da VENDA mostra o sinal que entrou pelo pedido', () => {
    // Sem isto a venda pareceria ter recebido só o da entrega, e o cliente
    // apareceria tendo pago menos do que pagou.
    abrirTurno(1, 1, 0)
    const { id } = pedidoComSinal({ sinal: 100, sinal_forma: 'pix', conta_id: 2 })
    const venda = concluirPedido(id, {
      vendedor_id: 1,
      caixa_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'dinheiro'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const linhas = recebimentosDaVenda(venda.id)
    expect(linhas).toHaveLength(2)
    expect(linhas[0]).toMatchObject({ tipo: 'sinal', valor: 100, conta_nome: 'Banco' })
    expect(linhas[1]).toMatchObject({ tipo: 'venda', valor: 100, conta_nome: 'Caixa da loja' })
  })

  seTiverSqlite('★ cancelar DEVOLVE o sinal, na mesma conta e forma', () => {
    abrirTurno(1, 1, 0)
    const { id } = pedidoComSinal({ sinal: 100, sinal_forma: 'pix', conta_id: 2 })
    cancelarPedido(id, 'cliente desistiu')

    const movs = movimentosDoPedido(id)
    expect(movs).toHaveLength(2)
    expect(movs[1]).toMatchObject({ valor: -100, conta_id: 2, tipo: 'estorno', forma_pagamento: 'pix' })
    expect(totalNoLivro()).toBe(0)
  })

  seTiverSqlite('cancelar pedido SEM sinal nao mexe no livro', () => {
    abrirTurno(1, 1, 0)
    const { id } = pedidoComSinal()
    cancelarPedido(id, 'desistiu')
    expect(totalNoLivro()).toBe(0)
    expect(movimentosDoPedido(id)).toHaveLength(0)
  })

  seTiverSqlite('★ sinal SEM caixa aberto e recusado na loja que exige', () => {
    /*
     * ⚠️ Dinheiro fora de turno some de toda conferencia. A trava e a mesma da
     * venda; o que muda e a condicao: separar peca sem dinheiro continua
     * podendo acontecer com o caixa fechado.
     */
    db!.exec("UPDATE config SET valor = '1' WHERE chave = 'exigir_caixa_aberto'")
    expect(() => pedidoComSinal({ sinal: 50, sinal_forma: 'pix', caixa_id: null })).toThrow(
      'CAIXA_FECHADO'
    )
    // e sem sinal passa normalmente
    expect(() => pedidoComSinal({ caixa_id: null })).not.toThrow()
  })

  seTiverSqlite('★ cancelar devolve a PECA junto com o dinheiro', () => {
    abrirTurno(1, 1, 0)
    const { id } = pedidoComSinal({ sinal: 100, sinal_forma: 'pix', conta_id: 2 })
    const reservadoAntes = (db!.prepare('SELECT reservado FROM produtos WHERE id = 1').get() as {
      reservado: number
    }).reservado
    expect(reservadoAntes).toBe(1)
    cancelarPedido(id, 'desistiu')
    const reservadoDepois = (db!.prepare('SELECT reservado FROM produtos WHERE id = 1').get() as {
      reservado: number
    }).reservado
    expect(reservadoDepois).toBe(0)
  })
})
