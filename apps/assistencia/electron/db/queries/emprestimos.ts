import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { lerConfig, gravarConfig } from '@fhvptech/core/electron/backup/configBackup'
import type { AlertaVivo } from './notificacoes'

// Empréstimos de dinheiro do dono para clientes.
// O porquê de cada decisão de modelagem está em
// backup/migrations/os/at_005_emprestimos.ts — vale ler antes de mexer aqui.
//
// Resumo da mecânica:
//   devido   = valor_acordado + acréscimos - descontos   (espelho mantido)
//   pago     = soma dos pagamentos não estornados        (espelho mantido)
//   restante = devido - pago
// Dinheiro só entra e sai pelo EXTRATO (emprestimo_lancamentos); os espelhos são
// recalculados na mesma transação por `sincronizarTotais`, e por mais ninguém.

export type SituacaoEmprestimo = 'aberto' | 'vencido' | 'quitado' | 'cancelado'
export type ModoEmprestimo = 'unico' | 'carne'
export type TipoLancamento = 'pagamento' | 'acrescimo' | 'desconto'

export type Emprestimo = {
  id: number
  cliente_id: number | null
  devedor_nome: string
  devedor_documento: string | null
  valor_principal: number
  valor_acordado: number
  valor_devido: number
  valor_pago: number
  modo: ModoEmprestimo
  data_emprestimo: string
  vencimento: string | null
  observacao: string | null
  quitado_em: string | null
  cancelado: number
  cancelado_em: string | null
  cancelado_motivo: string | null
  criado_em: string
  criado_por: string | null
  // Derivados — calculados na leitura, nunca gravados:
  restante: number
  situacao: SituacaoEmprestimo
  proximo_vencimento: string | null
}

export type Lancamento = {
  id: number
  emprestimo_id: number
  tipo: TipoLancamento
  valor: number
  data: string
  forma_pagamento: string | null
  observacao: string | null
  parcela_id: number | null
  estornado: number
  estornado_em: string | null
  criado_em: string
  criado_por: string | null
}

export type ParcelaEmprestimo = {
  id: number
  emprestimo_id: number
  numero: number
  valor: number
  vencimento: string
  paga: number
  paga_em: string | null
}

export type EmprestimoDetalhado = Emprestimo & {
  lancamentos: Lancamento[]
  parcelas: ParcelaEmprestimo[]
}

export type DadosEmprestimo = {
  cliente_id: number | null
  devedor_nome: string
  devedor_documento: string | null
  valor_principal: number
  valor_acordado: number
  modo: ModoEmprestimo
  data_emprestimo: string
  vencimento: string | null
  observacao: string | null
  criado_por: string | null
  /** Só no modo 'carne': quantidade de parcelas e vencimento da primeira. */
  num_parcelas?: number | null
  primeiro_vencimento?: string | null
}

export type DadosLancamento = {
  valor: number
  data: string
  forma_pagamento?: string | null
  observacao?: string | null
  criado_por?: string | null
}

export type FiltroEmprestimos = 'aberto' | 'quitado' | 'todos'

const centavos = (v: number): number => +v.toFixed(2)

/**
 * A data de HOJE no fuso de quem está usando o sistema.
 *
 * ⚠️ Não é `toISOString().slice(0,10)`, que é o que o resto do app faz. Aquilo
 * devolve a data em UTC: no Brasil (UTC-3), das 21h em diante ele já responde
 * "amanhã". Efeito prático num empréstimo que vence hoje: às 21h01 ele passaria
 * a aparecer EM ATRASO, com direito a alerta vermelho no sino, no dia em que
 * ainda está em dia. Módulo novo nasce certo; corrigir os antigos é outra
 * conversa (mexeria no comportamento de lojas em produção).
 */
const hojeISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

/** A data daqui a N dias, também no fuso local. */
const emDiasISO = (dias: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}
const fmtBRL = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type LinhaEmprestimo = Omit<Emprestimo, 'restante' | 'situacao' | 'proximo_vencimento'> & {
  proximo_vencimento: string | null
}

