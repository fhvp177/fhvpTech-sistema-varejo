import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

/**
 * Sinal no pedido separado: o dinheiro que entra antes de a venda existir.
 *
 * ── O buraco que isto fecha ─────────────────────────────────────────────────
 * A loja tinha dois fluxos que nunca se encontravam:
 *
 *  - **Venda a prazo com sinal**: registra o dinheiro certo, mas dá baixa no
 *    estoque de uma peça que continua na prateleira esperando a entrega.
 *  - **Pedido separado**: reserva a peça certo, mas não tinha onde registrar o
 *    dinheiro recebido.
 *
 * O lojista escolhia entre acertar o estoque ou acertar o caixa, nunca os dois.
 * Pior: a tela do PDV aceitava o valor do sinal e o botão "Separar pedido" o
 * DESCARTAVA em silêncio — o operador recebia R$ 100 na maquininha, o sistema
 * não guardava nada, e o caixa fechava com sobra sem explicação.
 *
 * ── ⚠️ O sinal entra no livro-caixa NA HORA ─────────────────────────────────
 * O dinheiro entrou hoje, na gaveta ou no banco de hoje, e é hoje que ele tem
 * que aparecer na conferência. Guardar para lançar só na entrega deixaria o
 * fechamento do dia errado — e é a contagem do dia que descobre diferença.
 *
 * O movimento nasce apontando para o PEDIDO (`origem_tipo = 'pedido'`). Quando
 * o pedido vira venda, ele continua apontando para o pedido: o dinheiro é o
 * mesmo, e reescrever a origem faria o extrato de ontem mudar de assunto. Quem
 * lê o histórico da venda alcança esse movimento pelo pedido que a originou.
 *
 * ── ⚠️ Cancelou o pedido, o sinal VOLTA ─────────────────────────────────────
 * Decisão do dono, e é o costume do comércio: pedido desfeito devolve o sinal.
 * O estorno sai na mesma conta e na mesma forma em que entrou, no turno de
 * AGORA — igual ao estorno de recebimento de venda. Sem isso, cancelar deixaria
 * no livro um dinheiro que voltou para a mão do cliente, e a gaveta acusaria
 * falta daquele valor.
 *
 * ── Por que a coluna guarda só o VALOR ──────────────────────────────────────
 * Forma e conta já vivem no movimento do livro, que é a fonte da verdade do
 * dinheiro. Repetir aqui criaria dois lugares para a mesma resposta, e um dia
 * eles discordariam. O que o pedido precisa saber é só QUANTO já foi pago, para
 * abater na hora da entrega.
 */
export function aplicar053SinalDoPedido(db: Database.Database): void {
  adicionarColunaSeAusente(db, 'pedidos', 'sinal', 'REAL NOT NULL DEFAULT 0')
}
