// Consultas READ-ONLY usadas pelas tools do chatbot. Mantidas separadas das
// queries de domínio pra deixar explícito que o assistente de IA só LÊ o banco
// — nunca escreve. Toda tool do chat resolve aqui.

import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

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
      `SELECT p.nome, p.categoria, p.preco,
              CASE WHEN EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id)
                   THEN (SELECT COALESCE(SUM(v.estoque), 0) FROM produto_variacoes v WHERE v.produto_id = p.id)
                   ELSE p.estoque END AS estoque,
              f.nome AS fornecedor
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
      `SELECT p.nome,
              CASE WHEN EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id)
                   THEN (SELECT COALESCE(SUM(v.estoque), 0) FROM produto_variacoes v WHERE v.produto_id = p.id)
                   ELSE p.estoque END AS estoque,
              COALESCE(SUM(iv.quantidade), 0) AS vendidos
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

export type DevedorChat = {
  cliente: string
  telefone: string
  em_atraso: number                       // vencido e NÃO pago = inadimplência
  a_vencer: number                        // ainda dentro do prazo
  vencimento_mais_antigo: string | null   // da parte em atraso (ISO 'YYYY-MM-DD')
}

// Contas a receber por cliente, separando o que JÁ venceu e não foi pago
// (`em_atraso` = inadimplência) do que ainda está no prazo (`a_vencer`). Cobre
// vendas a prazo simples (num_parcelas IS NULL) e parceladas (tabela parcelas).
// A inadimplência é derivada de data_vencimento < hoje — não depende de o status
// já ter sido promovido a 'inadimplente' (o dashboard faz isso preguiçosamente).
export function clientesDevedores(apenasEmAtraso = false, limite = 50): DevedorChat[] {
  const db = obterBancoDeDados()
  const lim = Math.min(Math.max(1, Math.floor(limite)), 200)
  const filtro = apenasEmAtraso ? 'em_atraso > 0' : 'em_atraso > 0 OR a_vencer > 0'
  return db
    .prepare(
      `SELECT * FROM (
         SELECT
           c.nome AS cliente,
           c.telefone AS telefone,
           ROUND(
             COALESCE((SELECT SUM(v.total - v.valor_pago) FROM vendas v
                       WHERE v.cliente_id = c.id AND v.num_parcelas IS NULL
                         AND v.status_pagamento IN ('pendente','inadimplente')
                         AND v.data_vencimento IS NOT NULL
                         AND date(v.data_vencimento) < date('now')), 0)
             + COALESCE((SELECT SUM(p.valor) FROM parcelas p JOIN vendas v ON v.id = p.venda_id
                         WHERE v.cliente_id = c.id AND p.status != 'pago'
                           AND date(p.data_vencimento) < date('now')), 0)
           , 2) AS em_atraso,
           ROUND(
             COALESCE((SELECT SUM(v.total - v.valor_pago) FROM vendas v
                       WHERE v.cliente_id = c.id AND v.num_parcelas IS NULL
                         AND v.status_pagamento = 'pendente'
                         AND v.data_vencimento IS NOT NULL
                         AND date(v.data_vencimento) >= date('now')), 0)
             + COALESCE((SELECT SUM(p.valor) FROM parcelas p JOIN vendas v ON v.id = p.venda_id
                         WHERE v.cliente_id = c.id AND p.status != 'pago'
                           AND date(p.data_vencimento) >= date('now')), 0)
           , 2) AS a_vencer,
           (SELECT MIN(d) FROM (
              SELECT MIN(date(v.data_vencimento)) AS d FROM vendas v
                WHERE v.cliente_id = c.id AND v.num_parcelas IS NULL
                  AND v.status_pagamento IN ('pendente','inadimplente')
                  AND v.data_vencimento IS NOT NULL
                  AND date(v.data_vencimento) < date('now')
              UNION ALL
              SELECT MIN(date(p.data_vencimento)) AS d FROM parcelas p JOIN vendas v ON v.id = p.venda_id
                WHERE v.cliente_id = c.id AND p.status != 'pago'
                  AND date(p.data_vencimento) < date('now')
           )) AS vencimento_mais_antigo
         FROM clientes c
       )
       WHERE ${filtro}
       ORDER BY em_atraso DESC, a_vencer DESC
       LIMIT @lim`
    )
    .all({ lim }) as DevedorChat[]
}

