import type Database from 'better-sqlite3'

/**
 * "Não vende sem caixa aberto" vira interruptor POR LOJA.
 *
 * ── Por que deixou de ser regra fixa ────────────────────────────────────────
 * A regra nasceu para a loja que pediu o livro-caixa, e para ela está certa:
 * venda fora de turno não entra em conferência nenhuma e o dinheiro some do
 * controle sem ninguém notar.
 *
 * Só que a mesma versão vai para clientes que nunca viram uma tela de caixa. Na
 * manhã seguinte à atualização, eles abririam o sistema e não conseguiriam
 * vender — com o cliente no balcão e sem entender o motivo. Uma regra que
 * protege uma loja não pode parar as outras.
 *
 * Segue o padrão de módulo opcional do sistema: interruptor na `config`, nunca
 * edição de build nem de licença.
 *
 * ── ⚠️ O padrão não é fixo: é deduzido do que a loja JÁ faz ─────────────────
 * Ligar para todos quebraria quem não usa; desligar para todos silenciaria a
 * regra justamente na loja que a pediu. Então a migration olha o banco:
 *
 *   1. **Já tem turno de caixa registrado** → LIGA. Esta loja usa o recurso, e
 *      desligá-lo seria remover uma proteção que ela adotou.
 *   2. **Não tem venda nenhuma** → LIGA. Loja nova, instalação em branco: começa
 *      pelo jeito certo, sem ter hábito a quebrar.
 *   3. **Tem vendas e nenhum turno** → DESLIGA. É o cliente que já opera sem
 *      caixa; para ele isto é uma novidade, e novidade não pode chegar
 *      barrando a primeira venda do dia.
 *
 * ⚠️ A ordem importa: o caso 1 tem que ser testado antes do 2, senão uma loja
 * que abriu caixa mas ainda não vendeu cairia na regra errada por coincidência.
 */
export function aplicar048ExigirCaixaAberto(db: Database.Database): void {
  db.transaction(() => {
    const jaExiste = db
      .prepare("SELECT valor FROM config WHERE chave = 'exigir_caixa_aberto'")
      .get() as { valor: string } | undefined

    // Loja que já respondeu isto não é perguntada de novo: reaplicar sobreporia
    // a escolha do lojista pela dedução da máquina.
    if (!jaExiste) {
      const temTurno = db
        .prepare('SELECT 1 FROM turnos_caixa LIMIT 1')
        .get() as unknown

      const temVenda = db.prepare('SELECT 1 FROM vendas LIMIT 1').get() as unknown

      const ligado = temTurno ? true : !temVenda

      db.prepare("INSERT INTO config (chave, valor) VALUES ('exigir_caixa_aberto', ?)").run(
        ligado ? '1' : '0'
      )
    }

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '048_exigir_caixa_aberto'
    )
  })()
}
