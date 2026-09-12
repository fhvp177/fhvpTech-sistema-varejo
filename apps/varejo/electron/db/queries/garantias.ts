import type Database from 'better-sqlite3'
import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

/**
 * Garantia: até quando a loja responde pelo que vendeu.
 *
 * ── ⚠️ A escada do prazo mora aqui, e só aqui ───────────────────────────────
 * São três degraus, nesta ordem, e a ordem É a regra:
 *
 *   1. o prazo CONGELADO no item da venda (o que valia no dia da compra)
 *   2. o prazo do produto, se o item não tiver (venda anterior à migration 051)
 *   3. o padrão da loja
 *
 * ⚠️ Zero é um degrau LEGÍTIMO, não é ausência. Produto marcado com zero dias
 * é produto vendido sem garantia de propósito (ponta de estoque, liquidação).
 * Por isso a escada pergunta se o degrau é NULO, e nunca se ele é falso: um
 * `||` no lugar do `??` faria o zero escorregar para o degrau de baixo, e a
 * loja passaria a prometer noventa dias numa peça que ela decidiu vender sem
 * garantia nenhuma.
 *
 * ── ⚠️ Esta família NÃO mexe em dinheiro ────────────────────────────────────
 * Registrar o atendimento de garantia é registrar o que foi DECIDIDO. Nada aqui
 * lança devolução, estorna venda ou repõe estoque: isso continua sendo a tela
 * de devolução, que já sabe fazer as três coisas juntas. Dois caminhos mexendo
 * no mesmo dinheiro dariam duas verdades para a mesma venda.
 */

export const CHAVE_GARANTIA_PADRAO = 'garantia_padrao_dias'

/** Usado quando a loja nunca respondeu: o prazo legal do produto durável. */
export const GARANTIA_PADRAO_DIAS = 90

export type ItemComGarantia = {
  item_venda_id: number
  venda_id: number
  data_venda: string
  produto_id: number
  produto_nome: string
  tamanho: string | null
  quantidade: number
  preco_unitario: number
  cliente_id: number | null
  cliente_nome: string | null
  cliente_telefone: string | null
  venda_cancelada: number
  /** O prazo que vale para ESTE item, já resolvido pela escada. */
  garantia_dias: number
  /** ISO 'YYYY-MM-DD'. Null quando o prazo é zero (sem garantia). */
  garantia_ate: string | null
  /** Negativo quando já venceu. Null quando não há garantia. */
  dias_restantes: number | null
  /** True quando o prazo veio do padrão por a venda ser antiga (degrau 2 ou 3). */
  prazo_estimado: boolean
  /** Quantos atendimentos de garantia este item já teve. */
  atendimentos: number
}

export type Garantia = {
  id: number
  item_venda_id: number
  venda_id: number
  aberta_em: string
  aberta_por: number | null
  aberta_por_nome: string | null
  defeito: string
  situacao: 'aberta' | 'resolvida' | 'recusada'
  desfecho: string | null
  observacao: string | null
  dentro_do_prazo: number
  fechada_em: string | null
  fechada_por: number | null
  fechada_por_nome: string | null
  produto_nome: string
  cliente_nome: string | null
  cliente_telefone: string | null
  data_venda: string
}

const DESFECHOS = ['troca', 'conserto', 'devolucao', 'sem_defeito', 'fora_do_prazo'] as const
export type Desfecho = (typeof DESFECHOS)[number]

export function prazoPadraoDaLoja(db?: Database.Database): number {
  const banco = db ?? obterBancoDeDados()
  const linha = banco
    .prepare('SELECT valor FROM config WHERE chave = ?')
    .get(CHAVE_GARANTIA_PADRAO) as { valor: string } | undefined
  const n = Number(linha?.valor)
  return Number.isInteger(n) && n >= 0 ? n : GARANTIA_PADRAO_DIAS
}

export function definirPrazoPadraoDaLoja(dias: number): void {
  if (!Number.isInteger(dias) || dias < 0 || dias > 3650) {
    throw new Error('O prazo de garantia deve ser um número de 0 a 3650 dias.')
  }
  const db = obterBancoDeDados()
  db.prepare(
    `INSERT INTO config (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`
  ).run(CHAVE_GARANTIA_PADRAO, String(dias))
}