// Enriquece a linha crua no mesmo lugar para as duas leituras (lista e detalhe)
// nunca divergirem — o mesmo padrão do `decorar` de contasPagar.ts.
function decorar(linha: LinhaEmprestimo): Emprestimo {
  const restante = Math.max(0, centavos(linha.valor_devido - linha.valor_pago))
  const situacao: SituacaoEmprestimo = linha.cancelado
    ? 'cancelado'
    : restante <= 0
      ? 'quitado'
      : linha.proximo_vencimento && linha.proximo_vencimento < hojeISO()
        ? 'vencido'
        : 'aberto'
  return { ...linha, restante, situacao }
}

// O vencimento que importa AGORA. No modo 'unico' é a data única; no 'carne' é a
// da parcela em aberto mais antiga — é ela que define se o empréstimo está
// atrasado, não a última do carnê.
const SELECT_BASE = `
  SELECT e.*,
         CASE WHEN e.modo = 'carne'
              THEN (SELECT MIN(p.vencimento) FROM emprestimo_parcelas p
                     WHERE p.emprestimo_id = e.id AND p.paga = 0)
              ELSE e.vencimento
         END AS proximo_vencimento
  FROM emprestimos e
`

// Em aberto primeiro, dentro delas as mais atrasadas no topo; quitados e
// cancelados por último.
const ORDER_BASE = `
  ORDER BY (e.cancelado = 1) ASC,
           (e.valor_pago >= e.valor_devido) ASC,
           (proximo_vencimento IS NULL) ASC,
           proximo_vencimento ASC,
           e.id DESC
`

export function listarEmprestimos(filtro: FiltroEmprestimos = 'todos'): Emprestimo[] {
  const db = obterBancoDeDados()
  const where =
    filtro === 'aberto'
      ? 'WHERE e.cancelado = 0 AND e.valor_pago < e.valor_devido'
      : filtro === 'quitado'
        ? 'WHERE e.cancelado = 0 AND e.valor_pago >= e.valor_devido'
        : ''
  const linhas = db.prepare(`${SELECT_BASE} ${where} ${ORDER_BASE}`).all() as LinhaEmprestimo[]
  return linhas.map(decorar)
}

export function buscarEmprestimoPorId(id: number): EmprestimoDetalhado | undefined {
  const db = obterBancoDeDados()
  const linha = db.prepare(`${SELECT_BASE} WHERE e.id = ?`).get(id) as LinhaEmprestimo | undefined
  if (!linha) return undefined
  const lancamentos = db
    .prepare('SELECT * FROM emprestimo_lancamentos WHERE emprestimo_id = ? ORDER BY data, id')
    .all(id) as Lancamento[]
  const parcelas = db
    .prepare('SELECT * FROM emprestimo_parcelas WHERE emprestimo_id = ? ORDER BY numero')
    .all(id) as ParcelaEmprestimo[]
  return { ...decorar(linha), lancamentos, parcelas }
}

/**
 * Recalcula os espelhos (`valor_devido`, `valor_pago`, `quitado_em`) a partir do
 * extrato. É o ÚNICO lugar que escreve nessas três colunas — toda operação de
 * dinheiro grava seu lançamento e chama isto, dentro da mesma transação.
 *
 * Fazer assim é resposta direta ao que aconteceu nas vendas: lá, pagar parcela
 * mexia num lugar e o total em outro, os dois divergiram em produção e foi
 * preciso a migration 023 pra reconstruir o histórico. Com um caminho só, não há
 * como divergir — e `provaDosNove` no teste afirma isso a cada operação.
 */
