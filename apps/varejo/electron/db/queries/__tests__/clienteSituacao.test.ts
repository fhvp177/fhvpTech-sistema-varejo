/**
 * As tags do cliente e o custo congelado na venda.
 *
 * ── Por que estas duas coisas moram no mesmo arquivo ────────────────────────
 * As duas são contas que ninguém confere. A tag do cliente e o lucro do Painel
 * aparecem prontos na tela, sem nada ao lado para comparar — errados, eles
 * continuam parecendo certos por meses, e a decisão que sai deles (para quem
 * mandar promoção, por qual preço vender) sai errada junto.
 *
 * ── ⚠️ O que a escada de situações tem de traiçoeiro ────────────────────────
 * Não são cinco regras independentes: é uma ORDEM, e a ordem é a regra. Quem
 * comprou dez vezes e sumiu há seis meses cai em duas delas ao mesmo tempo, e o
 * degrau que ganha decide se o lojista vê "cliente fiel" ou "sumiu, corre atrás".
 *
 * Trocar a ordem não quebra nada, não dá erro, e continua devolvendo uma tag
 * plausível para todo mundo. É o motivo de existirem aqui dois testes que
 * testam SÓ a precedência.
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

const { listarClientes, resumoCaptacao, criarCliente, atualizarCliente } =
  await import('../clientes')
const { criarVenda } = await import('../vendas')

/*
 * ⚠️ Espelho ESCRITO À MÃO do schema real, como nos outros testes de consulta.
 * Ele já ficou para trás de uma coluna nova três vezes; quando isso acontece o
 * sintoma é "table X has no column named Y" no arquivo inteiro.
 */
const SCHEMA = `
  CREATE TABLE origens_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE COLLATE NOCASE
  );
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
    origem_id INTEGER,
    data_cadastro TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE vendedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, comissao_pct REAL
  );
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_barras TEXT UNIQUE,
    nome TEXT NOT NULL, preco REAL NOT NULL, custo REAL NOT NULL DEFAULT 0,
    garantia_dias INTEGER,
    estoque INTEGER DEFAULT 0, reservado INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE produto_variacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER NOT NULL,
    tamanho TEXT NOT NULL, codigo_barras TEXT UNIQUE, estoque INTEGER NOT NULL DEFAULT 0,
    reservado INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER, vendedor_id INTEGER,
    data DATETIME DEFAULT CURRENT_TIMESTAMP,
    total REAL NOT NULL, desconto REAL NOT NULL DEFAULT 0,
    entrada REAL NOT NULL DEFAULT 0, valor_pago REAL NOT NULL DEFAULT 0,
    status_pagamento TEXT DEFAULT 'pendente', data_vencimento DATE,
    num_parcelas INTEGER, forma_pagamento TEXT,
    cancelada INTEGER NOT NULL DEFAULT 0, comissao_pct REAL, observacao TEXT,
    turno_id INTEGER,
    cancelada_em TEXT, cancelada_por_id INTEGER, cancelamento_motivo TEXT
  );
  CREATE TABLE itens_venda (
    id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL, variacao_id INTEGER,
    quantidade INTEGER NOT NULL, preco_unitario REAL NOT NULL,
    custo_unitario REAL,
    garantia_dias INTEGER
  );
  CREATE TABLE parcelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER NOT NULL,
    numero INTEGER NOT NULL, valor REAL NOT NULL,
    data_vencimento DATE NOT NULL, status TEXT DEFAULT 'pendente', valor_pago REAL DEFAULT 0
  );
  CREATE TABLE devolucoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL,
    valor_total REAL NOT NULL
  );
  CREATE TABLE creditos_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER,
    tipo TEXT NOT NULL, valor REAL NOT NULL, venda_id INTEGER
  );
  CREATE TABLE contas_financeiras (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'banco', saldo_inicial REAL NOT NULL DEFAULT 0,
    ativa INTEGER NOT NULL DEFAULT 1, padrao_recebimento INTEGER NOT NULL DEFAULT 0,
    padrao_pagamento INTEGER NOT NULL DEFAULT 0, forma_padrao TEXT, criada_em TEXT
  );
  CREATE TABLE movimentos_financeiros (
    id INTEGER PRIMARY KEY AUTOINCREMENT, conta_id INTEGER NOT NULL,
    data TEXT NOT NULL, valor REAL NOT NULL, tipo TEXT NOT NULL,
    descricao TEXT, forma_pagamento TEXT, origem_tipo TEXT, origem_id INTEGER,
    turno_id INTEGER, vendedor_id INTEGER, criado_em TEXT
  );
  CREATE TABLE turnos_caixa (
    id INTEGER PRIMARY KEY AUTOINCREMENT, conta_id INTEGER NOT NULL,
    aberto_por INTEGER NOT NULL, aberto_em TEXT NOT NULL,
    fundo_troco REAL NOT NULL DEFAULT 0, fechado_por INTEGER, fechado_em TEXT,
    confirmado_por INTEGER, confirmado_em TEXT, justificativa TEXT,
    fora_de_hora INTEGER NOT NULL DEFAULT 0
  );
`

