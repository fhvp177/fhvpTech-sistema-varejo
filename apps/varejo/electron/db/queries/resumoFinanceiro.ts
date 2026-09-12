import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

/**
 * O mês fechado do dinheiro: o que entrou, o que saiu e com quanto terminou.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Relatórios financeiros como histórico, em vez de obrigar o usuário a
 * exportar para ter acesso aos dados. Ele escolhe o mês e o ano e vê na tela
 * tudo o que entraria no relatório exportado."
 *
 * Até aqui o livro-caixa só respondia por extrato: uma conta, linha por linha.
 * Para saber quanto a loja gastou em abril era preciso mandar imprimir e somar
 * no papel. Este arquivo é a soma, feita no banco.
 *
 * ── ⚠️ A regra que decide o lado de cada lançamento ─────────────────────────
 * O livro guarda a direção no SINAL do valor, não num campo "entrada/saída".
 * Somar positivos de um lado e negativos do outro quase funciona, e o "quase" é
 * o ESTORNO: quando uma conta paga é estornada, o dinheiro VOLTA para a loja e
 * o lançamento é positivo. Contado como receita, ele apareceria como se a loja
 * tivesse faturado, quando na verdade ela só gastou menos.
 *
 * Por isso o estorno volta para o lado de onde saiu, e lá entra com o sinal que
 * tem: estorno de conta paga ABATE despesa, estorno de recebimento ABATE
 * receita. É a única maneira de as duas linhas brutas dizerem o que dizem.
 *
 * ── ⚠️ Sangria e suprimento NÃO são receita nem despesa ─────────────────────
 * Sangria é dinheiro saindo da gaveta e suprimento é dinheiro entrando nela.
 * Nenhum dos dois é venda ou gasto: é a mesma nota mudando de lugar. Contá-los
 * como despesa faria o mês parecer catastrófico numa loja que só leva o caixa
 * para o cofre toda noite.
 *
 * Eles saem numa linha própria, e é essa linha que faz a conta fechar na tela:
 *
 *     saldo inicial + receitas − despesas + movimentações internas = saldo final
 *
 * Sem a linha, o lojista somaria três números, acharia outro, e desconfiaria do
 * painel inteiro (com razão).
 *
 * ── ⚠️ "Mês" aqui é o mês da LOJA ───────────────────────────────────────────
 * `movimentos_financeiros.data` já é gravada em hora local (`datetime('now',
 * 'localtime')`), então comparar o texto com 'YYYY-MM' é comparar o dia que o
 * lojista viveu. Usar `strftime('%Y-%m','now')` aqui traria UTC de volta, que é
 * o defeito que a migration 046 consertou.
 */

export type LinhaDia = {
  /** ISO 'YYYY-MM-DD'. */
  dia: string
  receitas: number
  despesas: number
}

export type LinhaCategoriaDespesa = {
  categoria: string
  total: number
  /** Quantos lançamentos entraram nesta linha. */
  lancamentos: number
}

export type LinhaContaMes = {
  conta_id: number
  nome: string
  tipo: string
  entradas: number
  saidas: number
  saldo_final: number
}

export type ResumoFinanceiroMes = {
  /** 'YYYY-MM'. */
  mes: string
  primeiro_dia: string
  ultimo_dia: string
  saldo_inicial: number
  saldo_final: number
  receitas: number
  despesas: number
  /** receitas − despesas. */
  resultado: number
  /** Sangrias e suprimentos, líquido. Explica a diferença até o saldo final. */
  movimentacoes_internas: number
  /** Quantos lançamentos o mês teve, internos incluídos. Zero = mês sem nada. */
  lancamentos: number
  por_dia: LinhaDia[]
  despesas_por_categoria: LinhaCategoriaDespesa[]
  por_conta: LinhaContaMes[]
}

const arred = (v: number): number => +v.toFixed(2)

const MES_ISO = /^\d{4}-(0[1-9]|1[0-2])$/

/** Último dia do mês, como 'YYYY-MM-DD'. Fevereiro e bissexto inclusos. */
export function ultimoDiaDoMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  // Dia 0 do mês SEGUINTE é o último dia deste. `Date.UTC` para o fuso da
  // máquina não empurrar a data um dia para trás.
  const d = new Date(Date.UTC(ano, m, 0))
  return d.toISOString().slice(0, 10)
}

/**
 * Rótulo do lado de cada lançamento, em SQL.
 *
 * Fica numa constante porque as quatro consultas abaixo precisam dele idêntico:
 * se a soma do topo e a lista por dia discordassem em um único tipo, as barras
 * do gráfico não somariam o total escrito acima delas.
 */
const LADO = `
  CASE
    WHEN m.tipo IN ('sangria','suprimento','transferencia') THEN 'interno'
    WHEN m.tipo = 'estorno' AND m.origem_tipo = 'conta_pagar' THEN 'despesa'
    WHEN m.tipo = 'estorno' THEN 'receita'
    WHEN m.tipo = 'despesa' THEN 'despesa'
    WHEN m.valor >= 0 THEN 'receita'
    ELSE 'despesa'
  END`

