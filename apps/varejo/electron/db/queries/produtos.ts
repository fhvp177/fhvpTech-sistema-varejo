import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { comErroAmigavelDeVinculo } from '../erros'

// Ordem canônica dos tamanhos (a grade vai do P ao GG por enquanto). Usada só
// para devolver as variações já ordenadas; o cadastro de fato vem da tela.
const ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG']
const ordemDe = (t: string): number => {
  const i = ORDEM_TAMANHOS.indexOf(t.toUpperCase())
  return i === -1 ? ORDEM_TAMANHOS.length : i
}

export type Variacao = {
  id: number
  produto_id: number
  tamanho: string
  codigo_barras: string
  estoque: number
}

export type Produto = {
  id: number
  codigo_barras: string | null // null em produto de grade (o código vive nos tamanhos)
  nome: string
  categoria: string | null
  preco: number
  custo: number
  estoque: number // simples: o próprio; grade: soma das variações
  fornecedor_id: number | null
  data_cadastro: string
  fornecedor_nome?: string | null
  variacoes: Variacao[] // [] quando o produto é simples
}

export type DadosVariacao = {
  tamanho: string
  codigo_barras: string
  estoque: number
}

export type DadosProduto = {
  codigo_barras: string | null
  nome: string
  categoria: string | null
  preco: number
  custo: number
  estoque: number
  fornecedor_id: number | null
  // Presente e não-vazio => produto de grade (codigo_barras/estoque do produto
  // são ignorados; quem manda são as variações).
  variacoes?: DadosVariacao[]
}

type ProdutoRow = Omit<Produto, 'variacoes' | 'estoque'> & { estoque: number }

// Anexa as variações (ordenadas) a uma lista de produtos e recalcula o estoque:
// para produto de grade, estoque = soma dos tamanhos; para simples, o do próprio.
function anexarVariacoes(rows: ProdutoRow[]): Produto[] {
  if (rows.length === 0) return []
  const db = obterBancoDeDados()
  const ids = rows.map((r) => r.id)
  const placeholders = ids.map(() => '?').join(',')
  const variacoes = db
    .prepare(`SELECT * FROM produto_variacoes WHERE produto_id IN (${placeholders})`)
    .all(...ids) as Variacao[]

  const porProduto = new Map<number, Variacao[]>()
  for (const v of variacoes) {
    const lista = porProduto.get(v.produto_id) ?? []
    lista.push(v)
    porProduto.set(v.produto_id, lista)
  }

  return rows.map((r) => {
    const vs = (porProduto.get(r.id) ?? []).sort((a, b) => ordemDe(a.tamanho) - ordemDe(b.tamanho))
    const estoque = vs.length > 0 ? vs.reduce((s, v) => s + v.estoque, 0) : r.estoque
    return { ...r, estoque, variacoes: vs }
  })
}

export function listarProdutos(): Produto[] {
  const db = obterBancoDeDados()
  const rows = db
    .prepare(
      `SELECT p.*, f.nome AS fornecedor_nome
       FROM produtos p
       LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
       ORDER BY p.nome COLLATE NOCASE`
    )
    .all() as ProdutoRow[]
  return anexarVariacoes(rows)
}

export function obterProdutoPorId(id: number): Produto | undefined {
  const db = obterBancoDeDados()
  const row = db
    .prepare(
      `SELECT p.*, f.nome AS fornecedor_nome
       FROM produtos p
       LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
       WHERE p.id = ?`
    )
    .get(id) as ProdutoRow | undefined
  if (!row) return undefined
  return anexarVariacoes([row])[0]
}

// Resultado da busca por código no PDV: o produto + qual variação foi bipada
// (null quando o código é de um produto simples). O caixa usa `variacao_encontrada`
// para saber de qual tamanho baixar o estoque.
export type ResultadoBuscaCodigo = Produto & { variacao_encontrada: Variacao | null }

export function buscarProdutoPorCodigoBarras(codigo: string): ResultadoBuscaCodigo | undefined {
  const db = obterBancoDeDados()
  // 1) Produto simples — código no próprio produto.
  const row = db
    .prepare(
      `SELECT p.*, f.nome AS fornecedor_nome
       FROM produtos p
       LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
       WHERE p.codigo_barras = ?`
    )
    .get(codigo) as ProdutoRow | undefined
  if (row) {
    return { ...anexarVariacoes([row])[0], variacao_encontrada: null }
  }

  // 2) Código de um tamanho (grade) — devolve o produto-pai + a variação bipada.
  const variacao = db
    .prepare('SELECT * FROM produto_variacoes WHERE codigo_barras = ?')
    .get(codigo) as Variacao | undefined
  if (variacao) {
    const produto = obterProdutoPorId(variacao.produto_id)
    if (produto) return { ...produto, variacao_encontrada: variacao }
  }

  return undefined
}

