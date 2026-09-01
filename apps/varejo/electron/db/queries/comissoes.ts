import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

/**
 * Comissão de vendedores.
 *
 * ── A regra, inteira ─────────────────────────────────────────────────────────
 *   comissão da venda = percentual × (total da venda − o que foi devolvido)
 *
 * O desconto não aparece na fórmula porque já está embutido: `vendas.total` é o
 * valor FINAL, depois do desconto (ver migration 010). Quem dá desconto reduz a
 * própria comissão sozinho, sem regra escrita pra isso.
 *
 * Venda cancelada não entra em nada — mesma exclusão que o resto dos relatórios
 * já usa (`cancelada = 0`).
 *
 * ── Qual percentual vale ─────────────────────────────────────────────────────
 * Nesta ordem: o carimbado na venda → o vigente do vendedor → o padrão da loja.
 * O porquê do carimbo está na migration 038. Aqui basta saber que o primeiro que
 * existir ganha, e que mudar o percentual de alguém NÃO mexe nas vendas que já
 * foram carimbadas.
 *
 * ── Arredondamento: por venda, nunca no total ────────────────────────────────
 * Cada venda é arredondada em 2 casas e só depois somada. O contrário — somar a
 * base e arredondar no fim — daria um total que não bate com a soma das linhas
 * do detalhamento, e a primeira pergunta de quem confere no papel seria
 * exatamente essa diferença de centavos.
 *
 * ── Uma inconsistência herdada, mantida de propósito ─────────────────────────
 * `vendas.data` é gravada em UTC (CURRENT_TIMESTAMP). Venda feita depois das 21h
 * no último dia do mês cai no mês seguinte. Está ERRADO, e está errado no app
 * inteiro — `listarVendas` e os relatórios de faturamento fatiam a mesma coluna
 * do mesmo jeito. Corrigir só aqui faria a comissão de agosto discordar do
 * faturamento de agosto, que é pior que o erro original: dois números certos
 * sozinhos e mentirosos juntos. O conserto é uma frente própria, no app todo.
 */

export const CHAVE_COMISSAO_PADRAO = 'comissao_pct_padrao'

export type LinhaComissao = {
  vendedor_id: number | null
  vendedor_nome: string
  ativo: number
  qtd_vendas: number
  base: number
  valor_comissao: number
  /** Percentual vigente do vendedor hoje — o que vale para as PRÓXIMAS vendas. */
  pct_vigente: number
  /** 1 quando as vendas do período foram carimbadas com percentuais diferentes. */
  pct_misto: number
  /** 0 na linha "Sem vendedor": ela informa, mas não gera comissão pra ninguém. */
  comissionavel: number
  pagamento_id: number | null
  pago_em: string | null
  valor_pago_comissao: number | null
}

export type VendaComissao = {
  venda_id: number
  data: string
  cliente_nome: string | null
  total: number
  devolvido: number
  base: number
  pct: number
  valor_comissao: number
}

export type PagamentoComissao = {
  id: number
  vendedor_id: number
  vendedor_nome: string
  periodo_inicio: string
  periodo_fim: string
  qtd_vendas: number
  valor_base: number
  valor_comissao: number
  pago_em: string
  pago_por_nome: string | null
  observacao: string | null
}

// ── Percentual padrão da loja ────────────────────────────────────────────────

export function obterComissaoPadrao(): number {
  const db = obterBancoDeDados()
  const row = db
    .prepare('SELECT valor FROM config WHERE chave = ?')
    .get(CHAVE_COMISSAO_PADRAO) as { valor: string } | undefined
  const n = Number(row?.valor)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Valida um percentual de comissão. Recusa o que não é número, o negativo e o
 * acima de 100 — comissão maior que a venda inteira é erro de digitação, não
 * regra de negócio. Sem esta trava, um "300" digitado sem querer viraria uma
 * folha de pagamento de três vezes o faturamento, sem aviso nenhum na tela.
 */
export function validarPct(pct: number): number {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) {
    throw new Error('Percentual de comissão inválido.')
  }
  if (pct < 0) throw new Error('O percentual de comissão não pode ser negativo.')
  if (pct > 100) throw new Error('O percentual de comissão não pode passar de 100%.')
  return +pct.toFixed(2)
}

export function definirComissaoPadrao(pct: number): void {
  const db = obterBancoDeDados()
  const limpo = validarPct(pct)
  db.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').run(
    CHAVE_COMISSAO_PADRAO,
    String(limpo)
  )
}

/**
 * A aba "Comissões" só existe pra quem usa comissão.
 *
 * Em vez de um interruptor separado, quem liga o módulo é a própria regra de
 * negócio: definiu percentual (na loja ou em alguém), adotou a funcionalidade.
 * Loja que não paga comissão nunca vê a aba e não precisa saber que ela existe.
 *
 * O terceiro caso é o que evita a pegadinha: se o gerente zerar os percentuais
 * depois de já ter pago comissão, a aba PRECISA continuar existindo — senão o
 * histórico de pagamentos some da vista junto com o percentual.
 */
