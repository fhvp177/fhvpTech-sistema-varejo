import { vi, describe, it, expect, beforeAll } from 'vitest'

// Teste de integração da importação de NF-e contra um banco SQLite DE VERDADE.
//
// O better-sqlite3 do repo é compilado pro ABI do Electron (rebuildar pro Node
// quebraria o app), então usamos o node:sqlite embutido do Node por trás de um
// adaptador com a mesma cara (prepare/run/get/all/transaction) — o mesmo truque
// do smoke test da v1.22. O que roda aqui é o código REAL das queries e da
// migration 028; só a conexão é trocada.
//
// node:sqlite precisa do flag --experimental-sqlite no Node 22; sem ele a
// suíte inteira é pulada (não falha o `npm test` de quem rodar sem o flag).

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

type Adaptador = {
  exec: (sql: string) => void
  pragma: (sql: string) => void
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

import {
  analisarNota,
  importarNotaEntrada,
  listarNotasEntrada,
  mesesComNotas,
  xmlsDoMes,
  type DadosImportacao
} from '../notasEntrada'
import { criarProduto, buscarProdutoPorCodigoBarras } from '../produtos'
import { aplicar028NotasEntrada } from '../../../backup/migrations/028_notas_entrada'
import { aplicar029ProdutoReferencia } from '../../../backup/migrations/029_produto_referencia'
import type Database from 'better-sqlite3'

function criarBancoDeTeste(mod: typeof import('node:sqlite')): Adaptador {
  const db = new mod.DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  let profundidade = 0
  return {
    exec: (sql) => db.exec(sql),
    pragma: (sql) => db.exec(`PRAGMA ${sql}`),
    prepare: (sql) => {
      const st = db.prepare(sql)
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: (...args: unknown[]) => st.run(...(args as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: (...args: unknown[]) => st.get(...(args as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all: (...args: unknown[]) => st.all(...(args as any[]))
      }
    },
    // Emula o transaction aninhável do better-sqlite3 (savepoints)
    transaction:
      (fn) =>
      (...args) => {
        const sp = `sp_${profundidade}`
        db.exec(profundidade === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
        profundidade++
        try {
          const r = fn(...args)
          profundidade--
          db.exec(profundidade === 0 ? 'COMMIT' : `RELEASE ${sp}`)
          return r
        } catch (e) {
          profundidade--
          db.exec(profundidade === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
          throw e
        }
      }
  }
}

// Schema mínimo que a importação toca (espelho do schema.ts + migration 001)
const SCHEMA = `
  CREATE TABLE fornecedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL, cnpj TEXT, telefone TEXT, email TEXT, endereco TEXT
  );
  CREATE TABLE produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_barras TEXT UNIQUE, nome TEXT NOT NULL, categoria TEXT,
    preco REAL NOT NULL, custo REAL NOT NULL DEFAULT 0, estoque INTEGER DEFAULT 0,
    fornecedor_id INTEGER, data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
  );
  CREATE TABLE produto_variacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL, tamanho TEXT NOT NULL,
    codigo_barras TEXT UNIQUE NOT NULL, estoque INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
  );
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE _migrations (nome TEXT PRIMARY KEY, data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP);
`

const CHAVE_1 = '35260712345678000199550010000012341000012349'
const CHAVE_2 = '35260812345678000199550010000012350000012350'
const CHAVE_3 = '35260912345678000199550010000012360000012351'

const itemXml = (cprod: string, descricao: string, quantidade: number, custo: number) => ({
  cprod,
  descricao,
  ncm: '61044400',
  cfop: '5102',
  unidade: 'UN',
  quantidade,
  custoUnitario: custo
})

const notaBase = (chave: string, numero: string): DadosImportacao['nota'] => ({
  chave,
  numero,
  serie: '1',
  modelo: '55',
  dataEmissao: '2026-07-10T14:30:00-03:00',
  valorTotal: 500,
  xml: `<NFe><infNFe Id="NFe${chave}"/></NFe>`
})

const fornecedorXml = {
  id: null as number | null,
  nome: 'CONFECCOES EXEMPLO LTDA',
  cnpj: '12345678000199',
  telefone: '8533334444',
  endereco: 'RUA DAS FABRICAS, 100 - CENTRO - FORTALEZA/CE'
}

const d = sqlite ? describe : describe.skip

d('importação de NF-e (banco real via node:sqlite)', () => {
  beforeAll(() => {
    banco = criarBancoDeTeste(sqlite!)
    banco.exec(SCHEMA)
    // Produto "legado", de antes da coluna referencia existir — a migration 029
    // precisa numerá-lo no backfill.
    banco.exec(
      "INSERT INTO produtos (codigo_barras, nome, preco, custo, estoque) VALUES ('7890000000001', 'PRODUTO LEGADO', 10, 5, 3)"
    )
    aplicar028NotasEntrada(banco as unknown as Database.Database)
    aplicar029ProdutoReferencia(banco as unknown as Database.Database)
  })

  it('a migration 028 cria as tabelas e se registra', () => {
    const tabelas = banco!
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
    const nomes = tabelas.map((t) => t.name)
    expect(nomes).toContain('notas_entrada')
    expect(nomes).toContain('notas_entrada_itens')
    expect(nomes).toContain('fornecedor_produtos')
    expect(
      banco!.prepare('SELECT 1 FROM _migrations WHERE nome = ?').get('028_notas_entrada')
    ).toBeTruthy()
  })

  it('análise em banco vazio: nada reconhecido, fornecedor desconhecido', () => {
    const a = analisarNota(CHAVE_1, '12345678000199', [
      { nItem: 1, cprod: '0451', ean: null },
      { nItem: 2, cprod: 'PM-889', ean: '7891234567895' }
    ])
    expect(a.notaJaImportada).toBeNull()
    expect(a.fornecedorExistente).toBeNull()
    expect(a.matches).toHaveLength(0)
    expect(a.margemPadrao).toBeNull()
  })

  it('importa a 1ª nota: fornecedor + produto simples + produto de grade', () => {
    const resumo = importarNotaEntrada({
      nota: notaBase(CHAVE_1, '1234'),
      fornecedor: fornecedorXml,
      linhas: [
        {
          tipo: 'novo',
          nome: 'PNEU DIANTEIRO MOTO 90/90-19',
          categoria: null,
          preco: 177,
          custo: 118,
          codigo_barras: '7891234567895',
          item: itemXml('PM-889', 'PNEU DIANTEIRO MOTO 90/90-19', 2, 118)
        },
        {
          tipo: 'novo',
          nome: 'VESTIDO LONGO AZUL',
          categoria: 'Roupas',
          preco: 90,
          custo: 45,
          codigo_barras: null,
          variacoes: [
            {
              tamanho: 'M',
              codigo_barras: '7890000000017',
              item: itemXml('0451', 'VESTIDO LONGO AZUL M', 3, 45)
            },
            {
              tamanho: 'G',
              codigo_barras: '7890000000024',
              item: itemXml('0452', 'VESTIDO LONGO AZUL G', 2, 45)
            }
          ]
        }
      ],
      margemUsada: { valor: 50, tipo: 'pct' }
    })

    expect(resumo.produtosNovos).toBe(2)
    expect(resumo.reposicoes).toBe(0)
    expect(resumo.fornecedorNovo).toBe(true)

    const fornecedor = banco!
      .prepare('SELECT * FROM fornecedores WHERE id = ?')
      .get(resumo.fornecedorId) as { nome: string; cnpj: string }
    expect(fornecedor.nome).toBe('CONFECCOES EXEMPLO LTDA')
    expect(fornecedor.cnpj).toBe('12.345.678/0001-99') // guardado com máscara

    const pneu = banco!
      .prepare('SELECT * FROM produtos WHERE codigo_barras = ?')
      .get('7891234567895') as { estoque: number; custo: number; preco: number; fornecedor_id: number }
    expect(pneu.estoque).toBe(2)
    expect(pneu.custo).toBe(118)
    expect(pneu.fornecedor_id).toBe(resumo.fornecedorId)

    const vestido = banco!
      .prepare('SELECT * FROM produtos WHERE nome = ?')
      .get('VESTIDO LONGO AZUL') as { id: number; codigo_barras: string | null; estoque: number }
    expect(vestido.codigo_barras).toBeNull() // grade: código vive nos tamanhos
    const variacoes = banco!
      .prepare('SELECT tamanho, estoque FROM produto_variacoes WHERE produto_id = ? ORDER BY tamanho')
      .all(vestido.id) as Array<{ tamanho: string; estoque: number }>
    expect(variacoes).toEqual([
      { tamanho: 'G', estoque: 2 },
      { tamanho: 'M', estoque: 3 }
    ])

    expect(
      (banco!.prepare('SELECT COUNT(*) AS n FROM notas_entrada_itens').get() as { n: number }).n
    ).toBe(3)
    expect(
      (banco!.prepare('SELECT COUNT(*) AS n FROM fornecedor_produtos').get() as { n: number }).n
    ).toBe(3)
    expect(
      (banco!.prepare("SELECT valor FROM config WHERE chave = 'nfe_margem_padrao'").get() as { valor: string }).valor
    ).toBe('50')
  })

  it('na 2ª análise o sistema reconhece tudo: EAN, vínculo e fornecedor', () => {
    const a = analisarNota(CHAVE_2, '12.345.678/0001-99', [
      { nItem: 1, cprod: 'PM-889', ean: '7891234567895' },
      { nItem: 2, cprod: '0451', ean: null }, // SEM GTIN → só o vínculo salva
      { nItem: 3, cprod: 'XX-INEXISTENTE', ean: null }
    ])
    expect(a.notaJaImportada).toBeNull() // chave nova
    expect(a.fornecedorExistente?.nome).toBe('CONFECCOES EXEMPLO LTDA')
    expect(a.margemPadrao).toEqual({ valor: 50, tipo: 'pct' })

    expect(a.matches).toHaveLength(2)
    const porItem = new Map(a.matches.map((m) => [m.nItem, m]))
    expect(porItem.get(1)?.origem).toBe('ean')
    expect(porItem.get(1)?.produto_nome).toBe('PNEU DIANTEIRO MOTO 90/90-19')
    const vinculo = porItem.get(2)
    expect(vinculo?.origem).toBe('vinculo')
    expect(vinculo?.variacao_tamanho).toBe('M')
    expect(vinculo?.estoque_atual).toBe(3)

    const repetida = analisarNota(CHAVE_1, null, [])
    expect(repetida.notaJaImportada?.numero).toBe('1234')
  })

  it('reposição: soma estoque no alvo certo e só mexe no preço se pedido', () => {
    const pneuAntes = banco!
      .prepare('SELECT id FROM produtos WHERE codigo_barras = ?')
      .get('7891234567895') as { id: number }
    const variacaoM = banco!
      .prepare("SELECT id, produto_id FROM produto_variacoes WHERE tamanho = 'M'")
      .get() as { id: number; produto_id: number }

    const resumo = importarNotaEntrada({
      nota: notaBase(CHAVE_2, '1250'),
      fornecedor: { ...fornecedorXml, id: null }, // mesmo CNPJ mas id null: análise não rodou? o import confia no id
      linhas: [
        {
          tipo: 'reposicao',
          produto_id: pneuAntes.id,
          variacao_id: null,
          novo_custo: 120,
          novo_preco: 180,
          item: itemXml('PM-889', 'PNEU DIANTEIRO MOTO 90/90-19', 2, 120)
        },
        {
          tipo: 'reposicao',
          produto_id: variacaoM.produto_id,
          variacao_id: variacaoM.id,
          novo_custo: 45,
          novo_preco: null, // manter o preço de venda
          item: itemXml('0451', 'VESTIDO LONGO AZUL M', 5, 45)
        }
      ]
    })
    expect(resumo.reposicoes).toBe(2)
    expect(resumo.produtosNovos).toBe(0)

    const pneu = banco!
      .prepare('SELECT estoque, custo, preco FROM produtos WHERE id = ?')
      .get(pneuAntes.id) as { estoque: number; custo: number; preco: number }
    expect(pneu.estoque).toBe(4) // 2 + 2
    expect(pneu.custo).toBe(120)
    expect(pneu.preco).toBe(180)

    const m = banco!
      .prepare('SELECT estoque FROM produto_variacoes WHERE id = ?')
      .get(variacaoM.id) as { estoque: number }
    expect(m.estoque).toBe(8) // 3 + 5
    const vestido = banco!
      .prepare('SELECT preco, custo FROM produtos WHERE id = ?')
      .get(variacaoM.produto_id) as { preco: number; custo: number }
    expect(vestido.preco).toBe(90) // preço mantido
    expect(vestido.custo).toBe(45)
  })

  it('barra nota repetida (chave única) sem gravar nada', () => {
    const antes = (banco!.prepare('SELECT COUNT(*) AS n FROM notas_entrada_itens').get() as { n: number }).n
    expect(() =>
      importarNotaEntrada({
        nota: notaBase(CHAVE_1, '1234'),
        fornecedor: fornecedorXml,
        linhas: [
          {
            tipo: 'novo',
            nome: 'QUALQUER COISA',
            categoria: null,
            preco: 10,
            custo: 5,
            codigo_barras: '7899999999991',
            item: itemXml('Z1', 'QUALQUER COISA', 1, 5)
          }
        ]
      })
    ).toThrow(/já foi importada/)
    const depois = (banco!.prepare('SELECT COUNT(*) AS n FROM notas_entrada_itens').get() as { n: number }).n
    expect(depois).toBe(antes)
    expect(banco!.prepare('SELECT 1 FROM produtos WHERE nome = ?').get('QUALQUER COISA')).toBeFalsy()
  })

  it('barra código de barras que já existe, apontando o culpado', () => {
    expect(() =>
      importarNotaEntrada({
        nota: notaBase(CHAVE_3, '1300'),
        fornecedor: fornecedorXml,
        linhas: [
          {
            tipo: 'novo',
            nome: 'PRODUTO DUPLICADO',
            categoria: null,
            preco: 10,
            custo: 5,
            codigo_barras: '7891234567895', // já é do pneu
            item: itemXml('D1', 'PRODUTO DUPLICADO', 1, 5)
          }
        ]
      })
    ).toThrow(/7891234567895.*já existe/)
  })

  it('barra reposição sem tamanho em produto de grade (estoque sumiria)', () => {
    const vestido = banco!
      .prepare('SELECT id FROM produtos WHERE nome = ?')
      .get('VESTIDO LONGO AZUL') as { id: number }
    expect(() =>
      importarNotaEntrada({
        nota: notaBase(CHAVE_3, '1300'),
        fornecedor: fornecedorXml,
        linhas: [
          {
            tipo: 'reposicao',
            produto_id: vestido.id,
            variacao_id: null, // produto de grade SEM tamanho: proibido
            novo_custo: 45,
            novo_preco: null,
            item: itemXml('0451', 'VESTIDO LONGO AZUL M', 2, 45)
          }
        ]
      })
    ).toThrow(/grade de tamanhos/)
  })

  describe('referência do produto (migration 029 + busca)', () => {
    const base = {
      categoria: null,
      preco: 10,
      custo: 5,
      estoque: 1,
      fornecedor_id: null
    }

    it('migration numera os produtos existentes com o próprio id', () => {
      const legado = banco!
        .prepare("SELECT id, referencia FROM produtos WHERE nome = 'PRODUTO LEGADO'")
        .get() as { id: number; referencia: string }
      expect(legado.referencia).toBe(String(legado.id))
      // Os produtos criados via importação de NF-e também ganharam referência
      const semRef = banco!
        .prepare("SELECT COUNT(*) AS n FROM produtos WHERE referencia IS NULL OR referencia = ''")
        .get() as { n: number }
      expect(semRef.n).toBe(0)
    })

    it('cadastro numera sozinho; referência manual vale e não quebra a sequência', () => {
      const auto = criarProduto({ ...base, codigo_barras: '7897777777771', nome: 'REF AUTO' })
      expect(auto.referencia).toMatch(/^\d+$/)

      const manual = criarProduto({
        ...base,
        codigo_barras: '7897777777772',
        referencia: 'AZ-15',
        nome: 'REF MANUAL'
      })
      expect(manual.referencia).toBe('AZ-15')

      // A automática seguinte continua a numeração (ignora a "AZ-15")
      const seguinte = criarProduto({ ...base, codigo_barras: '7897777777773', nome: 'REF SEGUINTE' })
      expect(Number(seguinte.referencia)).toBe(Number(auto.referencia) + 1)
    })

    it('barra referência duplicada, mesmo mudando maiúsculas', () => {
      expect(() =>
        criarProduto({ ...base, codigo_barras: '7897777777774', referencia: 'az-15', nome: 'DUP' })
      ).toThrow(/UNIQUE/i)
    })

    it('campo do leitor acha por referência exata (sem diferenciar caixa)', () => {
      const porRef = buscarProdutoPorCodigoBarras('az-15')
      expect(porRef?.nome).toBe('REF MANUAL')
      expect(porRef?.variacao_encontrada).toBeNull()
    })

    it('código de barras exato tem prioridade sobre referência igual', () => {
      // Produto A tem CÓDIGO curto '77'; produto B tem REFERÊNCIA '77'.
      const a = criarProduto({ ...base, codigo_barras: '77', referencia: 'X-1', nome: 'CODIGO 77' })
      criarProduto({ ...base, codigo_barras: '7897777777775', referencia: '77', nome: 'REF 77' })
      const achado = buscarProdutoPorCodigoBarras('77')
      expect(achado?.id).toBe(a.id)
    })
  })

  it('histórico e relatório: lista por mês, meses e XMLs pro contador', () => {
    const notas = listarNotasEntrada('2026-07')
    expect(notas).toHaveLength(2)
    expect(notas[0].fornecedor_nome).toBe('CONFECCOES EXEMPLO LTDA')
    expect(notas.map((n) => n.numero).sort()).toEqual(['1234', '1250'])
    const primeira = notas.find((n) => n.numero === '1234')!
    expect(primeira.total_itens).toBe(3)
    expect(primeira.produtos_novos).toBe(3)

    expect(mesesComNotas()).toEqual(['2026-07'])
    expect(listarNotasEntrada('2026-01')).toHaveLength(0)

    const xmls = xmlsDoMes('2026-07')
    expect(xmls).toHaveLength(2)
    expect(xmls[0].xml).toContain('<NFe>')
  })
})
