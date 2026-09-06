import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

/**
 * Pedido separado: a mercadoria já saiu da prateleira, o dinheiro ainda não veio.
 *
 * ── O que o lojista faz hoje ────────────────────────────────────────────────
 * Vende joia. O cliente desconfia de golpe e não paga adiantado, então fecha o
 * pedido, o entregador leva a peça até a casa dele e o pagamento acontece na
 * porta — e a FORMA de pagamento (cartão, PIX, dinheiro) só se sabe lá.
 *
 * Venda, no sistema, é fato consumado: baixa estoque, gera comissão e entra no
 * faturamento na hora. Nada disso pode acontecer antes de o cliente pagar.
 *
 * ── Por que TABELA SEPARADA, e não uma situação dentro de `vendas` ──────────
 * Porque nada do que já existe muda de significado. Toda consulta que soma
 * `vendas` continua certa, o Painel continua certo, a comissão continua certa,
 * o fiscal continua certo. Bastaria UMA consulta de faturamento esquecer de
 * filtrar a nova situação para o Painel passar a mentir, e ninguém descobriria
 * até o fim do mês.
 *
 * O preço é duplicar os itens. Com o sistema já rodando na loja, vale.
 *
 * ── UM estado só ────────────────────────────────────────────────────────────
 * "Fechado" e "separado" colapsam num só: se tudo foi feito menos o pagamento,
 * a mercadoria vai sair ou o cliente vem buscar. Duas transições, e acabou:
 *
 *     separado ──pagou──▶ concluido  (vira venda de verdade)
 *         └────recusou───▶ cancelado (solta a reserva, e nada aconteceu)
 *
 * ── ⚠️ Estoque: RESERVA, nem baixa nem ignora ───────────────────────────────
 * `estoque` fica intacto e `reservado` cresce. Disponível = estoque - reservado.
 *
 * Não mexer no estoque venderia a mesma joia duas vezes. Baixar como venda
 * parece certo e é a armadilha: apaga a informação de que a peça AINDA É DELE,
 * e um cliente que recusa na porta viraria uma "devolução" no histórico — uma
 * devolução que nunca houve, sujando o relatório para sempre.
 *
 * Com reserva, recusou na porta, a peça volta e não aconteceu nada. Nem venda,
 * nem devolução. E a trava que impede vender a última unidade duas vezes segue
 * no mesmo lugar de sempre, só que comparando contra `estoque - reservado`.
 *
 * ⚠️ A reserva é POR VARIAÇÃO quando o produto é de grade: reservar o produto
 * inteiro deixaria o tamanho errado disponível.
 *
 * ── ⚠️ Preço CONGELADO ──────────────────────────────────────────────────────
 * `itens_pedido.preco_unitario` e `pedidos.total` guardam o combinado. Se o
 * preço do produto mudar entre separar e receber, a venda usa o do pedido —
 * senão o cliente paga na porta um valor diferente do que foi acertado. É o
 * mesmo princípio do percentual de comissão, que já congela na venda.
 *
 * `endereco_entrega` também é cópia, não referência: mudar o cadastro do cliente
 * depois não pode reescrever para onde a peça foi levada.
 */
export function aplicar041PedidosSeparados(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER REFERENCES clientes(id),
        vendedor_id INTEGER NOT NULL,
        situacao TEXT NOT NULL DEFAULT 'separado'
          CHECK(situacao IN ('separado','concluido','cancelado')),
        criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        para_entrega INTEGER NOT NULL DEFAULT 0,
        endereco_entrega TEXT,
        observacao TEXT,
        desconto REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        venda_id INTEGER REFERENCES vendas(id),
        concluido_em TEXT,
        cancelado_em TEXT,
        motivo_cancelamento TEXT
      );

      CREATE TABLE IF NOT EXISTS itens_pedido (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
        produto_id INTEGER NOT NULL REFERENCES produtos(id),
        variacao_id INTEGER,
        quantidade INTEGER NOT NULL,
        preco_unitario REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pedidos_situacao ON pedidos(situacao, criado_em);
      CREATE INDEX IF NOT EXISTS idx_itens_pedido ON itens_pedido(pedido_id);
    `)

    // Quantas unidades estão apartadas para pedidos ainda em aberto. Nasce em 0
    // em tudo que já existe, que é a verdade: não havia pedido nenhum antes.
    adicionarColunaSeAusente(db, 'produtos', 'reservado', 'INTEGER NOT NULL DEFAULT 0')
    adicionarColunaSeAusente(db, 'produto_variacoes', 'reservado', 'INTEGER NOT NULL DEFAULT 0')

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('041_pedidos_separados')
  })()
}
