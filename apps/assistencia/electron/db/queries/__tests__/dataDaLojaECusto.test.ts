/**
 * Duas contas que ninguém confere: a HORA em que a venda foi gravada e o CUSTO
 * que ela usa para calcular lucro.
 *
 * ── ⚠️ CURRENT_TIMESTAMP é UTC, sempre ─────────────────────────────────────
 * Não é configuração que alguém esqueceu: é a definição da função no SQLite, em
 * qualquer fuso da máquina. `vendas.data` dependia desse default, enquanto
 * `ordens_servico.criada_em` sempre foi gravada em hora local. A MESMA OS
 * registrava:
 *
 *     ordens_servico.criada_em → 2026-09-06 22:42  (hora da bancada)
 *     vendas.data              → 2026-09-07 01:42  (UTC)
 *
 * Mesmo instante, três horas e um DIA de diferença. O faturamento do dia filtra
 * `date(v.data)`, então toda entrega feita depois das 21h caía num dia na tela
 * de Ordens e no outro no relatório — os dois números certos isoladamente, e a
 * diferença sem explicação em lugar nenhum.
 *
 * ── Por que a guarda do fuso lê o SQL em vez de medir o relógio ─────────────
 * Comparar o valor gravado com "agora" só reprova numa máquina fora de UTC. Na
 * integração contínua, que roda em UTC, os dois são iguais e o teste passaria
 * verde com o defeito posto — o pior tipo de guarda. Ler o SQL responde a
 * pergunta certa em qualquer lugar.
 *
 * ── ⚠️ E o custo, que reescrevia o passado ──────────────────────────────────
 * O lucro era `quantidade * produtos.custo`: o custo de HOJE aplicado a uma
 * venda de meses atrás. Bastava o distribuidor reajustar a peça e alguém
 * atualizar o cadastro para todo o lucro já visto encolher de uma vez, sem que
 * nenhuma venda tivesse mudado.
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

const { criarVenda } = await import('../vendas')

/*
 * ⚠️ Espelho ESCRITO À MÃO do schema real, como nos outros testes de consulta
 * deste app. Quando ele fica para trás de uma coluna nova, o sintoma é
 * "table X has no column named Y" no arquivo inteiro.
 */
const SCHEMA = `
  CREATE TABLE vendedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
    ativo INTEGER NOT NULL DEFAULT 1
  );
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
    reservado INTEGER NOT NULL DEFAULT 0,
    tipo TEXT NOT NULL DEFAULT 'produto'
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
    observacao TEXT,
    turno_id INTEGER,
    cancelada INTEGER NOT NULL DEFAULT 0
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
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
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
`

/*
 * A peça custa 40 e é vendida por 100. A mão de obra custa 0 de propósito:
 * serviço sem custo cadastrado é o caso comum da oficina, e ele precisa gravar
 * ZERO, não NULL — ver o teste da distinção lá embaixo.
 */
const SEED = `
  -- ⚠️ Esta oficina de teste NÃO exige caixa aberto para vender.
  --
  -- Os testes daqui são sobre outra coisa (custo congelado, corrida por
  -- estoque), e exigir turno obrigaria cada um a abrir caixa antes de chegar
  -- ao que interessa. Fica declarado no fonte em vez de depender do padrão —
  -- que é LIGADO, e muda de significado se alguém mexer nele.
  INSERT INTO config (chave, valor) VALUES ('exigir_caixa_aberto', '0');
  INSERT INTO vendedores (id, nome) VALUES (1, 'Ana');
  INSERT INTO clientes (id, nome) VALUES (1, 'Maria');
  INSERT INTO produtos (id, nome, codigo_barras, preco, custo, estoque, tipo)
    VALUES (1, 'Tela de reposição', '7891111111111', 100, 40, 10, 'produto');
  INSERT INTO produtos (id, nome, codigo_barras, preco, custo, estoque, tipo)
    VALUES (2, 'Mão de obra', '7892222222222', 80, 0, 0, 'servico');
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
          db!.exec(p === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
          throw e
        }
      }
  }
})

const AQUI = dirname(fileURLToPath(import.meta.url))
const QUERIES = join(AQUI, '..')

/** O trecho do INSERT numa tabela, do `INSERT INTO x` até a crase de fechamento. */
function insertDe(fonte: string, tabela: string): string {
  const i = fonte.indexOf(`INSERT INTO ${tabela} (`)
  expect(i, `não achei o INSERT em ${tabela} — a varredura quebrou`).toBeGreaterThan(-1)
  return fonte.slice(i, fonte.indexOf('`', i))
}

/*
 * Cada linha: o arquivo, a tabela e a coluna de data que ele precisa preencher.
 * Tabela nova com coluna de data entra aqui junto com ela.
 */
