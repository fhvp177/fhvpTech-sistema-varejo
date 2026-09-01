import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Comissão de vendedores.
//
// ── Por que o percentual é carimbado NA VENDA ────────────────────────────────
// `vendedores.comissao_pct` é o percentual VIGENTE de cada um. `vendas.comissao_pct`
// é o que valia no instante em que aquela venda foi fechada.
//
// Sem o carimbo, promover alguém de 3% para 5% em outubro reescreveria setembro:
// o gerente abriria o relatório de um mês JÁ PAGO e veria outro número. Nada
// quebraria, nada daria erro — só o dinheiro que saiu do caixa deixaria de bater
// com o papel, e a culpa cairia no sistema. Com o carimbo, aumento vale da data
// em diante e o passado fica imóvel.
//
// Vendas anteriores a esta migration ficam com NULL, que é a verdade: não havia
// percentual nenhum quando elas aconteceram. O relatório então cai no percentual
// vigente do vendedor — único comportamento sensato, já que não existe
// percentual histórico pra recuperar, e é o que o gerente espera ao definir 3%
// e querer ver agosto.
//
// ── comissoes_pagas ──────────────────────────────────────────────────────────
// Uma linha por fechamento pago. Guarda o valor APURADO no instante do
// pagamento, não uma referência viva: devolução lançada depois não reescreve o
// que já saiu do caixa. Períodos que se sobrepõem são recusados na camada de
// queries — é o que impede pagar a mesma quinzena duas vezes, que é o jeito
// mais fácil de perder dinheiro aqui.
export function aplicar038Comissoes(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'vendedores', 'comissao_pct', 'REAL')
    adicionarColunaSeAusente(db, 'vendas', 'comissao_pct', 'REAL')

    // Zero é o estado desligado: sem percentual, não existe comissão, e a aba
    // nem aparece no menu.
    db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)').run(
      'comissao_pct_padrao',
      '0'
    )

    db.exec(`
      CREATE TABLE IF NOT EXISTS comissoes_pagas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendedor_id INTEGER NOT NULL REFERENCES vendedores(id),
        periodo_inicio DATE NOT NULL,
        periodo_fim DATE NOT NULL,
        qtd_vendas INTEGER NOT NULL,
        valor_base REAL NOT NULL,
        valor_comissao REAL NOT NULL,
        pago_em DATETIME NOT NULL,
        pago_por_id INTEGER REFERENCES vendedores(id),
        observacao TEXT
      )
    `)

    // Cobre as duas leituras quentes: "este período já foi pago?" (igualdade) e
    // a busca por sobreposição, que varre os períodos de um vendedor só.
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_comissoes_pagas_vendedor
       ON comissoes_pagas(vendedor_id, periodo_inicio, periodo_fim)`
    )

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('038_comissoes')
  })()
}
