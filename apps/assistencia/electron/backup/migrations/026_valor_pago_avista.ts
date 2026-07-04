import type Database from 'better-sqlite3'

// Alinha o valor_pago das vendas à vista antigas com o invariante "valor_pago =
// total recebido". Até aqui a venda à vista era gravada com valor_pago = 0 (era
// o status 'pago' que a marcava como paga), o que fazia o relatório, as telas de
// dívida e a elegibilidade de cancelamento a lerem como "não recebida" — e, pior,
// permitia cancelá-la como "virgem" restaurando estoque de mercadoria que já saiu.
//
// Backfill: toda venda 'pago' com valor_pago = 0 passa a valor_pago = total. As
// vendas marcadas como pagas depois da criação já tinham valor_pago = total, então
// não são tocadas; total = 0 vira no-op. Idempotente.
export function aplicar026ValorPagoAvista(db: Database.Database): void {
  db.transaction(() => {
    db.prepare(
      `UPDATE vendas SET valor_pago = total
       WHERE status_pagamento = 'pago' AND valor_pago = 0`
    ).run()
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('026_valor_pago_avista')
  })()
}
