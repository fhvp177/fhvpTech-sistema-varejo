import type Database from 'better-sqlite3'

// Recibos avulsos.
//
// ── Por que uma tabela, e não só um gerador de PDF ───────────────────────────
// Recibo tem NÚMERO, e número exige memória. Um gerador que pede o número ao
// usuário devolve o problema para ele: dois recibos com o mesmo número, ou uma
// sequência com buracos que ninguém explica depois. Guardando, o próximo número
// sai sozinho e a segunda via sai igual à primeira — que é o ponto de um
// recibo: as duas partes ficam com o mesmo papel.
//
// ── Por que ele não nasce de uma venda ───────────────────────────────────────
// Recibo aqui é AVULSO de propósito. A assistência recebe dinheiro por coisas
// que não passam pelo caixa: um adiantamento combinado, um acerto, um aluguel,
// a parte de um serviço que outra pessoa pagou. Amarrar o recibo a uma venda
// obrigaria a inventar uma venda para cada um desses casos — e aí o faturamento
// passaria a contar dinheiro que não foi venda. Quem quiser comprovante DE
// VENDA já tem o cupom e a nota fiscal.
//
// ── Os campos das duas partes ────────────────────────────────────────────────
// Nome, RG e CPF de cada lado ficam CONGELADOS na linha, copiados no momento em
// que o recibo é emitido — não são um JOIN com `clientes`. Um recibo é uma
// declaração feita numa data: se o cliente trocar de endereço ou o cadastro for
// corrigido depois, a segunda via tem que sair idêntica à que a pessoa levou.
export function aplicarAt002Recibos(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS recibos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Sequência visível ao cliente. UNIQUE porque é ela que dá fé: dois
        -- recibos com o mesmo número tornam os dois discutíveis. Número de
        -- recibo cancelado NÃO é reaproveitado — o buraco na sequência é a
        -- prova de que algo foi desfeito.
        numero INTEGER NOT NULL UNIQUE,

        valor REAL NOT NULL CHECK(valor > 0),

        -- Quem RECEBE (em geral a própria loja, mas pode ser o técnico).
        recebedor_nome TEXT NOT NULL,
        recebedor_documento TEXT,
        recebedor_rg TEXT,

        -- Quem PAGA. A coluna pagador_cliente_id é só rastro de onde os dados
        -- vieram; o que vale no papel são os campos de texto ao lado.
        pagador_nome TEXT NOT NULL,
        pagador_documento TEXT,
        pagador_rg TEXT,
        pagador_cliente_id INTEGER,

        -- "referente a" — o motivo do pagamento, no texto do recibo.
        referente TEXT NOT NULL,

        -- Local e data DECLARADOS (o "São Paulo, 04 de maio de 2018" do rodapé).
        -- Separados de criado_em porque um recibo pode ser lavrado hoje sobre
        -- um pagamento de ontem, e é a data declarada que vale no documento.
        cidade TEXT,
        data_recibo TEXT NOT NULL,

        observacao TEXT,

        cancelado INTEGER NOT NULL DEFAULT 0,
        cancelado_em DATETIME,
        cancelado_motivo TEXT,

        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        criado_por TEXT,

        FOREIGN KEY (pagador_cliente_id) REFERENCES clientes(id)
      );

      -- A lista abre ordenada por número decrescente e filtra por mês.
      CREATE INDEX IF NOT EXISTS idx_recibos_numero ON recibos(numero DESC);
      CREATE INDEX IF NOT EXISTS idx_recibos_data ON recibos(data_recibo);
    `)

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('at_002_recibos')
  })()
}
