import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import {
  criarVenda,
  destinoDoRecebimento,
  estornarNoLivro,
  formaDoDinheiroRecebido,
  type DadosNovaVenda,
  type VendaDetalhada
} from './vendas'
import { lancarMovimento } from './financeiro'
import { exigeCaixaAberto } from './turnos'

/**
 * Pedido separado: a peça já saiu da prateleira, o dinheiro ainda não veio.
 *
 * O cliente desconfia de golpe e não paga adiantado. A joia vai até a casa dele
 * com o entregador, e o pagamento — e a FORMA de pagamento — acontece na porta.
 *
 * ── O ciclo inteiro, e são só duas saídas ───────────────────────────────────
 *
 *     separado ──pagou──▶ concluido  (vira venda de verdade)
 *         └────recusou───▶ cancelado (solta a reserva; nada aconteceu)
 *
 * ── ⚠️ O pedido não é uma venda pela metade ─────────────────────────────────
 * Ele não entra no faturamento, não gera comissão e não emite nota. Nada disso
 * é acidente: até o cliente pagar, não houve venda. Por isso pedido mora em
 * tabela própria, e não como uma "situação" dentro de `vendas` — assim toda
 * consulta que soma vendas continua certa sem precisar aprender a filtrar.
 *
 * ── ⚠️ Preço congelado ──────────────────────────────────────────────────────
 * O item guarda o preço combinado. Se a etiqueta mudar entre separar e receber,
 * a venda usa o do pedido: o cliente paga na porta o que foi acertado na loja.
 */

export type SituacaoPedido = 'separado' | 'concluido' | 'cancelado'

export type ItemPedido = {
  id: number
  produto_id: number
  variacao_id: number | null
  quantidade: number
  preco_unitario: number
  nome: string
  tamanho: string | null
}

export type Pedido = {
  id: number
  cliente_id: number | null
  cliente_nome: string | null
  cliente_telefone: string | null
  vendedor_id: number
  vendedor_nome: string | null
  situacao: SituacaoPedido
  criado_em: string
  para_entrega: number
  endereco_entrega: string | null
  observacao: string | null
  desconto: number
  total: number
  /**
   * Sinal já recebido, e por isso já lançado no livro-caixa (migration 053).
   * O que falta receber na entrega é `total - sinal`.
   */
  sinal: number
  venda_id: number | null
  concluido_em: string | null
  cancelado_em: string | null
  motivo_cancelamento: string | null
  dias_parado: number
}

export type DadosNovoPedido = {
  cliente_id: number | null
  vendedor_id: number
  para_entrega: boolean
  endereco_entrega: string | null
  observacao: string | null
  desconto?: number
  /**
   * Sinal pago no ato de separar a peça.
   *
   * ⚠️ É dinheiro de verdade entrando HOJE, e vai para o livro-caixa agora.
   * Antes da migration 053 a tela do PDV aceitava este valor e o descartava em
   * silêncio: o operador recebia na maquininha, o sistema não guardava nada, e
   * o caixa fechava com sobra sem explicação.
   */
  sinal?: number
  /** Com que meio o sinal foi pago. Ausente presume espécie. */
  sinal_forma?: string | null
  /** Em qual conta o sinal entrou. ⚠️ IGNORADA quando a forma é espécie. */
  conta_id?: number | null
  /** Em qual caixa físico o sinal foi recebido. */
  caixa_id?: number | null
  itens: Array<{
    produto_id: number
    variacao_id?: number | null
    quantidade: number
    preco_unitario: number
  }>
}

const arred = (v: number): number => +v.toFixed(2)

const SELECT_PEDIDO = `
  SELECT p.*,
         c.nome AS cliente_nome,
         c.telefone AS cliente_telefone,
         v.nome AS vendedor_nome,
         CAST(julianday('now','localtime') - julianday(p.criado_em) AS INTEGER) AS dias_parado
    FROM pedidos p
    LEFT JOIN clientes c ON c.id = p.cliente_id
    LEFT JOIN vendedores v ON v.id = p.vendedor_id`

// ─── Reserva ─────────────────────────────────────────────────────────────────

/*
 * Mexer no `reservado` é o coração disto, e as duas direções passam pela mesma
 * função de propósito: um `+` onde devia haver `-` em cópias separadas é o tipo
 * de erro que só aparece semanas depois, como estoque que não fecha.
 */
function moverReserva(
  db: ReturnType<typeof obterBancoDeDados>,
  itens: Array<{ produto_id: number; variacao_id?: number | null; quantidade: number }>,
  sinal: 1 | -1
): void {
  for (const item of itens) {
    if (item.variacao_id != null) {
      db.prepare('UPDATE produto_variacoes SET reservado = MAX(0, reservado + ?) WHERE id = ?').run(
        sinal * item.quantidade,
        item.variacao_id
      )
    } else {
      db.prepare('UPDATE produtos SET reservado = MAX(0, reservado + ?) WHERE id = ?').run(
        sinal * item.quantidade,
        item.produto_id
      )
    }
  }
}

