import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { lancarMovimento } from './financeiro'

/**
 * Dinheiro mudando de conta dentro da própria loja.
 *
 * ── ⚠️ Nunca é receita nem despesa ──────────────────────────────────────────
 * É a mesma nota trocando de bolso. Por isso os dois lançamentos levam o tipo
 * `transferencia`, que o resumo financeiro classifica como movimento INTERNO —
 * junto de sangria e suprimento. Sem isso, o mês apareceria faturando o que só
 * saiu de outra conta da casa.
 *
 * ── Dois movimentos, uma transação ──────────────────────────────────────────
 * Sai da origem, entra no destino, e as duas pontas gravam juntas. Uma falha no
 * meio deixaria dinheiro saindo de um lugar e não chegando em nenhum — o pior
 * estado possível, porque some sem deixar rastro de para onde foi.
 */

export type Transferencia = {
  id: number
  conta_origem_id: number
  conta_origem_nome: string
  conta_destino_id: number
  conta_destino_nome: string
  valor: number
  observacao: string | null
  vendedor_id: number | null
  vendedor_nome: string | null
  criada_em: string
}

export type DadosTransferencia = {
  conta_origem_id: number
  conta_destino_id: number
  valor: number
  observacao?: string | null
  vendedor_id?: number | null
}

export function transferir(dados: DadosTransferencia): { id: number } {
  const db = obterBancoDeDados()

  const valor = +(Number(dados.valor) || 0).toFixed(2)
  if (valor <= 0) throw new Error('O valor da transferência deve ser maior que zero.')
  /*
   * ⚠️ Mesma conta na origem e no destino é recusado, e não ignorado em
   * silêncio. O par de lançamentos se anularia, deixando duas linhas inúteis no
   * extrato daquela conta — e quem fez ficaria achando que transferiu.
   */
  if (dados.conta_origem_id === dados.conta_destino_id) {
    throw new Error('Escolha duas contas diferentes.')
  }

  const contas = db
    .prepare(
      `SELECT id, nome, ativa FROM contas_financeiras WHERE id IN (?, ?)`
    )
    .all(dados.conta_origem_id, dados.conta_destino_id) as Array<{
    id: number
    nome: string
    ativa: number
  }>
  const origem = contas.find((c) => c.id === dados.conta_origem_id)
  const destino = contas.find((c) => c.id === dados.conta_destino_id)
  if (!origem) throw new Error('Conta de origem não encontrada.')
  if (!destino) throw new Error('Conta de destino não encontrada.')
  /*
   * ⚠️ Conta desativada não recebe nem envia. Ela existe só para o histórico
   * ficar de pé; movimentar nela agora criaria saldo novo numa conta que o
   * lojista tirou de circulação, e ela nem aparece na tela para ele conferir.
   */
  if (!origem.ativa) throw new Error(`A conta "${origem.nome}" está desativada.`)
  if (!destino.ativa) throw new Error(`A conta "${destino.nome}" está desativada.`)

  const observacao = (dados.observacao ?? '').trim() || null

  return db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO transferencias
           (conta_origem_id, conta_destino_id, valor, observacao, vendedor_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        dados.conta_origem_id,
        dados.conta_destino_id,
        valor,
        observacao,
        dados.vendedor_id ?? null
      )
    const id = Number(r.lastInsertRowid)

    /*
     * ⚠️ A descrição diz para ONDE foi e de ONDE veio, em cada ponta.
     *
     * Quem abre o extrato de uma conta só precisa entender a linha sem ter que
     * ir procurar a outra metade noutra tela. "Transferência" sozinho obrigaria
     * exatamente isso.
     *
     * ⚠️ `turno_id` fica ausente de propósito: `lancarMovimento` cai no turno
     * aberto DA CONTA, que é o certo aqui. Dinheiro que sai da gaveta tem que
     * baixar o esperado daquela contagem — é uma sangria com outro nome.
     */
    lancarMovimento(db, {
      conta_id: dados.conta_origem_id,
      valor: -valor,
      tipo: 'transferencia',
      descricao: `Transferência para ${destino.nome}`,
      origem_tipo: 'transferencia',
      origem_id: id,
      vendedor_id: dados.vendedor_id ?? null
    })
    lancarMovimento(db, {
      conta_id: dados.conta_destino_id,
      valor,
      tipo: 'transferencia',
      descricao: `Transferência de ${origem.nome}`,
      origem_tipo: 'transferencia',
      origem_id: id,
      vendedor_id: dados.vendedor_id ?? null
    })

    return { id }
  })()
}

/**
 * O histórico, do mais recente para o mais antigo.
 *
 * Sem `mes`, as 200 últimas — a visão de "o que andou acontecendo". Com `mes`
 * ('YYYY-MM'), todas as daquele mês, que é o recorte do relatório. O filtro
 * acontece no banco, e não em memória: o dia em que a loja tiver mil
 * transferências, filtrar depois esconderia as antigas sem avisar.
 */
export function listarTransferencias(mes?: string): Transferencia[] {
  const db = obterBancoDeDados()
  const base = `
    SELECT t.id, t.conta_origem_id, t.conta_destino_id, t.valor, t.observacao,
           t.vendedor_id, t.criada_em,
           o.nome AS conta_origem_nome,
           d.nome AS conta_destino_nome,
           v.nome AS vendedor_nome
      FROM transferencias t
      JOIN contas_financeiras o ON o.id = t.conta_origem_id
      JOIN contas_financeiras d ON d.id = t.conta_destino_id
      LEFT JOIN vendedores v ON v.id = t.vendedor_id`

  if (mes) {
    return db
      .prepare(`${base} WHERE strftime('%Y-%m', t.criada_em) = ? ORDER BY t.criada_em DESC, t.id DESC`)
      .all(mes) as Transferencia[]
  }
  return db
    .prepare(`${base} ORDER BY t.criada_em DESC, t.id DESC LIMIT 200`)
    .all() as Transferencia[]
}

/** Os meses que têm transferência, do mais novo para o mais velho. */
export function mesesComTransferencia(): string[] {
  const db = obterBancoDeDados()
  return (
    db
      .prepare(
        `SELECT DISTINCT strftime('%Y-%m', criada_em) AS mes
           FROM transferencias
          ORDER BY mes DESC`
      )
      .all() as Array<{ mes: string }>
  ).map((r) => r.mes)
}