function sincronizarTotais(db: ReturnType<typeof obterBancoDeDados>, id: number): void {
  const somas = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'pagamento' THEN valor ELSE 0 END), 0) AS pago,
         COALESCE(SUM(CASE WHEN tipo = 'acrescimo' THEN valor ELSE 0 END), 0) AS acrescimos,
         COALESCE(SUM(CASE WHEN tipo = 'desconto'  THEN valor ELSE 0 END), 0) AS descontos
       FROM emprestimo_lancamentos
       WHERE emprestimo_id = ? AND estornado = 0`
    )
    .get(id) as { pago: number; acrescimos: number; descontos: number }

  const { valor_acordado } = db
    .prepare('SELECT valor_acordado FROM emprestimos WHERE id = ?')
    .get(id) as { valor_acordado: number }

  // Desconto nunca leva o devido abaixo de zero — perdoar mais do que se deve
  // não faz o cliente virar credor.
  const devido = Math.max(0, centavos(valor_acordado + somas.acrescimos - somas.descontos))
  const pago = centavos(somas.pago)

  db.prepare(
    `UPDATE emprestimos
     SET valor_devido = ?,
         valor_pago = ?,
         quitado_em = CASE WHEN ? >= ? THEN COALESCE(quitado_em, datetime('now','localtime'))
                           ELSE NULL END
     WHERE id = ?`
  ).run(devido, pago, pago, devido, id)
}

const texto = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

const EH_DATA = /^\d{4}-\d{2}-\d{2}$/

export function criarEmprestimo(dados: DadosEmprestimo): EmprestimoDetalhado {
  const db = obterBancoDeDados()

  const nome = texto(dados.devedor_nome)
  if (!nome) throw new Error('Informe quem está pegando o empréstimo.')

  const principal = Number(dados.valor_principal)
  if (!Number.isFinite(principal) || principal <= 0) {
    throw new Error('O valor emprestado deve ser maior que zero.')
  }
  const acordado = Number(dados.valor_acordado)
  if (!Number.isFinite(acordado) || acordado <= 0) {
    throw new Error('O valor a receber deve ser maior que zero.')
  }
  if (!EH_DATA.test(dados.data_emprestimo)) throw new Error('Data do empréstimo inválida.')

  const modo: ModoEmprestimo = dados.modo === 'carne' ? 'carne' : 'unico'

  // No carnê o vencimento vive nas parcelas; guardar uma data solta na linha do
  // empréstimo criaria uma segunda verdade sobre a mesma coisa.
  let vencimento: string | null = null
  if (modo === 'unico' && texto(dados.vencimento)) {
    vencimento = texto(dados.vencimento)!
    if (!EH_DATA.test(vencimento)) throw new Error('Data de vencimento inválida.')
  }

  let parcelas: Array<{ numero: number; valor: number; vencimento: string }> = []
  if (modo === 'carne') {
    parcelas = montarParcelas(
      centavos(acordado),
      Number(dados.num_parcelas ?? 0),
      String(dados.primeiro_vencimento ?? '')
    )
  }

  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO emprestimos
           (cliente_id, devedor_nome, devedor_documento, valor_principal, valor_acordado,
            valor_devido, valor_pago, modo, data_emprestimo, vencimento, observacao, criado_por)
         VALUES (@cliente_id, @devedor_nome, @devedor_documento, @valor_principal, @valor_acordado,
                 @valor_acordado, 0, @modo, @data_emprestimo, @vencimento, @observacao, @criado_por)`
      )
      .run({
        cliente_id: dados.cliente_id ?? null,
        devedor_nome: nome,
        devedor_documento: texto(dados.devedor_documento),
        valor_principal: centavos(principal),
        valor_acordado: centavos(acordado),
        modo,
        data_emprestimo: dados.data_emprestimo,
        vencimento,
        observacao: texto(dados.observacao),
        criado_por: texto(dados.criado_por)
      })

    const id = info.lastInsertRowid as number

    if (parcelas.length > 0) {
      const inserir = db.prepare(
        'INSERT INTO emprestimo_parcelas (emprestimo_id, numero, valor, vencimento) VALUES (?, ?, ?, ?)'
      )
      for (const p of parcelas) inserir.run(id, p.numero, p.valor, p.vencimento)
    }

    return buscarEmprestimoPorId(id)!
  })()
}

/**
 * Divide o total em N parcelas mensais. A sobra dos centavos vai toda na PRIMEIRA
 * parcela, não na última: quem paga em dia paga o arredondamento, e o carnê nunca
 * termina com uma parcela quebrada que o cliente estranha na hora de quitar.
 * A soma das parcelas é exatamente o total — há teste (`provaDosNove`).
 */
