/**
 * O comprovante de pagamento anexado à venda.
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 * O comprovante é PROVA de que o dinheiro entrou. Ele nasceu de um problema
 * concreto: a peça sai para entrega, o cliente paga por PIX na porta, o
 * entregador olha o print no celular do cliente e vai embora. Quando o valor
 * não aparece na conta, dias depois, não há nada.
 *
 * Cada asserção aqui corresponde a um jeito de essa prova valer menos do que
 * parece — e nenhum deles quebra nada visível.
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

const {
  anexarComprovante,
  obterComprovante,
  resumoComprovante,
  vendasComComprovante,
  removerComprovante
} = await import('../comprovantes')

const SCHEMA = `
  CREATE TABLE vendedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL
  );
  CREATE TABLE vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, total REAL NOT NULL
  );
  CREATE TABLE comprovantes_venda (
    venda_id INTEGER PRIMARY KEY REFERENCES vendas(id),
    mime TEXT NOT NULL,
    dados TEXT NOT NULL,
    tamanho INTEGER NOT NULL,
    nome_arquivo TEXT,
    anexado_por INTEGER,
    anexado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`

const SEED = `
  INSERT INTO vendedores (id, nome) VALUES (1, 'Ana'), (2, 'Gerente');
  INSERT INTO vendas (id, total) VALUES (1, 500), (2, 300), (3, 120);
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

/** Base64 válido de N caracteres — conteúdo não importa, formato sim. */
const base64De = (chars: number): string => 'A'.repeat(chars)

const anexar = (vendaId = 1, extras: Record<string, unknown> = {}) =>
  anexarComprovante({
    venda_id: vendaId,
    mime: 'image/jpeg',
    dados: base64De(400),
    nome_arquivo: 'pix.jpg',
    anexado_por: 1,
    ...extras
  })

describe('anexar e recuperar', () => {
  seTiverSqlite('guarda a imagem e devolve inteira', () => {
    anexar()
    const c = obterComprovante(1)!
    expect(c.dados).toBe(base64De(400))
    expect(c.mime).toBe('image/jpeg')
    expect(c.nome_arquivo).toBe('pix.jpg')
  })

  seTiverSqlite('venda sem comprovante devolve null, e não erro', () => {
    // A tela pergunta por TODA venda que abre. Erro aqui viraria uma mensagem
    // vermelha em toda venda que nunca teve anexo, que é a maioria.
    expect(obterComprovante(1)).toBeNull()
    expect(resumoComprovante(1)).toBeNull()
  })

  seTiverSqlite('★ o resumo NÃO traz a imagem', () => {
    /*
     * É o que a tela de detalhe pede ao abrir, e o que separa este recurso de
     * um que deixa o sistema lento.
     *
     * Se o resumo trouxesse `dados`, abrir qualquer venda carregaria a foto
     * inteira só para escrever "anexado por Ana às 14:20". Não quebraria nada —
     * só ficaria pior a cada mês, sem causa aparente.
     */
    anexar()
    const r = resumoComprovante(1)!
    expect(r).not.toHaveProperty('dados')
    expect(r.tamanho).toBeGreaterThan(0)
    expect(r.anexado_por_nome).toBe('Ana')
  })

  seTiverSqlite('★ anexar de novo SUBSTITUI, não empilha', () => {
    /*
     * Quem anexa duas vezes é porque a primeira saiu ilegível. Guardar as duas
     * criaria a pergunta "qual destes é o certo?" justamente na hora da
     * conferência, que é quando ninguém tem tempo para ela.
     */
    anexar()
    anexar(1, { dados: base64De(800), nome_arquivo: 'certo.jpg', anexado_por: 2 })

    const quantos = db!
      .prepare('SELECT COUNT(*) AS n FROM comprovantes_venda WHERE venda_id = 1')
      .get() as { n: number }
    expect(quantos.n).toBe(1)

    const c = obterComprovante(1)!
    expect(c.dados).toBe(base64De(800))
    expect(c.anexado_por_nome, 'quem trocou passa a ser quem anexou').toBe('Gerente')
  })

  seTiverSqlite('remover apaga só o daquela venda', () => {
    anexar(1)
    anexar(2)
    removerComprovante(1)
    expect(obterComprovante(1)).toBeNull()
    expect(obterComprovante(2)).not.toBeNull()
  })
})

