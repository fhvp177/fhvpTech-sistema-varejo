import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { contaSugerida, lancarMovimento } from './financeiro'
import { exigeCaixaAberto } from './turnos'
import { obterComissaoPadrao } from './comissoes'
import { prazoDoItem, prazoPadraoDaLoja } from './garantias'

export type StatusPagamento = 'pago' | 'pendente' | 'inadimplente' | 'parcelado'

export type Parcela = {
  id: number
  venda_id: number
  numero: number
  valor: number
  data_vencimento: string
  status: 'pendente' | 'pago' | 'inadimplente'
}

export type Venda = {
  id: number
  cliente_id: number | null
  vendedor_id: number | null
  data: string
  total: number
  desconto: number
  entrada: number
  valor_pago: number
  status_pagamento: StatusPagamento
  data_vencimento: string | null
  num_parcelas: number | null
  // Percentual de comissão do vendedor CONGELADO no momento da venda. Aumentar
  // o percentual de alguém não pode reescrever o mês que já foi pago — o porquê
  // está inteiro na migration 038. NULL nas vendas anteriores a ela.
  comissao_pct: number | null
  // Em qual turno de caixa esta venda entrou. NULL nas anteriores à migration
  // 047 e nas que nascem fora de caixa (entrega de OS na assistência).
  turno_id: number | null
  // Bilhete desta compra, escrito no PDV e impresso no cupom: "troca até 15/09",
  // "presente, não mandar preço". É da VENDA, não do cliente — o porquê está na
  // migration 042.
  observacao: string | null
  valor_inadimplente: number
  valor_devolvido: number
  cliente_nome?: string | null
  cliente_telefone?: string | null
  cliente_endereco?: string | null
  cliente_cpf?: string | null
  cliente_tipo_pessoa?: 'fisica' | 'juridica' | null
  cliente_cnpj?: string | null
  cliente_razao_social?: string | null
  vendedor_nome?: string | null
  cancelada?: number
  cancelada_em?: string | null
  cancelada_por_id?: number | null
  cancelamento_motivo?: string | null
  cancelada_por_nome?: string | null
  // 1 quando a venda consumiu crédito da loja (bloqueia o estorno simples — usar
  // devolução). Só é preenchido em buscarVendaPorId.
  usou_credito?: number
}

export type ItemVenda = {
  id: number
  venda_id: number
  produto_id: number
  variacao_id: number | null
  quantidade: number
  preco_unitario: number
  // Quanto a peça CUSTOU no dia em que foi vendida. NULL nas vendas anteriores
  // à migration 043, e quem lê cai no custo atual do produto — ver lá.
  custo_unitario: number | null
  // Prazo de garantia CONGELADO no dia da venda. NULL nas vendas
  // anteriores à migration 051, e quem lê trata isso como "não sei o que
  // foi prometido", nunca como "sem garantia".
  garantia_dias: number | null
  produto_nome?: string
  codigo_barras?: string
  tamanho?: string | null
}

export type VendaDetalhada = Venda & { itens: ItemVenda[]; parcelas: Parcela[] }

export type DadosNovaVenda = {
  cliente_id: number | null
  vendedor_id: number
  /**
   * Em qual caixa físico esta venda aconteceu.
   *
   * ⚠️ Obrigatório, e a venda é recusada se o caixa não estiver aberto. Venda
   * fora de turno é dinheiro que não entra em conferência nenhuma — some do
   * fechamento sem ninguém notar, que é o oposto do que o controle existe para
   * fazer.
   *
   * Ausente só em venda que nasce de outro fluxo sem caixa (entrega de OS na
   * assistência), e aí o movimento fica sem turno de propósito.
   */
  caixa_id?: number | null
  /**
   * Em qual conta o dinheiro desta venda entra.
   *
   * ⚠️ IGNORADA quando a forma é espécie: a nota está na gaveta do
   * operador, e só lá. Ver `destinoDoRecebimento`.
   *
   * Ausente cai na escada de sempre: a conta casada com a FORMA, senão a
   * padrão de recebimento, senão qualquer ativa. Quem não escolhe continua
   * com o comportamento que sempre teve.
   */
  conta_id?: number | null
  status_pagamento: StatusPagamento
  data_vencimento: string | null
  num_parcelas?: number | null
  desconto?: number
  // Entrada paga no ato — só em venda parcelada ou a prazo. Reduz o valor
  // financiado/devido e já entra como valor_pago. Em venda à vista é ignorada.
  entrada?: number
  // Crédito na loja do cliente abatido nesta venda (forma de pagamento "usar
  // crédito"). v1: só em venda à vista ('pago'). Lança um 'uso' no ledger.
  valor_credito_usado?: number
  // COMO o cliente pagou — dinheiro/debito/credito/pix. Só faz sentido em venda
  // à vista: a prazo é crediário por definição e é DERIVADO aqui, não perguntado.
  // Ausente grava NULL ("não sabemos"), que é o caso da venda vinda de uma OS.
  forma_pagamento?: string | null
  /**
   * COM QUE MEIO o cliente pagou o SINAL, na venda a prazo ou parcelada.
   *
   * ⚠️ É outra pergunta que `forma_pagamento`, e por isso é outro campo. A
   * VENDA a prazo é crediário — é isso que fica em `vendas.forma_pagamento` e é
   * assim que ela conta nos relatórios. Mas o sinal é dinheiro de verdade
   * entrando agora, e ele entra por um meio: espécie, PIX, cartão.
   *
   * ⚠️ Sem isto o sinal ia para o livro carimbado como "crediario", e aí a
   * trava que manda espécie para a gaveta não o reconhecia: o sinal pago em
   * notas era registrado na conta padrão de recebimento, que numa loja com
   * banco cadastrado é o banco. O dinheiro ficava na gaveta e o sistema
   * anotava no banco, todo dia, sem nada na tela ligando uma coisa à outra.
   *
   * Ausente presume ESPÉCIE — ver `formaDoDinheiroQueEntrou`.
   */
  forma_entrada?: string | null
  /**
   * Quanto do dinheiro desta venda JÁ está lançado no livro-caixa por outro
   * caminho.
   *
   * ⚠️ Existe por causa do sinal do pedido separado (migration 053): o dinheiro
   * entrou no dia em que a peça foi apartada, e foi registrado naquele dia, com
   * a forma e a conta daquele dia. Quando o pedido vira venda, o `entrada` da
   * venda precisa refletir o que o cliente já pagou — senão o cupom e a dívida
   * mentem — mas o livro NÃO pode receber o mesmo dinheiro de novo.
   *
   * Sem isto, cada pedido com sinal lançaria o sinal duas vezes: a loja
   * apareceria tendo recebido mais do que recebeu, e o fechamento do dia da
   * entrega acusaria uma sobra do tamanho exato do sinal.
   *
   * ⚠️ NÃO é desconto nem abatimento: a venda continua valendo o total, e o
   * cliente continua devendo o que falta. É só o livro que já foi avisado.
   */
  valor_ja_lancado?: number
  // Bilhete opcional impresso no cupom não fiscal.
  observacao?: string | null
  itens: Array<{
    produto_id: number
    // Tamanho vendido, quando o produto é de grade. null/ausente = produto simples
    // (baixa do estoque do próprio produto).
    variacao_id?: number | null
    quantidade: number
    preco_unitario: number
  }>
}

export type ResumoDashboard = {
  vendas_hoje: number
  total_hoje: number
  total_clientes: number
  total_produtos: number
}

// Adiciona N meses a uma data ISO, respeitando o último dia do mês alvo
function adicionarMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  const anoAlvo = ano + Math.floor((mes - 1 + meses) / 12)
  const mesAlvo = (mes - 1 + meses) % 12
  const ultimoDia = new Date(anoAlvo, mesAlvo + 1, 0).getDate()
  const diaAlvo = Math.min(dia, ultimoDia)
  return `${anoAlvo}-${String(mesAlvo + 1).padStart(2, '0')}-${String(diaAlvo).padStart(2, '0')}`
}

export function promoverVendasVencidas(): void {
  const db = obterBancoDeDados()
  // Promove parcelas vencidas (ignora parcelas de vendas canceladas)
  db.prepare(
    `UPDATE parcelas SET status = 'inadimplente'
     WHERE status = 'pendente' AND date(data_vencimento) < date('now')
       AND venda_id IN (SELECT id FROM vendas WHERE cancelada = 0)`
  ).run()
  // Promove vendas parceladas que têm parcelas em atraso
  db.prepare(
    `UPDATE vendas SET status_pagamento = 'inadimplente'
     WHERE status_pagamento = 'parcelado'
       AND cancelada = 0
       AND id IN (SELECT DISTINCT venda_id FROM parcelas WHERE status = 'inadimplente')`
  ).run()
  // Promove vendas simples pendentes vencidas
  db.prepare(
    `UPDATE vendas
     SET status_pagamento = 'inadimplente'
     WHERE status_pagamento = 'pendente'
       AND cancelada = 0
       AND data_vencimento IS NOT NULL
       AND date(data_vencimento) < date('now')`
  ).run()
}