export function montarParcelas(
  total: number,
  numParcelas: number,
  primeiroVencimento: string
): Array<{ numero: number; valor: number; vencimento: string }> {
  if (!Number.isInteger(numParcelas) || numParcelas < 2) {
    throw new Error('O carnê precisa de pelo menos 2 parcelas.')
  }
  if (!EH_DATA.test(primeiroVencimento)) {
    throw new Error('Data de vencimento da primeira parcela inválida.')
  }

  const base = Math.floor((total * 100) / numParcelas) / 100
  const sobra = centavos(total - base * numParcelas)

  const [ano, mes, dia] = primeiroVencimento.split('-').map(Number)
  const parcelas: Array<{ numero: number; valor: number; vencimento: string }> = []
  for (let i = 0; i < numParcelas; i++) {
    // Dia 31 em mês de 30 cai no último dia do mês, nunca vaza pro mês seguinte:
    // vencimento que pula de mês bagunça a ordem do carnê.
    const alvo = new Date(ano, mes - 1 + i, 1)
    const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
    alvo.setDate(Math.min(dia, ultimoDia))
    const iso = `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(
      alvo.getDate()
    ).padStart(2, '0')}`
    parcelas.push({ numero: i + 1, valor: i === 0 ? centavos(base + sobra) : base, vencimento: iso })
  }
  return parcelas
}

function garantirAtivo(db: ReturnType<typeof obterBancoDeDados>, id: number): LinhaEmprestimo {
  const emp = db.prepare(`${SELECT_BASE} WHERE e.id = ?`).get(id) as LinhaEmprestimo | undefined
  if (!emp) throw new Error('Empréstimo não encontrado.')
  if (emp.cancelado) throw new Error('Este empréstimo foi cancelado.')
  return emp
}

/**
 * Recebe um pagamento — parcial ou total — no modo 'unico'.
 *
 * No carnê isto é RECUSADO de propósito, exatamente como as vendas já fazem
 * (`vendas.ts:521`): lá o carnê é um papel que o cliente levou pra casa, e um
 * pagamento solto de R$37 não corresponde a nenhuma parcela dele. Quem tem carnê
 * quita parcela por `pagarParcelaEmprestimo`.
 */
export function registrarPagamentoEmprestimo(id: number, dados: DadosLancamento): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    const emp = garantirAtivo(db, id)
    if (emp.modo === 'carne') {
      throw new Error('Empréstimo em carnê: receba pela parcela.')
    }

    const valor = Number(dados.valor)
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('O valor deve ser maior que zero.')

    const restante = centavos(emp.valor_devido - emp.valor_pago)
    if (restante <= 0) throw new Error('Este empréstimo já está quitado.')

    // Recebeu a mais do que devia? Credita só o que fecha a conta. O troco é
    // dinheiro na mão, não crédito no sistema — guardar saldo negativo aqui
    // inventaria uma dívida do dono pro cliente que ninguém pediu.
    const efetivo = Math.min(centavos(valor), restante)

    inserirLancamento(db, id, 'pagamento', efetivo, dados, null)
    sincronizarTotais(db, id)
  })()
}

/** Quita uma parcela do carnê por inteiro (modo 'carne'). */
export function pagarParcelaEmprestimo(parcelaId: number, dados: DadosLancamento): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    const parcela = db
      .prepare('SELECT * FROM emprestimo_parcelas WHERE id = ?')
      .get(parcelaId) as ParcelaEmprestimo | undefined
    if (!parcela) throw new Error('Parcela não encontrada.')
    if (parcela.paga) throw new Error('Esta parcela já está paga.')
    garantirAtivo(db, parcela.emprestimo_id)

    db.prepare(
      `UPDATE emprestimo_parcelas SET paga = 1, paga_em = datetime('now','localtime') WHERE id = ?`
    ).run(parcelaId)

    inserirLancamento(db, parcela.emprestimo_id, 'pagamento', parcela.valor, dados, parcelaId)
    sincronizarTotais(db, parcela.emprestimo_id)
  })()
}

/**
 * Lança um acréscimo (juros combinado, multa) ou um desconto (perdão de parte).
 *
 * Num empréstimo em carnê, o acréscimo fica AO LADO do carnê e nunca é rediluído
 * nas parcelas: o cliente tem um papel assinado em casa, e mexer nos números
 * dele faria as duas vias deixarem de bater. A multa vira uma linha avulsa que
 * pode ser recebida a qualquer momento.
 */