describe('o que NÃO entra', () => {
  seTiverSqlite('★ recusa o que não é imagem', () => {
    /*
     * O que sai daqui vira `src` de uma <img> na tela. Aceitar qualquer tipo
     * transformaria a tela de vendas no lugar onde um conteúdo arbitrário é
     * interpretado — o pior lugar possível para descobrir o problema.
     */
    expect(() => anexar(1, { mime: 'application/pdf' })).toThrow(/imagem/i)
    expect(() => anexar(1, { mime: 'text/html' })).toThrow(/imagem/i)
    expect(obterComprovante(1)).toBeNull()
  })

  seTiverSqlite('★ recusa base64 malformado', () => {
    expect(() => anexar(1, { dados: '<script>alert(1)</script>' })).toThrow(/inválido/i)
    expect(() => anexar(1, { dados: 'curto' })).toThrow(/inválido/i)
    expect(obterComprovante(1)).toBeNull()
  })

  seTiverSqlite('★ recusa arquivo acima do teto, com o tamanho na mensagem', () => {
    /*
     * ⚠️ O teto existe DOS DOIS LADOS de propósito.
     *
     * O navegador reduz a imagem antes de mandar, e é onde isso é barato. Mas
     * quem chama pode não ser a tela: o canal é IPC e o segundo caixa fala com
     * ele pela rede. Confiar só na redução do cliente deixaria o tamanho do
     * banco — que é copiado e enviado para a nuvem a cada backup — na mão de
     * quem chama.
     */
    const gigante = base64De(3 * 1024 * 1024)
    expect(() => anexar(1, { dados: gigante })).toThrow(/limite é 2 MB/)
    expect(obterComprovante(1)).toBeNull()
  })

  seTiverSqlite('★ recusa comprovante de venda que não existe', () => {
    // Sem esta checagem ficaria um comprovante órfão, invisível em qualquer
    // tela e contando espaço no backup para sempre.
    expect(() => anexar(999)).toThrow(/não encontrada/i)
  })
})

describe('a lista de vendas', () => {
  seTiverSqlite('★ diz quais têm anexo em UMA consulta, sem trazer imagem', () => {
    anexar(1)
    anexar(3)
    const comAnexo = vendasComComprovante([1, 2, 3])
    expect(comAnexo.sort()).toEqual([1, 3])
  })

  seTiverSqlite('lista vazia não vira consulta', () => {
    // `IN ()` é erro de sintaxe no SQLite. A página sem vendas é o caso comum
    // numa loja que acabou de abrir.
    expect(vendasComComprovante([])).toEqual([])
  })
})

describe('onde o comprovante mora', () => {
  const AQUI = dirname(fileURLToPath(import.meta.url))

  it('★ o backup leva o comprovante junto porque ele está NO banco', () => {
    /*
     * ⚠️ A decisão de arquitetura inteira depende deste fato, e ele mora em
     * outro arquivo — por isso a guarda lê os dois.
     *
     * `criarZip` empacota exatamente `database.sqlite` e `metadata.json`. Nada
     * mais. Se alguém um dia mover o comprovante para uma pasta ao lado do
     * banco (o instinto natural para arquivos), ele deixa de existir em backup
     * nenhum, restaurar passa a apontar para arquivos que sumiram, e a loja
     * hospedada perde tudo na primeira troca de máquina — em silêncio, e
     * justamente com a prova de que o dinheiro entrou.
     *
     * Este teste fica vermelho no dia em que a coluna `dados` sair da tabela.
     */
    const migration = readFileSync(
      join(AQUI, '..', '..', '..', 'backup', 'migrations', '045_comprovante_venda.ts'),
      'utf-8'
    )
    expect(migration, 'a imagem deixou de ser guardada no banco')
      .toMatch(/dados TEXT NOT NULL/)

    const compactador = readFileSync(
      join(AQUI, '..', '..', '..', '..', '..', '..', 'packages', 'core', 'src', 'electron',
        'backup', 'Compactador.ts'),
      'utf-8'
    )
    expect(compactador, 'o backup passou a levar mais que o banco — reveja a decisão da 045')
      .toMatch(/archive\.file\(caminhoDbCopia, \{ name: 'database\.sqlite' \}\)/)
  })
})
