import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

/**
 * Tráfego pago: quanto custou o anúncio e quanto ele trouxe de volta.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Cards de ROAS e tráfego pago na Dashboard."
 *
 * ── O que o sistema sabia e o que faltava ───────────────────────────────────
 * O sistema já sabia POR ONDE o cliente chegou: a origem de captação existe
 * desde a migration 044, e o cadastro do cliente pergunta. O que não existia em
 * lugar nenhum era o custo: nem a fatura do Instagram nem a do Google passam
 * pelo caixa da loja. Sem o custo não há divisão, e ROAS é uma divisão.
 *
 * Daí a migration 050: o lojista digita, por mês e por canal, quanto gastou.
 *
 * ── ⚠️ Existem DOIS ROAS aqui, e a diferença importa ────────────────────────
 *
 *  **ROAS atribuído** = faturamento dos clientes marcados com um canal pago,
 *  dividido pelo que se gastou naquele canal. É o número honesto, e só vale se
 *  o cadastro de clientes estiver com a origem preenchida. Loja que não
 *  pergunta "como você nos conheceu?" vê zero aqui, e o zero é verdade: não há
 *  como saber.
 *
 *  **ROAS geral** = faturamento da loja INTEIRA dividido pelo mesmo gasto.
 *  Não é atribuição, é ordem de grandeza: responde "para cada real de anúncio,
 *  quanto a loja faturou no total". Conta junto a venda do cliente antigo que
 *  nunca viu anúncio nenhum, então ele sempre parece melhor do que é.
 *
 * Os dois aparecem lado a lado de propósito. Mostrar só o atribuído faria o
 * lojista achar que o anúncio não funciona quando o que falta é preencher a
 * origem; mostrar só o geral faria qualquer campanha parecer um sucesso.
 *
 * ── ⚠️ O investimento é do MÊS, o filtro do Painel não é ────────────────────
 * A fatura do anúncio fecha por mês. O Painel filtra por janela ("últimos 30
 * dias"), que atravessa a virada do mês quase sempre.
 *
 * A saída é ratear por DIA: uma janela que pega 12 dias de abril e 18 de maio
 * leva 12/30 do investimento de abril mais 18/31 do de maio. É aproximação, e
 * está escrito na tela que é. A alternativa seria esconder o card fora do modo
 * "mês", e aí ele quase nunca apareceria.
 */

export type InvestimentoCanal = {
  origem_id: number
  origem_nome: string
  valor: number
  observacao: string | null
  /**
   * Quantos clientes da loja vieram por este canal, em todo o histórico.
   *
   * ⚠️ Não entra em conta nenhuma: serve só para a tela de lançamento poder
   * dizer o que é cada linha. O lojista abriu a tela e perguntou "quais são
   * esses quatro canais?" — a lista são as origens de cliente dele, e
   * "Presencial" e "Indicação" estão ali no meio de "Instagram" sem nada
   * explicando que anúncio se paga só em alguns.
   */
  clientes: number
}

export type CanalTrafego = {
  origem_id: number
  origem_nome: string
  /** Já rateado pelos dias do período. */
  investimento: number
  receita: number
  num_vendas: number
  clientes_novos: number
  /** receita ÷ investimento. Zero quando não houve investimento. */
  roas: number
}

export type ResumoTrafego = {
  inicio: string
  fim: string
  investimento: number
  receita_atribuida: number
  receita_total: number
  roas_atribuido: number
  roas_geral: number
  clientes_novos_atribuidos: number
  /** Custo por cliente novo do canal pago. Zero quando não veio nenhum. */
  custo_por_cliente: number
  /** Quantos clientes da loja ainda estão sem origem preenchida. */
  clientes_sem_origem: number
  canais: CanalTrafego[]
}

const arred = (v: number): number => +v.toFixed(2)
const MES_ISO = /^\d{4}-(0[1-9]|1[0-2])$/
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/

const emDias = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86400000

const iso = (ms: number): string => new Date(ms * 86400000).toISOString().slice(0, 10)

/** Último dia do mês 'YYYY-MM', como 'YYYY-MM-DD'. */
function ultimoDiaDoMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10)
}

/**
 * Os meses que o período encosta, e quanto de cada um ele pegou.
 *
 * A fração é em DIAS do mês, não em dias do período: um período de 30 dias que
 * pega 12 dias de abril leva 12/30 do investimento de abril (abril tem 30
 * dias), e não 12/30 porque o período tem 30. São coisas diferentes, e a
 * segunda daria errado em fevereiro.
 *
 * Exportada para poder ser testada sem banco — é a única aritmética deste
 * arquivo que não é uma soma.
 */