export function lancarAjuste(
  id: number,
  tipo: 'acrescimo' | 'desconto',
  dados: DadosLancamento
): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    garantirAtivo(db, id)
    const valor = Number(dados.valor)
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('O valor deve ser maior que zero.')
    inserirLancamento(db, id, tipo, centavos(valor), dados, null)
    sincronizarTotais(db, id)
  })()
}

function inserirLancamento(
  db: ReturnType<typeof obterBancoDeDados>,
  emprestimoId: number,
  tipo: TipoLancamento,
  valor: number,
  dados: DadosLancamento,
  parcelaId: number | null
): void {
  const data = EH_DATA.test(String(dados.data ?? '')) ? dados.data : hojeISO()
  db.prepare(
    `INSERT INTO emprestimo_lancamentos
       (emprestimo_id, tipo, valor, data, forma_pagamento, observacao, parcela_id, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    emprestimoId,
    tipo,
    valor,
    data,
    texto(dados.forma_pagamento),
    texto(dados.observacao),
    parcelaId,
    texto(dados.criado_por)
  )
}

/**
 * Desfaz um lançamento sem apagá-lo — ele continua no extrato, marcado. Se era o
 * pagamento de uma parcela, a parcela volta a ficar em aberto junto: as duas
 * coisas são o mesmo fato e não podem se separar.
 */
export function estornarLancamento(lancamentoId: number): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    const lanc = db
      .prepare('SELECT * FROM emprestimo_lancamentos WHERE id = ?')
      .get(lancamentoId) as Lancamento | undefined
    if (!lanc) throw new Error('Lançamento não encontrado.')
    if (lanc.estornado) throw new Error('Este lançamento já foi estornado.')

    db.prepare(
      `UPDATE emprestimo_lancamentos SET estornado = 1, estornado_em = datetime('now','localtime')
       WHERE id = ?`
    ).run(lancamentoId)

    if (lanc.parcela_id) {
      db.prepare('UPDATE emprestimo_parcelas SET paga = 0, paga_em = NULL WHERE id = ?').run(
        lanc.parcela_id
      )
    }

    sincronizarTotais(db, lanc.emprestimo_id)
  })()
}

/**
 * Cancela o empréstimo (erro de lançamento, acordo desfeito). Não apaga nada: o
 * empréstimo some dos totais e das cobranças, mas continua consultável com o
 * motivo — é dinheiro entre duas pessoas, o rastro é o produto.
 */
export function cancelarEmprestimo(id: number, motivo: string): void {
  const db = obterBancoDeDados()
  const razao = texto(motivo)
  if (!razao) throw new Error('Informe o motivo do cancelamento.')
  const info = db
    .prepare(
      `UPDATE emprestimos
       SET cancelado = 1, cancelado_em = datetime('now','localtime'), cancelado_motivo = ?
       WHERE id = ? AND cancelado = 0`
    )
    .run(razao, id)
  if (info.changes === 0) throw new Error('Empréstimo não encontrado ou já cancelado.')
}

// ── Resumo para os cartões do topo da página ──
export type ResumoEmprestimos = {
  /** Tudo que ainda falta receber, somando os empréstimos em aberto. */
  total_a_receber: number
  /** Em aberto com vencimento já passado. */
  vencido: number
  /** Em aberto vencendo de hoje até +7 dias. */
  vence_7d: number
  /** Pagamentos lançados no mês corrente. */
  recebido_mes: number
  /**
   * Do que está em aberto, quanto foi capital efetivamente emprestado — ou
   * seja, sem os acréscimos combinados. É a leitura de "quanto do meu dinheiro
   * está comprometido", separada de "quanto eu espero receber".
   */
  principal_em_aberto: number
}

export function resumoEmprestimos(): ResumoEmprestimos {
  const db = obterBancoDeDados()

  const linhas = db
    .prepare(`${SELECT_BASE} WHERE e.cancelado = 0 AND e.valor_pago < e.valor_devido`)
    .all() as LinhaEmprestimo[]

  const hoje = hojeISO()
  const em7d = emDiasISO(7)

  let totalAReceber = 0
  let vencido = 0
  let vence_7d = 0
  let principalEmAberto = 0
  for (const l of linhas) {
    const restante = Math.max(0, centavos(l.valor_devido - l.valor_pago))
    totalAReceber += restante
    principalEmAberto += l.valor_principal
    const venc = l.proximo_vencimento
    if (venc && venc < hoje) vencido += restante
    else if (venc && venc >= hoje && venc <= em7d) vence_7d += restante
  }

  const { recebido } = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS recebido FROM emprestimo_lancamentos
       WHERE tipo = 'pagamento' AND estornado = 0
         AND strftime('%Y-%m', data) = strftime('%Y-%m', 'now', 'localtime')`
    )
    .get() as { recebido: number }

  return {
    total_a_receber: centavos(totalAReceber),
    vencido: centavos(vencido),
    vence_7d: centavos(vence_7d),
    recebido_mes: centavos(recebido),
    principal_em_aberto: centavos(principalEmAberto)
  }
}