/**
 * O nome da linha de despesa, em SQL.
 *
 * ⚠️ Ele aparece DUAS vezes na consulta, no SELECT e no GROUP BY, e a repetição
 * é obrigatória. Escrever `GROUP BY categoria` apontando para o apelido não
 * funciona: existe uma coluna chamada `categoria` em `contas_pagar`, e o SQLite
 * resolve o nome do GROUP BY contra as colunas da tabela ANTES de olhar o
 * apelido do SELECT.
 *
 * O estrago é silencioso e específico: o agrupamento cai em `cp.categoria`, que
 * é NULL tanto para a conta sem categoria quanto para a saída que nem tem conta.
 * Os dois viram um grupo só, com um nome escolhido a esmo entre os dois. Foi
 * exatamente o que aconteceu na primeira versão deste arquivo: "Outras saídas"
 * desapareceu da tela e o valor dela foi parar dentro de "Sem categoria".
 */
const ROTULO_CATEGORIA = `
  CASE
    WHEN m.origem_tipo = 'conta_pagar'
      THEN COALESCE(NULLIF(TRIM(cp.categoria), ''), 'Sem categoria')
    ELSE 'Outras saídas'
  END`

export function resumoFinanceiroMes(mes: string): ResumoFinanceiroMes {
  if (!MES_ISO.test(mes)) throw new Error('Mês inválido. Use o formato AAAA-MM.')

  const db = obterBancoDeDados()
  const primeiroDia = `${mes}-01`
  const ultimoDia = ultimoDiaDoMes(mes)
  // O livro grava 'YYYY-MM-DD HH:MM:SS'. Comparar com o dia seco deixaria de
  // fora tudo o que aconteceu depois da meia-noite do último dia.
  const fimDoMes = `${ultimoDia} 23:59:59`

  // ── Os três totais do mês ────────────────────────────────────────────────
  const totais = db
    .prepare(
      `SELECT ${LADO} AS lado,
              COALESCE(SUM(m.valor), 0) AS total,
              COUNT(*) AS n
         FROM movimentos_financeiros m
        WHERE m.data >= ? AND m.data <= ?
        GROUP BY lado`
    )
    .all(primeiroDia, fimDoMes) as Array<{ lado: string; total: number; n: number }>

  let receitas = 0
  let despesas = 0
  let internas = 0
  let lancamentos = 0
  for (const t of totais) {
    lancamentos += t.n
    // O lado despesa soma valores NEGATIVOS; vira positivo aqui, uma vez só.
    if (t.lado === 'receita') receitas = t.total
    else if (t.lado === 'despesa') despesas = -t.total
    else internas = t.total
  }
  receitas = arred(receitas)
  despesas = arred(despesas)
  internas = arred(internas)

  /*
   * ── Saldo do mês: o dinheiro que a loja TEM, não o que ela ganhou ─────────
   *
   * ⚠️ Todas as contas entram, inclusive as desativadas. Uma conta desativada
   * com saldo continua com dinheiro dentro, e escondê-la faria o saldo final da
   * tela não bater com a soma das contas na aba de Contas.
   */
  const saldoEm = (operador: '<' | '<=', limite: string): number => {
    const r = db
      .prepare(
        `SELECT COALESCE(SUM(c.saldo_inicial), 0) + COALESCE((
                  SELECT SUM(m.valor) FROM movimentos_financeiros m
                   WHERE m.data ${operador} ?
                ), 0) AS s
           FROM contas_financeiras c`
      )
      .get(limite) as { s: number }
    return arred(r?.s ?? 0)
  }

  /*
   * ⚠️ O saldo inicial é o que havia ANTES do primeiro dia, e o operador é `<`,
   * não `<=`. A data no livro é 'YYYY-MM-DD HH:MM:SS', e em texto qualquer hora
   * do dia 1 vem DEPOIS do dia 1 seco. Com `<=` o "antes do mês" engoliria o
   * dia 1 inteiro, e o mês começaria já com as vendas da manhã somadas no saldo
   * de abertura: o painel mostraria o mesmo dinheiro duas vezes.
   */
  const saldoInicial = saldoEm('<', primeiroDia)
  const saldoFinal = saldoEm('<=', fimDoMes)

  // ── Receitas e despesas dia a dia ────────────────────────────────────────
  const linhasDia = db
    .prepare(
      `SELECT date(m.data) AS dia, ${LADO} AS lado, COALESCE(SUM(m.valor), 0) AS total
         FROM movimentos_financeiros m
        WHERE m.data >= ? AND m.data <= ?
        GROUP BY dia, lado
        ORDER BY dia`
    )
    .all(primeiroDia, fimDoMes) as Array<{ dia: string; lado: string; total: number }>

  /*
   * O mês sai COMPLETO, com os dias vazios em zero. Um gráfico só com os dias
   * que tiveram movimento mente sobre o ritmo da loja: três vendas em três
   * segundas viram três barras coladas, como se tivessem sido três dias
   * seguidos de movimento.
   */
  const mapaDia = new Map<string, LinhaDia>()
  const diasNoMes = Number(ultimoDia.slice(8, 10))
  for (let d = 1; d <= diasNoMes; d++) {
    const dia = `${mes}-${String(d).padStart(2, '0')}`
    mapaDia.set(dia, { dia, receitas: 0, despesas: 0 })
  }
  for (const l of linhasDia) {
    const alvo = mapaDia.get(l.dia)
    if (!alvo) continue // fora do mês não existe, mas o filtro já garante
    if (l.lado === 'receita') alvo.receitas = arred(l.total)
    else if (l.lado === 'despesa') alvo.despesas = arred(-l.total)
  }
  const porDia = [...mapaDia.values()]

  /*
   * ── Despesas por categoria ───────────────────────────────────────────────
   *
   * A categoria é a que o lojista escreveu na conta a pagar (campo livre, com
   * sugestões). Ela só existe para a saída que NASCEU de uma conta cadastrada.
   *
   * ⚠️ O que não nasceu de conta a pagar (um ajuste na mão, uma devolução em
   * dinheiro) cai em "Outras saídas", com nome próprio, e não em "Sem
   * categoria". São coisas diferentes: uma é conta cadastrada sem categoria
   * preenchida, a outra é saída que nunca teve categoria para preencher.
   */
  const linhasCategoria = db
    .prepare(
      `SELECT ${ROTULO_CATEGORIA} AS categoria,
              COALESCE(SUM(m.valor), 0) AS total,
              COUNT(*) AS lancamentos
         FROM movimentos_financeiros m
         LEFT JOIN contas_pagar cp
                ON m.origem_tipo = 'conta_pagar' AND cp.id = m.origem_id
        WHERE m.data >= ? AND m.data <= ?
          AND ${LADO} = 'despesa'
        GROUP BY ${ROTULO_CATEGORIA}`
    )
    .all(primeiroDia, fimDoMes) as Array<{
    categoria: string
    total: number
    lancamentos: number
  }>

  const despesasPorCategoria: LinhaCategoriaDespesa[] = linhasCategoria
    .map((l) => ({ categoria: l.categoria, total: arred(-l.total), lancamentos: l.lancamentos }))
    /*
     * Linha que ficou em zero ou negativa some. Acontece quando tudo o que foi
     * pago numa categoria acabou estornado no mesmo mês: mostrar "Aluguel: R$
     * 0,00" sugeriria que o aluguel foi de graça.
     */
    .filter((l) => l.total > 0)
    .sort((a, b) => {
      if (a.categoria === 'Outras saídas') return 1
      if (b.categoria === 'Outras saídas') return -1
      if (b.total !== a.total) return b.total - a.total
      return a.categoria.localeCompare(b.categoria, 'pt-BR')
    })

  // ── Onde o dinheiro está, conta por conta ────────────────────────────────
  const porConta = db
    .prepare(
      `SELECT c.id AS conta_id, c.nome, c.tipo,
              COALESCE((SELECT SUM(m.valor) FROM movimentos_financeiros m
                         WHERE m.conta_id = c.id AND m.valor > 0
                           AND m.data >= ? AND m.data <= ?), 0) AS entradas,
              COALESCE((SELECT SUM(-m.valor) FROM movimentos_financeiros m
                         WHERE m.conta_id = c.id AND m.valor < 0
                           AND m.data >= ? AND m.data <= ?), 0) AS saidas,
              ROUND(c.saldo_inicial + COALESCE((
                SELECT SUM(m.valor) FROM movimentos_financeiros m
                 WHERE m.conta_id = c.id AND m.data <= ?), 0), 2) AS saldo_final
         FROM contas_financeiras c
        ORDER BY c.ativa DESC, c.tipo = 'caixa' DESC, c.nome COLLATE NOCASE`
    )
    .all(
      primeiroDia,
      fimDoMes,
      primeiroDia,
      fimDoMes,
      fimDoMes
    ) as LinhaContaMes[]

  return {
    mes,
    primeiro_dia: primeiroDia,
    ultimo_dia: ultimoDia,
    saldo_inicial: saldoInicial,
    saldo_final: saldoFinal,
    receitas,
    despesas,
    resultado: arred(receitas - despesas),
    movimentacoes_internas: internas,
    lancamentos,
    por_dia: porDia,
    despesas_por_categoria: despesasPorCategoria,
    por_conta: porConta.map((c) => ({
      ...c,
      entradas: arred(c.entradas),
      saidas: arred(c.saidas),
      saldo_final: arred(c.saldo_final)
    }))
  }
}

/**
 * Os meses que têm alguma coisa no livro, do mais novo para o mais velho.
 *
 * Serve ao seletor da tela: sem isso ele ofereceria doze meses vazios de um ano
 * em que a loja nem existia, e o lojista clicaria em cada um para descobrir.
 */
export function mesesComMovimento(): string[] {
  const db = obterBancoDeDados()
  const linhas = db
    .prepare(
      `SELECT DISTINCT substr(data, 1, 7) AS mes
         FROM movimentos_financeiros
        WHERE data IS NOT NULL AND data <> ''
        ORDER BY mes DESC`
    )
    .all() as Array<{ mes: string }>
  return linhas.map((l) => l.mes).filter((m) => MES_ISO.test(m))
}