// Sem `mes`: as 300 vendas mais recentes (visão padrão do histórico). Com `mes`
// ('YYYY-MM'): TODAS as vendas daquele mês, sem teto (um mês é naturalmente
// limitado). Filtrar o mês AQUI, no banco, evita o bug de esconder vendas antigas
// quando a loja passa de 300 vendas no total e o filtro era feito só em memória.
export function listarVendas(mes?: string): Venda[] {
  const db = obterBancoDeDados()
  promoverVendasVencidas()
  const filtroMes = mes ? 'AND substr(v.data, 1, 7) = @mes' : ''
  const limite = mes ? '' : 'LIMIT 300'
  return db
    .prepare(
      `SELECT v.*, c.nome AS cliente_nome,
              c.tipo_pessoa AS cliente_tipo_pessoa,
              vd.nome AS vendedor_nome,
              COALESCE(p_late.valor_inadimplente, 0) AS valor_inadimplente,
              COALESCE(dev.valor_devolvido, 0) AS valor_devolvido
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
       LEFT JOIN (
         SELECT venda_id, SUM(valor) AS valor_inadimplente
         FROM parcelas WHERE status = 'inadimplente'
         GROUP BY venda_id
       ) p_late ON p_late.venda_id = v.id
       LEFT JOIN (
         SELECT venda_id, SUM(valor_total) AS valor_devolvido
         FROM devolucoes
         GROUP BY venda_id
       ) dev ON dev.venda_id = v.id
       WHERE v.cancelada = 0
       ${filtroMes}
       ORDER BY v.data DESC
       ${limite}`
    )
    .all(mes ? { mes } : {}) as Venda[]
}

// Vendas arquivadas (canceladas) — para a aba "Canceladas". Inclui quem cancelou,
// quando e o motivo (já vêm em v.*). Respeita o filtro de mês pela data da venda.
export function listarVendasCanceladas(mes?: string): Venda[] {
  const db = obterBancoDeDados()
  const filtroMes = mes ? 'AND substr(v.data, 1, 7) = @mes' : ''
  return db
    .prepare(
      `SELECT v.*, c.nome AS cliente_nome,
              vd.nome AS vendedor_nome,
              vdc.nome AS cancelada_por_nome,
              0 AS valor_inadimplente,
              COALESCE(dev.valor_devolvido, 0) AS valor_devolvido
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
       LEFT JOIN vendedores vdc ON vdc.id = v.cancelada_por_id
       LEFT JOIN (
         SELECT venda_id, SUM(valor_total) AS valor_devolvido
         FROM devolucoes
         GROUP BY venda_id
       ) dev ON dev.venda_id = v.id
       WHERE v.cancelada = 1
       ${filtroMes}
       ORDER BY v.cancelada_em DESC, v.id DESC`
    )
    .all(mes ? { mes } : {}) as Venda[]
}

export function buscarVendaPorId(id: number): VendaDetalhada | undefined {
  const db = obterBancoDeDados()
  const venda = db
    .prepare(
      `SELECT v.*, c.nome AS cliente_nome,
              c.telefone AS cliente_telefone,
              c.endereco AS cliente_endereco,
              c.cpf AS cliente_cpf,
              c.tipo_pessoa AS cliente_tipo_pessoa,
              c.cnpj AS cliente_cnpj,
              c.razao_social AS cliente_razao_social,
              vd.nome AS vendedor_nome,
              EXISTS(SELECT 1 FROM creditos_cliente cc WHERE cc.venda_id = v.id AND cc.tipo = 'uso') AS usou_credito,
              COALESCE(p_late.valor_inadimplente, 0) AS valor_inadimplente,
              COALESCE(dev.valor_devolvido, 0) AS valor_devolvido
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
       LEFT JOIN (
         SELECT venda_id, SUM(valor) AS valor_inadimplente
         FROM parcelas WHERE status = 'inadimplente'
         GROUP BY venda_id
       ) p_late ON p_late.venda_id = v.id
       LEFT JOIN (
         SELECT venda_id, SUM(valor_total) AS valor_devolvido
         FROM devolucoes
         GROUP BY venda_id
       ) dev ON dev.venda_id = v.id
       WHERE v.id = ?`
    )
    .get(id) as Venda | undefined

  if (!venda) return undefined

  const itens = db
    .prepare(
      `SELECT iv.*,
              p.nome || CASE WHEN pv.tamanho IS NOT NULL THEN ' (' || pv.tamanho || ')' ELSE '' END AS produto_nome,
              COALESCE(pv.codigo_barras, p.codigo_barras) AS codigo_barras,
              pv.tamanho AS tamanho
       FROM itens_venda iv
       JOIN produtos p ON p.id = iv.produto_id
       LEFT JOIN produto_variacoes pv ON pv.id = iv.variacao_id
       WHERE iv.venda_id = ?`
    )
    .all(id) as ItemVenda[]

  const parcelas = db
    .prepare('SELECT * FROM parcelas WHERE venda_id = ? ORDER BY numero')
    .all(id) as Parcela[]

  return { ...venda, itens, parcelas }
}

/**
 * Esta loja usa venda PARCELADA (carnê de várias parcelas)?
 *
 * ── Por que virou interruptor, e não uma remoção ────────────────────────────
 * O pedido veio de uma loja só: "tira o Parcelado da tela". Tirar do produto
 * cobraria a conta de quem vive de crediário — que é a maior parte do comércio
 * de bairro — e, pior, não apagaria as vendas parceladas que a própria loja já
 * tem. Um interruptor resolve o pedido sem tocar em ninguém mais.
 *
 * ── ⚠️ Nasce LIGADO, e desligar não apaga nada ──────────────────────────────
 * Quem nunca respondeu continua com o parcelamento disponível: a ausência de
 * resposta nunca pode virar mudança de comportamento numa loja que já opera.
 *
 * Desligado, o PDV deixa de OFERECER a condição. As vendas parceladas que já
 * existem continuam inteiras: aparecem na lista, recebem baixa de parcela,
 * aceitam estorno. Esconder o que já foi vendido seria apagar dívida de
 * cliente da tela do lojista.
 *
 * ── Por que a trava é de tela, e não do banco ───────────────────────────────
 * Diferente da exigência de caixa, aqui não há dinheiro fora de conferência
 * nem promessa ao cliente: é preferência de operação. Uma venda parcelada que
 * entrasse por um caminho antigo seria uma venda válida, visível e cancelável
 * — não um dado corrompido. Pôr a recusa no banco criaria a chance de barrar
 * uma venda no balcão por causa de um interruptor que alguém virou sem querer.
 */
export function permiteParcelamento(): boolean {
  const db = obterBancoDeDados()
  const r = db
    .prepare("SELECT valor FROM config WHERE chave = 'permitir_parcelamento'")
    .get() as { valor: string } | undefined
  return r?.valor !== '0'
}

export function definirPermissaoParcelamento(permitir: boolean): void {
  const db = obterBancoDeDados()
  db.prepare(
    "INSERT OR REPLACE INTO config (chave, valor) VALUES ('permitir_parcelamento', ?)"
  ).run(permitir ? '1' : '0')
}

export type RecebimentoDaVenda = {
  id: number
  data: string
  valor: number
  /** 'venda' (o que entrou ao fechar a venda), 'recebimento' ou 'estorno'. */
  tipo: string
  forma_pagamento: string | null
  conta_id: number
  conta_nome: string
  /** 'venda' ou 'parcela' — de onde este dinheiro veio. */
  origem_tipo: string | null
  /** Número da parcela, quando a linha for a baixa de uma. */
  parcela_numero: number | null
}