// ─── Criar ───────────────────────────────────────────────────────────────────

export function criarPedido(dados: DadosNovoPedido): { id: number } {
  const db = obterBancoDeDados()
  if (dados.itens.length === 0) throw new Error('Um pedido precisa de pelo menos um item.')

  return db.transaction(() => {
    /*
     * ⚠️ A conferência de estoque é a MESMA da venda, contra `estoque -
     * reservado`. Sem ela, dois pedidos separariam a mesma peça e o segundo
     * cliente descobriria na porta de casa.
     */
    for (const item of dados.itens) {
      if (item.variacao_id != null) {
        const v = db
          .prepare(
            `SELECT pv.estoque - pv.reservado AS disponivel, pv.tamanho, p.nome
               FROM produto_variacoes pv JOIN produtos p ON p.id = pv.produto_id
              WHERE pv.id = ?`
          )
          .get(item.variacao_id) as { disponivel: number; tamanho: string; nome: string } | undefined
        if (!v) throw new Error(`Tamanho #${item.variacao_id} não encontrado.`)
        if (item.quantidade > v.disponivel) {
          throw new Error(
            `Sem estoque disponível para "${v.nome} (${v.tamanho})": ` +
              `pedido ${item.quantidade}, livre ${v.disponivel}.`
          )
        }
      } else {
        const p = db
          .prepare('SELECT nome, estoque - reservado AS disponivel FROM produtos WHERE id = ?')
          .get(item.produto_id) as { nome: string; disponivel: number } | undefined
        if (!p) throw new Error(`Produto #${item.produto_id} não encontrado.`)
        if (item.quantidade > p.disponivel) {
          throw new Error(
            `Sem estoque disponível para "${p.nome}": ` +
              `pedido ${item.quantidade}, livre ${p.disponivel}.`
          )
        }
      }
    }

    const subtotal = dados.itens.reduce((a, i) => a + i.quantidade * i.preco_unitario, 0)
    const desconto = Math.max(0, arred(dados.desconto ?? 0))
    if (desconto > subtotal) throw new Error('O desconto não pode ser maior que o subtotal.')
    const total = arred(subtotal - desconto)

    /*
     * O sinal.
     *
     * ⚠️ Não pode chegar ao total. Quem pagou tudo não está separando um
     * pedido para pagar depois: está comprando. Deixar passar criaria um
     * pedido quitado esperando "receber" zero, e a entrega não teria o que
     * cobrar — a saída certa para esse caso é a venda à vista.
     */
    const sinal = Math.max(0, arred(dados.sinal ?? 0))
    if (sinal >= total && sinal > 0) {
      throw new Error(
        'O sinal não pode ser igual ou maior que o total do pedido. Para receber tudo agora, finalize a venda.'
      )
    }
    // Valida o meio ANTES de gravar: forma inválida tem que derrubar o pedido
    // inteiro, não entrar como pedido sem o dinheiro que o cliente entregou.
    const formaDoSinal = sinal > 0 ? formaDoDinheiroRecebido(dados.sinal_forma) : null

    /*
     * ⚠️ Pedido COM SINAL exige caixa aberto; sem sinal, não.
     *
     * É a mesma regra da venda, e pelo mesmo motivo: dinheiro que entra fora de
     * turno não aparece em fechamento nenhum e some do controle sem ninguém
     * notar. O que muda é a condição — separar peça não movimenta dinheiro e
     * continua podendo acontecer com o caixa fechado.
     *
     * A trava mora aqui, no banco, e não só na tela: a loja no navegador e o
     * segundo caixa falam por este mesmo caminho.
     */
    let turnoDoSinal: number | null = null
    if (sinal > 0) {
      if (dados.caixa_id) {
        const turno = db
          .prepare(
            `SELECT id FROM turnos_caixa
              WHERE conta_id = ? AND fechado_em IS NULL
              ORDER BY id DESC LIMIT 1`
          )
          .get(dados.caixa_id) as { id: number } | undefined
        if (!turno) throw new Error('CAIXA_FECHADO')
        turnoDoSinal = turno.id
      } else if (exigeCaixaAberto()) {
        throw new Error('CAIXA_FECHADO')
      }
    }

    const r = db
      .prepare(
        `INSERT INTO pedidos
           (cliente_id, vendedor_id, situacao, para_entrega, endereco_entrega,
            observacao, desconto, total, sinal)
         VALUES (?, ?, 'separado', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        dados.cliente_id,
        dados.vendedor_id,
        dados.para_entrega ? 1 : 0,
        dados.endereco_entrega,
        dados.observacao,
        desconto,
        total,
        sinal
      )
    const pedidoId = Number(r.lastInsertRowid)

    const inserirItem = db.prepare(
      `INSERT INTO itens_pedido (pedido_id, produto_id, variacao_id, quantidade, preco_unitario)
       VALUES (?, ?, ?, ?, ?)`
    )
    for (const item of dados.itens) {
      inserirItem.run(
        pedidoId,
        item.produto_id,
        item.variacao_id ?? null,
        item.quantidade,
        arred(item.preco_unitario)
      )
    }

    moverReserva(db, dados.itens, 1)

    /*
     * O sinal vai ao livro-caixa AGORA, na mesma transação do pedido.
     *
     * ⚠️ A trava da espécie é a mesma da venda (`destinoDoRecebimento`): nota
     * entregue no balcão cai na gaveta daquele operador, e a escolha de conta é
     * ignorada. Um segundo caminho para o dinheiro com regra própria daria duas
     * respostas para a mesma pergunta.
     *
     * ⚠️ Dentro da transação de propósito: se o pedido falhar depois disto, o
     * dinheiro não pode ficar registrado sozinho.
     */
    if (sinal > 0) {
      const { conta } = destinoDoRecebimento(db, formaDoSinal, dados.caixa_id, dados.conta_id)
      if (conta) {
        lancarMovimento(db, {
          conta_id: conta,
          valor: sinal,
          tipo: 'sinal',
          descricao: `Sinal do pedido #${pedidoId}`,
          forma_pagamento: formaDoSinal,
          origem_tipo: 'pedido',
          origem_id: pedidoId,
          vendedor_id: dados.vendedor_id,
          turno_id: turnoDoSinal
        })
      }
    }

    return { id: pedidoId }
  })()
}

