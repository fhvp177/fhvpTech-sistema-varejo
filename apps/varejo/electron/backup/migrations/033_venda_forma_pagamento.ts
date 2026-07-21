import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Como o cliente pagou — dinheiro, cartão, PIX, crediário.
//
// Até aqui a venda guardava só o PRAZO (`status_pagamento`: pago, pendente,
// parcelado), nunca o MEIO. Deu pra viver sem isso enquanto era só cupom, mas a
// NFC-e exige declarar a forma de pagamento ao Fisco.
//
// Fica NA VENDA (e não só dentro da nota) de propósito: é o mesmo campo que o
// TEF vai preencher quando a maquininha for integrada — aí o meio vem da
// própria transação, sem ninguém digitar. Hoje quem preenche é o modal que
// aparece ao emitir a nota; amanhã, o TEF. Sem retrabalho.
//
// Fica NULL nas vendas antigas: nulo aqui significa "não sabemos", que é a
// verdade — melhor que carimbar "dinheiro" em venda que pode ter sido no
// cartão e depois virar relatório mentiroso.
export function aplicar033VendaFormaPagamento(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'vendas', 'forma_pagamento', 'TEXT')
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '033_venda_forma_pagamento'
    )
  })()
}