// ── Alertas para o sino (mesmo formato AlertaVivo das outras fontes) ──
// O sino só existe para o dono (App.tsx), então estes alertas não vazam a lista
// de devedores para o técnico do balcão.
export function alertasEmprestimos(): AlertaVivo[] {
  const db = obterBancoDeDados()
  if (!moduloEmprestimosAtivo()) return []

  const alertas: AlertaVivo[] = []
  const hoje = hojeISO()
  const abertos = db
    .prepare(`${SELECT_BASE} WHERE e.cancelado = 0 AND e.valor_pago < e.valor_devido`)
    .all() as LinhaEmprestimo[]

  const restanteDe = (l: LinhaEmprestimo): number =>
    Math.max(0, centavos(l.valor_devido - l.valor_pago))

  const vencidos = abertos.filter((l) => l.proximo_vencimento && l.proximo_vencimento < hoje)
  if (vencidos.length > 0) {
    const soma = centavos(vencidos.reduce((s, l) => s + restanteDe(l), 0))
    alertas.push({
      chave: 'emprestimos-vencidos',
      assinatura: `${vencidos.length}:${soma.toFixed(2)}`,
      tipo: 'dinheiro',
      severidade: 'critico',
      titulo: 'Empréstimos em atraso',
      descricao: `${vencidos.length} empréstimo(s) vencido(s) · ${fmtBRL(soma)}`,
      rota: '/emprestimos',
      acao: null
    })
  }

  const hojeVence = abertos.filter((l) => l.proximo_vencimento === hoje)
  if (hojeVence.length > 0) {
    const soma = centavos(hojeVence.reduce((s, l) => s + restanteDe(l), 0))
    alertas.push({
      chave: 'emprestimos-vencem-hoje',
      assinatura: `${hojeVence.length}:${hoje}`,
      tipo: 'dinheiro',
      severidade: 'alerta',
      titulo: 'Empréstimos vencem hoje',
      descricao: `${hojeVence.length} empréstimo(s) · ${fmtBRL(soma)}`,
      rota: '/emprestimos',
      acao: null
    })
  }

  return alertas
}

// ── O interruptor do módulo ──────────────────────────────────────────────────
// Empréstimo é uma necessidade de UM cliente, não do nicho. Em vez de uma edição
// de build só pra ele (que viraria um terceiro canal de atualização publicado em
// toda release, pra sempre) ou de uma capacidade na chave de licença (que mexe
// no licenciador), o módulo é ligado por loja, aqui.
//
// O ponto de decisão fica NUM lugar só: se um dia isto virar item de plano,
// `moduloEmprestimosAtivo` passa a consultar a flag de build ou a licença, e
// nenhuma linha do resto do módulo muda.
//
// ⚠️ A chave mora na tabela `config`, então ela VIAJA NO BACKUP. Restaurar o
// backup deste cliente noutra loja leva o módulo ligado junto.
const CHAVE_MODULO = 'emprestimos_ativo'

export function moduloEmprestimosAtivo(): boolean {
  return lerConfig(CHAVE_MODULO) === '1'
}

export function definirModuloEmprestimos(ativo: boolean): void {
  gravarConfig(CHAVE_MODULO, ativo ? '1' : '0')
}
