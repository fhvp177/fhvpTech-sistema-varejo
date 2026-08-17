/**
 * Contrato de quem cobra na maquininha.
 *
 * Uma integração serve UMA bandeira: Mercado Pago não fala com maquininha
 * PagBank. Este contrato existe pra que trocar de adquirente (ou um cliente
 * novo chegar com outra) não encoste na tela do PDV — a tela pede "cobra R$X" e
 * quem sabe fazer isso muda por baixo.
 *
 * ── A regra que dá o formato a tudo aqui ─────────────────────────────────────
 * O DINHEIRO SAI DA MÃO DO CLIENTE ANTES DO NOSSO SISTEMA SABER.
 *
 * O cartão é aprovado na maquininha; só depois a notícia volta pra cá — e a
 * volta pode não acontecer (internet piscou, PC desligou, webhook perdido).
 * Ou seja: "não recebi resposta" NÃO significa "não foi pago". Significa
 * "não sei". Confundir os dois é o que faz um caixa cobrar duas vezes do mesmo
 * cliente, que é o pior defeito possível numa loja.
 *
 * Daí as duas exigências que qualquer implementação tem que respeitar:
 *
 * 1. **Idempotência por venda.** Toda cobrança leva uma `referencia` que
 *    amarra ela à venda. Pedir de novo com a mesma referência tem que devolver
 *    a cobrança que já existe, não criar outra.
 * 2. **`consultar` é obrigatório, não conveniência.** É a única forma honesta
 *    de sair do "não sei" — e tem que ser chamado ANTES de qualquer recobrança.
 *
 * ⚠️ Nenhum método aqui pode ser usado como "se deu erro, tenta de novo".
 * Erro de comunicação exige CONSULTAR primeiro.
 */

/** Como o cliente vai pagar na maquininha. */
export type MeioCobranca = 'credito' | 'debito' | 'pix'

export type PedidoCobranca = {
  /**
   * Amarra a cobrança à venda — normalmente o id dela. É o que torna a operação
   * repetível sem cobrar duas vezes: mandar de novo com a mesma referência tem
   * que devolver a cobrança existente.
   */
  referencia: string
  /** Em reais. Quem implementa converte pra unidade do provedor (centavos). */
  valor: number
  meio: MeioCobranca
  /** Só faz sentido no crédito. Ausente/1 = à vista. */
  parcelas?: number
}

/**
 * Em que pé está a cobrança.
 *
 * `desconhecido` é um estado de primeira classe DE PROPÓSITO. É o que o sistema
 * sabe quando a comunicação falhou: nem aprovado, nem recusado. A tela precisa
 * tratá-lo como "vá olhar na maquininha", nunca como recusa.
 */
export type SituacaoCobranca =
  | 'aguardando'
  | 'aprovada'
  | 'recusada'
  | 'cancelada'
  | 'desconhecido'

export type ResultadoCobranca = {
  situacao: SituacaoCobranca
  /** Id da cobrança no provedor — necessário pra consultar e pra cancelar. */
  idExterno: string | null
  /** Preenchido quando aprovada; alimenta a forma_pagamento da venda. */
  meio?: MeioCobranca
  /** Bandeira, autorização e credenciadora: o que a NFC-e pede pra tpIntegra=1. */
  bandeira?: string | null
  autorizacao?: string | null
  cnpjCredenciadora?: string | null
  /** Texto pro operador ler. Nunca joga a mensagem crua do provedor na tela. */
  detalhe?: string
}

export interface ProvedorPagamento {
  /** Nome curto pra config e log: 'mercadopago', 'pagbank'. */
  readonly id: string
  /** Como o lojista chama: "Mercado Pago". */
  readonly nome: string

  /**
   * Manda o valor pra maquininha e devolve assim que ela ACEITA a cobrança —
   * não espera o cliente passar o cartão. Quem acompanha o desfecho é
   * `consultar`. Bloquear o caixa esperando o cliente achar o cartão na
   * carteira é inaceitável.
   */
  cobrar(pedido: PedidoCobranca): Promise<ResultadoCobranca>

  /** Desfecho de uma cobrança já criada. Único jeito de sair do 'desconhecido'. */
  consultar(idExterno: string): Promise<ResultadoCobranca>

  /**
   * Desiste de uma cobrança que ainda não foi paga (cliente desistiu, operador
   * errou o valor). Não é estorno: cobrança JÁ APROVADA se desfaz pelo caminho
   * de devolução do adquirente, que é outra conversa.
   */
  cancelar(idExterno: string): Promise<ResultadoCobranca>

  /**
   * Diz se dá pra operar agora: credencial válida, aparelho escolhido, no ar.
   * A tela de configuração usa isso pra provar que ficou funcionando, em vez de
   * o lojista descobrir no primeiro cliente da fila.
   */
  verificar(): Promise<{ ok: boolean; detalhe: string }>
}