export function comissoesConfiguradas(): boolean {
  const db = obterBancoDeDados()
  if (obterComissaoPadrao() > 0) return true
  const algum = db
    .prepare(
      `SELECT 1 FROM vendedores WHERE ativo = 1 AND COALESCE(comissao_pct, 0) > 0
       UNION ALL
       SELECT 1 FROM comissoes_pagas
       LIMIT 1`
    )
    .get()
  return algum !== undefined
}

// ── Apuração ─────────────────────────────────────────────────────────────────

/** Primeiro e último dia de um mês 'YYYY-MM'. */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mês inválido.')
  const [ano, m] = mes.split('-').map(Number)
  if (m < 1 || m > 12) throw new Error('Mês inválido.')
  const ultimo = new Date(ano, m, 0).getDate()
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

function validarPeriodo(inicio: string, fim: string): void {
  const formato = /^\d{4}-\d{2}-\d{2}$/
  if (!formato.test(inicio) || !formato.test(fim)) {
    throw new Error('Período inválido.')
  }
  if (inicio > fim) throw new Error('A data inicial não pode ser depois da final.')
}

// Vendas do período já com base e percentual resolvidos. Uma fonte só para o
// resumo, o detalhamento e o fechamento: se as três divergissem, o gerente
// pagaria um número que a tela não sabe explicar.
const CTE_CALCULO = `
  WITH dev AS (
    SELECT venda_id, SUM(valor_total) AS valor FROM devolucoes GROUP BY venda_id
  ),
  calc AS (
    SELECT
      v.id                 AS venda_id,
      v.vendedor_id        AS vendedor_id,
      v.data               AS data,
      v.cliente_id         AS cliente_id,
      v.total              AS total,
      COALESCE(d.valor, 0) AS devolvido,
      MAX(0, ROUND(v.total - COALESCE(d.valor, 0), 2)) AS base,
      COALESCE(v.comissao_pct, vd.comissao_pct, @padrao) AS pct
    FROM vendas v
    LEFT JOIN dev d ON d.venda_id = v.id
    LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
    WHERE v.cancelada = 0
      AND date(v.data) BETWEEN @inicio AND @fim
  )
`

export function resumoComissoes(inicio: string, fim: string): LinhaComissao[] {
  validarPeriodo(inicio, fim)
  const db = obterBancoDeDados()
  return db
    .prepare(
      `${CTE_CALCULO},
       agregado AS (
         SELECT
           c.vendedor_id AS vendedor_id,
           COUNT(*) AS qtd_vendas,
           ROUND(SUM(c.base), 2) AS base,
           -- Venda sem vendedor (anterior à migration 009) entra na base pra
           -- explicar a diferença contra o faturamento, mas não comissiona
           -- ninguém: não há a quem pagar.
           ROUND(SUM(CASE WHEN c.vendedor_id IS NULL THEN 0
                          ELSE ROUND(c.base * c.pct / 100.0, 2) END), 2) AS valor_comissao,
           COUNT(DISTINCT c.pct) AS pcts_distintos
         FROM calc c
         GROUP BY c.vendedor_id
       )
       SELECT
         a.vendedor_id AS vendedor_id,
         COALESCE(vd.nome, 'Sem vendedor') AS vendedor_nome,
         COALESCE(vd.ativo, 0) AS ativo,
         a.qtd_vendas AS qtd_vendas,
         a.base AS base,
         a.valor_comissao AS valor_comissao,
         COALESCE(vd.comissao_pct, @padrao) AS pct_vigente,
         CASE WHEN a.pcts_distintos > 1 THEN 1 ELSE 0 END AS pct_misto,
         CASE WHEN a.vendedor_id IS NULL THEN 0 ELSE 1 END AS comissionavel,
         cp.id AS pagamento_id,
         cp.pago_em AS pago_em,
         cp.valor_comissao AS valor_pago_comissao
       FROM agregado a
       LEFT JOIN vendedores vd ON vd.id = a.vendedor_id
       LEFT JOIN comissoes_pagas cp
              ON cp.vendedor_id = a.vendedor_id
             AND cp.periodo_inicio = @inicio
             AND cp.periodo_fim = @fim
       ORDER BY (a.vendedor_id IS NULL), a.valor_comissao DESC, vendedor_nome COLLATE NOCASE`
    )
    .all({ inicio, fim, padrao: obterComissaoPadrao() }) as LinhaComissao[]
}