/**
 * Cada entrada e cada saída de dinheiro DESTA venda, em ordem.
 *
 * ── Por que isto não precisou de tabela nova ────────────────────────────────
 * O livro-caixa já guarda tudo: quem lança carimba `origem_tipo` e `origem_id`
 * desde a migration 039. O que faltava era só perguntar. Criar uma tabela de
 * "recebimentos da venda" daria DUAS verdades sobre o mesmo dinheiro, e a
 * segunda envelheceria calada no primeiro caminho que esquecesse de gravar nela.
 *
 * ── ⚠️ Os ESTORNOS entram na lista ──────────────────────────────────────────
 * Eles são movimentos negativos com a mesma origem. Esconder os negativos daria
 * uma lista que soma mais do que a venda recebeu — bonita e errada. Quem lê
 * precisa ver que entraram 185 e que 185 voltaram.
 *
 * ── ⚠️ O sinal do PEDIDO entra aqui ────────────────────────────────────────
 * Quando a venda nasceu de um pedido separado, o sinal foi lançado no dia em
 * que a peça foi apartada e continua apontando para o PEDIDO — reescrever a
 * origem faria o extrato daquele dia mudar de assunto. Sem este terceiro ramo,
 * o histórico da venda mostraria só o que foi pago na entrega e pareceria que
 * o cliente pagou menos do que pagou.
 *
 * ── ⚠️ Os parênteses em volta do OR não são enfeite ────────────────────────
 * `AND` ganha de `OR` em SQL. Sem o par externo, um filtro que alguém
 * acrescente no fim (um `AND m.valor > 0` para "limpar" a lista, digamos) gruda
 * só no ramo da PARCELA e não vale para o da venda: a consulta passa a filtrar
 * metade do que se pediu, sem erro nenhum. Descoberto tentando exatamente essa
 * mutação, que ficou VERDE por causa disto.
 *
 * ── ⚠️ Pode vir VAZIA com a venda paga ──────────────────────────────────────
 * Venda antiga da loja que não tinha conta financeira configurada, ou paga
 * inteira com crédito da loja, não gerou movimento nenhum. A tela trata isso
 * dizendo que não há lançamento, nunca afirmando que não houve pagamento — quem
 * responde quanto a venda recebeu continua sendo `valor_pago`.
 */
