import { obterBancoDeDados } from '../conexao'

export type GranularidadeSerie = 'dia' | 'semana' | 'mes'

export type PontoSerie = {
  rotulo: string       // ex: '15/05', 'Sem 12', 'Mai/26'
  data_inicio: string  // ISO 'YYYY-MM-DD'
  total: number
  num_vendas: number
}

export type TopProduto = {
  produto_id: number
  nome: string
  quantidade: number
  receita: number
}

export type TopCategoria = {
  categoria: string
  quantidade: number
  receita: number
}

export type DistribuicaoPagamento = {
  pago: { num: number; valor: number }
  pendente: { num: number; valor: number }
  parcelado: { num: number; valor: number }
  inadimplente: { num: number; valor: number }
}

export type RecebivelFuturo = {
  proximos_30d: number
  proximos_60d: number
  proximos_90d: number
}

export type ProdutoParado = {
  produto_id: number
  nome: string
  estoque: number
  categoria: string | null
}

export type ProdutoEstoqueBaixo = {
  produto_id: number
  nome: string
  estoque: number
}

export type IntervaloDashboard = {
  inicio_atual: string      // ISO 'YYYY-MM-DD' inclusivo
  fim_atual: string         // ISO 'YYYY-MM-DD' inclusivo
  inicio_anterior: string   // ISO 'YYYY-MM-DD' inclusivo
  fim_anterior: string      // ISO 'YYYY-MM-DD' inclusivo
}

export type MetricasDashboard = {
  periodo_dias: number
  granularidade: GranularidadeSerie
  faturamento_atual: number
  faturamento_anterior: number
  num_vendas_atual: number
  num_vendas_anterior: number
  ticket_medio_atual: number
  ticket_medio_anterior: number
  serie_temporal: PontoSerie[]
  top_produtos: TopProduto[]
  top_categorias: TopCategoria[]
  distribuicao_pagamento: DistribuicaoPagamento
  recebivel_futuro: RecebivelFuturo
  produtos_parados: ProdutoParado[]
  estoque_baixo: ProdutoEstoqueBaixo[]
}

// Granularidade do gráfico de série temporal pela duração do período:
// - até 31d: ponto por dia (mês inteiro entra confortável)
// - até 120d: ponto por semana (~13 pontos)
// - acima: ponto por mês
function escolherGranularidade(periodoDias: number): GranularidadeSerie {
  if (periodoDias <= 31) return 'dia'
  if (periodoDias <= 120) return 'semana'
  return 'mes'
}

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatarRotulo(dataIso: string, gran: GranularidadeSerie): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  if (gran === 'dia') return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
  if (gran === 'mes') return `${MESES_ABREV[mes - 1]}/${String(ano).slice(-2)}`
  // semana
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

