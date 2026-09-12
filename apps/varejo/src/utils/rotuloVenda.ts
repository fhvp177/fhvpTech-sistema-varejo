/**
 * Como cada venda se chama na tela.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Nessa tela eu trocaria 'Venda a prazo' por 'Com sinal / saldo pendente'."
 * (12/09/2026)
 *
 * ── ⚠️ "Com sinal" é RÓTULO, nunca condição de pagamento ────────────────────
 * A tentação era criar um quarto `status_pagamento`. Não se faz, por três
 * motivos que valem mais que a economia de uma função:
 *
 *  1. **Não é uma categoria, é um número.** Venda com sinal e venda a prazo são
 *     a mesma venda: um total, quanto entrou, quanto falta. A diferença é
 *     `entrada > 0`, que o sistema já sabe.
 *
 *  2. **Não seria estável.** O gerente estorna o recebimento e a venda deixaria
 *     de ter sinal — ela mudaria de CONDIÇÃO sozinha, sem ninguém ter mexido
 *     nela. Condição de pagamento é o que foi combinado, não o que já entrou.
 *
 *  3. **Partiria o histórico em dois.** As vendas a prazo com sinal que já
 *     existem ficariam com um nome e as novas com outro, a mesma coisa
 *     aparecendo de dois jeitos na mesma lista.
 *
 * Calculado aqui, o nome acompanha o fato: recebeu sinal, chama-se "Com sinal";
 * estornou, volta a ser "A prazo". Nada gravado, nada para envelhecer.
 */

export type VendaParaRotulo = {
  status_pagamento: 'pago' | 'pendente' | 'inadimplente' | 'parcelado'
  num_parcelas: number | null
  /** Sinal pago no ato da venda. 0 quando não houve. */
  entrada: number
  total: number
  valor_pago: number
}

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * O nome curto, para a lista e a tabela.
 *
 * ⚠️ Sem valor nenhum dentro: nas duas listas a coluna de dinheiro já mostra o
 * que falta, com a palavra "restante" ao lado. Repetir o número na mesma linha
 * não informa mais ninguém e come a largura do nome do cliente, que em 360px é
 * o que já estava apertado.
 */
export function rotuloVenda(v: VendaParaRotulo): string {
  if (v.num_parcelas) {
    if (v.status_pagamento === 'parcelado') return `Parcelado (${v.num_parcelas}x)`
    if (v.status_pagamento === 'pago') return `Pago (${v.num_parcelas}x)`
  }
  if (v.status_pagamento === 'pago') return 'Pago'
  /*
   * ⚠️ Atraso GANHA de "com sinal".
   *
   * Uma venda atrasada que teve sinal continua atrasada, e é isso que a pessoa
   * precisa ler primeiro — é a etiqueta que manda cobrar. Trocar por "Com
   * sinal" esconderia a cobrança atrás de uma informação simpática.
   */
  if (v.status_pagamento === 'inadimplente') return 'Inadimplente'
  return v.entrada > 0 ? 'Com sinal' : 'A prazo'
}

/**
 * O nome com o saldo junto, para o detalhe da venda.
 *
 * Aqui o valor acrescenta: o diálogo abre pelo cabeçalho, e o quanto falta está
 * mais abaixo, no bloco de pagamento. É o "Recebido X / Pendente Y" que o
 * lojista desenhou, na primeira linha que ele lê.
 */
export function rotuloVendaComSaldo(v: VendaParaRotulo): string {
  const base = rotuloVenda(v)
  const falta = +(v.total - v.valor_pago).toFixed(2)
  // Venda quitada não tem saldo a anunciar, e valor negativo (resíduo de
  // arredondamento do rateio de parcelas) não vira "falta -R$ 0,01".
  if (v.status_pagamento === 'pago' || falta <= 0) return base
  return `${base} · falta ${fmt(falta)}`
}