const GRAVAM_DATA: Array<{ arquivo: string; tabela: string; coluna: string }> = [
  { arquivo: 'vendas.ts', tabela: 'vendas', coluna: 'data' },
  { arquivo: 'clientes.ts', tabela: 'clientes', coluna: 'data_cadastro' },
  { arquivo: 'produtos.ts', tabela: 'produtos', coluna: 'data_cadastro' }
]

describe('as datas gravadas são a hora da loja', () => {
  for (const { arquivo, tabela, coluna } of GRAVAM_DATA) {
    it(`★ ${tabela}.${coluna} é escrita explicitamente, em hora local`, () => {
      /*
       * ⚠️ A coluna precisa aparecer na LISTA do INSERT.
       *
       * Omiti-la não dá erro: o SQLite cai no default da coluna, que é
       * `CURRENT_TIMESTAMP` — ou seja, volta silenciosamente para UTC. É
       * exatamente assim que o defeito existia, e é o que esta linha impede.
       */
      const sql = insertDe(readFileSync(join(QUERIES, arquivo), 'utf-8'), tabela)

      expect(
        sql,
        `${tabela}: a coluna ${coluna} saiu da lista do INSERT — sem ela o ` +
          'SQLite usa o default da tabela, que é CURRENT_TIMESTAMP (UTC)'
      ).toContain(coluna)

      expect(sql, `${tabela}: a data deixou de ser gravada em hora local`).toContain(
        "datetime('now','localtime')"
      )
    })
  }

  it('★ nenhum INSERT usa CURRENT_TIMESTAMP', () => {
    /*
     * A porta dos fundos: escrever `CURRENT_TIMESTAMP` à mão no INSERT passaria
     * na asserção acima (a coluna está lá) e gravaria UTC do mesmo jeito.
     */
    for (const { arquivo } of GRAVAM_DATA) {
      const fonte = readFileSync(join(QUERIES, arquivo), 'utf-8')
      const emInsert = [...fonte.matchAll(/INSERT INTO \w+ \([\s\S]*?\)`/g)]
        .map((m) => m[0])
        .filter((s) => s.includes('CURRENT_TIMESTAMP'))
      expect(emInsert, `${arquivo}: INSERT gravando CURRENT_TIMESTAMP, que é UTC`).toEqual([])
    }
  })
})

describe('o custo congela na venda', () => {
  const vendaDaTela = () =>
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'dinheiro',
      itens: [{ produto_id: 1, variacao_id: null, quantidade: 1, preco_unitario: 100 }]
    })

  seTiverSqlite('★ a venda guarda o custo do dia, não uma referência ao produto', () => {
    vendaDaTela()
    const item = db!.prepare('SELECT custo_unitario FROM itens_venda').get() as {
      custo_unitario: number
    }
    expect(item.custo_unitario).toBe(40)
  })

  seTiverSqlite('★ reajustar o preço de compra NÃO reescreve o lucro do passado', () => {
    /*
     * O defeito que o congelamento existe para impedir, e ele é silencioso: um
     * mês já fechado deixava de bater com o que o dono tinha anotado, e não
     * havia como explicar a diferença.
     */
    vendaDaTela()
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
    vendaDaTela()
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

  seTiverSqlite('★ mão de obra sem custo grava ZERO, e não "não sei"', () => {
    /*
     * ⚠️ Aqui peça e serviço dividem a tabela `produtos`, então o serviço passa
     * pelo mesmo caminho — e é onde a distinção entre 0 e NULL vale.
     *
     * Serviço de cortesia custa zero DE VERDADE; venda antiga não sabe quanto
     * custou. Se o zero virasse NULL, o COALESCE cairia no custo atual do
     * cadastro e o lucro da mão de obra passaria a mudar sozinho no dia em que
     * alguém preenchesse o custo da hora do técnico.
     */
    criarVenda({
      cliente_id: 1,
      vendedor_id: 1,
      status_pagamento: 'pago',
      data_vencimento: null,
      forma_pagamento: 'dinheiro',
      itens: [{ produto_id: 2, variacao_id: null, quantidade: 1, preco_unitario: 80 }]
    })
    const item = db!.prepare('SELECT custo_unitario FROM itens_venda').get() as {
      custo_unitario: number | null
    }
    expect(item.custo_unitario).toBe(0)
    expect(item.custo_unitario).not.toBeNull()
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
    const dashboard = readFileSync(join(QUERIES, 'dashboard.ts'), 'utf-8')
    expect(dashboard, 'o Painel voltou a ler só o custo de hoje').toMatch(
      /SUM\(\s*iv\.quantidade\s*\*\s*COALESCE\(iv\.custo_unitario,\s*p\.custo\)\s*\)/
    )
  })
})
