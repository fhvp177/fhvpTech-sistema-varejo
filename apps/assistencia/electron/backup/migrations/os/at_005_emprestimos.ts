import type Database from 'better-sqlite3'

// Empréstimos de DINHEIRO do dono para clientes.
//
// ── Por que tabelas próprias, e não vendas nem contas_pagar ──────────────────
// O dinheiro do dono mora em três potes diferentes, e misturá-los estraga todo
// número que ele usa pra decidir:
//   venda     = dinheiro que virou dele (entra no faturamento e no lucro);
//   despesa   = dinheiro que saiu pra sempre (luz, aluguel — contas_pagar);
//   empréstimo = dinheiro que só MUDOU DE LUGAR — saiu da gaveta e virou "um
//                papel dizendo que o João me deve". Continua sendo dele.
// Registrar empréstimo como venda incharia o faturamento com dinheiro que não é
// receita; registrar a devolução como venda contaria o MESMO dinheiro duas
// vezes. Por isso: tabelas próprias, e nada disso encosta em vendas, estoque ou
// dashboard. Há teste garantindo que o faturamento não se mexe (emprestimo.test).
//
// ── A dívida é uma FOTO, não um relógio ──────────────────────────────────────
// O total é combinado no ato e não anda sozinho: não existe taxa de juros
// gravada, nem recálculo por tempo. O que existe é o dono LANÇAR um acréscimo
// ("juros de setembro: R$50", "multa por atraso: R$30") ou um desconto, cada um
// uma linha datada no extrato. Decisão de produto e não limitação: quem define
// o número é a pessoa, o sistema só guarda o que foi combinado. Isso mantém o
// saldo auditável (dá pra apontar a linha que originou cada centavo) e evita um
// motor de juros que precisaria responder "saldo em QUE dia?" em cada relatório.
//
// ── O extrato é a fonte da verdade; os totais são espelhos ───────────────────
// `valor_devido` e `valor_pago` poderiam ser deduzidos somando os lançamentos,
// mas as telas e os cartões leem o restante como (devido - pago), igual ao resto
// do app. Então os dois são MANTIDOS, sempre dentro da mesma transação que grava
// o lançamento, e nunca escritos por fora dela.
//
// Isso é resposta direta a um erro que já custou caro aqui: nas vendas, pagar
// parcela marcava a parcela mas não somava no valor_pago, os dois divergiram em
// produção e foi preciso a migration 023_recalcular_valor_pago_parcelado pra
// consertar o histórico de todo mundo. Aqui o lançamento é o único caminho por
// onde dinheiro entra, e `provaDosNove` (teste) afirma que o cache bate com a
// soma do extrato.
//
// ── Nada é apagado ───────────────────────────────────────────────────────────
// Empréstimo é dinheiro entre duas pessoas: o rastro É o produto. Empréstimo
// cancelado e lançamento estornado ficam MARCADOS, nunca deletados — mesmo
// princípio dos recibos (at_002_recibos).
export function aplicarAt005Emprestimos(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS emprestimos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- O devedor. cliente_id é o vínculo vivo (usado pra abrir a ficha e
        -- somar quanto aquele cliente deve); o nome e o documento ao lado são
        -- CONGELADOS na emissão porque são eles que saem no comprovante. Se o
        -- cadastro for corrigido depois, a 2ª via continua idêntica à 1ª.
        cliente_id INTEGER,
        devedor_nome TEXT NOT NULL,
        devedor_documento TEXT,

        -- valor_principal: o que efetivamente saiu da mão dele.
        -- valor_acordado: o que ele combinou receber de volta (principal + o
        -- que já foi embutido no acerto). Guardar os dois separados é o que
        -- permite dizer depois quanto o empréstimo rendeu, sem inventar taxa.
        valor_principal REAL NOT NULL CHECK(valor_principal > 0),
        valor_acordado REAL NOT NULL CHECK(valor_acordado > 0),

        -- Espelhos do extrato, mantidos na MESMA transação que grava o
        -- lançamento e escritos por mais ninguém:
        --   valor_devido = valor_acordado + acréscimos - descontos
        --   valor_pago   = soma dos pagamentos não estornados
        -- Existem pra que os cartões e a lista leiam o restante como
        -- (valor_devido - valor_pago), igual ao resto do app, sem subconsulta em
        -- cada linha. "provaDosNove" (teste) afirma que eles batem com o extrato.
        valor_devido REAL NOT NULL,
        valor_pago REAL NOT NULL DEFAULT 0,

        -- 'unico' = uma data alvo e pagamentos parciais livres.
        -- 'carne' = parcelas fixas, cada uma quitada por inteiro.
        -- Excludentes de propósito, o mesmo que as vendas já fazem: pagamento
        -- parcial em carnê é recusado, senão o papel do cliente e o saldo do
        -- sistema deixam de bater.
        modo TEXT NOT NULL DEFAULT 'unico' CHECK(modo IN ('unico','carne')),

        data_emprestimo DATE NOT NULL,
        vencimento DATE,
        observacao TEXT,

        quitado_em DATETIME,

        cancelado INTEGER NOT NULL DEFAULT 0,
        cancelado_em DATETIME,
        cancelado_motivo TEXT,

        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        criado_por TEXT,

        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
      );

      -- O extrato. Toda movimentação de dinheiro do empréstimo passa por aqui.
      --   pagamento = o devedor pagou (abate o saldo)
      --   acrescimo = juros combinado, multa, taxa (aumenta o devido)
      --   desconto  = perdão de parte da dívida (diminui o devido)
      -- "estornado" desfaz sem apagar: a linha continua visível no extrato,
      -- riscada, porque "esse pagamento foi lançado errado e desfeito" é
      -- informação, não sujeira.
      CREATE TABLE IF NOT EXISTS emprestimo_lancamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emprestimo_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('pagamento','acrescimo','desconto')),
        valor REAL NOT NULL CHECK(valor > 0),
        data DATE NOT NULL,
        forma_pagamento TEXT,
        observacao TEXT,

        -- Preenchido quando o pagamento quitou uma parcela do carnê. É o que
        -- permite ao extrato e ao carnê contarem a mesma história.
        parcela_id INTEGER,

        estornado INTEGER NOT NULL DEFAULT 0,
        estornado_em DATETIME,

        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        criado_por TEXT,

        FOREIGN KEY (emprestimo_id) REFERENCES emprestimos(id)
      );

      -- Só existe no modo 'carne'. A TELA do carnê chega na Fase 2; a tabela
      -- nasce junto com as outras porque o formato foi decidido agora e criá-la
      -- depois custaria uma segunda migration sem nenhum ganho.
      -- O carnê é o acordo ORIGINAL, congelado:
      -- acréscimo lançado depois NUNCA é rediluído aqui, senão o papel que o
      -- cliente levou pra casa deixaria de bater com o sistema. Multa vive como
      -- lançamento avulso, ao lado do carnê.
      CREATE TABLE IF NOT EXISTS emprestimo_parcelas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emprestimo_id INTEGER NOT NULL,
        numero INTEGER NOT NULL,
        valor REAL NOT NULL CHECK(valor > 0),
        vencimento DATE NOT NULL,
        paga INTEGER NOT NULL DEFAULT 0,
        paga_em DATETIME,
        FOREIGN KEY (emprestimo_id) REFERENCES emprestimos(id)
      );

      CREATE INDEX IF NOT EXISTS idx_emprestimos_vencimento ON emprestimos(vencimento);
      CREATE INDEX IF NOT EXISTS idx_emprestimos_cliente ON emprestimos(cliente_id);
      CREATE INDEX IF NOT EXISTS idx_emp_lancamentos_emprestimo ON emprestimo_lancamentos(emprestimo_id);
      CREATE INDEX IF NOT EXISTS idx_emp_parcelas_emprestimo ON emprestimo_parcelas(emprestimo_id, numero);
    `)

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('at_005_emprestimos')
  })()
}
