import { rotuloForma } from './formaPagamento'

/**
 * O histórico de dinheiro de UMA venda, pronto para a tela.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Quero conseguir visualizar dentro da venda um histórico dos recebimentos:
 * 07/09 — Sinal — R$185 — Pix — Nubank / 08/09 — Saldo — R$185 — Dinheiro —
 * Caixa." (12/09/2026)
 *
 * ── ⚠️ O nome da linha é DERIVADO, nunca gravado ────────────────────────────
 * "Sinal" e "Saldo" não existem no banco, e não deveriam: são a mesma coisa
 * (dinheiro entrando nesta venda) em dois momentos. Gravar o rótulo criaria um
 * campo que pode discordar dos fatos — uma linha escrita "Sinal" num movimento
 * que não é o primeiro, por exemplo. Aqui ele é calculado do que já é verdade:
 * o tipo do movimento, a origem e o fato de a venda ter nascido com entrada.
 */

export type MovimentoDaVenda = {
  id: number
  data: string
  valor: number
  tipo: string
  forma_pagamento: string | null
  conta_id: number
  conta_nome: string
  origem_tipo: string | null
  parcela_numero: number | null
}

export type LinhaRecebimento = {
  id: number
  data: string
  valor: number
  /** "Sinal", "Saldo", "Parcela 2", "Pagamento" ou "Estorno". */
  rotulo: string
  /** Rótulo do meio de pagamento, ou null quando a venda é antiga demais. */
  forma: string | null
  conta: string
  /** Estorno sai em vermelho e com o valor negativo, como no extrato. */
  ehEstorno: boolean
}

/**
 * Como chamar esta linha.
 *
 * ⚠️ A ordem dos testes importa. O ESTORNO vem primeiro porque ele também tem
 * origem 'venda' ou 'parcela': classificado pela origem antes do tipo, um
 * estorno de parcela viraria "Parcela 2" e a lista mostraria a mesma parcela
 * paga duas vezes, uma delas negativa.
 */
export function rotuloDoMovimento(mov: MovimentoDaVenda, vendaTeveSinal: boolean): string {
  if (mov.tipo === 'estorno' || mov.valor < 0) return 'Estorno'
  if (mov.origem_tipo === 'parcela') {
    return mov.parcela_numero != null ? `Parcela ${mov.parcela_numero}` : 'Parcela'
  }
  // 'venda' é o dinheiro que entrou no ato de fechar a venda. Numa venda que
  // nasceu com entrada, esse dinheiro É o sinal; na venda à vista é o
  // pagamento inteiro.
  // O sinal do pedido separado já vem com o tipo escrito: ele foi recebido
  // antes de a venda existir, e é sinal mesmo que a venda tenha sido quitada
  // à vista na entrega.
  if (mov.tipo === 'sinal') return 'Sinal'
  if (mov.tipo === 'venda') return vendaTeveSinal ? 'Sinal' : 'Pagamento'
  // Sobra o recebimento posterior de uma venda a prazo: o saldo. Só se chama
  // "Saldo" quando houve um sinal antes; sem sinal, é o pagamento da dívida.
  return vendaTeveSinal ? 'Saldo' : 'Pagamento'
}

export function montarHistorico(
  movimentos: MovimentoDaVenda[],
  vendaTeveSinal: boolean
): LinhaRecebimento[] {
  return movimentos.map((m) => ({
    id: m.id,
    data: m.data,
    valor: m.valor,
    rotulo: rotuloDoMovimento(m, vendaTeveSinal),
    forma: rotuloForma(m.forma_pagamento),
    conta: m.conta_nome,
    ehEstorno: m.tipo === 'estorno' || m.valor < 0
  }))
}

/**
 * Quanto esta venda tem de dinheiro lançado no livro, estornos já descontados.
 *
 * ⚠️ Isto NÃO substitui `valor_pago`, e pode ser menor que ele: venda paga com
 * crédito da loja fica quitada sem nenhum movimento, e loja sem conta
 * financeira na época da venda não lançou nada. Serve para conferir o
 * histórico contra si mesmo, não para dizer quanto a venda recebeu.
 */
export function totalLancado(movimentos: MovimentoDaVenda[]): number {
  return +movimentos.reduce((acc, m) => acc + m.valor, 0).toFixed(2)
}
