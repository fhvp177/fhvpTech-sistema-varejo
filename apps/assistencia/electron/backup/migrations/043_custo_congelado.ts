import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

/**
 * O custo do produto CONGELA na venda, como já congela o preço.
 *
 * Portada do varejo com o mesmo nome de propósito: é a mesma coluna, na mesma
 * tabela, e um backup que já passou por ela não precisa passar de novo.
 *
 * ── O defeito que isto conserta ─────────────────────────────────────────────
 * O lucro do Painel era calculado assim:
 *
 *     SUM(itens_venda.quantidade * produtos.custo)
 *
 * lendo o custo de HOJE para uma venda de meses atrás. O próprio comentário no
 * código já admitia a estimativa.
 *
 * O estrago é silencioso e sempre no mesmo sentido: o distribuidor reajusta a
 * peça, o técnico atualiza o preço de compra, e **todo o lucro do passado
 * encolhe de uma vez** — sem que uma única venda tenha mudado. Um mês fechado
 * deixa de bater com o que já foi visto e ninguém consegue explicar a
 * diferença.
 *
 * ⚠️ Aqui a coluna vale para PEÇA e para SERVIÇO, porque os dois moram em
 * `produtos`. Mão de obra com custo cadastrado (a hora do técnico) congela
 * igual; mão de obra sem custo cadastrado continua entrando como 0, que é o
 * que ela já fazia.
 *
 * ── ⚠️ O fallback é deliberado, e some sozinho ──────────────────────────────
 * As vendas que já existem não têm como saber o custo da época: essa
 * informação nunca foi gravada e não há de onde tirá-la. Elas ficam com
 * `custo_unitario` NULL, e quem lê usa `COALESCE(iv.custo_unitario, p.custo)` —
 * ou seja, o comportamento antigo, exatamente como era.
 *
 * Não é remendo permanente: toda venda nova nasce congelada, então a parte
 * estimada do relatório encolhe todo dia por conta própria. O que não se pode
 * fazer é inventar um custo histórico e apresentá-lo como fato.
 *
 * ── Por que NULL e não 0 ────────────────────────────────────────────────────
 * Zero é um custo válido (peça de brinde, serviço de cortesia). NULL diz "não
 * sei", que é a verdade aqui, e é o único valor que o COALESCE consegue
 * distinguir.
 */
export function aplicar043CustoCongelado(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'itens_venda', 'custo_unitario', 'REAL')
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('043_custo_congelado')
  })()
}
