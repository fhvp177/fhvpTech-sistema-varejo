import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

/**
 * Observação da venda, escrita no PDV e impressa no cupom não fiscal.
 *
 * ── Para que serve ──────────────────────────────────────────────────────────
 * É o bilhete que acompanha a mercadoria: "troca até 15/09", "presente, não
 * mandar preço", "cliente vai retirar sábado". Hoje o lojista escreve isso à
 * mão no verso do cupom, quando lembra.
 *
 * ── ⚠️ Por que na VENDA e não no cliente ────────────────────────────────────
 * Já existe `clientes.observacao`, e é outra coisa: aquilo vale para sempre
 * ("prefere ser chamada de Dona Ana"). Esta vale para UMA compra. Reaproveitar
 * o campo do cliente faria o bilhete de uma venda aparecer no cupom de todas
 * as outras, e a primeira troca com data marcada viraria uma promessa eterna.
 *
 * ── Nasce NULL em tudo que já existe ────────────────────────────────────────
 * Que é a verdade: não havia onde escrever antes. O cupom só desenha o bloco
 * quando há texto, então nada muda no papel das vendas antigas.
 */
export function aplicar042VendaObservacao(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'vendas', 'observacao', 'TEXT')
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('042_venda_observacao')
  })()
}
