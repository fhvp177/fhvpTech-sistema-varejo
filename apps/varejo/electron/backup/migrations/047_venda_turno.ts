import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

/**
 * A venda passa a guardar em QUAL TURNO ela aconteceu.
 *
 * ── A pergunta que não tinha resposta ───────────────────────────────────────
 * "O que foi vendido no caixa de ontem?" O sistema fechava o turno, guardava a
 * contagem e a diferença, e não havia como voltar e ver as vendas daquele
 * período. Quem precisa disso é justamente quem encontrou diferença e quer
 * entender de onde ela veio.
 *
 * ── ⚠️ Por que não dava para deduzir pelo livro-caixa ───────────────────────
 * `movimentos_financeiros` já tem `turno_id`, e a tentação é listar as vendas a
 * partir dele. Mas o movimento só nasce quando entra DINHEIRO:
 *
 *     if (recebidoAgora > 0) { lancarMovimento(...) }
 *
 * Venda a prazo sem entrada não gera movimento nenhum. Venda paga inteira com
 * crédito da loja também não. As duas aconteceram no turno, contam para o que
 * saiu da prateleira e para a comissão do vendedor — e sumiriam da lista.
 *
 * Uma lista de "vendas do turno" que esconde as vendas a prazo é pior que não
 * ter lista: ela parece completa.
 *
 * ── ⚠️ E por que não dá para deduzir pela data ──────────────────────────────
 * Filtrar por `data BETWEEN aberto_em AND fechado_em` erra de dois jeitos. Com
 * dois caixas abertos ao mesmo tempo, as vendas de um apareceriam no outro —
 * a venda não guardava o caixa, só o turno do movimento. E turno que atravessa
 * a meia-noite (o cliente abriu às 2h e deixou aberto) transforma qualquer
 * comparação de data numa armadilha.
 *
 * O vínculo direto não tem nenhum desses problemas: é o turno em que a venda
 * entrou, decidido no momento em que ela entrou.
 *
 * ── Nasce NULL no que já existe ─────────────────────────────────────────────
 * Que é a verdade: as vendas anteriores a esta coluna não têm como saber a qual
 * turno pertenceram, e inventar um vínculo por aproximação de data seria criar
 * um dado errado com cara de certo. A tela diz quando o período é anterior ao
 * registro, em vez de mostrar uma lista incompleta sem avisar.
 *
 * Também fica NULL a venda que nasce fora de caixa — entrega de OS na
 * assistência —, e aí o NULL é permanente e correto.
 */
export function aplicar047VendaTurno(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(
      db,
      'vendas',
      'turno_id',
      'INTEGER REFERENCES turnos_caixa(id)'
    )
    db.exec('CREATE INDEX IF NOT EXISTS idx_vendas_turno ON vendas(turno_id)')
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('047_venda_turno')
  })()
}