export function recebimentosDaVenda(vendaId: number): RecebimentoDaVenda[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT m.id, m.data, m.valor, m.tipo, m.forma_pagamento,
              m.conta_id, c.nome AS conta_nome,
              m.origem_tipo, p.numero AS parcela_numero
         FROM movimentos_financeiros m
         JOIN contas_financeiras c ON c.id = m.conta_id
         LEFT JOIN parcelas p ON m.origem_tipo = 'parcela' AND p.id = m.origem_id
        WHERE (
                (m.origem_tipo = 'venda' AND m.origem_id = @venda)
                OR (m.origem_tipo = 'parcela'
                    AND m.origem_id IN (SELECT id FROM parcelas WHERE venda_id = @venda))
                OR (m.origem_tipo = 'pedido'
                    AND m.origem_id IN (SELECT id FROM pedidos WHERE venda_id = @venda))
              )
        ORDER BY m.data, m.id`
    )
    .all({ venda: vendaId }) as RecebimentoDaVenda[]
}

// As únicas que o operador pode ESCOLHER. 'crediario' e 'credito_loja' não
// entram: são derivadas de fatos que o sistema já conhece (ver formaDaVenda).
// Espelha src/utils/formaPagamento.ts — o renderer não é importável daqui.
const FORMAS_ESCOLHIVEIS = new Set(['dinheiro', 'debito', 'credito', 'pix'])

/**
 * Decide COMO a venda foi paga.
 *
 * Deriva tudo que dá pra derivar e só aceita escolha onde há escolha de verdade:
 *
 * - a prazo/parcelado → sempre 'crediario'. É a definição do prazo, e é a mesma
 *   regra que a emissão da NFC-e já aplicava, então os dois caminhos não podem
 *   divergir.
 * - crédito da loja cobrindo o total → 'credito_loja'. Não entrou dinheiro,
 *   cartão nem PIX; obrigar o operador a apontar um deles seria forçar mentira.
 * - resto → o que o operador marcou no caixa.
 *
 * Devolve `null` quando ninguém informou. É de propósito que isso NÃO é erro
 * aqui: a venda gerada ao entregar uma Ordem de Serviço não passa pelo caixa, e
 * derrubar a entrega da OS por causa de um campo novo seria quebrar um fluxo
 * que funciona. A obrigatoriedade mora na tela do PDV, que é onde existe alguém
 * pra responder.
 */
export function formaDaVenda(
  dados: DadosNovaVenda,
  total: number,
  creditoUsado: number
): string | null {
  if (dados.status_pagamento !== 'pago') return 'crediario'
  // `> 0` importa: numa venda de total zero, sem crédito nenhum, `0 >= 0` seria
  // verdade e carimbaria "crédito da loja" numa venda que não usou crédito.
  if (creditoUsado > 0 && creditoUsado >= total) return 'credito_loja'

  const forma = (dados.forma_pagamento ?? '').trim().toLowerCase()
  if (!forma) return null
  if (!FORMAS_ESCOLHIVEIS.has(forma)) {
    throw new Error(`Forma de pagamento inválida: "${dados.forma_pagamento}".`)
  }
  return forma
}

/**
 * COM QUE MEIO entrou o dinheiro que a loja recebeu NESTE instante.
 *
 * ── Por que não é a mesma pergunta de `formaDaVenda` ────────────────────────
 * `formaDaVenda` responde "como esta VENDA foi paga", e a prazo a resposta é
 * sempre crediário. Esta aqui responde "o que entrou na mão agora", que numa
 * venda a prazo é o sinal — e sinal se paga em notas, PIX ou cartão como
 * qualquer outra coisa.
 *
 * Misturar as duas é o defeito que isto veio consertar: o sinal ia ao livro
 * como "crediario", escapava da trava da espécie (que compara com a palavra
 * "dinheiro") e era lançado numa conta de banco enquanto as notas ficavam na
 * gaveta. De quebra, o fechamento ganhava uma linha "crediario" que o operador
 * não tinha como contar.
 *
 * ── ⚠️ Sem escolha, presume ESPÉCIE ─────────────────────────────────────────
 * Sinal nasce no balcão, na frente do operador, e espécie é o caso comum.
 * Mais do que comum, é a suposição que a loja consegue DESMENTIR: se o dinheiro
 * não estiver na gaveta, a contagem do fechamento acusa na mesma hora. Supor
 * banco erra em silêncio — nenhuma conferência do dia percebe.
 *
 * A tela obriga a escolha quando há sinal; este padrão é para quem chama o
 * canal por fora (segundo caixa antigo, pedido concluído, script).
 */
export function formaDoDinheiroQueEntrou(
  dados: DadosNovaVenda,
  formaDaVendaResolvida: string | null
): string | null {
  if (dados.status_pagamento === 'pago') return formaDaVendaResolvida
  return formaDoDinheiroRecebido(dados.forma_entrada)
}

/**
 * Valida o meio de um dinheiro que está entrando AGORA, no balcão.
 *
 * Vale para o sinal da venda a prazo e para o sinal do pedido separado — os
 * dois são a mesma coisa vista de dois fluxos, e a regra do padrão (espécie)
 * não pode discordar entre eles. A razão do padrão está em
 * `formaDoDinheiroQueEntrou`.
 */
export function formaDoDinheiroRecebido(forma: string | null | undefined): string {
  const escolhida = (forma ?? '').trim().toLowerCase()
  if (!escolhida) return 'dinheiro'
  if (!FORMAS_ESCOLHIVEIS.has(escolhida)) {
    throw new Error(`Forma de pagamento inválida: "${forma}".`)
  }
  return escolhida
}

export function criarVenda(dados: DadosNovaVenda): VendaDetalhada {
  const db = obterBancoDeDados()
  const ehParcelado = dados.status_pagamento === 'parcelado' && dados.num_parcelas && dados.num_parcelas > 1

  if (!dados.vendedor_id) {
    throw new Error('Selecione o vendedor responsável pela venda.')
  }
  const vendedor = db
    .prepare('SELECT id, comissao_pct FROM vendedores WHERE id = ? AND ativo = 1')
    .get(dados.vendedor_id) as { id: number; comissao_pct: number | null } | undefined
  if (!vendedor) {
    throw new Error('Vendedor inválido ou inativo.')
  }

  // Carimba o percentual de comissão que vale AGORA (o do vendedor, ou o padrão
  // da loja). Congelar aqui é o que mantém imóvel o mês já fechado quando
  // alguém é promovido depois — ver migration 038.
  const comissaoPct = vendedor.comissao_pct ?? obterComissaoPadrao()

  /*
   * ⚠️ A trava de estoque desconta o RESERVADO.
   *
   * É esta comparação que impede vender a mesma peça duas vezes, e ela funciona
   * por o banco ser síncrono — uma operação por vez, sem vão entre ler e gravar.
   * Com pedidos separados, uma peça apartada para um cliente continua no
   * `estoque` (ela ainda é da loja até alguém pagar) mas não está mais
   * disponível para vender.
   *
   * A mudança é AQUI, e não numa segunda checagem em outro lugar: duas travas
   * em pontos diferentes deixam um vão entre elas, e o vão é exatamente onde a
   * última unidade some duas vezes.
   */
  for (const item of dados.itens) {
    if (item.variacao_id != null) {
      const v = db
        .prepare(
          `SELECT pv.estoque - pv.reservado AS estoque, pv.tamanho AS tamanho, p.nome AS nome
           FROM produto_variacoes pv JOIN produtos p ON p.id = pv.produto_id
           WHERE pv.id = ?`
        )
        .get(item.variacao_id) as { estoque: number; tamanho: string; nome: string } | undefined
      if (!v) throw new Error(`Tamanho #${item.variacao_id} não encontrado.`)
      if (item.quantidade > v.estoque) {
        throw new Error(
          `Estoque insuficiente para "${v.nome} (${v.tamanho})": ` +
          `solicitado ${item.quantidade}, disponível ${v.estoque}.`
        )
      }
    } else {
      const produto = db
        .prepare('SELECT nome, estoque - reservado AS estoque FROM produtos WHERE id = ?')
        .get(item.produto_id) as { nome: string; estoque: number } | undefined

      if (!produto) throw new Error(`Produto #${item.produto_id} não encontrado.`)
      if (item.quantidade > produto.estoque) {
        throw new Error(
          `Estoque insuficiente para "${produto.nome}": ` +
          `solicitado ${item.quantidade}, disponível ${produto.estoque}.`
        )
      }
    }
  }

  const subtotal = dados.itens.reduce(
    (acc, item) => acc + item.quantidade * item.preco_unitario,
    0
  )
  const desconto = Math.max(0, +(dados.desconto ?? 0).toFixed(2))
  if (desconto > subtotal) {
    throw new Error('O desconto não pode ser maior que o subtotal da venda.')
  }
  const total = +(subtotal - desconto).toFixed(2)

  // Entrada paga no ato (parcelado ou a prazo). Reduz o valor financiado/devido
  // e entra como valor_pago. O total da venda permanece o valor cheio.
  const entrada = Math.max(0, +(dados.entrada ?? 0).toFixed(2))
  if (entrada > 0) {
    if (dados.status_pagamento === 'pago') {
      throw new Error('Venda à vista não tem entrada — o cliente paga o total.')
    }
    if (entrada >= total) {
      throw new Error('A entrada não pode ser igual ou maior que o total. Para receber tudo agora, use "À vista".')
    }
  }

  // Uso de crédito da loja (forma de pagamento "usar crédito"). v1: só à vista.
  const creditoUsado = Math.max(0, +(dados.valor_credito_usado ?? 0).toFixed(2))
  if (creditoUsado > 0) {
    if (!dados.cliente_id) {
      throw new Error('Para usar crédito, selecione o cliente gerente do crédito.')
    }
    if (dados.status_pagamento !== 'pago') {
      throw new Error('Crédito da loja só pode ser usado em venda à vista.')
    }
    if (creditoUsado > total) {
      throw new Error('O crédito usado não pode ser maior que o total da venda.')
    }
    const { saldo } = db
      .prepare('SELECT COALESCE(SUM(valor), 0) AS saldo FROM creditos_cliente WHERE cliente_id = ?')
      .get(dados.cliente_id) as { saldo: number }
    if (creditoUsado > +saldo.toFixed(2)) {
      throw new Error(`Crédito insuficiente. Saldo disponível: R$ ${saldo.toFixed(2).replace('.', ',')}.`)
    }
  }

  const formaPagamento = formaDaVenda(dados, total, creditoUsado)
  // O que fica gravado NA VENDA (crediário, quando é a prazo) e o meio pelo
  // qual o dinheiro entrou agora são coisas diferentes. Ver a função.
  const formaDoDinheiro = formaDoDinheiroQueEntrou(dados, formaPagamento)

  /*
   * ⚠️ Sem caixa aberto não se vende.
   *
   * A regra parece dura e é o que faz a conferência valer: venda fora de turno
   * não entra em fechamento nenhum, e o dinheiro dela some do controle sem
   * ninguém notar. O PDV oferece "abrir caixa" na mesma tela, então o custo para
   * quem opera é de dois cliques.
   *
   * A trava mora AQUI, no banco, e não só na tela: o segundo caixa fala pelo
   * mesmo canal, e uma regra que vive na interface é uma regra que o outro
   * aparelho não tem.
   */
  let turnoId: number | null = null
  if (dados.caixa_id) {
    const turno = db
      .prepare(
        `SELECT id FROM turnos_caixa
          WHERE conta_id = ? AND fechado_em IS NULL
          ORDER BY id DESC LIMIT 1`
      )
      .get(dados.caixa_id) as { id: number } | undefined
    if (!turno) {
      throw new Error('CAIXA_FECHADO')
    }
    turnoId = turno.id
  } else if (exigeCaixaAberto()) {
    /*
     * ⚠️ Sem `caixa_id` NENHUM, com a exigência ligada, também é recusa.
     *
     * Antes o guarda só existia quando a tela mandava o caixa — ou seja, a
     * regra dependia de a interface se comportar. Bastava um aparelho com
     * versão antiga, ou o segundo caixa chamando o canal direto, para a venda
     * passar sem turno e o dinheiro ficar fora de toda conferência.
     *
     * Agora quem decide é o banco, que é onde a regra tem que morar.
     */
    throw new Error('CAIXA_FECHADO')
  }

  const inserirVenda = db.prepare(
    /*
     * ⚠️ `data` vai EXPLÍCITA, em hora da loja.
     *
     * O default da coluna é `CURRENT_TIMESTAMP`, que no SQLite é UTC — sempre,
     * em qualquer fuso da máquina; não é configuração, é a definição. No Brasil
     * isso gravava a venda três horas adiante do relógio do balcão, e a partir
     * das 21h no DIA SEGUINTE.
     *
     * O estrago não era só a data na tela. As tabelas do livro-caixa gravam em
     * hora local, então a mesma venda entrava como 22:42 no movimento e 01:42
     * do dia seguinte em `vendas`: o faturamento do dia e o dinheiro do caixa
     * deixavam de bater, sem nada que explicasse a diferença.
     *
     * O default fica onde está de propósito, como rede para quem inserir por
     * fora — trocá-lo exigiria reconstruir a tabela, e ela é referenciada por
     * itens, parcelas, devoluções, créditos e pedidos.
     */
    `INSERT INTO vendas (cliente_id, vendedor_id, data, total, desconto, entrada, valor_pago, status_pagamento, data_vencimento, num_parcelas, forma_pagamento, comissao_pct, observacao, turno_id)
     VALUES (@cliente_id, @vendedor_id, datetime('now','localtime'), @total, @desconto, @entrada, @valor_pago, @status_pagamento, @data_vencimento, @num_parcelas, @forma_pagamento, @comissao_pct, @observacao, @turno_id)`
  )
  const inserirItem = db.prepare(
    `INSERT INTO itens_venda (venda_id, produto_id, variacao_id, quantidade, preco_unitario, custo_unitario, garantia_dias)
     VALUES (@venda_id, @produto_id, @variacao_id, @quantidade, @preco_unitario, @custo_unitario, @garantia_dias)`
  )
  /*
   * ⚠️ O custo é lido AGORA e guardado junto, como já acontece com o preço e o
   * percentual de comissão.
   *
   * Sem isto o lucro do Painel lia o custo de hoje para uma venda de meses
   * atrás: bastava o fornecedor reajustar e o lojista atualizar o preço de
   * compra para TODO o lucro do passado encolher de uma vez, sem que nenhuma
   * venda tivesse mudado. Ver a migration 043.
   *
   * O custo é do PRODUTO mesmo em grade — na modelagem, preço e custo nunca
   * moram na variação.
   */
  const dadosDoProduto = db.prepare('SELECT custo, garantia_dias FROM produtos WHERE id = ?')
  /*
   * ⚠️ O prazo de garantia é congelado no item, exatamente como o custo logo
   * acima e o percentual de comissão na venda.
   *
   * Garantia não é um número do sistema: é uma promessa feita a uma pessoa.
   * Lida do produto na hora da consulta, ela mudaria de tamanho sozinha. Baixar
   * o padrão da loja de 90 para 30 dias encurtaria, no mesmo instante, a
   * garantia de todo mundo que já comprou, inclusive de quem está com o cupom
   * na mão dizendo "aqui está escrito noventa dias". Ver a migration 051.
   *
   * O padrão é lido UMA vez por venda, e não por item: são dezenas de itens num
   * carrinho grande, e o valor não muda no meio da mesma venda.
   */
  const garantiaPadrao = prazoPadraoDaLoja(db)
  const decrementarEstoqueProduto = db.prepare(
    'UPDATE produtos SET estoque = estoque - ? WHERE id = ?'
  )
  const decrementarEstoqueVariacao = db.prepare(
    'UPDATE produto_variacoes SET estoque = estoque - ? WHERE id = ?'
  )
  const inserirParcela = db.prepare(
    `INSERT INTO parcelas (venda_id, numero, valor, data_vencimento)
     VALUES (@venda_id, @numero, @valor, @data_vencimento)`
  )

  let vendaId!: number
  db.transaction(() => {
    const result = inserirVenda.run({
      cliente_id: dados.cliente_id,
      vendedor_id: dados.vendedor_id,
      total,
      desconto,
      entrada,
      // valor_pago é a fonte da verdade do total recebido. À vista já entra
      // integralmente paga (senão relatório/dívida/cancelamento a leem como não
      // recebida). Parcelado/a prazo começam só com a entrada (0 se não houver).
      valor_pago: dados.status_pagamento === 'pago' ? total : entrada,
      status_pagamento: dados.status_pagamento,
      data_vencimento: dados.data_vencimento,
      num_parcelas: dados.num_parcelas ?? null,
      forma_pagamento: formaPagamento,
      comissao_pct: comissaoPct,
      // Texto vazio vira NULL: "" e "não escreveu nada" são a mesma coisa, e o
      // cupom só desenha o bloco quando há o que dizer.
      observacao: dados.observacao?.trim() || null,
      /*
       * ⚠️ O turno vai na VENDA, e não só no movimento do livro-caixa.
       *
       * O movimento só nasce quando entra dinheiro. Venda a prazo sem entrada,
       * ou paga inteira com crédito da loja, não gera nenhum — e sumiria da
       * lista do turno, que é justamente onde alguém vai procurar de onde veio
       * uma diferença. Ver a migration 047.
       */
      turno_id: turnoId
    })
    vendaId = result.lastInsertRowid as number

    for (const item of dados.itens) {
      const doProduto = dadosDoProduto.get(item.produto_id) as
        | { custo: number; garantia_dias: number | null }
        | undefined
      inserirItem.run({
        venda_id: vendaId,
        produto_id: item.produto_id,
        variacao_id: item.variacao_id ?? null,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        custo_unitario: doProduto?.custo ?? null,
        garantia_dias: prazoDoItem(null, doProduto?.garantia_dias, garantiaPadrao)
      })
      if (item.variacao_id != null) {
        decrementarEstoqueVariacao.run(item.quantidade, item.variacao_id)
      } else {
        decrementarEstoqueProduto.run(item.quantidade, item.produto_id)
      }
    }

    if (ehParcelado && dados.data_vencimento && dados.num_parcelas) {
      const n = dados.num_parcelas
      // Só o que sobra depois da entrada é parcelado.
      const valorFinanciado = +(total - entrada).toFixed(2)
      const valorBase = Math.floor((valorFinanciado * 100) / n) / 100
      const valorUltima = +(valorFinanciado - valorBase * (n - 1)).toFixed(2)
      for (let i = 0; i < n; i++) {
        inserirParcela.run({
          venda_id: vendaId,
          numero: i + 1,
          valor: i === n - 1 ? valorUltima : valorBase,
          data_vencimento: adicionarMeses(dados.data_vencimento, i)
        })
      }
    }

    if (creditoUsado > 0) {
      db.prepare(
        `INSERT INTO creditos_cliente (cliente_id, tipo, valor, venda_id)
         VALUES (?, 'uso', ?, ?)`
      ).run(dados.cliente_id, -creditoUsado, vendaId)
    }

    /*
     * O dinheiro que de fato entrou vai para o livro-caixa.
     *
     * ⚠️ CRÉDITO DA LOJA NÃO É DINHEIRO. Numa venda de 100 paga com 30 de
     * crédito e 70 em espécie, `valor_pago` fica 100 (a venda está quitada) mas
     * só 70 entraram na gaveta. Lançar 100 faria o fechamento acusar falta de 30
     * sempre que alguém usasse crédito — e um controle que acusa falta sem
     * motivo é desligado na primeira semana.
     *
     * O lançamento acontece DENTRO desta transação: se a venda falhar no meio,
     * o dinheiro não pode ficar registrado.
     */
    /*
     * ⚠️ E o que JÁ ESTÁ no livro sai da conta.
     *
     * É o sinal do pedido separado: aquele dinheiro entrou no dia em que a peça
     * foi apartada e foi registrado naquele dia. Lançar de novo agora faria a
     * loja aparecer recebendo duas vezes o mesmo valor, e o fechamento do dia
     * da entrega acusaria sobra do tamanho do sinal. Ver `valor_ja_lancado`.
     */
    const jaLancado = Math.max(0, +(dados.valor_ja_lancado ?? 0).toFixed(2))
    const recebidoAgora = +(
      (dados.status_pagamento === 'pago' ? total : entrada) - creditoUsado - jaLancado
    ).toFixed(2)
    if (recebidoAgora > 0) {
      /*
       * ⚠️ Dinheiro em espécie cai NO CAIXA DO OPERADOR, sempre.
       *
       * Com um caixa só, perguntar "qual conta recebe dinheiro?" dava no mesmo.
       * Com dois, a nota de R$ 50 que entrou no Caixa 2 iria parar na gaveta do
       * Caixa 1 — e as duas contagens fechariam erradas, uma sobrando e a outra
       * faltando exatamente o mesmo valor.
       *
       * Cartão e PIX não passam por gaveta nenhuma, então aí sim o operador
       * pode dizer em qual conta o dinheiro caiu (`conta_id`). Sem escolha,
       * segue a escada de sempre: a conta casada com a forma, senão a padrão
       * de recebimento.
       *
       * A decisão inteira mora em `destinoDoRecebimento`, junto com a do
       * recebimento de dívida e a da baixa de parcela — três telas diferentes
       * que não podem discordar sobre onde o dinheiro entrou.
       *
       * ⚠️ Quem manda aqui é `formaDoDinheiro`, não a forma da VENDA. Numa
       * venda a prazo com sinal as duas discordam de propósito: a venda é
       * crediário, o sinal é o meio pelo qual as notas ou o PIX chegaram.
       */
      const { conta } = destinoDoRecebimento(
        db,
        formaDoDinheiro,
        dados.caixa_id,
        dados.conta_id
      )
      if (conta) {
        lancarMovimento(db, {
          conta_id: conta,
          valor: recebidoAgora,
          tipo: 'venda',
          descricao: `Venda #${vendaId}`,
          forma_pagamento: formaDoDinheiro,
          origem_tipo: 'venda',
          origem_id: vendaId,
          vendedor_id: dados.vendedor_id,
          // O turno é o do CAIXA, mesmo quando o dinheiro cai no banco.
          turno_id: turnoId
        })
      }
    }
  })()

  return buscarVendaPorId(vendaId)!
}

