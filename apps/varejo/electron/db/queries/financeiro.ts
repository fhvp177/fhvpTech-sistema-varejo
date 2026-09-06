import type Database from 'better-sqlite3'
import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

/**
 * Contas do dinheiro e o livro de movimentos.
 *
 * ── A regra que governa este arquivo ────────────────────────────────────────
 * Saldo NÃO é guardado, é DERIVADO: `saldo_inicial` mais a soma dos movimentos.
 * Um número guardado que erra uma vez erra para sempre, e não há como saber
 * quando começou. Um movimento faltando aparece na lista.
 *
 * ── ⚠️ O que este livro NÃO é ───────────────────────────────────────────────
 * Não é a verdade da dívida. Quanto um cliente deve continua sendo
 * `vendas.total - vendas.valor_pago` (ver a nota sobre valor_pago no projeto).
 * Aqui se responde ONDE o dinheiro caiu, nunca QUANTO falta. Duas fontes para a
 * mesma pergunta acabam discordando, e aí ninguém sabe em qual acreditar.
 */

export type TipoConta = 'caixa' | 'banco' | 'a_receber'

export type ContaFinanceira = {
  id: number
  nome: string
  tipo: TipoConta
  banco: string | null
  agencia: string | null
  conta: string | null
  saldo_inicial: number
  ativa: number
  padrao_recebimento: number
  padrao_pagamento: number
  forma_padrao: string | null
  criada_em: string
}

export type ContaComSaldo = ContaFinanceira & { saldo: number }

export type DadosConta = {
  nome: string
  tipo: TipoConta
  banco: string | null
  agencia: string | null
  conta: string | null
  saldo_inicial: number
  forma_padrao: string | null
  padrao_recebimento: boolean
  padrao_pagamento: boolean
}

/** Um lançamento. `valor` positivo entra, negativo sai — a direção É o sinal. */
export type Movimento = {
  id: number
  conta_id: number
  conta_nome: string
  data: string
  valor: number
  tipo: string
  descricao: string | null
  forma_pagamento: string | null
  origem_tipo: string | null
  origem_id: number | null
  turno_id: number | null
  vendedor_id: number | null
}

export type NovoMovimento = {
  conta_id: number
  valor: number
  tipo: string
  descricao?: string | null
  forma_pagamento?: string | null
  origem_tipo?: string | null
  origem_id?: number | null
  vendedor_id?: number | null
  /** Sobrescreve a data; ausente usa agora, no horário local. */
  data?: string
  /**
   * A que turno este dinheiro pertence.
   *
   * ⚠️ Quem chama PRECISA passar isto quando o dinheiro nasce de uma venda: a
   * venda no PIX cai no BANCO, mas pertence ao turno do CAIXA onde ela foi
   * feita. Sem passar, com dois caixas abertos metade das vendas cairia no
   * turno errado — e o erro só apareceria no fechamento, sem pista de onde veio.
   *
   * Omitido, cai na regra de sempre: o turno aberto DESTA conta, que é o certo
   * para sangria, suprimento e conta paga em espécie.
   */
  turno_id?: number | null
}

const arred = (v: number): number => +v.toFixed(2)

// ─── Contas ──────────────────────────────────────────────────────────────────

export function listarContas(incluirInativas = false): ContaComSaldo[] {
  const db = obterBancoDeDados()
  /*
   * O saldo sai numa subconsulta e não num JOIN com GROUP BY: com JOIN, conta
   * sem movimento nenhum sumiria da lista (ou exigiria LEFT JOIN mais COALESCE),
   * e conta recém-cadastrada é exatamente a que o lojista quer ver na tela.
   */
  return db
    .prepare(
      `SELECT c.*,
              ROUND(c.saldo_inicial + COALESCE(
                (SELECT SUM(m.valor) FROM movimentos_financeiros m WHERE m.conta_id = c.id), 0
              ), 2) AS saldo
         FROM contas_financeiras c
        ${incluirInativas ? '' : 'WHERE c.ativa = 1'}
        ORDER BY c.ativa DESC, c.tipo = 'caixa' DESC, c.nome`
    )
    .all() as ContaComSaldo[]
}

