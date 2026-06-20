import type Database from 'better-sqlite3'

// Até aqui, "pagar parcela" marcava a parcela como paga mas NÃO somava no
// valor_pago da venda — então o valor_pago das vendas parceladas só refletia a
// entrada. Telas que calculam o restante como (total - valor_pago) mostravam a
// dívida inflada. A partir desta versão pagarParcela credita o valor_pago; esta
// migration recalcula o histórico já existente:
//   valor_pago = entrada + soma das parcelas já pagas.
// Só toca vendas parceladas (num_parcelas IS NOT NULL); vendas simples já tinham
// o valor_pago correto (entrada + pagamentos parciais). É idempotente: recomputa
// a partir do estado atual das parcelas, então rodar de novo dá o mesmo valor.
export function aplicar023RecalcularValorPagoParcelado(db: Database.Database): void {
  db.transaction(() => {
    db.prepare(
      `UPDATE vendas
       SET valor_pago = ROUND(
         entrada + COALESCE((
           SELECT SUM(p.valor) FROM parcelas p
           WHERE p.venda_id = vendas.id AND p.status = 'pago'
         ), 0), 2)
       WHERE num_parcelas IS NOT NULL`
    ).run()
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '023_recalcular_valor_pago_parcelado'
    )
  })()
}