// Guarda comum de pagamento/estorno: uma venda cancelada (arquivada) não deve
// receber pagamento nem estorno. Defesa no backend — a UI já esconde as ações.
function garantirVendaAtiva(vendaId: number): void {
  const db = obterBancoDeDados()
  const v = db.prepare('SELECT cancelada FROM vendas WHERE id = ?').get(vendaId) as
    | { cancelada: number }
    | undefined
  if (!v) throw new Error('Venda não encontrada.')
  if (v.cancelada) throw new Error('Esta venda está cancelada e não aceita novas operações.')
}

// Estorno e devolução são dois mecanismos de reversão diferentes; sobrepô-los na
// mesma venda duplicaria o acerto (o cliente recebe de volta E a venda reabre
// devendo). Se já há devolução, o caminho é a devolução, não o estorno.
function garantirSemDevolucao(vendaId: number): void {
  const db = obterBancoDeDados()
  const tem = db.prepare('SELECT 1 FROM devolucoes WHERE venda_id = ? LIMIT 1').get(vendaId)
  if (tem) {
    throw new Error(
      'Esta venda tem devolução registrada — reverter o recebimento por cima duplicaria o acerto. Ajuste pela devolução.'
    )
  }
}

export function atualizarStatusVenda(id: number, status: StatusPagamento): void {
  garantirVendaAtiva(id)
  const db = obterBancoDeDados()
  db.transaction(() => {
    if (status === 'pago') {
      const venda = db.prepare('SELECT total FROM vendas WHERE id = ?').get(id) as { total: number } | undefined
      db.prepare('UPDATE vendas SET status_pagamento = ?, valor_pago = ? WHERE id = ?')
        .run(status, venda?.total ?? 0, id)
      db.prepare("UPDATE parcelas SET status = 'pago' WHERE venda_id = ?").run(id)
    } else {
      db.prepare('UPDATE vendas SET status_pagamento = ? WHERE id = ?').run(status, id)
    }
  })()
}

/**
 * Onde o dinheiro de um recebimento entra, e em qual turno.
 *
 * ── O defeito que isto conserta ─────────────────────────────────────────────
 * Receber dívida e receber parcela não perguntavam a FORMA. O movimento nascia
 * sem ela, e o fechamento agrupa por `COALESCE(forma_pagamento, 'dinheiro')` —
 * então um fiado quitado por PIX virava dinheiro esperado na gaveta. Dava
 * FALTA do tamanho da dívida, e no dia em que ninguém quitava nada o caixa
 * fechava certo. Era a origem mais provável do "às vezes não faz sentido".
 *
 * ── Espécie vai para a GAVETA de quem recebeu ───────────────────────────────
 * Mesma regra da venda: com dois caixas abertos, a nota que entrou no Caixa 2
 * não pode cair na gaveta do Caixa 1. Cartão e PIX seguem a conta da forma —
 * eles não passam por gaveta nenhuma.
 *
 * ── O turno vem de quem recebeu, mesmo quando o dinheiro cai no banco ───────
 * Igual à venda: o PIX do balcão pertence ao turno do caixa onde foi recebido,
 * senão ele some da conferência daquele turno.
 */
