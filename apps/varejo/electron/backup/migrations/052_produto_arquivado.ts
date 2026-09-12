import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

/**
 * Arquivar produto: tirar do dia a dia sem apagar o passado.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Fui tentar apagar um produto e não tem essa opção. Deixe essa opção normal
 * que eu consiga apagar a hora que quiser." (12/09/2026)
 *
 * ── ⚠️ Por que NÃO é apagar de verdade ──────────────────────────────────────
 * A recusa que ele viu não vem da tela: `itens_venda.produto_id` aponta para
 * `produtos.id`, e o banco protege esse laço. Apagar o produto arrancaria com
 * ele a linha do item em toda venda em que ele apareceu — e junto vão o cupom
 * daquela compra, o lucro do mês, a comissão que a vendedora já recebeu e,
 * desde a migration 051, **a garantia que o cliente tem em mãos**.
 *
 * Ele pediria para limpar um cadastro e apagaria o histórico da loja. O que ele
 * quer de verdade — que o produto suma da busca, do caixa e da lista — é isto
 * aqui, e custa uma coluna.
 *
 * ── O que arquivar faz, e o que não faz ─────────────────────────────────────
 * NÃO aparece mais: na lista de Produtos, na busca do caixa, nas etiquetas, no
 * inventário, nos alertas de estoque baixo e de produto parado, na contagem por
 * categoria, no diagnóstico fiscal e nas respostas do assistente.
 *
 * CONTINUA existindo: nas vendas antigas, nos relatórios do passado, na
 * garantia de quem comprou, e na busca por código de barras — esta última de
 * propósito, para o caixa poder dizer "este produto está arquivado" em vez de
 * "não encontrado", e para a importação de XML não cadastrar uma segunda cópia
 * do mesmo item.
 *
 * ── Apagar de verdade continua existindo ────────────────────────────────────
 * Produto que nunca foi vendido, nunca entrou em pedido e nunca saiu em nota
 * segue podendo ser excluído. Aí não há passado para preservar, e a coluna não
 * atrapalha ninguém.
 *
 * ⚠️ Nasce em 0 para todo mundo: nenhuma loja muda de comportamento ao
 * atualizar. Arquivar é sempre um ato de alguém.
 */
export function aplicar052ProdutoArquivado(db: Database.Database): void {
  adicionarColunaSeAusente(db, 'produtos', 'arquivado', 'INTEGER NOT NULL DEFAULT 0')

  /*
   * O índice existe porque a coluna entra no WHERE de quase toda listagem de
   * produto, e a listagem roda a cada abertura da tela e a cada busca no caixa.
   * É um índice pequeno: a coluna tem dois valores, e o que se quer dele é
   * pular depressa a minoria arquivada.
   */
  db.exec('CREATE INDEX IF NOT EXISTS idx_produtos_arquivado ON produtos(arquivado)')
}