const SEED = `
  INSERT INTO vendedores (id, nome) VALUES (1, 'Ana');
  INSERT INTO produtos (id, nome, preco, custo, estoque) VALUES (1, 'Anel', 100, 40, 999);
  INSERT INTO origens_cliente (id, nome) VALUES (1, 'Instagram'), (2, 'Indicação');
  INSERT INTO contas_financeiras (id, nome, tipo, padrao_recebimento, forma_padrao)
    VALUES (1, 'Caixa da loja', 'caixa', 1, 'dinheiro');
  INSERT INTO turnos_caixa (id, conta_id, aberto_por, aberto_em)
    VALUES (1, 1, 1, datetime('now','localtime'));
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

/** Cadastra um cliente, opcionalmente com origem. */
function cliente(id: number, nome: string, origemId: number | null = null): void {
  db!
    .prepare('INSERT INTO clientes (id, nome, telefone, origem_id) VALUES (?, ?, ?, ?)')
    .run(id, nome, '(88) 9.0000-0000', origemId)
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

const situacaoDe = (id: number): string =>
  listarClientes().find((c) => c.id === id)!.situacao

describe('a escada de situações do cliente', () => {
  seTiverSqlite('cadastrado e nunca comprou é "sem compras"', () => {
    cliente(1, 'Nunca comprou')
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

  seTiverSqlite('★ quem sumiu depois de comprar muito é INATIVO, não recorrente', () => {
    /*
     * O degrau que mais importa da escada inteira.
     *
     * Este cliente satisfaz "três compras ou mais" com folga. Se "recorrente"
     * viesse antes de "inativo", ele apareceria como cliente fiel — e é
     * exatamente o contrário: comprou cinco vezes e sumiu há mais de meio ano.
     * É o cliente que o lojista precisa achar na lista para correr atrás.
     */
    cliente(1, 'Sumiu')
    for (const dias of [400, 380, 360, 340, 320]) compraHa(1, dias)
    expect(situacaoDe(1)).toBe('inativo')
  })

  seTiverSqlite('★ quem voltou depois do sumiço é REATIVADO, não recorrente', () => {
    /*
     * O segundo degrau que depende só da ordem.
     *
     * Cinco compras antigas e uma agora: pelo número, é recorrente. Mas ficou um
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
     * grudar para sempre. Sumiu, voltou há muito tempo, e desde então compra
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
    // sempre, e o relatório de captação contaria faturamento que não existiu.
    cliente(1, 'Cancelou')
    compraHa(1, 5)
    db!.prepare('UPDATE vendas SET cancelada = 1').run()
    expect(situacaoDe(1)).toBe('sem_compras')
  })
})

describe('o resumo de captação', () => {
  seTiverSqlite('separa quem só cadastrou de quem comprou', () => {
    cliente(1, 'Comprou', 1)
    cliente(2, 'Só olhou', 1)
    cliente(3, 'Indicado', 2)
    compraHa(1, 10, 250)
    compraHa(3, 10, 90)

    const insta = resumoCaptacao().find((l) => l.origem_nome === 'Instagram')!
    expect(insta.clientes, 'contou os cadastros do canal').toBe(2)
    expect(insta.compradores, 'só um dos dois comprou').toBe(1)
    expect(insta.total_comprado).toBe(250)
  })

  seTiverSqlite('★ "Não informado" existe como linha, e vai para o fim', () => {
    /*
     * Esconder os clientes sem origem faria a soma das linhas não bater com o
     * total de clientes da loja — e um relatório cujos números não fecham perde
     * a confiança do lojista inteiro, não só naquela linha.
     *
     * E ele vai para o FIM mesmo somando mais que todo mundo: não é um canal,
     * é a ausência da resposta. No topo, pareceria a melhor campanha da loja.
     */
    cliente(1, 'Antigo', null)
    cliente(2, 'Do insta', 1)
    compraHa(1, 5, 9999)
    compraHa(2, 5, 10)

    const linhas = resumoCaptacao()
    expect(linhas.map((l) => l.origem_nome)).toContain('Não informado')
    expect(linhas[linhas.length - 1].origem_nome).toBe('Não informado')
  })

  seTiverSqlite('os totais fecham com o número de clientes', () => {
    cliente(1, 'A', 1)
    cliente(2, 'B', 2)
    cliente(3, 'C', null)
    const soma = resumoCaptacao().reduce((s, l) => s + l.clientes, 0)
    expect(soma).toBe(3)
  })
})

describe('cadastrar cliente sem informar a origem', () => {
  /*
   * ⚠️⚠️ ESTA GUARDA É ESTRUTURAL, E NÃO POR ESCOLHA ────────────────────────
   *
   * Descobri isto tentando provar o teste vermelho, que é o único jeito de
   * descobrir: **os dois drivers de SQLite discordam em silêncio.**
   *
   *   • `better-sqlite3`, que roda na loja, LANÇA "missing named parameter"
   *     quando um @parametro do INSERT não vem no objeto.
   *   • `node:sqlite`, que roda nesta suíte, ACEITA e grava NULL.
   *
   * Ou seja: nenhum teste de comportamento desta suíte inteira consegue pegar
   * esse defeito. Eu havia escrito um — ele passava verde com o defeito posto,
   * que é pior do que não ter teste, porque parece cobertura.
   *
   * Sobra prender o conserto no código: a normalização com `?? null` antes do
   * `.run()`. Vale para toda coluna nova acrescentada a estes INSERTs, não só
   * para `origem_id`.
   */
  const FONTE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'clientes.ts'), 'utf-8')

  it('★ criarCliente normaliza a origem ausente antes de gravar', () => {
    /*
     * São TRÊS telas que montam este objeto à mão — Clientes, o cadastro rápido
     * do PDV e o da devolução — e as duas últimas passam pelo IPC como
     * `unknown`, então o compilador também não avisa. O sintoma em produção
     * seria o cadastro falhando no meio de uma venda, com o cliente no balcão.
     */
    expect(FONTE, 'criarCliente voltou a mandar `dados` cru para o INSERT')
      .toMatch(/const comPadroes = \{ \.\.\.dados, origem_id: dados\.origem_id \?\? null \}/)
    expect(FONTE, 'o INSERT deixou de usar o objeto normalizado')
      .toMatch(/\.run\(comPadroes\)/)
  })

  it('★ atualizarCliente normaliza do mesmo jeito', () => {
    expect(FONTE, 'atualizarCliente voltou a mandar `dados` cru')
      .toMatch(/\.run\(\{ \.\.\.dados, origem_id: dados\.origem_id \?\? null, id \}\)/)
  })

  seTiverSqlite('e o cliente sem origem realmente fica com origem nula', () => {
    /*
     * ⚠️ O defeito que este teste existe para impedir já estava posto, e passou
     * por typecheck e por toda a suíte.
     *
     * O INSERT de cliente usa parâmetros NOMEADOS (@origem_id). Acrescentar a
     * coluna quebra, em tempo de execução, todo caminho que monta o objeto à
     * mão sem ela — e são três: a tela de Clientes, o cadastro rápido do PDV e
     * o da devolução. Os dois últimos não são tipados contra `DadosCliente`
     * (vão como `unknown` pelo IPC), então o compilador não diz nada.
     *
     * O sintoma seria "missing named parameter: origem_id" no meio de uma
     * venda, com o cliente esperando no balcão.
     */
    const semOrigem = {
      nome: 'Cadastro rápido',
      telefone: '(88) 9.0000-0000',
      endereco: null,
      cpf: null,
      data_nascimento: null,
      tipo_pessoa: 'fisica' as const,
      cnpj: null,
      razao_social: null,
      observacao: null
    }
    // @ts-expect-error de propósito: é exatamente o objeto que o PDV mandava,
    // e o que um renderer de versão anterior manda para um backend novo.
    expect(() => criarCliente(semOrigem)).not.toThrow()
    expect(listarClientes()[0].origem_id).toBeNull()
  })

  seTiverSqlite('atualizar sem origem também não quebra', () => {
    cliente(1, 'Maria', 1)
    const semOrigem = {
      nome: 'Maria',
      telefone: '(88) 9.0000-0000',
      endereco: null,
      cpf: null,
      data_nascimento: null,
      tipo_pessoa: 'fisica' as const,
      cnpj: null,
      razao_social: null,
      observacao: null
    }
    // @ts-expect-error mesmo motivo do teste acima.
    expect(() => atualizarCliente(1, semOrigem)).not.toThrow()
  })
})

describe('o custo congela na venda', () => {
  const vendaDeUmAnel = () =>
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      caixa_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'dinheiro',
      itens: [{ produto_id: 1, variacao_id: null, quantidade: 1, preco_unitario: 100 }]
    })

  seTiverSqlite('★ a venda guarda o custo do dia, não uma referência ao produto', () => {
    cliente(1, 'Maria')
    vendaDeUmAnel()
    const item = db!.prepare('SELECT custo_unitario FROM itens_venda').get() as {
      custo_unitario: number
    }
    expect(item.custo_unitario).toBe(40)
  })

  seTiverSqlite('★ reajustar o preço de compra NÃO reescreve o lucro do passado', () => {
    /*
     * O defeito que o congelamento existe para impedir, e ele é silencioso.
     *
     * Antes, o custo das vendas era `quantidade * produtos.custo` — o custo de
     * HOJE, aplicado a uma venda de meses atrás. Bastava o fornecedor reajustar
     * e o lojista atualizar o cadastro para todo o lucro já visto encolher de
     * uma vez, sem que uma única venda tivesse mudado. Um mês fechado deixava de
     * bater com o que ele tinha anotado, e não havia como explicar a diferença.
     */
    cliente(1, 'Maria')
    vendaDeUmAnel()

    db!.prepare('UPDATE produtos SET custo = 90 WHERE id = 1').run()

    // A mesma conta que o Painel faz.
    const r = db!
      .prepare(
        `SELECT SUM(iv.quantidade * COALESCE(iv.custo_unitario, p.custo)) AS custo
           FROM itens_venda iv
           JOIN produtos p ON p.id = iv.produto_id`
      )
      .get() as { custo: number }
    expect(r.custo, 'o custo do passado seguiu o cadastro de hoje').toBe(40)
  })

  seTiverSqlite('venda antiga, sem custo congelado, cai no custo atual', () => {
    /*
     * O plano B, e ele é deliberado: as vendas anteriores à migration 043 não
     * têm como saber o custo da época, e essa informação não existe em lugar
     * nenhum. Elas seguem estimadas — o que não se pode é inventar um número e
     * apresentá-lo como fato.
     */
    cliente(1, 'Maria')
    vendaDeUmAnel()
    db!.prepare('UPDATE itens_venda SET custo_unitario = NULL').run()

    const r = db!
      .prepare(
        `SELECT SUM(iv.quantidade * COALESCE(iv.custo_unitario, p.custo)) AS custo
           FROM itens_venda iv
           JOIN produtos p ON p.id = iv.produto_id`
      )
      .get() as { custo: number }
    expect(r.custo).toBe(40)
  })

  it('★ o Painel PREFERE o custo congelado, e não só o dado existe gravado', () => {
    /*
     * ⚠️ Os testes acima rodam um SQL escrito aqui dentro. Eles provam que o
     * custo foi gravado certo — não que alguém o leia.
     *
     * Trocar a conta do Painel de volta por `p.custo` deixaria todos eles
     * verdes e o lucro errado do mesmo jeito de antes. Esta asserção é a que
     * prende o consumidor, e por isso lê o arquivo de verdade.
     */
    const aqui = dirname(fileURLToPath(import.meta.url))
    const dashboard = readFileSync(join(aqui, '..', 'dashboard.ts'), 'utf-8')
    expect(dashboard, 'o Painel voltou a ler só o custo de hoje')
      .toMatch(/SUM\(\s*iv\.quantidade\s*\*\s*COALESCE\(iv\.custo_unitario,\s*p\.custo\)\s*\)/)
  })

  seTiverSqlite('a observação da venda é gravada, e vazia vira NULL', () => {
    cliente(1, 'Maria')
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      caixa_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'dinheiro',
      observacao: '  Troca até 15/09  ',
      itens: [{ produto_id: 1, variacao_id: null, quantidade: 1, preco_unitario: 100 }]
    })
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      caixa_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'dinheiro',
      observacao: '   ',
      itens: [{ produto_id: 1, variacao_id: null, quantidade: 1, preco_unitario: 100 }]
    })

    const linhas = db!.prepare('SELECT observacao FROM vendas ORDER BY id').all() as Array<{
      observacao: string | null
    }>
    expect(linhas[0].observacao, 'guardou sem os espaços das pontas').toBe('Troca até 15/09')
    expect(linhas[1].observacao, 'só espaços é a mesma coisa que nada').toBeNull()
  })
})
