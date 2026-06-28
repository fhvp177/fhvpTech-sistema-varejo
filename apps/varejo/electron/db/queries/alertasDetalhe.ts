import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

// Consultas de DETALHE das notificações do sino. Quando o usuário clica num aviso
// (ex.: "2 vencem amanhã"), o popup mostra os itens exatos por trás dele — sempre
// recalculados AGORA (estado atual), não congelados no momento em que o aviso nasceu.

export type RecebivelDetalhe = {
  cliente: string
  telefone: string
  valor: number
  vencimento: string // 'YYYY-MM-DD'
  origem: string // ex.: "Venda #45" ou "Venda #45 — parcela 2/3"
}

export type ProdutoAlertaDetalhe = {
  nome: string // já inclui o tamanho quando é grade (ex.: "Camiseta (M)")
  estoque: number
  dias_parado?: number // só em "produtos parados"
}

export type FiltroRecebivel = 'hoje' | 'amanha' | 'atraso'

// Lista, item a item (não agregado por cliente), os recebíveis em aberto que
// casam com o filtro de data. Cobre vendas a prazo simples (num_parcelas IS NULL)
// e parcelas. 'hoje'/'amanha' = vencimento exatamente nesse dia; 'atraso' = vencidos.
export function listarRecebiveis(filtro: FiltroRecebivel): RecebivelDetalhe[] {
  const db = obterBancoDeDados()
  // Condição de data montada a partir de um valor interno fixo (não entra dado do
  // usuário aqui), então não há risco de injeção.
  const cond =
    filtro === 'hoje'
      ? "= date('now')"
      : filtro === 'amanha'
        ? "= date('now','+1 day')"
        : "< date('now')"
  return db
    .prepare(
      `SELECT c.nome AS cliente,
              COALESCE(c.telefone, '') AS telefone,
              ROUND(x.valor, 2) AS valor,
              x.vencimento AS vencimento,
              x.origem AS origem
       FROM (
         SELECT v.cliente_id AS cliente_id,
                (v.total - v.valor_pago) AS valor,
                date(v.data_vencimento) AS vencimento,
                'Venda #' || v.id AS origem
         FROM vendas v
         WHERE v.num_parcelas IS NULL
           AND v.cancelada = 0
           AND v.status_pagamento IN ('pendente','inadimplente')
           AND v.data_vencimento IS NOT NULL
           AND (v.total - v.valor_pago) > 0
           AND date(v.data_vencimento) ${cond}
         UNION ALL
         SELECT v.cliente_id AS cliente_id,
                p.valor AS valor,
                date(p.data_vencimento) AS vencimento,
                'Venda #' || p.venda_id || ' — parcela ' || p.numero AS origem
         FROM parcelas p JOIN vendas v ON v.id = p.venda_id
         WHERE p.status != 'pago'
           AND v.cancelada = 0
           AND date(p.data_vencimento) ${cond}
       ) x
       JOIN clientes c ON c.id = x.cliente_id
       WHERE x.valor > 0
       ORDER BY x.vencimento ASC, c.nome COLLATE NOCASE`
    )
    .all() as RecebivelDetalhe[]
}

export type TipoProdutoAlerta = 'estoque-baixo' | 'produtos-parados'

// Lista os produtos por trás dos alertas de estoque. 'estoque-baixo' = 1 a 5
// unidades (produto simples ou cada tamanho da grade). 'produtos-parados' = com
// estoque e sem venda há 30+ dias.
export function listarProdutosAlerta(tipo: TipoProdutoAlerta): ProdutoAlertaDetalhe[] {
  const db = obterBancoDeDados()
  if (tipo === 'estoque-baixo') {
    return db
      .prepare(
        `SELECT nome, estoque FROM (
           SELECT p.nome AS nome, p.estoque AS estoque
           FROM produtos p
           WHERE p.estoque > 0 AND p.estoque <= 5
             AND NOT EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id)
           UNION ALL
           SELECT p.nome || ' (' || pv.tamanho || ')' AS nome, pv.estoque AS estoque
           FROM produto_variacoes pv JOIN produtos p ON p.id = pv.produto_id
           WHERE pv.estoque > 0 AND pv.estoque <= 5
         )
         ORDER BY estoque ASC, nome COLLATE NOCASE
         LIMIT 100`
      )
      .all() as ProdutoAlertaDetalhe[]
  }
  return db
    .prepare(
      `SELECT nome, estoque, dias_parado FROM (
         SELECT p.nome AS nome, p.estoque AS estoque,
                CAST(julianday('now') - julianday(
                  COALESCE(
                    (SELECT MAX(date(v.data)) FROM itens_venda iv
                     JOIN vendas v ON v.id = iv.venda_id WHERE iv.produto_id = p.id AND v.cancelada = 0),
                    date(p.data_cadastro), '2000-01-01'
                  )
                ) AS INTEGER) AS dias_parado
         FROM produtos p
         WHERE p.estoque > 0
       )
       WHERE dias_parado >= 30
       ORDER BY dias_parado DESC, estoque DESC, nome COLLATE NOCASE
       LIMIT 100`
    )
    .all() as ProdutoAlertaDetalhe[]
}
