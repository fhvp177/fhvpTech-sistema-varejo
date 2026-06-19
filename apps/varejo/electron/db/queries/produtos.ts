import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

export type Produto = {
  id: number
  codigo_barras: string
  nome: string
  categoria: string | null
  preco: number
  custo: number
  estoque: number
  fornecedor_id: number | null
  data_cadastro: string
  fornecedor_nome?: string | null
}

export type DadosProduto = {
  codigo_barras: string
  nome: string
  categoria: string | null
  preco: number
  custo: number
  estoque: number
  fornecedor_id: number | null
}

export function listarProdutos(): Produto[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT p.*, f.nome AS fornecedor_nome
       FROM produtos p
       LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
       ORDER BY p.nome COLLATE NOCASE`
    )
    .all() as Produto[]
}

export function buscarProdutoPorCodigoBarras(codigo: string): Produto | undefined {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT p.*, f.nome AS fornecedor_nome
       FROM produtos p
       LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
       WHERE p.codigo_barras = ?`
    )
    .get(codigo) as Produto | undefined
}

export function criarProduto(dados: DadosProduto): Produto {
  const db = obterBancoDeDados()
  const result = db
    .prepare(
      `INSERT INTO produtos (codigo_barras, nome, categoria, preco, custo, estoque, fornecedor_id)
       VALUES (@codigo_barras, @nome, @categoria, @preco, @custo, @estoque, @fornecedor_id)`
    )
    .run(dados)
  return {
    id: result.lastInsertRowid as number,
    data_cadastro: new Date().toISOString(),
    ...dados
  }
}

export function atualizarProduto(id: number, dados: DadosProduto): void {
  const db = obterBancoDeDados()
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
  ).run({ ...dados, id })
}

export function deletarProduto(id: number): void {
  const db = obterBancoDeDados()
  db.prepare('DELETE FROM produtos WHERE id = ?').run(id)
}

export function atualizarEstoque(id: number, quantidade: number): void {
  const db = obterBancoDeDados()
  db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(quantidade, id)
}