/** Venda a venda de um vendedor no período — é como o gerente responde "por que deu isso?". */
export function detalheComissao(
  vendedorId: number | null,
  inicio: string,
  fim: string
): VendaComissao[] {
  validarPeriodo(inicio, fim)
  const db = obterBancoDeDados()
  const filtro = vendedorId === null ? 'c.vendedor_id IS NULL' : 'c.vendedor_id = @vendedor_id'
  return db
    .prepare(
      `${CTE_CALCULO}
       SELECT
         c.venda_id AS venda_id,
         c.data AS data,
         cl.nome AS cliente_nome,
         c.total AS total,
         c.devolvido AS devolvido,
         c.base AS base,
         c.pct AS pct,
         CASE WHEN c.vendedor_id IS NULL THEN 0
              ELSE ROUND(c.base * c.pct / 100.0, 2) END AS valor_comissao
       FROM calc c
       LEFT JOIN clientes cl ON cl.id = c.cliente_id
       WHERE ${filtro}
       ORDER BY c.data DESC, c.venda_id DESC`
    )
    // O parâmetro do vendedor só entra quando o SQL o cita: driver reclama de
    // parâmetro nomeado que sobra, e o ramo "Sem vendedor" filtra por IS NULL.
    .all(
      vendedorId === null
        ? { inicio, fim, padrao: obterComissaoPadrao() }
        : { inicio, fim, padrao: obterComissaoPadrao(), vendedor_id: vendedorId }
    ) as VendaComissao[]
}

// ── Fechamento ───────────────────────────────────────────────────────────────

/**
 * Registra que a comissão de um vendedor num período foi PAGA.
 *
 * O valor é recalculado aqui dentro e o que vier da tela é ignorado. Não é
 * desconfiança do front: é que o valor pago vira registro contábil, e registro
 * que aceita número de fora é registro que pode ser fabricado por qualquer
 * chamada ao canal.
 */
export function registrarPagamentoComissao(dados: {
  vendedor_id: number
  periodo_inicio: string
  periodo_fim: string
  pago_por_id: number | null
  observacao?: string | null
}): { id: number; valor_comissao: number } {
  const db = obterBancoDeDados()
  const { vendedor_id, periodo_inicio, periodo_fim } = dados
  validarPeriodo(periodo_inicio, periodo_fim)

  const vendedor = db.prepare('SELECT nome FROM vendedores WHERE id = ?').get(vendedor_id) as
    | { nome: string }
    | undefined
  if (!vendedor) throw new Error('Vendedor não encontrado.')

  return db.transaction(() => {
    // A trava que segura dinheiro: dois períodos que se encostam pagariam os
    // dias em comum duas vezes. Intervalos se sobrepõem quando cada um começa
    // antes de o outro terminar.
    const conflito = db
      .prepare(
        `SELECT periodo_inicio, periodo_fim, pago_em FROM comissoes_pagas
         WHERE vendedor_id = ? AND periodo_inicio <= ? AND periodo_fim >= ?
         ORDER BY periodo_inicio LIMIT 1`
      )
      .get(vendedor_id, periodo_fim, periodo_inicio) as
      | { periodo_inicio: string; periodo_fim: string; pago_em: string }
      | undefined
    if (conflito) {
      const br = (d: string): string => d.slice(0, 10).split('-').reverse().join('/')
      throw new Error(
        `A comissão de ${vendedor.nome} de ${br(conflito.periodo_inicio)} a ` +
          `${br(conflito.periodo_fim)} já foi paga em ${br(conflito.pago_em)}. ` +
          'Estorne aquele pagamento antes de fechar um período que o inclua.'
      )
    }

    const linha = resumoComissoes(periodo_inicio, periodo_fim).find(
      (l) => l.vendedor_id === vendedor_id
    )
    if (!linha || linha.valor_comissao <= 0) {
      throw new Error('Não há comissão a pagar para este vendedor neste período.')
    }

    const r = db
      .prepare(
        `INSERT INTO comissoes_pagas
           (vendedor_id, periodo_inicio, periodo_fim, qtd_vendas, valor_base,
            valor_comissao, pago_em, pago_por_id, observacao)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?, ?)`
      )
      .run(
        vendedor_id,
        periodo_inicio,
        periodo_fim,
        linha.qtd_vendas,
        linha.base,
        linha.valor_comissao,
        dados.pago_por_id,
        dados.observacao?.trim() || null
      )

    return { id: r.lastInsertRowid as number, valor_comissao: linha.valor_comissao }
  })()
}

/** Desfaz um fechamento — o gerente errou o período, ou o valor mudou. */
export function estornarPagamentoComissao(id: number): void {
  const db = obterBancoDeDados()
  const r = db.prepare('DELETE FROM comissoes_pagas WHERE id = ?').run(id)
  if (r.changes === 0) throw new Error('Pagamento de comissão não encontrado.')
}

export function listarPagamentosComissao(vendedorId?: number): PagamentoComissao[] {
  const db = obterBancoDeDados()
  const filtro = vendedorId ? 'WHERE cp.vendedor_id = @vendedor_id' : ''
  return db
    .prepare(
      `SELECT cp.id, cp.vendedor_id, vd.nome AS vendedor_nome,
              cp.periodo_inicio, cp.periodo_fim, cp.qtd_vendas,
              cp.valor_base, cp.valor_comissao, cp.pago_em,
              pg.nome AS pago_por_nome, cp.observacao
       FROM comissoes_pagas cp
       JOIN vendedores vd ON vd.id = cp.vendedor_id
       LEFT JOIN vendedores pg ON pg.id = cp.pago_por_id
       ${filtro}
       ORDER BY cp.pago_em DESC, cp.id DESC`
    )
    .all(vendedorId ? { vendedor_id: vendedorId } : {}) as PagamentoComissao[]
}