export function destinoDoRecebimento(
  db: ReturnType<typeof obterBancoDeDados>,
  forma: string | null | undefined,
  caixaId: number | null | undefined,
  contaEscolhida?: number | null
): { conta: number | null; turnoId: number | null } {
  const especie = (forma ?? '').toLowerCase() === 'dinheiro'
  /*
   * ⚠️ ESPÉCIE IGNORA A ESCOLHA, e a trava mora AQUI, não na tela.
   *
   * A nota que o cliente entregou está fisicamente na gaveta daquele
   * operador. Mandá-la para um banco no livro faria duas coisas ao mesmo
   * tempo: o banco ganharia dinheiro que nunca chegou nele, e o fechamento
   * do turno acusaria SOBRA daquele valor na gaveta, todo dia, sem
   * explicação. Com dois caixas abertos fica pior: uma contagem sobra e a
   * outra falta exatamente o mesmo.
   *
   * A tela esconde a escolha quando a forma é dinheiro, e isso NÃO basta: o
   * canal é falado por string, e quem chama pode ser um segundo caixa de
   * versão anterior, a loja no navegador ou um script. Guarda que depende de
   * quem chama é guarda que um dia não é chamada.
   *
   * Quem quiser levar espécie para o banco faz SANGRIA, que é o que ela é.
   */
  const conta = especie
    ? (caixaId ?? contaSugerida(db, 'recebimento', forma ?? null))
    : (contaEscolhida ?? contaSugerida(db, 'recebimento', forma ?? null))
  const turnoId = caixaId
    ? ((
        db
          .prepare(
            `SELECT id FROM turnos_caixa
              WHERE conta_id = ? AND fechado_em IS NULL
              ORDER BY id DESC LIMIT 1`
          )
          .get(caixaId) as { id: number } | undefined
      )?.id ?? null)
    : null
  return { conta, turnoId }
}

export function registrarPagamentoParcial(
  id: number,
  valor: number,
  forma?: string | null,
  caixaId?: number | null,
  /** Em qual conta o dinheiro caiu. IGNORADA quando a forma é espécie. */
  contaId?: number | null
): void {
  const db = obterBancoDeDados()
  garantirVendaAtiva(id)
  db.transaction(() => {
    const venda = db
      .prepare('SELECT total, valor_pago, num_parcelas FROM vendas WHERE id = ?')
      .get(id) as { total: number; valor_pago: number; num_parcelas: number | null } | undefined
    if (!venda) throw new Error('Venda não encontrada.')
    if (venda.num_parcelas && venda.num_parcelas > 1) {
      throw new Error('Venda parcelada: registre o pagamento por parcela.')
    }
    if (valor <= 0) throw new Error('O valor deve ser maior que zero.')

    const restante = +(venda.total - venda.valor_pago).toFixed(2)
    if (restante <= 0) throw new Error('Esta venda já está totalmente paga.')

    const valorEfetivo = Math.min(valor, restante)
    const novoValorPago = +(venda.valor_pago + valorEfetivo).toFixed(2)
    const novoStatus = novoValorPago >= venda.total ? 'pago' : undefined

    if (novoStatus) {
      db.prepare('UPDATE vendas SET valor_pago = ?, status_pagamento = ? WHERE id = ?')
        .run(novoValorPago, novoStatus, id)
    } else {
      db.prepare('UPDATE vendas SET valor_pago = ? WHERE id = ?')
        .run(novoValorPago, id)
    }

    // Recebimento de dívida: dinheiro de verdade entrando, e por isso vai ao
    // livro — agora COM a forma, que é o que o fechamento usa para separar o
    // que está na gaveta do que está no cartão. Ver destinoDoRecebimento.
    const { conta, turnoId } = destinoDoRecebimento(db, forma, caixaId, contaId)
    if (conta) {
      lancarMovimento(db, {
        conta_id: conta,
        valor: valorEfetivo,
        tipo: 'recebimento',
        descricao: `Recebimento da venda #${id}`,
        forma_pagamento: forma ?? undefined,
        origem_tipo: 'venda',
        origem_id: id,
        turno_id: turnoId
      })
    }
  })()
}

export function pagarParcela(
  parcelaId: number,
  forma?: string | null,
  caixaId?: number | null,
  /** Em qual conta o dinheiro caiu. IGNORADA quando a forma é espécie. */
  contaId?: number | null
): void {
  const db = obterBancoDeDados()
  const parcela = db
    .prepare('SELECT venda_id, valor, status FROM parcelas WHERE id = ?')
    .get(parcelaId) as { venda_id: number; valor: number; status: string } | undefined
  if (!parcela) throw new Error('Parcela não encontrada.')
  garantirVendaAtiva(parcela.venda_id)

  db.transaction(() => {
    // Credita o valor da parcela no valor_pago da venda — só se ela ainda não
    // estava paga (evita somar duas vezes em clique duplo). Assim o valor_pago
    // reflete o total recebido (entrada + parcelas pagas) e o "restante"
    // (total - valor_pago) fica correto nas telas de dívida.
    const jaPaga = parcela.status === 'pago'
    db.prepare("UPDATE parcelas SET status = 'pago' WHERE id = ?").run(parcelaId)
    if (!jaPaga) {
      db.prepare('UPDATE vendas SET valor_pago = ROUND(valor_pago + ?, 2) WHERE id = ?')
        .run(parcela.valor, parcela.venda_id)

      // ⚠️ Só lança se a parcela ainda NÃO estava paga. Sem esta guarda, um
      // clique duplo lançaria o dinheiro duas vezes no livro — e aí o
      // fechamento acusaria uma sobra que ninguém conseguiria explicar.
      const { conta, turnoId } = destinoDoRecebimento(db, forma, caixaId, contaId)
      if (conta) {
        lancarMovimento(db, {
          conta_id: conta,
          valor: parcela.valor,
          tipo: 'recebimento',
          descricao: `Parcela da venda #${parcela.venda_id}`,
          forma_pagamento: forma ?? undefined,
          origem_tipo: 'parcela',
          origem_id: parcelaId,
          turno_id: turnoId
        })
      }
    }

    const { total, pagas } = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'pago' THEN 1 ELSE 0 END) AS pagas
         FROM parcelas WHERE venda_id = ?`
      )
      .get(parcela.venda_id) as { total: number; pagas: number }

    if (total === pagas) {
      // Quitada: fixa valor_pago = total para não acumular resíduo de centavos
      // do rateio das parcelas.
      const venda = db
        .prepare('SELECT total FROM vendas WHERE id = ?')
        .get(parcela.venda_id) as { total: number }
      db.prepare("UPDATE vendas SET status_pagamento = 'pago', valor_pago = ? WHERE id = ?")
        .run(venda.total, parcela.venda_id)
    } else {
      const temAtrasada = db
        .prepare("SELECT 1 FROM parcelas WHERE venda_id = ? AND status = 'inadimplente'")
        .get(parcela.venda_id)
      const novoStatus = temAtrasada ? 'inadimplente' : 'parcelado'
      db.prepare('UPDATE vendas SET status_pagamento = ? WHERE id = ?').run(novoStatus, parcela.venda_id)
    }
  })()
}

// Estorna (reverte) o recebimento de UMA parcela paga: devolve a parcela para
// pendente ou inadimplente conforme já venceu, tira o valor do total recebido da
// venda (valor_pago) e recalcula o status. É o inverso exato do pagarParcela e
// funciona em qualquer parcela paga, a qualquer momento. Ação do gerente — a trava
// de permissão fica no IPC.
/**
 * Desfaz no LIVRO o dinheiro que uma venda ou parcela tinha trazido.
 *
 * ── Por que precisa existir ─────────────────────────────────────────────────
 * Estornar mexia só na venda: `valor_pago` caía, o status reabria, e o
 * lançamento continuava no livro. O dinheiro tinha voltado para a mão do
 * cliente e o sistema seguia esperando encontrá-lo na gaveta — dava FALTA no
 * fechamento, do tamanho exato do que foi estornado, sem nada na tela que
 * ligasse uma coisa à outra.
 *
 * ── Devolve na MESMA conta e na MESMA forma do original ────────────────────
 * Se entrou no cartão, sai do cartão; se entrou na gaveta, sai da gaveta.
 * Adivinhar aqui faria o saldo de uma conta subir e o de outra cair.
 *
 * ── ⚠️ Mas no turno de AGORA, não no turno original ────────────────────────
 * `lancarMovimento` carimba o turno aberto da conta, e é o que se quer. O turno
 * em que a venda aconteceu pode estar fechado e já conferido pelo gerente;
 * lançar lá dentro mudaria o esperado de uma contagem que já foi assinada.
 *
 * Devolve o total estornado, ou 0 quando não havia nada lançado (loja sem conta
 * configurada na época da venda — aí não há o que desfazer).
 */
export function estornarNoLivro(
  db: ReturnType<typeof obterBancoDeDados>,
  origemTipo: 'venda' | 'parcela' | 'pedido',
  origemId: number,
  descricao: string
): number {
  const entradas = db
    .prepare(
      `SELECT conta_id, forma_pagamento, SUM(valor) AS total
         FROM movimentos_financeiros
        WHERE origem_tipo = ? AND origem_id = ?
        GROUP BY conta_id, forma_pagamento
       HAVING SUM(valor) > 0`
    )
    .all(origemTipo, origemId) as Array<{
    conta_id: number
    forma_pagamento: string | null
    total: number
  }>

  let estornado = 0
  for (const e of entradas) {
    lancarMovimento(db, {
      conta_id: e.conta_id,
      valor: -(+e.total.toFixed(2)),
      tipo: 'estorno',
      descricao,
      forma_pagamento: e.forma_pagamento ?? undefined,
      origem_tipo: origemTipo,
      origem_id: origemId
    })
    estornado = +(estornado + e.total).toFixed(2)
  }
  return estornado
}

export function estornarParcela(parcelaId: number): void {
  const db = obterBancoDeDados()
  const parcela = db
    .prepare('SELECT venda_id, valor, status FROM parcelas WHERE id = ?')
    .get(parcelaId) as { venda_id: number; valor: number; status: string } | undefined
  if (!parcela) throw new Error('Parcela não encontrada.')
  if (parcela.status !== 'pago') throw new Error('Esta parcela não está paga.')
  garantirVendaAtiva(parcela.venda_id)
  garantirSemDevolucao(parcela.venda_id)

  db.transaction(() => {
    // Volta a parcela para pendente/inadimplente conforme o vencimento.
    db.prepare(
      `UPDATE parcelas
       SET status = CASE WHEN data_vencimento < date('now', 'localtime') THEN 'inadimplente' ELSE 'pendente' END
       WHERE id = ?`
    ).run(parcelaId)
    // Tira o valor da parcela do total recebido (nunca abaixo de zero).
    db.prepare('UPDATE vendas SET valor_pago = MAX(0, ROUND(valor_pago - ?, 2)) WHERE id = ?')
      .run(parcela.valor, parcela.venda_id)
    // Recalcula o status da venda: se sobrou parcela atrasada, inadimplente;
    // senão volta a ser uma venda parcelada em aberto.
    const temAtrasada = db
      .prepare("SELECT 1 FROM parcelas WHERE venda_id = ? AND status = 'inadimplente'")
      .get(parcela.venda_id)
    const novoStatus = temAtrasada ? 'inadimplente' : 'parcelado'
    db.prepare('UPDATE vendas SET status_pagamento = ? WHERE id = ?').run(novoStatus, parcela.venda_id)
    // O dinheiro da parcela volta para quem pagou, então sai do livro também.
    estornarNoLivro(db, 'parcela', parcelaId, `Estorno da parcela da venda #${parcela.venda_id}`)
  })()
}

