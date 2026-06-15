import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

// Catálogo de produtos/medicamentos com estoque simples. O faturamento (M4) dá
// baixa no estoque ao vender. ativo permite aposentar sem apagar histórico.

export type Produto = {
  id: number
  nome: string
  preco: number
  estoque: number
  ativo: number
  data_cadastro: string
}

export function listarProdutos(): Produto[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT id, nome, preco, estoque, ativo, data_cadastro
       FROM produtos ORDER BY ativo DESC, nome COLLATE NOCASE`
    )
    .all() as Produto[]
}

function validarPreco(preco: number): number {
  const n = Number(preco)
  if (isNaN(n) || n < 0) throw new Error('O preço deve ser um valor maior ou igual a zero.')
  return Math.round(n * 100) / 100
}

function validarEstoque(estoque: number): number {
  const n = Math.floor(Number(estoque))
  if (isNaN(n) || n < 0) throw new Error('O estoque deve ser um número inteiro maior ou igual a zero.')
  return n
}

export function criarProduto(dados: {
  nome: string
  preco: number
  estoque?: number
}): { id: number } {
  const db = obterBancoDeDados()
  const nome = dados.nome.trim()
  if (!nome) throw new Error('Nome do produto não pode ficar vazio.')
  const preco = validarPreco(dados.preco)
  const estoque = validarEstoque(dados.estoque ?? 0)
  const r = db
    .prepare('INSERT INTO produtos (nome, preco, estoque) VALUES (?, ?, ?)')
    .run(nome, preco, estoque)
  return { id: r.lastInsertRowid as number }
}

export function atualizarProduto(
  id: number,
  dados: { nome?: string; preco?: number; estoque?: number }
): void {
  const db = obterBancoDeDados()
  const atual = db.prepare('SELECT nome, preco, estoque FROM produtos WHERE id = ?').get(id) as
    | { nome: string; preco: number; estoque: number }
    | undefined
  if (!atual) throw new Error('Produto não encontrado.')
  const nome = dados.nome !== undefined ? dados.nome.trim() : atual.nome
  if (!nome) throw new Error('Nome do produto não pode ficar vazio.')
  const preco = dados.preco !== undefined ? validarPreco(dados.preco) : atual.preco
  const estoque = dados.estoque !== undefined ? validarEstoque(dados.estoque) : atual.estoque
  db.prepare('UPDATE produtos SET nome = ?, preco = ?, estoque = ? WHERE id = ?').run(
    nome,
    preco,
    estoque,
    id
  )
}

export function alternarAtivoProduto(id: number, ativo: boolean): void {
  const db = obterBancoDeDados()
  const r = db.prepare('UPDATE produtos SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, id)
  if (r.changes === 0) throw new Error('Produto não encontrado.')
}

export function deletarProduto(id: number): void {
  const db = obterBancoDeDados()
  db.prepare('DELETE FROM produtos WHERE id = ?').run(id)
}