/**
 * O prazo que vale para um item, pela escada.
 *
 * Fica numa função exportada porque a venda (que congela), a consulta (que
 * responde ao cliente) e o comprovante (que imprime) precisam chegar no mesmo
 * número. Três cópias da escada dariam três respostas para "até quando".
 *
 * ⚠️ A escada testa NULO, e não falsidade. Zero dias é uma decisão do lojista
 * (peça vendida sem garantia); lido como falsidade, ele escorregaria para o
 * degrau de baixo e a loja prometeria uma garantia que escolheu não dar.
 * `__tests__/garantias.test.ts` prende isso.
 */
export function prazoDoItem(
  congeladoNoItem: number | null | undefined,
  doProduto: number | null | undefined,
  padraoDaLoja: number
): number {
  if (congeladoNoItem != null) return congeladoNoItem
  if (doProduto != null) return doProduto
  return padraoDaLoja
}

/** Soma dias a uma data ISO ('YYYY-MM-DD' ou com hora), devolvendo 'YYYY-MM-DD'. */
export function somarDias(dataIso: string, dias: number): string {
  const base = Date.parse(`${dataIso.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(base)) return dataIso.slice(0, 10)
  return new Date(base + dias * 86400000).toISOString().slice(0, 10)
}

function hojeIsoLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de}T00:00:00Z`)
  const b = Date.parse(`${ate}T00:00:00Z`)
  return Math.round((b - a) / 86400000)
}

type LinhaItem = {
  item_venda_id: number
  venda_id: number
  data_venda: string
  produto_id: number
  produto_nome: string
  tamanho: string | null
  quantidade: number
  preco_unitario: number
  cliente_id: number | null
  cliente_nome: string | null
  cliente_telefone: string | null
  venda_cancelada: number
  item_garantia_dias: number | null
  produto_garantia_dias: number | null
  atendimentos: number
}

const SELECT_ITENS = `
  SELECT iv.id AS item_venda_id,
         v.id AS venda_id,
         v.data AS data_venda,
         p.id AS produto_id,
         p.nome AS produto_nome,
         pv.tamanho AS tamanho,
         iv.quantidade,
         iv.preco_unitario,
         v.cliente_id,
         c.nome AS cliente_nome,
         c.telefone AS cliente_telefone,
         v.cancelada AS venda_cancelada,
         iv.garantia_dias AS item_garantia_dias,
         p.garantia_dias AS produto_garantia_dias,
         (SELECT COUNT(*) FROM garantias g WHERE g.item_venda_id = iv.id) AS atendimentos
    FROM itens_venda iv
    JOIN vendas v ON v.id = iv.venda_id
    JOIN produtos p ON p.id = iv.produto_id
    LEFT JOIN produto_variacoes pv ON pv.id = iv.variacao_id
    LEFT JOIN clientes c ON c.id = v.cliente_id`

function montarItem(l: LinhaItem, padrao: number, hoje: string): ItemComGarantia {
  const dias = prazoDoItem(l.item_garantia_dias, l.produto_garantia_dias, padrao)
  const ate = dias > 0 ? somarDias(l.data_venda, dias) : null
  return {
    item_venda_id: l.item_venda_id,
    venda_id: l.venda_id,
    data_venda: l.data_venda,
    produto_id: l.produto_id,
    produto_nome: l.produto_nome,
    tamanho: l.tamanho,
    quantidade: l.quantidade,
    preco_unitario: l.preco_unitario,
    cliente_id: l.cliente_id,
    cliente_nome: l.cliente_nome,
    cliente_telefone: l.cliente_telefone,
    venda_cancelada: l.venda_cancelada,
    garantia_dias: dias,
    garantia_ate: ate,
    dias_restantes: ate ? diasEntre(hoje, ate) : null,
    // Venda anterior à migration 051 não tem prazo congelado: o que a tela
    // mostra é o melhor palpite de hoje, e ela precisa dizer isso.
    prazo_estimado: l.item_garantia_dias == null,
    atendimentos: l.atendimentos
  }
}