// Diferença em dias entre duas ISO 'YYYY-MM-DD' (inclusiva nos dois lados).
function diasEntre(inicio: string, fim: string): number {
  const a = new Date(inicio + 'T00:00:00Z').getTime()
  const b = new Date(fim + 'T00:00:00Z').getTime()
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

export function obterMetricasDashboard(intervalo: IntervaloDashboard): MetricasDashboard {
  const db = obterBancoDeDados()
  const { inicio_atual, fim_atual, inicio_anterior, fim_anterior } = intervalo
  const periodoDias = diasEntre(inicio_atual, fim_atual)
  const gran = escolherGranularidade(periodoDias)

  // Agregados do período atual e do período de comparação. Os dois intervalos chegam
  // já calculados pelo chamador (rolling window ou mês específico vs mês escolhido).
  const totaisAtual = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS faturamento,
              COUNT(*) AS num_vendas
       FROM vendas
       WHERE date(data) >= ? AND date(data) <= ?`
    )
    .get(inicio_atual, fim_atual) as { faturamento: number; num_vendas: number }

  const totaisAnterior = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS faturamento,
              COUNT(*) AS num_vendas
       FROM vendas
       WHERE date(data) >= ? AND date(data) <= ?`
    )
    .get(inicio_anterior, fim_anterior) as { faturamento: number; num_vendas: number }

  // Série temporal agrupada por granularidade.
  let bucketExpr: string
  let bucketParaData: (b: string) => string
  if (gran === 'dia') {
    bucketExpr = "strftime('%Y-%m-%d', data)"
    bucketParaData = (b) => b
  } else if (gran === 'mes') {
    bucketExpr = "strftime('%Y-%m', data)"
    bucketParaData = (b) => `${b}-01`
  } else {
    // semana: primeiro dia (segunda-feira) da semana ISO
    bucketExpr = "strftime('%Y-%m-%d', data, 'weekday 1', '-7 days')"
    bucketParaData = (b) => b
  }

  const linhasSerie = db
    .prepare(
      `SELECT ${bucketExpr} AS bucket,
              COALESCE(SUM(total), 0) AS total,
              COUNT(*) AS num_vendas
       FROM vendas
       WHERE date(data) >= ? AND date(data) <= ?
       GROUP BY bucket
       ORDER BY bucket ASC`
    )
    .all(inicio_atual, fim_atual) as Array<{ bucket: string; total: number; num_vendas: number }>

  const serieTemporal: PontoSerie[] = linhasSerie.map((r) => {
    const dataInicio = bucketParaData(r.bucket)
    return {
      rotulo: formatarRotulo(dataInicio, gran),
      data_inicio: dataInicio,
      total: r.total,
      num_vendas: r.num_vendas
    }
  })

  // Top 5 produtos por receita gerada no período.
  const topProdutos = db
    .prepare(
      `SELECT p.id AS produto_id, p.nome,
              SUM(iv.quantidade) AS quantidade,
              SUM(iv.quantidade * iv.preco_unitario) AS receita
       FROM itens_venda iv
       JOIN vendas v ON v.id = iv.venda_id
       JOIN produtos p ON p.id = iv.produto_id
       WHERE date(v.data) >= ? AND date(v.data) <= ?
       GROUP BY p.id
       ORDER BY receita DESC
       LIMIT 5`
    )
    .all(inicio_atual, fim_atual) as TopProduto[]

  // Top 5 categorias por receita no período. Produtos sem categoria caem em 'Sem categoria'.
  const topCategorias = db
    .prepare(
      `SELECT COALESCE(p.categoria, 'Sem categoria') AS categoria,
              SUM(iv.quantidade) AS quantidade,
              SUM(iv.quantidade * iv.preco_unitario) AS receita
       FROM itens_venda iv
       JOIN vendas v ON v.id = iv.venda_id
       JOIN produtos p ON p.id = iv.produto_id
       WHERE date(v.data) >= ? AND date(v.data) <= ?
       GROUP BY categoria
       ORDER BY receita DESC
       LIMIT 5`
    )
    .all(inicio_atual, fim_atual) as TopCategoria[]

  // Distribuição por forma de pagamento (status_pagamento das vendas do período).
  const linhasPagamento = db
    .prepare(
      `SELECT status_pagamento AS status,
              COUNT(*) AS num,
              COALESCE(SUM(total), 0) AS valor
       FROM vendas
       WHERE date(data) >= ? AND date(data) <= ?
       GROUP BY status_pagamento`
    )
    .all(inicio_atual, fim_atual) as Array<{ status: string; num: number; valor: number }>

  const distribuicaoPagamento: DistribuicaoPagamento = {
    pago: { num: 0, valor: 0 },
    pendente: { num: 0, valor: 0 },
    parcelado: { num: 0, valor: 0 },
    inadimplente: { num: 0, valor: 0 }
  }
  for (const linha of linhasPagamento) {
    const chave = linha.status as keyof DistribuicaoPagamento
    if (chave in distribuicaoPagamento) {
      distribuicaoPagamento[chave] = { num: linha.num, valor: linha.valor }
    }
  }

  // Recebível futuro — soma de parcelas pendentes (não pagas, não atrasadas) e vendas
  // simples a prazo com vencimento dentro da janela [hoje, hoje + N dias].
  // Promovemos vencidas antes para evitar contar atrasadas como futuras.
  db.prepare(
    `UPDATE parcelas SET status = 'inadimplente'
     WHERE status = 'pendente' AND date(data_vencimento) < date('now')`
  ).run()
  db.prepare(
    `UPDATE vendas SET status_pagamento = 'inadimplente'
     WHERE status_pagamento = 'pendente'
       AND data_vencimento IS NOT NULL
       AND date(data_vencimento) < date('now')`
  ).run()

  const recebivelEm = (dias: number): number => {
    const parcelas = db
      .prepare(
        `SELECT COALESCE(SUM(valor), 0) AS total FROM parcelas
         WHERE status = 'pendente'
           AND date(data_vencimento) >= date('now')
           AND date(data_vencimento) <= date('now', '+' || ? || ' days')`
      )
      .get(dias) as { total: number }
    const vendasSimples = db
      .prepare(
        `SELECT COALESCE(SUM(total - valor_pago), 0) AS total FROM vendas
         WHERE status_pagamento = 'pendente'
           AND num_parcelas IS NULL
           AND data_vencimento IS NOT NULL
           AND date(data_vencimento) >= date('now')
           AND date(data_vencimento) <= date('now', '+' || ? || ' days')`
      )
      .get(dias) as { total: number }
    return +(parcelas.total + vendasSimples.total).toFixed(2)
  }

  const recebivelFuturo: RecebivelFuturo = {
    proximos_30d: recebivelEm(30),
    proximos_60d: recebivelEm(60),
    proximos_90d: recebivelEm(90)
  }

  // Produtos parados — em estoque mas sem vendas no período. Top 5 por estoque (mais grave primeiro).
  const produtosParados = db
    .prepare(
      `SELECT p.id AS produto_id, p.nome, p.estoque, p.categoria
       FROM produtos p
       WHERE p.estoque > 0
         AND NOT EXISTS (
           SELECT 1 FROM itens_venda iv
           JOIN vendas v ON v.id = iv.venda_id
           WHERE iv.produto_id = p.id
             AND date(v.data) >= ? AND date(v.data) <= ?
         )
       ORDER BY p.estoque DESC, p.nome COLLATE NOCASE
       LIMIT 5`
    )
    .all(inicio_atual, fim_atual) as ProdutoParado[]

  // Estoque baixo — entre 1 e 5 unidades. Zero é descontinuado/sem estoque, não alerta.
  const estoqueBaixo = db
    .prepare(
      `SELECT id AS produto_id, nome, estoque
       FROM produtos
       WHERE estoque > 0 AND estoque <= 5
       ORDER BY estoque ASC, nome COLLATE NOCASE
       LIMIT 10`
    )
    .all() as ProdutoEstoqueBaixo[]

  const ticketAtual =
    totaisAtual.num_vendas > 0 ? totaisAtual.faturamento / totaisAtual.num_vendas : 0
  const ticketAnterior =
    totaisAnterior.num_vendas > 0 ? totaisAnterior.faturamento / totaisAnterior.num_vendas : 0

  return {
    periodo_dias: periodoDias,
    granularidade: gran,
    faturamento_atual: totaisAtual.faturamento,
    faturamento_anterior: totaisAnterior.faturamento,
    num_vendas_atual: totaisAtual.num_vendas,
    num_vendas_anterior: totaisAnterior.num_vendas,
    ticket_medio_atual: ticketAtual,
    ticket_medio_anterior: ticketAnterior,
    serie_temporal: serieTemporal,
    top_produtos: topProdutos,
    top_categorias: topCategorias,
    distribuicao_pagamento: distribuicaoPagamento,
    recebivel_futuro: recebivelFuturo,
    produtos_parados: produtosParados,
    estoque_baixo: estoqueBaixo
  }
}
