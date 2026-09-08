import type Database from 'better-sqlite3'

/**
 * Contas do dinheiro, e o livro onde cada movimento é lançado.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Uma aba de contas bancárias no financeiro, em que eu cadastro os bancos onde
 * recebo e tiro dinheiro, e sempre que houver uma movimentação o usuário informa
 * de qual conta o valor sai ou entra."
 *
 * ── Por que UM livro só, e não um saldo em cada conta ───────────────────────
 * Guardar `saldo` numa coluna e somar/subtrair a cada operação é o caminho
 * curto e o errado: qualquer falha no meio deixa o número mentindo para sempre,
 * e não há como descobrir quando começou. Aqui o saldo NÃO é guardado, é
 * DERIVADO: `saldo_inicial` mais a soma dos movimentos. Um lançamento perdido
 * aparece na lista; um saldo errado, não.
 *
 * ── O sinal do valor ────────────────────────────────────────────────────────
 * `valor` é positivo quando entra e negativo quando sai. Sem coluna de direção:
 * a direção JÁ é o sinal, e duas fontes para a mesma informação divergem.
 *
 * ── ⚠️ Este livro NÃO é a verdade da dívida ─────────────────────────────────
 * Quanto um cliente deve continua sendo `vendas.total - vendas.valor_pago`.
 * O livro diz ONDE o dinheiro caiu, não QUANTO falta. Fazer dele uma segunda
 * verdade sobre dívida criaria dois números para a mesma pergunta, e um dia
 * eles discordam.
 *
 * ── ⚠️ Por que NÃO existe carga retroativa ──────────────────────────────────
 * Seria fácil varrer as vendas antigas e inventar um movimento para cada uma.
 * Seria também mentira: o dinheiro daquelas vendas já foi depositado, gasto ou
 * trocado de conta de maneiras que o sistema não tem como saber. O livro começa
 * a contar HOJE, e o lojista informa quanto tinha em cada conta ao começar, no
 * `saldo_inicial`.
 *
 * ── Sobre cartão (decisão de 2026-09-06) ────────────────────────────────────
 * Venda no cartão entra pelo valor de face, na data da venda. Isso NÃO bate com
 * o extrato do banco, porque a adquirente desconta a taxa e paga depois. Foi
 * decisão consciente: ele não quer conferir contra o extrato.
 *
 * O dia em que quiser, o caminho já está aberto sem migração dolorosa: criar
 * contas do tipo `a_receber` (uma por adquirente), fazer a venda entrar nelas, e
 * lançar a liquidação como uma saída de lá com entrada no banco, mais uma saída
 * de taxa. Por isso `tipo` já é um texto livre com CHECK, e não um booleano.
 */
export function aplicar039ContasFinanceiras(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS contas_financeiras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'banco' CHECK(tipo IN ('caixa','banco','a_receber')),
        banco TEXT,
        agencia TEXT,
        conta TEXT,
        saldo_inicial REAL NOT NULL DEFAULT 0,
        ativa INTEGER NOT NULL DEFAULT 1,
        padrao_recebimento INTEGER NOT NULL DEFAULT 0,
        padrao_pagamento INTEGER NOT NULL DEFAULT 0,
        -- Forma de pagamento que cai NESTA conta por padrão (dinheiro, pix,
        -- debito, credito). É como a loja pensa: o dinheiro fica na gaveta, o
        -- PIX cai no banco, o cartão cai noutro. Sem isso o lojista escolheria
        -- a conta na mão em toda venda, e escolha repetida vira escolha errada.
        forma_padrao TEXT,
        criada_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS movimentos_financeiros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conta_id INTEGER NOT NULL REFERENCES contas_financeiras(id),
        data TEXT NOT NULL,
        valor REAL NOT NULL,
        tipo TEXT NOT NULL,
        descricao TEXT,
        forma_pagamento TEXT,
        origem_tipo TEXT,
        origem_id INTEGER,
        turno_id INTEGER,
        vendedor_id INTEGER,
        criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );

      CREATE INDEX IF NOT EXISTS idx_mov_conta_data
        ON movimentos_financeiros(conta_id, data);
      CREATE INDEX IF NOT EXISTS idx_mov_turno
        ON movimentos_financeiros(turno_id);
      CREATE INDEX IF NOT EXISTS idx_mov_origem
        ON movimentos_financeiros(origem_tipo, origem_id);
    `)

    /*
     * A loja nasce com um "Caixa da loja", e ele é o padrão dos dois lados.
     *
     * Sem isso, a primeira venda depois da atualização não teria onde cair, e a
     * escolha seria entre travar a venda (inaceitável: o caixa não pode parar
     * porque falta um cadastro) ou lançar sem conta (que é o buraco que este
     * livro existe para fechar).
     *
     * ⚠️ `saldo_inicial` começa em zero e é o lojista quem corrige, em Contas.
     * Chutar aqui seria inventar dinheiro.
     */
    const jaTem = db.prepare('SELECT COUNT(*) AS n FROM contas_financeiras').get() as { n: number }
    if (jaTem.n === 0) {
      db.prepare(
        `INSERT INTO contas_financeiras
           (nome, tipo, saldo_inicial, padrao_recebimento, padrao_pagamento, forma_padrao)
         VALUES ('Caixa da loja', 'caixa', 0, 1, 1, 'dinheiro')`
      ).run()
    }

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('039_contas_financeiras')
  })()
}