export function criarConta(dados: DadosConta): { id: number } {
  const db = obterBancoDeDados()
  return db.transaction(() => {
    limparPadroes(db, dados)
    const r = db
      .prepare(
        `INSERT INTO contas_financeiras
           (nome, tipo, banco, agencia, conta, saldo_inicial, forma_padrao,
            padrao_recebimento, padrao_pagamento)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        dados.nome.trim(),
        dados.tipo,
        dados.banco,
        dados.agencia,
        dados.conta,
        arred(dados.saldo_inicial),
        dados.forma_padrao,
        dados.padrao_recebimento ? 1 : 0,
        dados.padrao_pagamento ? 1 : 0
      )
    return { id: Number(r.lastInsertRowid) }
  })()
}

export function atualizarConta(id: number, dados: DadosConta): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    limparPadroes(db, dados, id)
    db.prepare(
      `UPDATE contas_financeiras
          SET nome = ?, tipo = ?, banco = ?, agencia = ?, conta = ?,
              saldo_inicial = ?, forma_padrao = ?,
              padrao_recebimento = ?, padrao_pagamento = ?
        WHERE id = ?`
    ).run(
      dados.nome.trim(),
      dados.tipo,
      dados.banco,
      dados.agencia,
      dados.conta,
      arred(dados.saldo_inicial),
      dados.forma_padrao,
      dados.padrao_recebimento ? 1 : 0,
      dados.padrao_pagamento ? 1 : 0,
      id
    )
  })()
}

/*
 * Padrão é EXCLUSIVO: marcar uma conta como padrão desmarca a anterior. Duas
 * contas padrão para a mesma coisa fariam a escolha automática depender da
 * ordem da consulta, que é o tipo de aleatoriedade que ninguém consegue depurar.
 */
function limparPadroes(db: Database.Database, dados: DadosConta, exceto?: number): void {
  const filtro = exceto ? ' WHERE id <> ?' : ''
  const args = exceto ? [exceto] : []
  if (dados.padrao_recebimento) {
    db.prepare(`UPDATE contas_financeiras SET padrao_recebimento = 0${filtro}`).run(...args)
  }
  if (dados.padrao_pagamento) {
    db.prepare(`UPDATE contas_financeiras SET padrao_pagamento = 0${filtro}`).run(...args)
  }
}

/**
 * Desativa, nunca apaga.
 *
 * ⚠️ Apagar uma conta arrastaria consigo o histórico dos movimentos dela, e o
 * extrato do mês passado passaria a mostrar menos dinheiro do que mostrava
 * ontem. Conta desativada some das escolhas novas e continua no histórico.
 */
export function desativarConta(id: number): void {
  const db = obterBancoDeDados()
  const ativas = db
    .prepare('SELECT COUNT(*) AS n FROM contas_financeiras WHERE ativa = 1')
    .get() as { n: number }
  if (ativas.n <= 1) {
    throw new Error('Esta é a única conta ativa. Cadastre outra antes de desativar esta.')
  }
  db.prepare(
    'UPDATE contas_financeiras SET ativa = 0, padrao_recebimento = 0, padrao_pagamento = 0 WHERE id = ?'
  ).run(id)
}

export function reativarConta(id: number): void {
  obterBancoDeDados().prepare('UPDATE contas_financeiras SET ativa = 1 WHERE id = ?').run(id)
}

// ─── Escolha automática da conta ─────────────────────────────────────────────

/**
 * Em qual conta este dinheiro cai, sem perguntar.
 *
 * A ordem existe para nunca devolver nada: a conta casada com a FORMA (dinheiro
 * na gaveta, PIX no banco), senão a padrão do lado certo, senão qualquer ativa.
 *
 * ⚠️ Nunca devolve null com a loja em uso. Se devolvesse, a venda teria que
 * escolher entre travar (o caixa não pode parar porque falta um cadastro) ou
 * lançar sem conta, que é o buraco que este livro existe para fechar.
 */
export function contaSugerida(
  db: Database.Database,
  lado: 'recebimento' | 'pagamento',
  forma?: string | null
): number | null {
  if (forma) {
    const porForma = db
      .prepare('SELECT id FROM contas_financeiras WHERE ativa = 1 AND forma_padrao = ? LIMIT 1')
      .get(forma) as { id: number } | undefined
    if (porForma) return porForma.id
  }
  const coluna = lado === 'recebimento' ? 'padrao_recebimento' : 'padrao_pagamento'
  const padrao = db
    .prepare(`SELECT id FROM contas_financeiras WHERE ativa = 1 AND ${coluna} = 1 LIMIT 1`)
    .get() as { id: number } | undefined
  if (padrao) return padrao.id

  const qualquer = db
    .prepare("SELECT id FROM contas_financeiras WHERE ativa = 1 ORDER BY tipo = 'caixa' DESC, id LIMIT 1")
    .get() as { id: number } | undefined
  return qualquer?.id ?? null
}

// ─── Movimentos ──────────────────────────────────────────────────────────────

/**
 * Lança um movimento.
 *
 * ⚠️ Recebe o `db` de propósito, em vez de pegar a conexão sozinho: quem chama
 * é a venda, a baixa de parcela, a conta a pagar — todas dentro das próprias
 * transações. Abrir outra conexão aqui deixaria o lançamento FORA da transação
 * do chamador, e uma venda que falhasse no meio deixaria o dinheiro registrado
 * mesmo assim.
 *
 * O turno é resolvido aqui, e não pelo chamador: quem lança não precisa saber
 * que existe turno, e esquecer de passar faria o movimento sumir do fechamento.
 */
export function lancarMovimento(db: Database.Database, mov: NovoMovimento): number {
  /*
   * ⚠️ O turno vem de QUEM CHAMA quando o dinheiro nasce de uma venda: a venda
   * no PIX cai no banco, mas pertence ao turno do CAIXA onde foi feita.
   *
   * A queda — o turno aberto DESTA conta — só serve para o que é da própria
   * gaveta: sangria, suprimento, conta paga em espécie. Nesses casos a conta JÁ
   * é o caixa, então não há o que adivinhar.
   */
  const turnoId =
    mov.turno_id ??
    (
      db
        .prepare(
          `SELECT id FROM turnos_caixa
            WHERE conta_id = ? AND fechado_em IS NULL
            ORDER BY id DESC LIMIT 1`
        )
        .get(mov.conta_id) as { id: number } | undefined
    )?.id ??
    null

  const r = db
    .prepare(
      `INSERT INTO movimentos_financeiros
         (conta_id, data, valor, tipo, descricao, forma_pagamento,
          origem_tipo, origem_id, turno_id, vendedor_id)
       VALUES (?, COALESCE(?, datetime('now','localtime')), ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      mov.conta_id,
      mov.data ?? null,
      arred(mov.valor),
      mov.tipo,
      mov.descricao ?? null,
      mov.forma_pagamento ?? null,
      mov.origem_tipo ?? null,
      mov.origem_id ?? null,
      turnoId,
      mov.vendedor_id ?? null
    )
  return Number(r.lastInsertRowid)
}

/** Atalho para quem está fora de transação (sangria, suprimento, ajuste). */
export function lancarMovimentoAvulso(mov: NovoMovimento): number {
  const db = obterBancoDeDados()
  return db.transaction(() => lancarMovimento(db, mov))()
}

export type FiltroExtrato = {
  conta_id?: number | null
  de?: string | null
  ate?: string | null
  limite?: number
}

export type LinhaExtrato = Movimento & { saldo_corrente: number }

/**
 * Extrato de uma conta, com saldo corrente.
 *
 * O saldo corrente é calculado aqui e não no SQL: a soma tem que começar no
 * saldo ANTERIOR ao primeiro movimento do período, senão o extrato de março
 * começaria do zero e pareceria que a conta nasceu em março.
 */
export function extrato(filtro: FiltroExtrato): LinhaExtrato[] {
  const db = obterBancoDeDados()
  const cond: string[] = []
  const args: unknown[] = []
  if (filtro.conta_id) {
    cond.push('m.conta_id = ?')
    args.push(filtro.conta_id)
  }
  if (filtro.de) {
    cond.push('m.data >= ?')
    args.push(filtro.de)
  }
  if (filtro.ate) {
    cond.push('m.data <= ?')
    args.push(`${filtro.ate} 23:59:59`)
  }
  const onde = cond.length > 0 ? `WHERE ${cond.join(' AND ')}` : ''

  const linhas = db
    .prepare(
      `SELECT m.*, c.nome AS conta_nome
         FROM movimentos_financeiros m
         JOIN contas_financeiras c ON c.id = m.conta_id
         ${onde}
        ORDER BY m.data, m.id
        LIMIT ?`
    )
    .all(...args, filtro.limite ?? 500) as Movimento[]

  // Saldo de partida: só faz sentido com UMA conta escolhida. Misturando
  // contas, um "saldo corrente" somaria dinheiro de lugares diferentes e não
  // significaria nada.
  let saldo = 0
  if (filtro.conta_id) {
    const antes = db
      .prepare(
        `SELECT c.saldo_inicial + COALESCE(
                  (SELECT SUM(m.valor) FROM movimentos_financeiros m
                    WHERE m.conta_id = c.id ${filtro.de ? 'AND m.data < ?' : 'AND 0'}), 0
                ) AS s
           FROM contas_financeiras c WHERE c.id = ?`
      )
      .get(...(filtro.de ? [filtro.de, filtro.conta_id] : [filtro.conta_id])) as { s: number }
    saldo = antes?.s ?? 0
  }

  return linhas.map((l) => {
    saldo = arred(saldo + l.valor)
    return { ...l, saldo_corrente: filtro.conta_id ? saldo : 0 }
  })
}

/** Total consolidado de todas as contas ativas. */
export function saldoConsolidado(): number {
  return arred(listarContas().reduce((s, c) => s + c.saldo, 0))
}
