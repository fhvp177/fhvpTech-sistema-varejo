/**
 * A última unidade não pode ser vendida duas vezes.
 *
 * ── O que este teste realmente prende ───────────────────────────────────────
 * `criarVenda` confere o estoque ("Estoque insuficiente para...") e só DEPOIS
 * baixa, já dentro da transação. Entre a conferência e a baixa existe um vão —
 * e a transação NÃO cobre esse vão, porque ela começa depois da conferência.
 *
 * Hoje o vão está fechado, mas não por trava nenhuma do banco: está fechado
 * porque `criarVenda` é SÍNCRONA de ponta a ponta. O roteador do core despacha
 * handler síncrono sem envolver em promessa, e diz por quê com todas as letras
 * (packages/core/src/electron/roteador.ts): "handler síncrono tem que continuar
 * rodando até o fim sem ceder a vez, que é o que mantém venda concorrente
 * segura (conferir estoque e gravar sem brecha no meio)". Duas vendas ao mesmo
 * tempo — dois caixas, o PC e o notebook do multi-caixa — nunca se intercalam
 * porque o Node não tem onde interromper.
 *
 * Ou seja: a corretude de dinheiro está apoiada numa característica do driver
 * do banco (better-sqlite3 é síncrono), não numa regra escrita em algum lugar.
 *
 * ── Por que ele existe ──────────────────────────────────────────────────────
 * No dia em que `criarVenda` virar assíncrona — troca de driver, banco em rede,
 * ou um `await` inocente no meio dela — as duas chamadas passam a se
 * intercalar, as duas leem estoque 1, as duas vendem, e o estoque fica
 * NEGATIVO. Nada quebra em tempo de compilação. Nenhum outro teste fica
 * vermelho. Some mercadoria e ninguém sabe explicar por quê.
 *
 * Este teste é o alarme desse dia, e ele não existe para pegar quem quebra a
 * regra de propósito: existe para pegar quem mexe sem saber o que estava
 * segurando.
 *
 * ── O que fazer se ele ficar vermelho ───────────────────────────────────────
 * NÃO afrouxar a asserção. A correção é mover a conferência de estoque para
 * DENTRO da transação e tornar a baixa condicional, deixando o próprio banco
 * decidir quem chegou primeiro:
 *
 *   UPDATE produtos SET estoque = estoque - ? WHERE id = ? AND estoque >= ?
 *                       AND tipo != 'servico'
 *
 * e conferir `changes`: se voltou 0, alguém levou a última unidade no meio do
 * caminho — desfaz a transação e devolve "Estoque insuficiente".
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

// Schema no formato FINAL (depois das migrations) — mesmo padrão do
// fiscal.test.ts. Só as tabelas que `criarVenda` e o `buscarVendaPorId` do
// retorno encostam. `produtos.tipo` vem da 027_produto_tipo.
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
    tipo TEXT NOT NULL DEFAULT 'produto'
  );
  CREATE TABLE produto_variacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    tamanho TEXT NOT NULL,
    codigo_barras TEXT UNIQUE NOT NULL,
    estoque INTEGER NOT NULL DEFAULT 0
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
    cancelada INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE itens_venda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    variacao_id INTEGER,
    quantidade INTEGER NOT NULL,
    preco_unitario REAL NOT NULL
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

// Estoque começa em 1: a última peça da bancada, que é o caso que importa.
const SEED = `
  INSERT INTO vendedores (id, nome) VALUES (1, 'Ana');
  INSERT INTO produtos (id, nome, codigo_barras, preco, estoque, tipo)
    VALUES (1, 'Tela de reposição', '7891111111111', 100, 1, 'produto');
  INSERT INTO produtos (id, nome, codigo_barras, preco, estoque, tipo)
    VALUES (2, 'Capa protetora', '7892222222222', 50, 0, 'produto');
  INSERT INTO produtos (id, nome, codigo_barras, preco, estoque, tipo)
    VALUES (3, 'Mão de obra', '7894444444444', 80, 0, 'servico');
  INSERT INTO produto_variacoes (id, produto_id, tamanho, codigo_barras, estoque)
    VALUES (1, 2, 'M', '7893333333333', 1);
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

type Alvo = 'produto' | 'variacao' | 'servico'

const vendaDe = (alvo: Alvo) => ({
  cliente_id: null,
  vendedor_id: 1,
  status_pagamento: 'pago' as const,
  data_vencimento: null,
  forma_pagamento: 'dinheiro',
  itens: [
    alvo === 'produto'
      ? { produto_id: 1, quantidade: 1, preco_unitario: 100 }
      : alvo === 'variacao'
        ? { produto_id: 2, variacao_id: 1, quantidade: 1, preco_unitario: 50 }
        : { produto_id: 3, quantidade: 1, preco_unitario: 80 }
  ]
})

/**
 * Dispara N vendas do mesmo item "ao mesmo tempo", como N caixas fariam.
 *
 * Enquanto `criarVenda` for síncrona, a primeira roda até o fim antes de a
 * segunda sequer começar — e é exatamente essa propriedade que está sob teste.
 * No instante em que ela ganhar um ponto de espera interno, estas chamadas
 * passam a se intercalar de verdade e o vão descrito no topo se abre.
 */
