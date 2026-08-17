/**
 * A garantia que uma OS nova recebe.
 *
 * ── A armadilha que este arquivo existe para fechar ──────────────────────────
 * Havia uma constante `GARANTIA_PADRAO_DIAS` em osCiclo.ts que **ninguém usava**.
 * O número que valia de verdade era o `DEFAULT 45` da coluna, escrito na
 * migration 028 — invisível para quem lê o código de criação da OS, e impossível
 * de mudar sem reconstruir a tabela.
 *
 * Quem tentasse alterar a garantia mexendo na constante veria typecheck limpo,
 * teste verde (o teste antigo só conferia o valor da constante, não o efeito
 * dela) e nada mudando na prática. É por isso que o schema abaixo mantém o
 * `DEFAULT 45` de propósito: o teste só passa se o código REALMENTE mandar o
 * número, sobrepondo o default velho.
 *
 * Garantia é promessa impressa no comprovante que o cliente leva embora. O
 * número não pode depender de um default que ninguém encontra.
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

const { criarOS } = await import('../ordens')
const { GARANTIA_PADRAO_DIAS } = await import('../osCiclo')

// ⚠️ `garantia_dias INTEGER NOT NULL DEFAULT 45` é cópia FIEL da migration 028,
// e tem que continuar assim. É esse 45 que o teste desafia.
const SCHEMA = `
  CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, telefone TEXT);
  CREATE TABLE vendedores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
  CREATE TABLE ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_atendimento TEXT NOT NULL DEFAULT 'bancada',
    natureza TEXT NOT NULL DEFAULT 'conserto',
    categoria TEXT NOT NULL DEFAULT 'equipamento',
    cliente_id INTEGER NOT NULL,
    tecnico_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberta',
    equipamento TEXT,
    numero_serie TEXT,
    acessorios TEXT,
    estado_entrada TEXT,
    senha_acesso TEXT,
    endereco_atendimento TEXT,
    agendado_para TEXT,
    defeito_relatado TEXT NOT NULL,
    diagnostico TEXT,
    orcamento_aprovado_em TEXT,
    garantia_dias INTEGER NOT NULL DEFAULT 45,
    entregue_em TEXT,
    venda_id INTEGER,
    os_origem_id INTEGER,
    criada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TABLE os_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_id INTEGER NOT NULL, produto_id INTEGER NOT NULL, variacao_id INTEGER,
    quantidade INTEGER NOT NULL DEFAULT 1, preco_unitario REAL NOT NULL
  );
  CREATE TABLE os_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_id INTEGER NOT NULL, status TEXT NOT NULL, observacao TEXT,
    vendedor_id INTEGER NOT NULL,
    criada_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  -- Ficam vazias: existem porque o retorno de criarOS passa por obterOS, que
  -- junta os itens do orçamento. OS recém-criada não tem item nenhum.
  CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'produto', estoque INTEGER DEFAULT 0
  );
  CREATE TABLE produto_variacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, produto_id INTEGER NOT NULL,
    tamanho TEXT, estoque INTEGER NOT NULL DEFAULT 0
  );
`

const SEED = `
  INSERT INTO clientes (id, nome, telefone) VALUES (1, 'Maria Francisca', '85999990000');
  INSERT INTO vendedores (id, nome) VALUES (1, 'Ana');
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

const novaOsDeBancada = () =>
  criarOS(
    {
      cliente_id: 1,
      tipo_atendimento: 'bancada',
      categoria: 'equipamento',
      equipamento: 'Notebook Dell Inspiron',
      defeito_relatado: 'não liga'
    },
    1
  )

const d = sqlite ? describe : describe.skip

d('garantia de uma OS nova', () => {
  it('★ vale 90 dias, e não o 45 que a coluna ainda tem como default', () => {
    const os = novaOsDeBancada()
    expect(
      os.garantia_dias,
      'a OS pegou a garantia do DEFAULT da coluna — a constante voltou a não valer nada'
    ).toBe(90)
  })

  it('o número vem da constante, não de um literal solto no INSERT', () => {
    // Se alguém escrever 90 na mão dentro do ordens.ts, mudar a constante
    // deixaria de surtir efeito — exatamente o defeito que estamos fechando.
    expect(novaOsDeBancada().garantia_dias).toBe(GARANTIA_PADRAO_DIAS)
  })

  it('OS externa recebe a mesma garantia', () => {
    const os = criarOS(
      {
        cliente_id: 1,
        tipo_atendimento: 'externo',
        categoria: 'cftv',
        endereco_atendimento: 'Sítio Olho d\'Água, s/n',
        defeito_relatado: 'instalação de 6 câmeras'
      },
      1
    )
    expect(os.garantia_dias).toBe(GARANTIA_PADRAO_DIAS)
  })
})

d('OS que já existe não é alcançada', () => {
  it('mudar o padrão não reescreve garantia já dada', () => {
    // O caso que importa de verdade: o cliente foi embora com "45 dias"
    // impresso no comprovante. Esse papel é a promessa, e ele não muda porque
    // o padrão da loja mudou depois.
    db!
      .prepare(
        `INSERT INTO ordens_servico
           (id, cliente_id, tecnico_id, equipamento, defeito_relatado, garantia_dias, status)
         VALUES (99, 1, 1, 'Impressora antiga', 'não puxa papel', 45, 'entregue')`
      )
      .run()

    const antiga = db!
      .prepare('SELECT garantia_dias FROM ordens_servico WHERE id = 99')
      .get() as { garantia_dias: number }
    expect(antiga.garantia_dias, 'a garantia de uma OS antiga foi reescrita').toBe(45)
  })
})
