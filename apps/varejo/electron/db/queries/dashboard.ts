import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { lerConfig } from '@fhvptech/core/electron/backup/configBackup'

// Chave na tabela `config` onde fica a meta de faturamento mensal (editável pelo
// próprio card da dashboard). Ausente/0 = meta não definida.
export const CHAVE_META_MENSAL = 'meta_faturamento_mensal'

export type GranularidadeSerie = 'dia' | 'semana' | 'mes'

export type PontoSerie = {
  rotulo: string         // ex: '15/05', 'Sem 12', 'Mai/26'
  data_inicio: string    // ISO 'YYYY-MM-DD'
  total: number
  total_anterior: number // mesmo bucket no período de comparação (alinhado por posição)
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
  dias_parado: number
}

export type ProdutoEstoqueBaixo = {
  produto_id: number
  nome: string
  estoque: number
  tamanho: string | null // preenchido quando o alerta é de um tamanho da grade
}

export type IntervaloDashboard = {
  inicio_atual: string      // ISO 'YYYY-MM-DD' inclusivo
  fim_atual: string         // ISO 'YYYY-MM-DD' inclusivo
  inicio_anterior: string   // ISO 'YYYY-MM-DD' inclusivo
  fim_anterior: string      // ISO 'YYYY-MM-DD' inclusivo
}

export type VendedorRanking = {
  vendedor_id: number
  nome: string
  num_vendas: number
  receita: number
}

export type PontoDiaSemana = {
  dow: number   // 0=Dom … 6=Sáb (strftime '%w')
  total: number
}

export type Aniversariante = {
  id: number
  nome: string
  telefone: string
  dia: string   // 'DD/MM'
}