/**
 * Procura itens vendidos para responder "isto ainda está na garantia?".
 *
 * O termo casa com número da venda, nome ou telefone do cliente, nome do
 * produto e código de barras — é como a pergunta chega no balcão, com o cupom
 * na mão ou sem nada.
 *
 * ⚠️ Venda CANCELADA continua aparecendo, marcada. Some da busca, o atendente
 * diria "não achei essa compra" para uma venda que existiu e foi desfeita, e a
 * conversa com o cliente começaria errada.
 */
export function buscarItensVendidos(termo: string, limite = 40): ItemComGarantia[] {
  const db = obterBancoDeDados()
  const t = termo.trim()
  if (t === '') return []
  const curinga = `%${t}%`
  const numero = /^\d+$/.test(t) ? Number(t) : -1

  const linhas = db
    .prepare(
      `${SELECT_ITENS}
        WHERE v.id = ?
           OR p.nome LIKE ? COLLATE NOCASE
           OR c.nome LIKE ? COLLATE NOCASE
           OR REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(c.telefone,''), '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?
           OR p.codigo_barras = ?
           OR pv.codigo_barras = ?
        ORDER BY v.data DESC, iv.id DESC
        LIMIT ?`
    )
    .all(numero, curinga, curinga, curinga, t, t, limite) as LinhaItem[]

  const padrao = prazoPadraoDaLoja(db)
  const hoje = hojeIsoLocal()
  return linhas.map((l) => montarItem(l, padrao, hoje))
}

/** Os itens de uma venda específica, para quem chegou com o número do cupom. */
export function itensDaVenda(vendaId: number): ItemComGarantia[] {
  const db = obterBancoDeDados()
  const linhas = db
    .prepare(`${SELECT_ITENS} WHERE v.id = ? ORDER BY iv.id`)
    .all(vendaId) as LinhaItem[]
  const padrao = prazoPadraoDaLoja(db)
  const hoje = hojeIsoLocal()
  return linhas.map((l) => montarItem(l, padrao, hoje))
}

const SELECT_GARANTIAS = `
  SELECT g.*,
         p.nome AS produto_nome,
         c.nome AS cliente_nome,
         c.telefone AS cliente_telefone,
         v.data AS data_venda,
         va.nome AS aberta_por_nome,
         vf.nome AS fechada_por_nome
    FROM garantias g
    JOIN itens_venda iv ON iv.id = g.item_venda_id
    JOIN produtos p ON p.id = iv.produto_id
    JOIN vendas v ON v.id = g.venda_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN vendedores va ON va.id = g.aberta_por
    LEFT JOIN vendedores vf ON vf.id = g.fechada_por`

export function listarGarantias(situacao?: string): Garantia[] {
  const db = obterBancoDeDados()
  const filtro = situacao ? ' WHERE g.situacao = ?' : ''
  const args = situacao ? [situacao] : []
  return db
    .prepare(
      `${SELECT_GARANTIAS}${filtro}
        ORDER BY g.situacao = 'aberta' DESC, g.aberta_em DESC
        LIMIT 300`
    )
    .all(...args) as Garantia[]
}

export function garantiasDoItem(itemVendaId: number): Garantia[] {
  return obterBancoDeDados()
    .prepare(`${SELECT_GARANTIAS} WHERE g.item_venda_id = ? ORDER BY g.aberta_em DESC`)
    .all(itemVendaId) as Garantia[]
}

/**
 * Abre um atendimento de garantia.
 *
 * ⚠️ Fora do prazo NÃO é recusa automática: o atendimento abre com
 * `dentro_do_prazo = 0` e o lojista decide. Barrar aqui tiraria dele uma
 * escolha que ele toma todo dia no balcão (cobrir por fora da regra para não
 * perder um cliente antigo), e a recusa ficaria sem registro nenhum.
 */