// ─── Concluir ────────────────────────────────────────────────────────────────

export type PagamentoDoPedido = Omit<DadosNovaVenda, 'itens' | 'desconto' | 'cliente_id'>

/**
 * O cliente pagou: o pedido vira venda.
 *
 * ⚠️ Soltar a reserva e criar a venda acontecem na MESMA transação. Separados,
 * uma falha no meio deixaria a peça reservada e vendida ao mesmo tempo — o
 * estoque contaria a menos para sempre, e ninguém saberia de onde veio.
 *
 * A reserva sai ANTES de `criarVenda` porque a trava de estoque dela compara
 * contra `estoque - reservado`: com a reserva ainda de pé, a venda da própria
 * peça reservada seria recusada por falta de estoque.
 */
export function concluirPedido(pedidoId: number, pagamento: PagamentoDoPedido): VendaDetalhada {
  const db = obterBancoDeDados()
  return db.transaction(() => {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId) as
      | {
          id: number
          situacao: SituacaoPedido
          cliente_id: number | null
          desconto: number
          observacao: string | null
          sinal: number
        }
      | undefined
    if (!pedido) throw new Error('Pedido não encontrado.')
    if (pedido.situacao !== 'separado') {
      throw new Error(`Este pedido já foi ${pedido.situacao === 'concluido' ? 'concluído' : 'cancelado'}.`)
    }

    const itens = db
      .prepare('SELECT produto_id, variacao_id, quantidade, preco_unitario FROM itens_pedido WHERE pedido_id = ?')
      .all(pedidoId) as Array<{
      produto_id: number
      variacao_id: number | null
      quantidade: number
      preco_unitario: number
    }>

    moverReserva(db, itens, -1)

    // ⚠️ Os preços vêm do PEDIDO, nunca da etiqueta de hoje: o cliente paga o
    // que foi combinado quando a peça foi separada.
    const sinal = Math.max(0, arred(pedido.sinal ?? 0))

    const venda = criarVenda({
      ...pagamento,
      cliente_id: pedido.cliente_id,
      desconto: pedido.desconto,
      /*
       * ⚠️ O sinal entra na venda como entrada E sai do que vai ao livro.
       *
       * Como ENTRADA, porque o cliente pagou aquilo: sem isso a venda nasceria
       * devendo o total cheio, o cupom cobraria de novo o que já foi pago e a
       * comissão sairia certa por acidente.
       *
       * Como JÁ LANÇADO, porque aquele dinheiro entrou no livro no dia em que a
       * peça foi separada. Lançar de novo faria a loja aparecer recebendo duas
       * vezes, e o fechamento do dia da entrega acusaria sobra do tamanho do
       * sinal.
       *
       * ⚠️ Na venda à VISTA o `entrada` é ignorado por `criarVenda` (quem paga
       * tudo não tem entrada), mas o `valor_ja_lancado` continua valendo — é
       * ele que impede a duplicidade nesse caminho, que é o mais comum.
       */
      entrada: pagamento.status_pagamento === 'pago' ? 0 : sinal,
      valor_ja_lancado: sinal,
      // O bilhete do pedido segue para a venda, e daí para o cupom. Foi escrito
      // sobre esta mercadoria, e some justamente na hora em que o cliente
      // recebe o papel se não for junto.
      observacao: pedido.observacao,
      itens
    })

    db.prepare(
      `UPDATE pedidos
          SET situacao = 'concluido', venda_id = ?, concluido_em = datetime('now','localtime')
        WHERE id = ?`
    ).run(venda.id, pedidoId)

    return venda
  })()
}