// Sincroniza as variações de um produto com o conjunto enviado: casa por tamanho
// (um produto não tem dois 'M'), atualizando os que já existem, inserindo os
// novos e removendo os tamanhos que sumiram da grade.
function sincronizarVariacoes(produtoId: number, variacoes: DadosVariacao[]): void {
  const db = obterBancoDeDados()
  const existentes = db
    .prepare('SELECT id, tamanho FROM produto_variacoes WHERE produto_id = ?')
    .all(produtoId) as Array<{ id: number; tamanho: string }>
  const idPorTamanho = new Map(existentes.map((v) => [v.tamanho, v.id]))
  const tamanhosEnviados = new Set(variacoes.map((v) => v.tamanho))

  const update = db.prepare(
    'UPDATE produto_variacoes SET codigo_barras = @codigo_barras, estoque = @estoque WHERE id = @id'
  )
  const insert = db.prepare(
    `INSERT INTO produto_variacoes (produto_id, tamanho, codigo_barras, estoque)
     VALUES (@produto_id, @tamanho, @codigo_barras, @estoque)`
  )
  for (const v of variacoes) {
    const id = idPorTamanho.get(v.tamanho)
    if (id != null) {
      update.run({ id, codigo_barras: v.codigo_barras, estoque: v.estoque })
    } else {
      insert.run({
        produto_id: produtoId,
        tamanho: v.tamanho,
        codigo_barras: v.codigo_barras,
        estoque: v.estoque
      })
    }
  }

  const del = db.prepare('DELETE FROM produto_variacoes WHERE id = ?')
  for (const e of existentes) {
    if (!tamanhosEnviados.has(e.tamanho)) del.run(e.id)
  }
}

export function criarProduto(dados: DadosProduto): Produto {
  const db = obterBancoDeDados()
  const temGrade = !!dados.variacoes && dados.variacoes.length > 0

  const criar = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO produtos (codigo_barras, nome, categoria, preco, custo, estoque, fornecedor_id)
         VALUES (@codigo_barras, @nome, @categoria, @preco, @custo, @estoque, @fornecedor_id)`
      )
      .run({
        codigo_barras: temGrade ? null : dados.codigo_barras,
        nome: dados.nome,
        categoria: dados.categoria,
        preco: dados.preco,
        custo: dados.custo,
        estoque: temGrade ? 0 : dados.estoque,
        fornecedor_id: dados.fornecedor_id
      })
    const id = result.lastInsertRowid as number
    if (temGrade) sincronizarVariacoes(id, dados.variacoes!)
    return id
  })

  const id = criar()
  return obterProdutoPorId(id)!
}

export function atualizarProduto(id: number, dados: DadosProduto): void {
  const db = obterBancoDeDados()
  const temGrade = !!dados.variacoes && dados.variacoes.length > 0

  const atualizar = db.transaction(() => {
    db.prepare(
      `UPDATE produtos
       SET codigo_barras = @codigo_barras,
           nome = @nome,
           categoria = @categoria,
           preco = @preco,
           custo = @custo,
           estoque = @estoque,
           fornecedor_id = @fornecedor_id
       WHERE id = @id`
    ).run({
      id,
      codigo_barras: temGrade ? null : dados.codigo_barras,
      nome: dados.nome,
      categoria: dados.categoria,
      preco: dados.preco,
      custo: dados.custo,
      estoque: temGrade ? 0 : dados.estoque,
      fornecedor_id: dados.fornecedor_id
    })
    // Grade: sincroniza os tamanhos. Simples: remove qualquer grade que existia
    // (caso o produto tenha deixado de ser de grade nesta edição).
    if (temGrade) sincronizarVariacoes(id, dados.variacoes!)
    else db.prepare('DELETE FROM produto_variacoes WHERE produto_id = ?').run(id)
  })

  atualizar()
}

export function deletarProduto(id: number): void {
  const db = obterBancoDeDados()
  const apagar = db.transaction(() => {
    db.prepare('DELETE FROM produto_variacoes WHERE produto_id = ?').run(id)
    db.prepare('DELETE FROM produtos WHERE id = ?').run(id)
  })
  comErroAmigavelDeVinculo(
    apagar,
    'Não dá pra excluir este produto porque ele já aparece em vendas registradas. ' +
      'Para tirá-lo do dia a dia, zere o estoque dele.'
  )
}

export function atualizarEstoque(id: number, quantidade: number): void {
  const db = obterBancoDeDados()
  db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(quantidade, id)
}
