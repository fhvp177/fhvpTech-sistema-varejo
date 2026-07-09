import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import type { AlertaVivo } from './notificacoes'

// "Contas a pagar" — o que a loja deve (fornecedor, aluguel, luz, salário…).
// Espelha a mecânica do "A receber": valor_pago é a fonte da verdade e o
// restante = valor_total − valor_pago. A `situacao` é derivada (nunca gravada):
// - paga:    valor_pago >= valor_total
// - vencida: em aberto e vencimento já passou
// - aberta:  em aberto e ainda no prazo (ou sem data de vencimento)

export type SituacaoConta = 'aberta' | 'vencida' | 'paga'

export type ContaPagar = {
  id: number
  descricao: string
  categoria: string | null
  fornecedor_id: number | null
  fornecedor_nome: string | null
  valor_total: number
  valor_pago: number
  restante: number
  vencimento: string | null
  observacao: string | null
  criada_em: string
  pago_em: string | null
  situacao: SituacaoConta
}

export type DadosContaPagar = {
  descricao: string
  categoria: string | null
  fornecedor_id: number | null
  valor_total: number
  vencimento: string | null
  observacao: string | null
}

export type FiltroContas = 'aberto' | 'pago' | 'todas'

type LinhaConta = Omit<ContaPagar, 'restante' | 'situacao'>

const fmtBRL = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Enriquece a linha crua com o restante e a situação, calculados no mesmo lugar
// para as duas leituras (lista e detalhe) nunca divergirem.
function decorar(linha: LinhaConta): ContaPagar {
  const hoje = new Date().toISOString().slice(0, 10)
  const restante = Math.max(0, +(linha.valor_total - linha.valor_pago).toFixed(2))
  const situacao: SituacaoConta =
    linha.valor_pago >= linha.valor_total
      ? 'paga'
      : linha.vencimento && linha.vencimento < hoje
        ? 'vencida'
        : 'aberta'
  return { ...linha, restante, situacao }
}

const SELECT_BASE = `
  SELECT c.id, c.descricao, c.categoria, c.fornecedor_id, f.nome AS fornecedor_nome,
         c.valor_total, c.valor_pago, c.vencimento, c.observacao, c.criada_em, c.pago_em
  FROM contas_pagar c
  LEFT JOIN fornecedores f ON f.id = c.fornecedor_id
`

// Abertas primeiro, dentro delas as com vencimento mais próximo no topo (vencidas
// à frente); contas sem data de vencimento vão para o fim; pagas por último.
const ORDER_BASE = `
  ORDER BY (c.valor_pago >= c.valor_total) ASC,
           (c.vencimento IS NULL) ASC,
           c.vencimento ASC,
           c.id DESC
`

export function listarContasPagar(filtro: FiltroContas = 'todas'): ContaPagar[] {
  const db = obterBancoDeDados()
  const where =
    filtro === 'aberto'
      ? 'WHERE c.valor_pago < c.valor_total'
      : filtro === 'pago'
        ? 'WHERE c.valor_pago >= c.valor_total'
        : ''
  const linhas = db.prepare(`${SELECT_BASE} ${where} ${ORDER_BASE}`).all() as LinhaConta[]
  return linhas.map(decorar)
}

export function buscarContaPagarPorId(id: number): ContaPagar | undefined {
  const db = obterBancoDeDados()
  const linha = db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(id) as LinhaConta | undefined
  return linha ? decorar(linha) : undefined
}

export function criarContaPagar(dados: DadosContaPagar): ContaPagar {
  const db = obterBancoDeDados()
  const result = db
    .prepare(
      `INSERT INTO contas_pagar (descricao, categoria, fornecedor_id, valor_total, vencimento, observacao)
       VALUES (@descricao, @categoria, @fornecedor_id, @valor_total, @vencimento, @observacao)`
    )
    .run(dados)
  return buscarContaPagarPorId(result.lastInsertRowid as number)!
}

export function atualizarContaPagar(id: number, dados: DadosContaPagar): void {
  const db = obterBancoDeDados()
  db.prepare(
    `UPDATE contas_pagar
     SET descricao = @descricao, categoria = @categoria, fornecedor_id = @fornecedor_id,
         valor_total = @valor_total, vencimento = @vencimento, observacao = @observacao
     WHERE id = @id`
  ).run({ ...dados, id })
  // Mantém o pago_em coerente com o novo total nos dois sentidos: se a edição
  // deixou a conta quitada, carimba (preservando um carimbo já existente); se a
  // reabriu (ex.: subiram o valor acima do que já foi pago), limpa o carimbo —
  // senão ela seguiria contando no "Pago no mês".
  db.prepare(
    `UPDATE contas_pagar
     SET pago_em = CASE WHEN valor_pago >= valor_total
                        THEN COALESCE(pago_em, datetime('now', 'localtime'))
                        ELSE NULL END
     WHERE id = ?`
  ).run(id)
}

