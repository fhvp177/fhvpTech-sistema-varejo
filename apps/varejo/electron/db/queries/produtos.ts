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
  referencia: string | null // código curto e único pra busca rápida sem leitor (ex.: "10")
  nome: string
  categoria: string | null
  preco: number
  custo: number
  /**
   * Prazo de garantia deste produto, em dias.
   *
   * ⚠️ NULO e ZERO são coisas diferentes. Nulo é "use o padrão da loja";
   * zero é "este produto sai sem garantia", que é uma decisão (ponta de
   * estoque, liquidação). Tratar os dois igual faria a loja prometer
   * noventa dias em peça que ela escolheu vender sem garantia nenhuma.
   */
  garantia_dias: number | null
  estoque: number // simples: o próprio; grade: soma das variações
  /**
   * 1 = fora de circulação.
   *
   * ⚠️ Não é o mesmo que estoque zero, e não é exclusão. O produto arquivado
   * some da lista, do caixa, das etiquetas e dos alertas, e continua inteiro no
   * histórico de quem já comprou — inclusive na garantia. Ver a migration 052.
   *
   * ⚠️ A busca por código de barras ACHA o arquivado de propósito: é o que
   * permite ao caixa dizer "este produto está arquivado" em vez de "não
   * encontrado", e o que impede a importação de XML de cadastrar uma segunda
   * cópia do mesmo item.
   */
  arquivado: number
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
  // Ausente/vazia => o sistema numera sozinho (próximo número livre).
  referencia?: string | null
  nome: string
  categoria: string | null
  preco: number
  custo: number
  /** Ausente/nulo => herda o padrão da loja. Zero => sem garantia. */
  garantia_dias?: number | null
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

/**
 * Os produtos da loja.
 *
 * ⚠️ Sem os ARQUIVADOS por padrão. Esta lista alimenta a tela de Produtos, a
 * busca do caixa, as etiquetas e o inventário — tudo que é "o que a loja tem
 * hoje". Produto arquivado saiu de circulação por decisão do lojista, e voltar
 * em qualquer uma dessas telas anularia o arquivamento na prática.
 *
 * `incluirArquivados` existe para uma tela só: a de Produtos, quando o lojista
 * pede para ver o que arquivou.
 */
export function listarProdutos(incluirArquivados = false): Produto[] {
  const db = obterBancoDeDados()
  const rows = db
    .prepare(
      `SELECT p.*, f.nome AS fornecedor_nome
       FROM produtos p
       LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
       ${incluirArquivados ? '' : 'WHERE p.arquivado = 0'}
       ORDER BY p.nome COLLATE NOCASE`
    )
    .all() as ProdutoRow[]
  return anexarVariacoes(rows)
}

/**
 * Tira o produto de circulação, ou traz de volta.
 *
 * ── ⚠️ Não é o mesmo que excluir, e o motivo é o histórico ──────────────────
 * Excluir esbarra na chave estrangeira de `itens_venda` — e isso é proteção,
 * não obstáculo: apagar o produto levaria junto a linha dele em toda venda
 * passada, e com ela o cupom, o lucro do mês, a comissão paga e a garantia que
 * o cliente tem em mãos. Ver a migration 052.
 *
 * Arquivar resolve o que o lojista quer (sumir da lista e do caixa) sem tocar
 * em nada do que já aconteceu.
 *
 * ⚠️ O estoque NÃO é zerado. A peça arquivada que ainda está na prateleira
 * continua sendo patrimônio da loja; mexer no número aqui seria inventar uma
 * baixa que ninguém fez. Quem quiser zerar faz pelo cadastro, de propósito.
 */