// ─── Cancelar ────────────────────────────────────────────────────────────────

/**
 * O cliente recusou, ou desistiu: a peça volta — e o sinal também.
 *
 * ⚠️ Isto NÃO é devolução. Não houve venda, então não pode aparecer no
 * histórico como mercadoria devolvida — o relatório de devoluções ficaria
 * inflado com peças que nunca saíram vendidas.
 *
 * ── ⚠️ O SINAL VOLTA PARA O CLIENTE ─────────────────────────────────────────
 * Decisão do dono, e é o costume do comércio: pedido desfeito devolve o sinal.
 * O estorno sai na mesma conta e na mesma forma em que o dinheiro entrou.
 *
 * Sem isto, cancelar deixaria no livro um dinheiro que já voltou para a mão do
 * cliente: o saldo da conta ficaria alto pelo valor do sinal, e a contagem da
 * gaveta acusaria falta exatamente daquele valor, todo dia, sem nada na tela
 * ligando uma coisa à outra.
 *
 * ⚠️ O estorno cai no turno de AGORA, não no turno em que o sinal entrou — o
 * turno original pode estar fechado e já conferido pelo gerente, e lançar lá
 * dentro mudaria o esperado de uma contagem que já foi assinada. É a mesma
 * regra do estorno de recebimento de venda.
 */
export function cancelarPedido(pedidoId: number, motivo: string | null): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    const pedido = db.prepare('SELECT situacao, sinal FROM pedidos WHERE id = ?').get(pedidoId) as
      | { situacao: SituacaoPedido; sinal: number }
      | undefined
    if (!pedido) throw new Error('Pedido não encontrado.')
    if (pedido.situacao === 'concluido') {
      throw new Error('Este pedido já virou venda. Para desfazer, cancele a venda.')
    }
    if (pedido.situacao === 'cancelado') return

    const itens = db
      .prepare('SELECT produto_id, variacao_id, quantidade FROM itens_pedido WHERE pedido_id = ?')
      .all(pedidoId) as Array<{ produto_id: number; variacao_id: number | null; quantidade: number }>

    moverReserva(db, itens, -1)

    // O dinheiro do sinal volta para quem pagou, então sai do livro também.
    // `estornarNoLivro` devolve na mesma conta e na mesma forma do original.
    if ((pedido.sinal ?? 0) > 0) {
      estornarNoLivro(db, 'pedido', pedidoId, `Devolução do sinal do pedido #${pedidoId}`)
    }

    db.prepare(
      `UPDATE pedidos
          SET situacao = 'cancelado', cancelado_em = datetime('now','localtime'),
              motivo_cancelamento = ?
        WHERE id = ?`
    ).run(motivo, pedidoId)
  })()
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export function listarPedidos(situacao: SituacaoPedido | 'todos' = 'separado'): Pedido[] {
  const db = obterBancoDeDados()
  const onde = situacao === 'todos' ? '' : 'WHERE p.situacao = ?'
  const args = situacao === 'todos' ? [] : [situacao]
  return db
    .prepare(`${SELECT_PEDIDO} ${onde} ORDER BY p.criado_em DESC LIMIT 300`)
    .all(...args) as Pedido[]
}

export function detalhePedido(pedidoId: number): (Pedido & { itens: ItemPedido[] }) | null {
  const db = obterBancoDeDados()
  const pedido = db.prepare(`${SELECT_PEDIDO} WHERE p.id = ?`).get(pedidoId) as Pedido | undefined
  if (!pedido) return null
  const itens = db
    .prepare(
      `SELECT ip.*, pr.nome, pv.tamanho
         FROM itens_pedido ip
         JOIN produtos pr ON pr.id = ip.produto_id
         LEFT JOIN produto_variacoes pv ON pv.id = ip.variacao_id
        WHERE ip.pedido_id = ?`
    )
    .all(pedidoId) as ItemPedido[]
  return { ...pedido, itens }
}

/** Quantos pedidos estão separados agora — para o aviso no Painel. */
export function totalSeparados(): number {
  const r = obterBancoDeDados()
    .prepare("SELECT COUNT(*) AS n FROM pedidos WHERE situacao = 'separado'")
    .get() as { n: number }
  return r.n
}
