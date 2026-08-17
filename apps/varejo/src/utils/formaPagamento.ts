// COMO o dinheiro entrou: dinheiro, cartão, PIX, crediário.
//
// Não confundir com a CONDIÇÃO de pagamento (`status_pagamento`: à vista, a
// prazo, parcelado), que responde QUANDO o dinheiro entra. Por muito tempo a
// tela chamou a condição de "forma de pagamento" e o banco chamou o meio de
// `forma_pagamento` — duas coisas diferentes com o mesmo nome, em telas
// vizinhas. Este arquivo existe pra encerrar essa confusão: aqui é o MEIO, e
// só o meio.
//
// Lista única do app: o PDV grava daqui ao fechar a venda e o modal da NFC-e lê
// daqui ao emitir. Quando a maquininha for integrada, o provedor devolve o meio
// da própria transação e grava neste mesmo campo, sem ninguém digitar.
//
// ⚠️ Os valores viram código da SEFAZ (tPag) em electron/ipc/fiscal.ts. Incluir
// forma nova aqui sem mapear lá faz a nota sair como "99 — outros".

import { Banknote, CreditCard, Landmark, Smartphone, Wallet, type LucideIcon } from 'lucide-react'

export type FormaPagamento =
  | 'dinheiro'
  | 'debito'
  | 'credito'
  | 'pix'
  | 'crediario'
  | 'credito_loja'

/**
 * O que o operador escolhe no caixa numa venda à vista.
 *
 * `crediario` e `credito_loja` ficam de fora de propósito: não são escolha, são
 * consequência. Venda a prazo é crediário por definição, e crédito da loja é
 * decidido pelo abatimento do saldo — perguntar seria oferecer ao operador a
 * chance de contradizer um fato que o sistema já sabe.
 */
export const FORMAS_A_VISTA: { valor: FormaPagamento; rotulo: string; icone: LucideIcon }[] = [
  { valor: 'dinheiro', rotulo: 'Dinheiro', icone: Banknote },
  { valor: 'debito', rotulo: 'Cartão de débito', icone: CreditCard },
  { valor: 'credito', rotulo: 'Cartão de crédito', icone: CreditCard },
  { valor: 'pix', rotulo: 'PIX', icone: Smartphone }
]

export const LABEL_FORMA: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  pix: 'PIX',
  crediario: 'Crediário',
  credito_loja: 'Crédito da loja'
}

export const ICONE_FORMA: Record<FormaPagamento, LucideIcon> = {
  dinheiro: Banknote,
  debito: CreditCard,
  credito: CreditCard,
  pix: Smartphone,
  crediario: Landmark,
  credito_loja: Wallet
}

const VALORES_A_VISTA = new Set<string>(FORMAS_A_VISTA.map((f) => f.valor))

/** Só as que o operador pode escolher — não aceita 'crediario' nem 'credito_loja'. */
export function ehFormaAVista(valor: string | null | undefined): valor is FormaPagamento {
  return VALORES_A_VISTA.has((valor ?? '').trim().toLowerCase())
}

/**
 * Rótulo pra exibir. Devolve null quando não sabemos — venda antiga, anterior a
 * este campo. Mostrar "não informado" é honesto; chutar "dinheiro" viraria
 * relatório mentiroso.
 */
export function rotuloForma(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim().toLowerCase()
  return v in LABEL_FORMA ? LABEL_FORMA[v as FormaPagamento] : null
}
