// Consultas READ-ONLY usadas pelas tools do chatbot. Mantidas separadas das
// queries de domínio pra deixar explícito que o assistente de IA só LÊ o banco
// — nunca escreve. Toda tool do chat resolve aqui.

import { obterBancoDeDados } from '../conexao'

export type ProdutoChat = {
  nome: string
  categoria: string | null
  preco: number
  estoque: number
  fornecedor: string | null
}

// Busca produtos por trecho do nome ou categoria. Termo vazio retorna os
// primeiros `limite` (ordem alfabética). Limita o resultado pra não estourar
// o contexto do modelo em lojas com muitos itens.
export function buscarProdutos(termo: string | undefined, limite = 40): ProdutoChat[] {
  const db = obterBancoDeDados()
  const like = `%${(termo ?? '').trim()}%`
  return db
    .prepare(
      `SELECT p.nome, p.categoria, p.preco, p.estoque, f.nome AS fornecedor
       FROM produtos p
       LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
       WHERE p.nome LIKE @like COLLATE NOCASE
          OR (p.categoria IS NOT NULL AND p.categoria LIKE @like COLLATE NOCASE)
       ORDER BY p.nome COLLATE NOCASE
       LIMIT @limite`
    )
    .all({ like, limite }) as ProdutoChat[]
}

export type GiroChat = { nome: string; estoque: number; vendidos: number }

// Quantas unidades de cada produto (que casa com o termo) saíram nos últimos
// `dias` dias. Base pra sugerir reposição / avaliar giro.
export function giroProduto(termo: string, dias = 30, limite = 20): GiroChat[] {
  const db = obterBancoDeDados()
  const janela = `-${Math.max(1, Math.floor(dias))} days`
  return db
    .prepare(
      `SELECT p.nome, p.estoque, COALESCE(SUM(iv.quantidade), 0) AS vendidos
       FROM produtos p
       LEFT JOIN itens_venda iv ON iv.produto_id = p.id
       LEFT JOIN vendas v ON v.id = iv.venda_id AND date(v.data) >= date('now', @janela)
       WHERE p.nome LIKE @like COLLATE NOCASE
       GROUP BY p.id
       ORDER BY vendidos DESC, p.nome COLLATE NOCASE
       LIMIT @limite`
    )
    .all({ like: `%${termo}%`, janela, limite }) as GiroChat[]
}

export type VendaChat = {
  id: number
  data: string
  cliente: string | null
  total: number
  status: string
}

export function vendasRecentes(limite = 20): VendaChat[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT v.id, v.data, c.nome AS cliente, v.total, v.status_pagamento AS status
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       ORDER BY v.data DESC
       LIMIT @limite`
    )
    .all({ limite: Math.min(Math.max(1, limite), 100) }) as VendaChat[]
}