export type MetricasDashboard = {
  periodo_dias: number
  granularidade: GranularidadeSerie
  faturamento_atual: number
  faturamento_anterior: number
  custo_vendas_atual: number
  custo_vendas_anterior: number
  devolucoes_atual: number
  devolucoes_anterior: number
  num_vendas_atual: number
  num_vendas_anterior: number
  ticket_medio_atual: number
  ticket_medio_anterior: number
  clientes_novos_atual: number
  clientes_novos_anterior: number
  meta_mensal: number
  faturamento_mes_corrente: number
  serie_temporal: PontoSerie[]
  top_produtos: TopProduto[]
  top_categorias: TopCategoria[]
  ranking_vendedores: VendedorRanking[]
  vendas_por_dia_semana: PontoDiaSemana[]
  aniversariantes_mes: Aniversariante[]
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

  // Devoluções de cada período (pra faturamento líquido = vendas − devoluções).
  const devAtual = db
    .prepare(
      `SELECT COALESCE(SUM(valor_total), 0) AS total FROM devolucoes
       WHERE date(data) >= ? AND date(data) <= ?`
    )
    .get(inicio_atual, fim_atual) as { total: number }
  const devAnterior = db
    .prepare(
      `SELECT COALESCE(SUM(valor_total), 0) AS total FROM devolucoes
       WHERE date(data) >= ? AND date(data) <= ?`
    )
    .get(inicio_anterior, fim_anterior) as { total: number }

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

  // Mesma agregação no período de comparação, alinhada por POSIÇÃO (1º bucket do
  // atual ↔ 1º bucket do anterior, etc.) — é o que o botão "Comparar" do gráfico usa.
  const linhasSerieAnterior = db
    .prepare(
      `SELECT ${bucketExpr} AS bucket,
              COALESCE(SUM(total), 0) AS total
       FROM vendas
       WHERE date(data) >= ? AND date(data) <= ?
       GROUP BY bucket
       ORDER BY bucket ASC`
    )
    .all(inicio_anterior, fim_anterior) as Array<{ bucket: string; total: number }>

  const serieTemporal: PontoSerie[] = linhasSerie.map((r, i) => {
    const dataInicio = bucketParaData(r.bucket)
    return {
      rotulo: formatarRotulo(dataInicio, gran),
      data_inicio: dataInicio,
      total: r.total,
      total_anterior: linhasSerieAnterior[i]?.total ?? 0,
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

  // Produtos parados — janela fixa de 30 dias, independente do filtro da dashboard.
  // dias_parado = dias desde a última venda do produto, ou desde o cadastro se nunca vendeu.
  // Aparece se >= 30 dias parado. Top 5 ordenado pelos mais críticos.
  const produtosParados = db
    .prepare(
      `SELECT * FROM (
         SELECT
           p.id AS produto_id,
           p.nome,
           p.estoque,
           p.categoria,
           CAST(
             julianday('now') - julianday(
               COALESCE(
                 (SELECT MAX(date(v.data))
                  FROM itens_venda iv
                  JOIN vendas v ON v.id = iv.venda_id
                  WHERE iv.produto_id = p.id),
                 date(p.data_cadastro),
                 '2000-01-01'
               )
             ) AS INTEGER
           ) AS dias_parado
         FROM produtos p
         WHERE p.estoque > 0
       )
       WHERE dias_parado >= 30
       ORDER BY dias_parado DESC, estoque DESC, nome COLLATE NOCASE
       LIMIT 5`
    )
    .all() as ProdutoParado[]

  // Estoque baixo — entre 1 e 5 unidades. Zero é descontinuado/sem estoque, não alerta.
  // Produto simples: olha o estoque do produto. Produto de grade: olha CADA tamanho
  // (o alerta é por tamanho, ex.: "Camiseta (M)" com 2 unidades).
  const estoqueBaixo = db
    .prepare(
      `SELECT produto_id, nome, estoque, tamanho FROM (
         SELECT p.id AS produto_id, p.nome AS nome, p.estoque AS estoque, NULL AS tamanho
         FROM produtos p
         WHERE p.estoque > 0 AND p.estoque <= 5
           AND NOT EXISTS (SELECT 1 FROM produto_variacoes v WHERE v.produto_id = p.id)
         UNION ALL
         SELECT p.id AS produto_id, p.nome AS nome, pv.estoque AS estoque, pv.tamanho AS tamanho
         FROM produto_variacoes pv
         JOIN produtos p ON p.id = pv.produto_id
         WHERE pv.estoque > 0 AND pv.estoque <= 5
       )
       ORDER BY estoque ASC, nome COLLATE NOCASE
       LIMIT 10`
    )
    .all() as ProdutoEstoqueBaixo[]

  // ── Custo das vendas (base do lucro/margem). Usa o custo ATUAL do produto como
  // estimativa — itens_venda não guarda o custo do momento da venda. Produtos sem
  // custo cadastrado entram como 0 (a UI avisa quando o custo total é 0).
  const custoVendas = (ini: string, fim: string): number => {
    const r = db
      .prepare(
        `SELECT COALESCE(SUM(iv.quantidade * p.custo), 0) AS custo
         FROM itens_venda iv
         JOIN vendas v ON v.id = iv.venda_id
         JOIN produtos p ON p.id = iv.produto_id
         WHERE date(v.data) >= ? AND date(v.data) <= ?`
      )
      .get(ini, fim) as { custo: number }
    return r.custo
  }
  const custoVendasAtual = custoVendas(inicio_atual, fim_atual)
  const custoVendasAnterior = custoVendas(inicio_anterior, fim_anterior)

  // ── Clientes novos no período (pela data_cadastro).
  const clientesNovos = (ini: string, fim: string): number => {
    const r = db
      .prepare(
        `SELECT COUNT(*) AS n FROM clientes
         WHERE date(data_cadastro) >= ? AND date(data_cadastro) <= ?`
      )
      .get(ini, fim) as { n: number }
    return r.n
  }
  const clientesNovosAtual = clientesNovos(inicio_atual, fim_atual)
  const clientesNovosAnterior = clientesNovos(inicio_anterior, fim_anterior)

  // ── Ranking de vendedores por faturamento no período (top 5).
  const rankingVendedores = db
    .prepare(
      `SELECT v.vendedor_id AS vendedor_id,
              vd.nome AS nome,
              COUNT(*) AS num_vendas,
              COALESCE(SUM(v.total), 0) AS receita
       FROM vendas v
       JOIN vendedores vd ON vd.id = v.vendedor_id
       WHERE date(v.data) >= ? AND date(v.data) <= ?
       GROUP BY v.vendedor_id
       ORDER BY receita DESC
       LIMIT 5`
    )
    .all(inicio_atual, fim_atual) as VendedorRanking[]

  // ── Vendas por dia da semana no período (0=Dom … 6=Sáb). Preenche os 7 dias.
  const linhasDow = db
    .prepare(
      `SELECT CAST(strftime('%w', data) AS INTEGER) AS dow,
              COALESCE(SUM(total), 0) AS total
       FROM vendas
       WHERE date(data) >= ? AND date(data) <= ?
       GROUP BY dow`
    )
    .all(inicio_atual, fim_atual) as Array<{ dow: number; total: number }>
  const mapaDow = new Map(linhasDow.map((l) => [l.dow, l.total]))
  const vendasPorDiaSemana: PontoDiaSemana[] = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    total: mapaDow.get(dow) ?? 0
  }))

  // ── Aniversariantes do mês corrente (data_nascimento 'YYYY-MM-DD'). Independe do filtro.
  const aniversariantesMes = db
    .prepare(
      `SELECT id, nome, telefone,
              substr(data_nascimento, 9, 2) || '/' || substr(data_nascimento, 6, 2) AS dia
       FROM clientes
       WHERE data_nascimento IS NOT NULL AND data_nascimento <> ''
         AND substr(data_nascimento, 6, 2) = strftime('%m', 'now')
       ORDER BY substr(data_nascimento, 9, 2) ASC
       LIMIT 12`
    )
    .all() as Aniversariante[]

  // ── Meta de faturamento do mês corrente vs realizado (independe do filtro do topo).
  const metaMensal = Number(lerConfig(CHAVE_META_MENSAL)) || 0
  const { faturamento_mes } = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS faturamento_mes FROM vendas
       WHERE substr(data, 1, 7) = strftime('%Y-%m', 'now')`
    )
    .get() as { faturamento_mes: number }

  const ticketAtual =
    totaisAtual.num_vendas > 0 ? totaisAtual.faturamento / totaisAtual.num_vendas : 0
  const ticketAnterior =
    totaisAnterior.num_vendas > 0 ? totaisAnterior.faturamento / totaisAnterior.num_vendas : 0

  return {
    periodo_dias: periodoDias,
    granularidade: gran,
    faturamento_atual: totaisAtual.faturamento,
    faturamento_anterior: totaisAnterior.faturamento,
    custo_vendas_atual: custoVendasAtual,
    custo_vendas_anterior: custoVendasAnterior,
    devolucoes_atual: devAtual.total,
    devolucoes_anterior: devAnterior.total,
    num_vendas_atual: totaisAtual.num_vendas,
    num_vendas_anterior: totaisAnterior.num_vendas,
    ticket_medio_atual: ticketAtual,
    ticket_medio_anterior: ticketAnterior,
    clientes_novos_atual: clientesNovosAtual,
    clientes_novos_anterior: clientesNovosAnterior,
    meta_mensal: metaMensal,
    faturamento_mes_corrente: faturamento_mes,
    serie_temporal: serieTemporal,
    top_produtos: topProdutos,
    top_categorias: topCategorias,
    ranking_vendedores: rankingVendedores,
    vendas_por_dia_semana: vendasPorDiaSemana,
    aniversariantes_mes: aniversariantesMes,
    distribuicao_pagamento: distribuicaoPagamento,
    recebivel_futuro: recebivelFuturo,
    produtos_parados: produtosParados,
    estoque_baixo: estoqueBaixo
  }
}