export function deletarContaPagar(id: number): void {
  const db = obterBancoDeDados()
  db.prepare('DELETE FROM contas_pagar WHERE id = ?').run(id)
}

// Registra um pagamento (parcial ou total), espelhando registrarPagamentoParcial
// das vendas: credita em valor_pago, sem nunca ultrapassar o total, e carimba o
// pago_em quando a conta é quitada por inteiro.
export function registrarPagamentoConta(id: number, valor: number): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    const conta = db
      .prepare('SELECT valor_total, valor_pago FROM contas_pagar WHERE id = ?')
      .get(id) as { valor_total: number; valor_pago: number } | undefined
    if (!conta) throw new Error('Conta não encontrada.')
    if (valor <= 0) throw new Error('O valor deve ser maior que zero.')

    const restante = +(conta.valor_total - conta.valor_pago).toFixed(2)
    if (restante <= 0) throw new Error('Esta conta já está totalmente paga.')

    const valorEfetivo = Math.min(valor, restante)
    const novoValorPago = +(conta.valor_pago + valorEfetivo).toFixed(2)

    if (novoValorPago >= conta.valor_total) {
      db.prepare(
        `UPDATE contas_pagar SET valor_pago = ?, pago_em = datetime('now', 'localtime') WHERE id = ?`
      ).run(novoValorPago, id)
    } else {
      db.prepare('UPDATE contas_pagar SET valor_pago = ? WHERE id = ?').run(novoValorPago, id)
    }
  })()
}

// Desfaz os pagamentos de uma conta (volta pra "em aberto"). Simples e suficiente
// para um livro-caixa pessoal: zera o pago e limpa o carimbo de quitação.
export function estornarPagamentoConta(id: number): void {
  const db = obterBancoDeDados()
  const info = db
    .prepare('UPDATE contas_pagar SET valor_pago = 0, pago_em = NULL WHERE id = ?')
    .run(id)
  if (info.changes === 0) throw new Error('Conta não encontrada.')
}

// ── Resumo para os cartões do topo da página ──
export type ResumoContasPagar = {
  vencido_total: number   // em aberto, vencimento já passado
  vence_7d_total: number  // em aberto, vence de hoje até +7 dias
  aberto_total: number    // tudo que ainda falta pagar (todas as abertas)
  pago_mes: number        // total das contas quitadas no mês corrente
}

export function resumoContasPagar(): ResumoContasPagar {
  const db = obterBancoDeDados()
  const abertas = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN vencimento IS NOT NULL AND date(vencimento) < date('now')
                           THEN valor_total - valor_pago ELSE 0 END), 0) AS vencido_total,
         COALESCE(SUM(CASE WHEN vencimento IS NOT NULL
                            AND date(vencimento) >= date('now')
                            AND date(vencimento) <= date('now', '+7 days')
                           THEN valor_total - valor_pago ELSE 0 END), 0) AS vence_7d_total,
         COALESCE(SUM(valor_total - valor_pago), 0) AS aberto_total
       FROM contas_pagar
       WHERE valor_pago < valor_total`
    )
    .get() as { vencido_total: number; vence_7d_total: number; aberto_total: number }

  const { pago_mes } = db
    .prepare(
      `SELECT COALESCE(SUM(valor_total), 0) AS pago_mes FROM contas_pagar
       WHERE pago_em IS NOT NULL AND strftime('%Y-%m', pago_em) = strftime('%Y-%m', 'now', 'localtime')`
    )
    .get() as { pago_mes: number }

  return {
    vencido_total: +abertas.vencido_total.toFixed(2),
    vence_7d_total: +abertas.vence_7d_total.toFixed(2),
    aberto_total: +abertas.aberto_total.toFixed(2),
    pago_mes: +pago_mes.toFixed(2)
  }
}

// ── Números para o dashboard (espelho de aReceberPorVencimento / recebivel_futuro) ──

export type APagarPorVencimento = {
  a_vencer: number // vencimento de hoje em diante, ainda em aberto
  vencido: number  // vencimento já passou e não foi pago (em atraso)
}

// Quanto a loja tem a pagar com VENCIMENTO dentro de [inicio, fim] (ISO
// 'YYYY-MM-DD', inclusivo). Âncora é o vencimento, não a data de cadastro.
export function aPagarPorVencimento(inicio: string, fim: string): APagarPorVencimento {
  const db = obterBancoDeDados()
  const r = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN date(vencimento) >= date('now') THEN valor_total - valor_pago ELSE 0 END), 0) AS a_vencer,
         COALESCE(SUM(CASE WHEN date(vencimento) <  date('now') THEN valor_total - valor_pago ELSE 0 END), 0) AS vencido
       FROM contas_pagar
       WHERE valor_pago < valor_total
         AND vencimento IS NOT NULL
         AND date(vencimento) >= ? AND date(vencimento) <= ?`
    )
    .get(inicio, fim) as APagarPorVencimento
  return { a_vencer: +r.a_vencer.toFixed(2), vencido: +r.vencido.toFixed(2) }
}