// ─── Análises por período (estatísticas e rankings) ─────────────────────────
// Tudo agregado no SQLite: o retorno é pequeno (um resumo ou um ranking curto),
// nunca o dump das vendas. Mais barato em tokens e mais preciso que mandar o
// modelo somar linha a linha.

type PeriodoInput = { periodo?: string; inicio?: string; fim?: string }

// Expressões SQLite para períodos relativos. As CHAVES são constantes do código
// (o input do modelo só INDEXA este mapa, nunca é interpolado), então não há
// risco de injeção. inicio/fim são inclusivos.
const PERIODOS: Record<string, { ini: string; fim: string }> = {
  hoje: { ini: "date('now')", fim: "date('now')" },
  ontem: { ini: "date('now','-1 day')", fim: "date('now','-1 day')" },
  ultimos_7_dias: { ini: "date('now','-6 days')", fim: "date('now')" },
  ultimos_30_dias: { ini: "date('now','-29 days')", fim: "date('now')" },
  este_mes: { ini: "date('now','start of month')", fim: "date('now')" },
  mes_passado: {
    ini: "date('now','start of month','-1 month')",
    fim: "date('now','start of month','-1 day')"
  },
  este_ano: { ini: "date('now','start of year')", fim: "date('now')" }
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/

export type Periodo = { inicio: string; fim: string; rotulo: string }

// Converte {periodo|inicio|fim} num intervalo concreto [inicio, fim]. Datas
// explícitas válidas (YYYY-MM-DD) têm prioridade; senão usa o keyword (padrão
// 'este_mes'). Resolve pelo relógio do SQLite, então bate com o resto do app.
export function resolverPeriodo(input: PeriodoInput): Periodo {
  const db = obterBancoDeDados()
  if (RE_DATA.test(input.inicio ?? '') && RE_DATA.test(input.fim ?? '')) {
    return { inicio: input.inicio as string, fim: input.fim as string, rotulo: `${input.inicio} a ${input.fim}` }
  }
  const chave = input.periodo && input.periodo in PERIODOS ? input.periodo : 'este_mes'
  const { ini, fim } = PERIODOS[chave]
  const r = db.prepare(`SELECT ${ini} AS inicio, ${fim} AS fim`).get() as { inicio: string; fim: string }
  return { inicio: r.inicio, fim: r.fim, rotulo: chave }
}

type VendaExtremo = { id: number; data: string; cliente: string | null; total: number }

export type EstatisticasVendas = {
  periodo: Periodo
  num_vendas: number
  faturamento: number
  ticket_medio: number
  maior_venda: VendaExtremo | null
  menor_venda: VendaExtremo | null
  melhor_dia: { dia: string; total: number; vendas: number } | null
  num_devolucoes: number
  total_devolucoes: number
}

// Resumo financeiro de um período. `faturamento` = SUM(total), líquido de
// desconto (o `total` já é gravado descontado) — mesma conta do dashboard.
export function estatisticasVendas(p: Periodo): EstatisticasVendas {
  const db = obterBancoDeDados()
  const arg = { inicio: p.inicio, fim: p.fim }

  const ag = db
    .prepare(
      `SELECT COUNT(*) AS num_vendas,
              ROUND(COALESCE(SUM(total), 0), 2) AS faturamento,
              ROUND(COALESCE(AVG(total), 0), 2) AS ticket_medio
       FROM vendas WHERE date(data) BETWEEN @inicio AND @fim`
    )
    .get(arg) as { num_vendas: number; faturamento: number; ticket_medio: number }

  const extremo = (ordem: 'DESC' | 'ASC') =>
    (db
      .prepare(
        `SELECT v.id, date(v.data) AS data, c.nome AS cliente, v.total
         FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id
         WHERE date(v.data) BETWEEN @inicio AND @fim
         ORDER BY v.total ${ordem}, v.id LIMIT 1`
      )
      .get(arg) as VendaExtremo | undefined) ?? null

  const melhorDia =
    (db
      .prepare(
        `SELECT date(data) AS dia, ROUND(SUM(total), 2) AS total, COUNT(*) AS vendas
         FROM vendas WHERE date(data) BETWEEN @inicio AND @fim
         GROUP BY date(data) ORDER BY total DESC LIMIT 1`
      )
      .get(arg) as { dia: string; total: number; vendas: number } | undefined) ?? null

  const dev = db
    .prepare(
      `SELECT COUNT(*) AS num, ROUND(COALESCE(SUM(valor_total), 0), 2) AS total
       FROM devolucoes WHERE date(data) BETWEEN @inicio AND @fim`
    )
    .get(arg) as { num: number; total: number }

  return {
    periodo: p,
    num_vendas: ag.num_vendas,
    faturamento: ag.faturamento,
    ticket_medio: ag.ticket_medio,
    maior_venda: extremo('DESC'),
    menor_venda: extremo('ASC'),
    melhor_dia: melhorDia,
    num_devolucoes: dev.num,
    total_devolucoes: dev.total
  }
}

export type ProdutoRanking = { nome: string; quantidade: number; receita: number }

// Produtos mais vendidos no período, por quantidade (desempate por receita).
export function produtosMaisVendidos(p: Periodo, limite = 10): ProdutoRanking[] {
  const db = obterBancoDeDados()
  const lim = Math.min(Math.max(1, Math.floor(limite)), 50)
  return db
    .prepare(
      `SELECT pr.nome,
              SUM(iv.quantidade) AS quantidade,
              ROUND(SUM(iv.quantidade * iv.preco_unitario), 2) AS receita
       FROM itens_venda iv
       JOIN vendas v ON v.id = iv.venda_id
       JOIN produtos pr ON pr.id = iv.produto_id
       WHERE date(v.data) BETWEEN @inicio AND @fim
       GROUP BY iv.produto_id
       ORDER BY quantidade DESC, receita DESC
       LIMIT @lim`
    )
    .all({ inicio: p.inicio, fim: p.fim, lim }) as ProdutoRanking[]
}

export type VendedorRanking = { vendedor: string; num_vendas: number; faturamento: number }

// Faturamento e nº de vendas por vendedor no período (maior → menor).
export function desempenhoVendedores(p: Periodo): VendedorRanking[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT COALESCE(vd.nome, 'Sem vendedor') AS vendedor,
              COUNT(*) AS num_vendas,
              ROUND(COALESCE(SUM(v.total), 0), 2) AS faturamento
       FROM vendas v LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
       WHERE date(v.data) BETWEEN @inicio AND @fim
       GROUP BY v.vendedor_id
       ORDER BY faturamento DESC`
    )
    .all({ inicio: p.inicio, fim: p.fim }) as VendedorRanking[]
}

export type ClienteRanking = { cliente: string; num_compras: number; total: number }

// Clientes que mais compraram no período (ignora vendas avulsas, sem cliente).
export function melhoresClientes(p: Periodo, limite = 10): ClienteRanking[] {
  const db = obterBancoDeDados()
  const lim = Math.min(Math.max(1, Math.floor(limite)), 50)
  return db
    .prepare(
      `SELECT c.nome AS cliente,
              COUNT(*) AS num_compras,
              ROUND(COALESCE(SUM(v.total), 0), 2) AS total
       FROM vendas v JOIN clientes c ON c.id = v.cliente_id
       WHERE date(v.data) BETWEEN @inicio AND @fim
       GROUP BY v.cliente_id
       ORDER BY total DESC
       LIMIT @lim`
    )
    .all({ inicio: p.inicio, fim: p.fim, lim }) as ClienteRanking[]
}

// ─── Dívida de um cliente e total a receber da loja ─────────────────────────
// Inadimplência é derivada da DATA de vencimento (< hoje), não do status — igual
// a clientesDevedores, então os números batem entre as ferramentas. Cobre vendas
// a prazo simples (num_parcelas IS NULL) e parceladas (tabela parcelas).

export type ItemDivida = {
  origem: string // ex.: "Venda #12 (a prazo)" ou "Venda #12 — parcela 2"
  valor: number
  vencimento: string // YYYY-MM-DD
  atrasada: boolean
}

export type DividaCliente = {
  cliente: string
  telefone: string
  em_atraso: number
  a_vencer: number
  itens: ItemDivida[]
}

// Detalha a dívida em aberto de cada cliente cujo nome casa com `termo`. Cliente
// encontrado mas sem dívida volta com totais 0 e itens vazios (≠ de lista vazia,
// que significa nenhum cliente com esse nome). Totais derivam dos itens, então
// detalhe e somatório nunca divergem.
export function dividaCliente(termo: string, limiteClientes = 5): DividaCliente[] {
  const db = obterBancoDeDados()
  const t = (termo ?? '').trim()
  if (!t) return []

  const clientes = db
    .prepare(
      `SELECT id, nome, telefone FROM clientes
       WHERE nome LIKE @like COLLATE NOCASE
       ORDER BY nome COLLATE NOCASE LIMIT @lim`
    )
    .all({ like: `%${t}%`, lim: Math.min(Math.max(1, limiteClientes), 10) }) as Array<{
    id: number
    nome: string
    telefone: string
  }>

  const itensStmt = db.prepare(
    `SELECT origem, ROUND(valor, 2) AS valor, vencimento, atrasada FROM (
       SELECT 'Venda #' || v.id || ' (a prazo)' AS origem,
              (v.total - v.valor_pago) AS valor,
              date(v.data_vencimento) AS vencimento,
              CASE WHEN date(v.data_vencimento) < date('now') THEN 1 ELSE 0 END AS atrasada
       FROM vendas v
       WHERE v.cliente_id = @id
         AND v.num_parcelas IS NULL
         AND v.status_pagamento IN ('pendente','inadimplente')
         AND v.data_vencimento IS NOT NULL
         AND (v.total - v.valor_pago) > 0
       UNION ALL
       SELECT 'Venda #' || p.venda_id || ' — parcela ' || p.numero AS origem,
              p.valor AS valor,
              date(p.data_vencimento) AS vencimento,
              CASE WHEN date(p.data_vencimento) < date('now') THEN 1 ELSE 0 END AS atrasada
       FROM parcelas p JOIN vendas v ON v.id = p.venda_id
       WHERE v.cliente_id = @id AND p.status != 'pago'
     )
     ORDER BY vencimento`
  )

  return clientes.map((c) => {
    const linhas = itensStmt.all({ id: c.id }) as Array<{
      origem: string
      valor: number
      vencimento: string
      atrasada: number
    }>
    const itens: ItemDivida[] = linhas.map((l) => ({
      origem: l.origem,
      valor: l.valor,
      vencimento: l.vencimento,
      atrasada: l.atrasada === 1
    }))
    const somar = (filtro: (i: ItemDivida) => boolean) =>
      +itens.filter(filtro).reduce((s, i) => s + i.valor, 0).toFixed(2)
    return {
      cliente: c.nome,
      telefone: c.telefone,
      em_atraso: somar((i) => i.atrasada),
      a_vencer: somar((i) => !i.atrasada),
      itens
    }
  })
}

export type TotalAReceber = {
  em_atraso: number
  a_vencer: number
  total: number
  clientes_devedores: number
}

// Total que a loja tem a receber agora, somado no banco (não pelo modelo): em
// atraso (inadimplência), a vencer, total e quantos clientes devem algo.
export function totalAReceber(): TotalAReceber {
  const db = obterBancoDeDados()
  const r = db
    .prepare(
      `SELECT
         ROUND(
           COALESCE((SELECT SUM(v.total - v.valor_pago) FROM vendas v
                     WHERE v.num_parcelas IS NULL AND v.status_pagamento IN ('pendente','inadimplente')
                       AND v.data_vencimento IS NOT NULL AND date(v.data_vencimento) < date('now')), 0)
           + COALESCE((SELECT SUM(p.valor) FROM parcelas p
                       WHERE p.status != 'pago' AND date(p.data_vencimento) < date('now')), 0)
         , 2) AS em_atraso,
         ROUND(
           COALESCE((SELECT SUM(v.total - v.valor_pago) FROM vendas v
                     WHERE v.num_parcelas IS NULL AND v.status_pagamento = 'pendente'
                       AND v.data_vencimento IS NOT NULL AND date(v.data_vencimento) >= date('now')), 0)
           + COALESCE((SELECT SUM(p.valor) FROM parcelas p
                       WHERE p.status != 'pago' AND date(p.data_vencimento) >= date('now')), 0)
         , 2) AS a_vencer`
    )
    .get() as { em_atraso: number; a_vencer: number }

  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM clientes c WHERE
         (SELECT COALESCE(SUM(v.total - v.valor_pago), 0) FROM vendas v
          WHERE v.cliente_id = c.id AND v.num_parcelas IS NULL
            AND v.status_pagamento IN ('pendente','inadimplente')
            AND v.data_vencimento IS NOT NULL) > 0
         OR (SELECT COALESCE(SUM(p.valor), 0) FROM parcelas p JOIN vendas v ON v.id = p.venda_id
             WHERE v.cliente_id = c.id AND p.status != 'pago') > 0`
    )
    .get() as { n: number }

  return {
    em_atraso: r.em_atraso,
    a_vencer: r.a_vencer,
    total: +(r.em_atraso + r.a_vencer).toFixed(2),
    clientes_devedores: n
  }
}