// Estorna o recebimento de uma venda SIMPLES (à vista ou a prazo sem parcelas):
// reabre a venda zerando o total recebido e voltando o status para pendente ou
// inadimplente conforme o vencimento. Vendas simples não guardam os pagamentos
// parciais individualmente, então o estorno é do recebimento inteiro — as
// parceladas usam estornarParcela. Ação do gerente (trava no IPC).
export function estornarRecebimento(vendaId: number): void {
  const db = obterBancoDeDados()
  const venda = db
    .prepare('SELECT cliente_id, num_parcelas, valor_pago, status_pagamento FROM vendas WHERE id = ?')
    .get(vendaId) as
    | { cliente_id: number | null; num_parcelas: number | null; valor_pago: number; status_pagamento: StatusPagamento }
    | undefined
  if (!venda) throw new Error('Venda não encontrada.')
  garantirVendaAtiva(vendaId)
  garantirSemDevolucao(vendaId)
  if (venda.num_parcelas && venda.num_parcelas > 1) {
    throw new Error('Venda parcelada: estorne parcela por parcela.')
  }
  // Venda avulsa (sem cliente): estornar criaria uma dívida sem a quem atribuir —
  // não há como cobrar. Aqui o caminho é a Devolução/troca, não o estorno.
  if (venda.cliente_id == null) {
    throw new Error(
      'Venda avulsa (sem cliente) não pode ser estornada — não há a quem atribuir o valor em aberto. Use Devolução/troca.'
    )
  }
  // Venda à vista grava valor_pago = 0 (é o status 'pago' que a marca como paga),
  // então "tem recebimento" quando valor_pago > 0 OU o status é 'pago'.
  const temRecebimento = venda.valor_pago > 0 || venda.status_pagamento === 'pago'
  if (!temRecebimento) throw new Error('Esta venda não tem recebimento para estornar.')
  // À vista que consumiu crédito da loja: reabrir sem devolver o crédito cobraria
  // o cliente duas vezes. Bloqueia — esse caso se resolve pela devolução.
  const usouCredito = db
    .prepare("SELECT 1 FROM creditos_cliente WHERE venda_id = ? AND tipo = 'uso'")
    .get(vendaId)
  if (usouCredito) {
    throw new Error(
      'Esta venda usou crédito da loja. Para reverter, faça uma devolução (o estorno não devolve o crédito).'
    )
  }

  // ⚠️ Numa transação só: reabrir a venda e desfazer o livro têm que acontecer
  // junto. Meio caminho deixaria a venda em aberto com o dinheiro ainda lançado,
  // que é exatamente o estado errado que este conserto veio remover.
  db.transaction(() => {
    db.prepare(
      `UPDATE vendas
       SET valor_pago = 0,
           status_pagamento = CASE
             WHEN data_vencimento IS NOT NULL AND data_vencimento < date('now', 'localtime') THEN 'inadimplente'
             ELSE 'pendente' END
       WHERE id = ?`
    ).run(vendaId)
    estornarNoLivro(db, 'venda', vendaId, `Estorno do recebimento da venda #${vendaId}`)
  })()
}

// Estados em que cancelar é seguro (a regra completa fica aqui).
export type ElegibilidadeCancelamento =
  | { permitido: true; cenario: 'virgem' | 'devolvida' }
  | { permitido: false; motivo: string }

type EstadoVendaCancelamento = {
  total: number
  valor_pago: number
  cancelada: number
  valor_devolvido: number
}