export type APagarFuturo = {
  proximos_30d: number
  proximos_60d: number
  proximos_90d: number
}

export function aPagarFuturo(): APagarFuturo {
  const db = obterBancoDeDados()
  const em = (dias: number): number => {
    const { total } = db
      .prepare(
        `SELECT COALESCE(SUM(valor_total - valor_pago), 0) AS total FROM contas_pagar
         WHERE valor_pago < valor_total
           AND vencimento IS NOT NULL
           AND date(vencimento) >= date('now')
           AND date(vencimento) <= date('now', '+' || ? || ' days')`
      )
      .get(dias) as { total: number }
    return +total.toFixed(2)
  }
  return { proximos_30d: em(30), proximos_60d: em(60), proximos_90d: em(90) }
}

// ── Alertas para o sino (mesmo formato AlertaVivo das outras fontes) ──
export function alertasContasPagar(): AlertaVivo[] {
  const db = obterBancoDeDados()
  const alertas: AlertaVivo[] = []
  const hoje = new Date().toISOString().slice(0, 10)

  // Contas vencidas e ainda em aberto — o mais urgente.
  const vencidas = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(valor_total - valor_pago), 0) AS soma
       FROM contas_pagar
       WHERE valor_pago < valor_total AND vencimento IS NOT NULL AND date(vencimento) < date('now')`
    )
    .get() as { n: number; soma: number }
  if (vencidas.n > 0) {
    alertas.push({
      chave: 'contas-vencidas',
      assinatura: `${vencidas.n}:${vencidas.soma.toFixed(2)}`,
      tipo: 'dinheiro',
      severidade: 'critico',
      titulo: 'Contas vencidas',
      descricao: `${vencidas.n} conta(s) a pagar em atraso · ${fmtBRL(vencidas.soma)}`,
      rota: '/contas-pagar',
      acao: null
    })
  }

  // Vencem hoje.
  const hojeConta = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(valor_total - valor_pago), 0) AS soma
       FROM contas_pagar
       WHERE valor_pago < valor_total AND vencimento IS NOT NULL AND date(vencimento) = date('now')`
    )
    .get() as { n: number; soma: number }
  if (hojeConta.n > 0) {
    alertas.push({
      chave: 'contas-vencem-hoje',
      assinatura: `${hojeConta.n}:${hoje}`,
      tipo: 'dinheiro',
      severidade: 'alerta',
      titulo: 'Contas vencem hoje',
      descricao: `${hojeConta.n} conta(s) a pagar · ${fmtBRL(hojeConta.soma)}`,
      rota: '/contas-pagar',
      acao: null
    })
  }

  // Vencem nos próximos 3 dias (excluindo hoje) — heads-up para se organizar.
  const breve = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(valor_total - valor_pago), 0) AS soma
       FROM contas_pagar
       WHERE valor_pago < valor_total AND vencimento IS NOT NULL
         AND date(vencimento) > date('now') AND date(vencimento) <= date('now', '+3 days')`
    )
    .get() as { n: number; soma: number }
  if (breve.n > 0) {
    alertas.push({
      chave: 'contas-vencem-breve',
      assinatura: `${breve.n}:${hoje}`,
      tipo: 'dinheiro',
      severidade: 'info',
      titulo: 'Contas a vencer',
      descricao: `${breve.n} conta(s) vencem nos próximos 3 dias · ${fmtBRL(breve.soma)}`,
      rota: '/contas-pagar',
      acao: null
    })
  }

  return alertas
}