export function abrirGarantia(dados: {
  item_venda_id: number
  defeito: string
  vendedor_id: number | null
  observacao?: string | null
}): { id: number; dentro_do_prazo: boolean } {
  const db = obterBancoDeDados()
  const defeito = String(dados.defeito ?? '').trim()
  if (!defeito) throw new Error('Descreva o problema apresentado.')

  const linha = db
    .prepare(`${SELECT_ITENS} WHERE iv.id = ?`)
    .get(Number(dados.item_venda_id)) as LinhaItem | undefined
  if (!linha) throw new Error('Item de venda não encontrado.')
  if (linha.venda_cancelada) {
    throw new Error('Esta venda foi cancelada. Não há garantia sobre ela.')
  }

  const item = montarItem(linha, prazoPadraoDaLoja(db), hojeIsoLocal())
  const dentro = item.dias_restantes != null && item.dias_restantes >= 0

  const r = db
    .prepare(
      `INSERT INTO garantias (item_venda_id, venda_id, aberta_por, defeito, observacao, dentro_do_prazo)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      linha.item_venda_id,
      linha.venda_id,
      dados.vendedor_id ?? null,
      defeito,
      (dados.observacao ?? '').toString().trim() || null,
      dentro ? 1 : 0
    )

  return { id: Number(r.lastInsertRowid), dentro_do_prazo: dentro }
}

/**
 * Fecha o atendimento com o que foi decidido.
 *
 * ⚠️ Fechar NÃO move dinheiro nem estoque, mesmo com desfecho `devolucao`. O
 * dinheiro sai pela tela de devolução, que já lança o crédito, baixa o
 * livro-caixa e repõe a peça. Duplicar isso aqui tiraria o caixa do lugar na
 * primeira troca registrada nos dois lugares.
 */
export function fecharGarantia(
  id: number,
  desfecho: string,
  vendedorId: number | null,
  observacao?: string | null
): void {
  if (!DESFECHOS.includes(desfecho as Desfecho)) {
    throw new Error('Desfecho inválido.')
  }
  const db = obterBancoDeDados()
  const atual = db.prepare('SELECT situacao FROM garantias WHERE id = ?').get(Number(id)) as
    | { situacao: string }
    | undefined
  if (!atual) throw new Error('Atendimento de garantia não encontrado.')
  if (atual.situacao !== 'aberta') throw new Error('Este atendimento já foi encerrado.')

  /*
   * "Sem defeito" e "fora do prazo" são RECUSAS: a loja não assumiu a peça. Os
   * outros três são resoluções. A separação importa no relatório — uma loja com
   * muitas trocas tem um problema de produto; uma com muitas recusas tem um
   * problema de expectativa na venda.
   */
  const situacao =
    desfecho === 'sem_defeito' || desfecho === 'fora_do_prazo' ? 'recusada' : 'resolvida'

  db.prepare(
    `UPDATE garantias
        SET situacao = ?, desfecho = ?, fechada_em = datetime('now','localtime'),
            fechada_por = ?,
            observacao = COALESCE(NULLIF(TRIM(?), ''), observacao)
      WHERE id = ?`
  ).run(situacao, desfecho, vendedorId ?? null, observacao ?? '', Number(id))
}

export function reabrirGarantia(id: number): void {
  const db = obterBancoDeDados()
  const r = db
    .prepare(
      `UPDATE garantias
          SET situacao = 'aberta', desfecho = NULL, fechada_em = NULL, fechada_por = NULL
        WHERE id = ? AND situacao <> 'aberta'`
    )
    .run(Number(id))
  if (r.changes === 0) throw new Error('Este atendimento já está aberto.')
}

export type ResumoGarantias = {
  abertas: number
  fora_do_prazo_abertas: number
  resolvidas_30d: number
  recusadas_30d: number
}

/** Os números do topo da tela: o que está pendente e o giro do último mês. */
export function resumoGarantias(): ResumoGarantias {
  const db = obterBancoDeDados()
  const r = db
    .prepare(
      `SELECT
         SUM(situacao = 'aberta') AS abertas,
         SUM(situacao = 'aberta' AND dentro_do_prazo = 0) AS fora_do_prazo_abertas,
         SUM(situacao = 'resolvida' AND date(fechada_em) >= date('now','localtime','-30 days')) AS resolvidas_30d,
         SUM(situacao = 'recusada' AND date(fechada_em) >= date('now','localtime','-30 days')) AS recusadas_30d
       FROM garantias`
    )
    .get() as Record<string, number | null>
  return {
    abertas: r.abertas ?? 0,
    fora_do_prazo_abertas: r.fora_do_prazo_abertas ?? 0,
    resolvidas_30d: r.resolvidas_30d ?? 0,
    recusadas_30d: r.recusadas_30d ?? 0
  }
}