function lerEstadoCancelamento(id: number): EstadoVendaCancelamento | undefined {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT v.total, v.valor_pago, v.cancelada,
              COALESCE((SELECT SUM(valor_total) FROM devolucoes WHERE venda_id = v.id), 0) AS valor_devolvido
       FROM vendas v WHERE v.id = ?`
    )
    .get(id) as EstadoVendaCancelamento | undefined
}

// Decide se a venda pode ser cancelada e em qual cenário:
//  • 'virgem'    — nada recebido e nada devolvido → cancelar devolve o estoque;
//  • 'devolvida' — já foi integralmente devolvida → cancelar só arquiva (a
//                  devolução já repôs estoque e estornou o dinheiro).
// Qualquer estado intermediário (recebido sem devolução, devolução parcial) é
// barrado: ainda há valor a acertar, e isso é trabalho da devolução.
export function avaliarCancelamento(estado: EstadoVendaCancelamento): ElegibilidadeCancelamento {
  if (estado.cancelada) return { permitido: false, motivo: 'Esta venda já está cancelada.' }
  const total = +estado.total.toFixed(2)
  const devolvido = +estado.valor_devolvido.toFixed(2)
  const pago = +estado.valor_pago.toFixed(2)
  if (pago === 0 && devolvido === 0) return { permitido: true, cenario: 'virgem' }
  if (devolvido >= total) return { permitido: true, cenario: 'devolvida' }
  return {
    permitido: false,
    motivo:
      'Só dá para cancelar uma venda sem nenhum recebimento, ou que já foi totalmente devolvida. ' +
      'Esta tem valor em aberto — faça a devolução do restante antes de cancelar.'
  }
}

// Eligibilidade para a UI decidir se mostra/habilita o botão "Cancelar".
export function elegibilidadeCancelamento(id: number): ElegibilidadeCancelamento {
  const estado = lerEstadoCancelamento(id)
  if (!estado) return { permitido: false, motivo: 'Venda não encontrada.' }
  return avaliarCancelamento(estado)
}

// Cancela (arquiva) a venda. No cenário 'virgem' devolve o estoque; no 'devolvida'
// não mexe em estoque/dinheiro (a devolução já acertou). A venda some de todos os
// relatórios pelo filtro `cancelada = 0`, mas fica no banco para auditoria.
export function cancelarVenda(id: number, canceladaPorId: number, motivo: string): void {
  const db = obterBancoDeDados()
  const motivoLimpo = (motivo ?? '').trim()
  if (!motivoLimpo) throw new Error('Informe o motivo do cancelamento.')

  const estado = lerEstadoCancelamento(id)
  if (!estado) throw new Error('Venda não encontrada.')
  const elegivel = avaliarCancelamento(estado)
  if (!elegivel.permitido) throw new Error(elegivel.motivo)

  // Venda com nota fiscal VÁLIDA não pode ser cancelada por aqui: o documento
  // continuaria valendo na SEFAZ, com mercadoria que não saiu. Cancelar a nota
  // é ato fiscal próprio (prazo curto, justificativa, registro na SEFAZ), então
  // exige ser feito antes — de propósito, na tela da nota.
  //
  // A tabela pode não existir em instalação que nunca teve o módulo fiscal.
  const temTabelaNota = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'nfce_emitidas'`)
    .get()
  if (temTabelaNota) {
    const notaViva = db
      .prepare(
        `SELECT numero, status FROM nfce_emitidas
         WHERE venda_id = ? AND status IN ('autorizado','pendente')
         ORDER BY tentativa DESC LIMIT 1`
      )
      .get(id) as { numero: number; status: string } | undefined
    if (notaViva) {
      throw new Error(
        notaViva.status === 'pendente'
          ? 'Esta venda tem uma nota fiscal aguardando a SEFAZ. Verifique o resultado antes de cancelar.'
          : `Esta venda tem a nota fiscal nº ${notaViva.numero} autorizada. Cancele a nota primeiro (na lista de vendas, no ícone da nota).`
      )
    }
  }

  const itens = db
    .prepare('SELECT produto_id, variacao_id, quantidade FROM itens_venda WHERE venda_id = ?')
    .all(id) as Array<{ produto_id: number; variacao_id: number | null; quantidade: number }>

  db.transaction(() => {
    if (elegivel.cenario === 'virgem') {
      // Venda nunca acertada por devolução: devolve o estoque ao cancelar.
      const incProduto = db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?')
      const incVariacao = db.prepare('UPDATE produto_variacoes SET estoque = estoque + ? WHERE id = ?')
      for (const it of itens) {
        if (it.variacao_id != null) incVariacao.run(it.quantidade, it.variacao_id)
        else incProduto.run(it.quantidade, it.produto_id)
      }
    }
    db.prepare(
      `UPDATE vendas
       SET cancelada = 1, cancelada_em = datetime('now', 'localtime'),
           cancelada_por_id = ?, cancelamento_motivo = ?
       WHERE id = ?`
    ).run(canceladaPorId, motivoLimpo, id)
  })()
}

export type ProdutoMaisVendido = {
  produto_nome: string
  quantidade: number
  receita: number
}

// Produtos mais vendidos em um mês ('YYYY-MM'), ordenados por quantidade.
// Usa substr(v.data, 1, 7) (e não strftime) pra casar exatamente com o filtro
// de mês do histórico no front, que compara os 7 primeiros caracteres da data.
export function produtosMaisVendidosNoMes(mes: string): ProdutoMaisVendido[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT p.nome AS produto_nome,
              SUM(iv.quantidade) AS quantidade,
              SUM(iv.quantidade * iv.preco_unitario) AS receita
       FROM itens_venda iv
       JOIN vendas v ON v.id = iv.venda_id
       JOIN produtos p ON p.id = iv.produto_id
       WHERE substr(v.data, 1, 7) = ?
         AND v.cancelada = 0
       GROUP BY iv.produto_id
       ORDER BY quantidade DESC, receita DESC
       LIMIT 50`
    )
    .all(mes) as ProdutoMaisVendido[]
}

export type AReceberPorVencimento = {
  a_vencer: number // vencimento de hoje em diante, ainda em aberto
  vencido: number  // vencimento já passou e ninguém pagou (em atraso)
}

// Quanto a loja tem pra receber com VENCIMENTO dentro de [inicio, fim] (ISO
// 'YYYY-MM-DD', inclusivo), somando parcelas em aberto e vendas simples a prazo.
// A âncora é o vencimento, não a data da venda — parcelas de vendas feitas em
// meses anteriores entram. É um número diferente (e complementar) do faturamento,
// que soma pela data da venda; somar os dois dobraria a contagem.
export function aReceberPorVencimento(inicio: string, fim: string): AReceberPorVencimento {
  promoverVendasVencidas()
  const db = obterBancoDeDados()
  const parcelas = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN date(p.data_vencimento) >= date('now') THEN p.valor ELSE 0 END), 0) AS a_vencer,
         COALESCE(SUM(CASE WHEN date(p.data_vencimento) <  date('now') THEN p.valor ELSE 0 END), 0) AS vencido
       FROM parcelas p
       JOIN vendas v ON v.id = p.venda_id
       WHERE p.status <> 'pago'
         AND v.cancelada = 0
         AND date(p.data_vencimento) >= ? AND date(p.data_vencimento) <= ?`
    )
    .get(inicio, fim) as AReceberPorVencimento
  const vendasSimples = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN date(data_vencimento) >= date('now') THEN total - valor_pago ELSE 0 END), 0) AS a_vencer,
         COALESCE(SUM(CASE WHEN date(data_vencimento) <  date('now') THEN total - valor_pago ELSE 0 END), 0) AS vencido
       FROM vendas
       WHERE status_pagamento IN ('pendente', 'inadimplente')
         AND cancelada = 0
         AND num_parcelas IS NULL
         AND data_vencimento IS NOT NULL
         AND total - valor_pago > 0
         AND date(data_vencimento) >= ? AND date(data_vencimento) <= ?`
    )
    .get(inicio, fim) as AReceberPorVencimento
  return {
    a_vencer: +(parcelas.a_vencer + vendasSimples.a_vencer).toFixed(2),
    vencido: +(parcelas.vencido + vendasSimples.vencido).toFixed(2)
  }
}

/**
 * O que está em aberto SEM prazo combinado.
 *
 * ── Por que esta consulta existe ────────────────────────────────────────────
 * Desde 12/09/2026 a venda a prazo pode nascer sem data de vencimento: existe
 * combinação que se faz assim ("me paga quando a mercadoria chegar"). O preço
 * disso é que a venda some de TODA conta ancorada em vencimento — o card do
 * Painel, o relatório do mês, a promoção para inadimplente. Todas filtram
 * `data_vencimento IS NOT NULL`, e continuam filtrando: sem data não há prazo
 * para vencer, e inventar um seria mentir no relatório.
 *
 * Sem esta soma, porém, o dinheiro sumiria da vista do dono, que é pior. Ela é
 * a linha que devolve essas vendas para a tela.
 *
 * ⚠️ Não tem recorte de período, e não é esquecimento: período aqui seria
 * recorte por vencimento, e é justamente o que estas vendas não têm. É o total
 * em aberto, hoje.
 */
export function aReceberSemPrazo(): number {
  const db = obterBancoDeDados()
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(total - valor_pago), 0) AS total
         FROM vendas
        WHERE status_pagamento IN ('pendente', 'inadimplente')
          AND cancelada = 0
          AND num_parcelas IS NULL
          AND data_vencimento IS NULL
          AND total - valor_pago > 0`
    )
    .get() as { total: number }
  return +r.total.toFixed(2)
}

// Mesma conta, recortada para um mês ('YYYY-MM') — usada pelo relatório de vendas.
export function aReceberPorVencimentoNoMes(mes: string): AReceberPorVencimento {
  const [ano, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(ano, m, 0).getDate()
  return aReceberPorVencimento(`${mes}-01`, `${mes}-${String(ultimoDia).padStart(2, '0')}`)
}

export function resumoDashboard(): ResumoDashboard {
  promoverVendasVencidas()
  const db = obterBancoDeDados()
  const { vendas_hoje, total_hoje } = db
    .prepare(
      `SELECT COUNT(*) AS vendas_hoje, COALESCE(SUM(total), 0) AS total_hoje
       FROM vendas WHERE date(data) = date('now') AND cancelada = 0`
    )
    .get() as { vendas_hoje: number; total_hoje: number }

  const { total_clientes } = db
    .prepare('SELECT COUNT(*) AS total_clientes FROM clientes')
    .get() as { total_clientes: number }

  const { total_produtos } = db
    .prepare('SELECT COUNT(*) AS total_produtos FROM produtos WHERE arquivado = 0')
    .get() as { total_produtos: number }

  return { vendas_hoje, total_hoje, total_clientes, total_produtos }
}