export function arquivarProduto(id: number, arquivar = true): void {
  const db = obterBancoDeDados()
  const r = db.prepare('UPDATE produtos SET arquivado = ? WHERE id = ?').run(arquivar ? 1 : 0, id)
  if (r.changes === 0) throw new Error('Produto não encontrado.')
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

// Busca exata por código de barras OU referência — é o que o campo do leitor
// usa: bipou, acha pelo código; digitou "10" + Enter, acha pela referência.
// A ordem importa (código primeiro), mas não há colisão real: código de barras
// tem 8+ dígitos, referência é curta.
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

  // 3) Referência exata (caixa sem leitor digita "10" + Enter).
  const porReferencia = db
    .prepare(
      `SELECT p.*, f.nome AS fornecedor_nome
       FROM produtos p
       LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
       WHERE p.referencia = ? COLLATE NOCASE`
    )
    .get(codigo.trim()) as ProdutoRow | undefined
  if (porReferencia) {
    return { ...anexarVariacoes([porReferencia])[0], variacao_encontrada: null }
  }

  return undefined
}

// Próximo número livre de referência, olhando só as numéricas ("AZ-15" não
// participa da numeração automática).
function proximaReferencia(): string {
  const db = obterBancoDeDados()
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(CAST(referencia AS INTEGER)), 0) + 1 AS prox
       FROM produtos
       WHERE referencia IS NOT NULL AND referencia != '' AND referencia NOT GLOB '*[^0-9]*'`
    )
    .get() as { prox: number }
  return String(row.prox)
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

/**
 * O prazo de garantia como ele pode entrar no banco.
 *
 * ⚠️ A limpeza mora AQUI, e não no handler, de propósito. O canal é falado
 * por string, e quem chama pode ser o renderer do aplicativo, a loja no
 * navegador ou um segundo caixa de versão anterior. Guarda que depende de
 * quem chama é guarda que um dia não é chamada.
 *
 * ⚠️ Nulo e zero continuam diferentes ao sair daqui: nulo é "use o padrão da
 * loja" e zero é "sem garantia". Só o lixo (texto, negativo, quebrado) vira
 * nulo, porque para lixo a resposta certa é voltar para o padrão.
 */
function normalizarGarantia(valor: unknown): number | null {
  if (valor == null || valor === '') return null
  const n = Number(valor)
  if (!Number.isInteger(n) || n < 0 || n > 3650) return null
  return n
}

export function criarProduto(dados: DadosProduto): Produto {
  const db = obterBancoDeDados()
  const temGrade = !!dados.variacoes && dados.variacoes.length > 0

  const criar = db.transaction(() => {
    const result = db
      .prepare(
        // Hora da loja — ver criarVenda. Aqui alimenta "produtos parados", que
        // conta dias desde o cadastro.
        `INSERT INTO produtos (codigo_barras, referencia, nome, categoria, preco, custo, garantia_dias, estoque, fornecedor_id, data_cadastro)
         VALUES (@codigo_barras, @referencia, @nome, @categoria, @preco, @custo, @garantia_dias, @estoque, @fornecedor_id, datetime('now','localtime'))`
      )
      .run({
        codigo_barras: temGrade ? null : dados.codigo_barras,
        referencia: dados.referencia?.trim() || proximaReferencia(),
        nome: dados.nome,
        categoria: dados.categoria,
        preco: dados.preco,
        custo: dados.custo,
        garantia_dias: normalizarGarantia(dados.garantia_dias),
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
           referencia = @referencia,
           nome = @nome,
           categoria = @categoria,
           preco = @preco,
           custo = @custo,
           garantia_dias = @garantia_dias,
           estoque = @estoque,
           fornecedor_id = @fornecedor_id
       WHERE id = @id`
    ).run({
      id,
      codigo_barras: temGrade ? null : dados.codigo_barras,
      // Campo limpo na edição = "me dá um número novo" (produto nunca fica sem)
      referencia: dados.referencia?.trim() || proximaReferencia(),
      nome: dados.nome,
      categoria: dados.categoria,
      preco: dados.preco,
      custo: dados.custo,
      garantia_dias: normalizarGarantia(dados.garantia_dias),
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
      'Apagar agora levaria junto a linha dele nessas vendas, com o lucro, a comissão e a ' +
      'garantia do cliente. Use "Arquivar": ele some da lista e do caixa e o histórico fica de pé.'
  )
}

export function atualizarEstoque(id: number, quantidade: number): void {
  const db = obterBancoDeDados()
  db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(quantidade, id)
}