export function mesesDoPeriodo(
  inicioIso: string,
  fimIso: string
): Array<{ mes: string; fracao: number }> {
  if (!DIA_ISO.test(inicioIso) || !DIA_ISO.test(fimIso)) return []
  if (inicioIso > fimIso) return []

  const saida: Array<{ mes: string; fracao: number }> = []
  let mes = inicioIso.slice(0, 7)
  const mesFinal = fimIso.slice(0, 7)

  // Teto de segurança: 600 meses são 50 anos. Sem ele, uma data absurda vinda
  // de um filtro quebrado giraria para sempre e travaria o Painel.
  for (let volta = 0; volta < 600; volta++) {
    const primeiroDoMes = `${mes}-01`
    const ultimoDoMes = ultimoDiaDoMes(mes)
    const de = inicioIso > primeiroDoMes ? inicioIso : primeiroDoMes
    const ate = fimIso < ultimoDoMes ? fimIso : ultimoDoMes
    const diasPegos = emDias(ate) - emDias(de) + 1
    const diasNoMes = Number(ultimoDoMes.slice(8, 10))
    if (diasPegos > 0) {
      saida.push({ mes, fracao: Math.min(1, diasPegos / diasNoMes) })
    }
    if (mes === mesFinal) break
    // Próximo mês: um dia depois do último deste.
    mes = iso(emDias(ultimoDoMes) + 1).slice(0, 7)
  }
  return saida
}

/**
 * O que já está lançado num mês, com TODAS as origens na lista.
 *
 * Origem sem lançamento vem com zero em vez de ficar de fora: a tela de
 * lançamento é uma lista de campos, e canal ausente seria canal que o lojista
 * não consegue preencher.
 */
export function investimentosDoMes(mes: string): InvestimentoCanal[] {
  if (!MES_ISO.test(mes)) throw new Error('Mês inválido. Use o formato AAAA-MM.')
  return obterBancoDeDados()
    .prepare(
      `SELECT o.id AS origem_id, o.nome AS origem_nome,
              COALESCE(i.valor, 0) AS valor,
              i.observacao AS observacao,
              (SELECT COUNT(*) FROM clientes c WHERE c.origem_id = o.id) AS clientes
         FROM origens_cliente o
         LEFT JOIN investimentos_trafego i ON i.origem_id = o.id AND i.mes = ?
        ORDER BY COALESCE(i.valor, 0) DESC, o.nome COLLATE NOCASE`
    )
    .all(mes) as InvestimentoCanal[]
}

/**
 * Grava o mês inteiro de uma vez.
 *
 * ⚠️ Valor zero APAGA a linha em vez de gravar zero. Um zero gravado marcaria o
 * canal como "pago com R$ 0,00" naquele mês, e ele entraria na lista de canais
 * pagos do ROAS com investimento nenhum: a receita dele contaria no numerador
 * sem nada no denominador, inflando o ROAS do período inteiro.
 */
export function gravarInvestimentos(
  mes: string,
  linhas: Array<{ origem_id: number; valor: number; observacao?: string | null }>
): void {
  if (!MES_ISO.test(mes)) throw new Error('Mês inválido. Use o formato AAAA-MM.')
  const db = obterBancoDeDados()

  const gravar = db.prepare(
    `INSERT INTO investimentos_trafego (mes, origem_id, valor, observacao)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(mes, origem_id) DO UPDATE SET
       valor = excluded.valor,
       observacao = excluded.observacao,
       atualizado_em = datetime('now','localtime')`
  )
  const apagar = db.prepare('DELETE FROM investimentos_trafego WHERE mes = ? AND origem_id = ?')

  db.transaction(() => {
    for (const l of linhas) {
      const id = Number(l.origem_id)
      const valor = Number(l.valor)
      if (!Number.isInteger(id) || id <= 0) throw new Error('Canal inválido.')
      if (!Number.isFinite(valor) || valor < 0) {
        throw new Error('O valor investido não pode ser negativo.')
      }
      const obs = (l.observacao ?? '').toString().trim() || null
      if (valor === 0) apagar.run(mes, id)
      else gravar.run(mes, id, arred(valor), obs)
    }
  })()
}