const disparar = (n: number, alvo: Alvo = 'produto') =>
  Promise.allSettled(Array.from({ length: n }, async () => criarVenda(vendaDe(alvo))))

const estoqueProduto = (id: number) =>
  (db!.prepare('SELECT estoque FROM produtos WHERE id = ?').get(id) as { estoque: number }).estoque

const estoqueVariacao = (id: number) =>
  (db!.prepare('SELECT estoque FROM produto_variacoes WHERE id = ?').get(id) as { estoque: number })
    .estoque

const totalDeVendas = () =>
  (db!.prepare('SELECT COUNT(*) AS n FROM vendas').get() as { n: number }).n

const motivos = (r: PromiseSettledResult<unknown>[]) =>
  r.filter((x) => x.status === 'rejected').map((x) => String((x as PromiseRejectedResult).reason))

describe.runIf(sqlite)('duas vendas simultâneas da última unidade', () => {
  it('estoque nunca fica negativo', async () => {
    // A asserção que vale dinheiro. Estoque negativo significa que a loja
    // vendeu o que não tinha: um dos dois clientes vai embora sem a peça e o
    // sistema não avisou ninguém.
    await disparar(2)
    expect(
      estoqueProduto(1),
      'estoque negativo: a mesma unidade foi vendida duas vezes — leia o cabeçalho deste arquivo'
    ).toBeGreaterThanOrEqual(0)
    expect(estoqueProduto(1)).toBe(0)
  })

  it('exatamente uma passa e a outra é recusada por falta de estoque', async () => {
    const r = await disparar(2)
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(motivos(r)).toEqual([expect.stringMatching(/Estoque insuficiente/)])
  })

  it('grava uma venda só', async () => {
    // Complementa a asserção de estoque: se as duas gravassem e o estoque
    // ficasse certo por acaso, ainda haveria dinheiro cobrado em dobro.
    await disparar(2)
    expect(totalDeVendas()).toBe(1)
  })

  it('vale também para a última unidade de um TAMANHO da grade', async () => {
    // Caminho separado no código (produto_variacoes), com o mesmo vão. Uma
    // correção que só cobrisse `produtos` deixaria a grade desprotegida.
    const r = await disparar(2, 'variacao')
    expect(
      estoqueVariacao(1),
      'estoque negativo na variação: o caminho da grade de tamanhos ficou sem proteção'
    ).toBeGreaterThanOrEqual(0)
    expect(estoqueVariacao(1)).toBe(0)
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
  })

  it('aguenta a bancada inteira brigando pela mesma peça', async () => {
    // Cinco caixas, uma unidade. Quatro têm que ouvir "não tem".
    const r = await disparar(5)
    expect(estoqueProduto(1)).toBe(0)
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(motivos(r)).toHaveLength(4)
  })
})

describe.runIf(sqlite)('serviço não é limitado por estoque', () => {
  it('três atendimentos simultâneos passam e o estoque não se mexe', async () => {
    // O outro lado da moeda, exclusivo da assistência: mão de obra não acaba.
    // Se a proteção de concorrência for reescrita, ela não pode passar a
    // recusar serviço por "falta de estoque" — nem descontar estoque dele, que
    // é o que a guarda `tipo != 'servico'` do UPDATE impede.
    const r = await disparar(3, 'servico')
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(3)
    expect(estoqueProduto(3), 'estoque de serviço se moveu').toBe(0)
    expect(totalDeVendas()).toBe(3)
  })
})

describe.runIf(sqlite)('a garantia por trás disso', () => {
  it('criarVenda não pode virar assíncrona', () => {
    // Guarda direta e determinística do mecanismo, sem depender de
    // escalonamento: enquanto o retorno não for uma promessa, não existe ponto
    // onde outra venda se enfie entre a conferência e a baixa do estoque.
    //
    // Se este teste ficar vermelho, alguém tornou `criarVenda` assíncrona (ou
    // trocou o driver do banco por um assíncrono). A troca em si pode ser certa
    // — o que não pode é acontecer sem mover a conferência de estoque para
    // dentro da transação. Ver o cabeçalho deste arquivo.
    const resultado = criarVenda(vendaDe('produto'))
    expect(
      resultado,
      'criarVenda virou assíncrona: o vão entre conferir e baixar o estoque foi aberto'
    ).not.toBeInstanceOf(Promise)
  })
})