export function resumoTrafego(inicioIso: string, fimIso: string): ResumoTrafego {
  const db = obterBancoDeDados()
  const vazio: ResumoTrafego = {
    inicio: inicioIso,
    fim: fimIso,
    investimento: 0,
    receita_atribuida: 0,
    receita_total: 0,
    roas_atribuido: 0,
    roas_geral: 0,
    clientes_novos_atribuidos: 0,
    custo_por_cliente: 0,
    clientes_sem_origem: 0,
    canais: []
  }

  const meses = mesesDoPeriodo(inicioIso, fimIso)
  if (meses.length === 0) return vazio

  // ── Investimento rateado, canal por canal ────────────────────────────────
  const marcadores = meses.map(() => '?').join(',')
  const lancamentos = db
    .prepare(
      `SELECT i.mes, i.origem_id, o.nome AS origem_nome, i.valor
         FROM investimentos_trafego i
         JOIN origens_cliente o ON o.id = i.origem_id
        WHERE i.mes IN (${marcadores}) AND i.valor > 0`
    )
    .all(...meses.map((m) => m.mes)) as Array<{
    mes: string
    origem_id: number
    origem_nome: string
    valor: number
  }>

  const fracaoDo = new Map(meses.map((m) => [m.mes, m.fracao]))
  const porCanal = new Map<number, CanalTrafego>()
  for (const l of lancamentos) {
    const fracao = fracaoDo.get(l.mes) ?? 0
    let canal = porCanal.get(l.origem_id)
    if (!canal) {
      canal = {
        origem_id: l.origem_id,
        origem_nome: l.origem_nome,
        investimento: 0,
        receita: 0,
        num_vendas: 0,
        clientes_novos: 0,
        roas: 0
      }
      porCanal.set(l.origem_id, canal)
    }
    canal.investimento += l.valor * fracao
  }

  // ── Faturamento total do período, com e sem atribuição ───────────────────
  const { total: receitaTotal } = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS total FROM vendas
        WHERE date(data) >= ? AND date(data) <= ? AND cancelada = 0`
    )
    .get(inicioIso, fimIso) as { total: number }

  const { n: semOrigem } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM clientes WHERE origem_id IS NULL`
    )
    .get() as { n: number }

  const ids = [...porCanal.keys()]
  if (ids.length > 0) {
    const marcadoresIds = ids.map(() => '?').join(',')

    /*
     * ⚠️ A venda é atribuída pela origem do CLIENTE, e a venda sem cliente
     * (balcão anônimo) fica de fora — não há como saber de onde ela veio.
     * Contá-la no numerador inflaria o ROAS de toda loja que vende no balcão.
     */
    const receitas = db
      .prepare(
        `SELECT c.origem_id AS origem_id,
                COALESCE(SUM(v.total), 0) AS receita,
                COUNT(*) AS num_vendas
           FROM vendas v
           JOIN clientes c ON c.id = v.cliente_id
          WHERE v.cancelada = 0
            AND date(v.data) >= ? AND date(v.data) <= ?
            AND c.origem_id IN (${marcadoresIds})
          GROUP BY c.origem_id`
      )
      .all(inicioIso, fimIso, ...ids) as Array<{
      origem_id: number
      receita: number
      num_vendas: number
    }>

    const novos = db
      .prepare(
        `SELECT origem_id, COUNT(*) AS n
           FROM clientes
          WHERE date(data_cadastro) >= ? AND date(data_cadastro) <= ?
            AND origem_id IN (${marcadoresIds})
          GROUP BY origem_id`
      )
      .all(inicioIso, fimIso, ...ids) as Array<{ origem_id: number; n: number }>

    for (const r of receitas) {
      const canal = porCanal.get(r.origem_id)
      if (!canal) continue
      canal.receita = r.receita
      canal.num_vendas = r.num_vendas
    }
    for (const n of novos) {
      const canal = porCanal.get(n.origem_id)
      if (canal) canal.clientes_novos = n.n
    }
  }

  const canais = [...porCanal.values()]
  for (const c of canais) {
    c.investimento = arred(c.investimento)
    c.receita = arred(c.receita)
    c.roas = c.investimento > 0 ? +(c.receita / c.investimento).toFixed(2) : 0
  }
  // Do canal que mais consome dinheiro para o que menos consome: a conversa
  // começa sempre pelo maior gasto, não pelo melhor resultado.
  canais.sort((a, b) => b.investimento - a.investimento)

  const investimento = arred(canais.reduce((s, c) => s + c.investimento, 0))
  const receitaAtribuida = arred(canais.reduce((s, c) => s + c.receita, 0))
  const clientesNovos = canais.reduce((s, c) => s + c.clientes_novos, 0)

  return {
    inicio: inicioIso,
    fim: fimIso,
    investimento,
    receita_atribuida: receitaAtribuida,
    receita_total: arred(receitaTotal),
    roas_atribuido: investimento > 0 ? +(receitaAtribuida / investimento).toFixed(2) : 0,
    roas_geral: investimento > 0 ? +(receitaTotal / investimento).toFixed(2) : 0,
    clientes_novos_atribuidos: clientesNovos,
    custo_por_cliente: clientesNovos > 0 ? arred(investimento / clientesNovos) : 0,
    clientes_sem_origem: semOrigem,
    canais
  }
}
