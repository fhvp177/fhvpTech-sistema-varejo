import type Database from 'better-sqlite3'

/**
 * Transferência de dinheiro entre as contas da loja.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Um botão de transferência de dinheiro entre as contas cadastradas: conta de
 * origem, conta de destino, valor e observação." (12/09/2026)
 *
 * ── ⚠️ Transferência NÃO é receita nem despesa ──────────────────────────────
 * É a mesma nota mudando de bolso. Contada como entrada no destino e nada mais,
 * o mês pareceria ter faturado o que só saiu de outra conta da própria loja —
 * e o lojista tomaria decisão de compra em cima de um faturamento inflado.
 *
 * Por isso ela nasce como DOIS movimentos do mesmo tipo (`transferencia`): um
 * negativo na origem, um positivo no destino. O resumo financeiro já sabe
 * separar esse tipo do que é receita e do que é despesa, como já fazia com
 * sangria e suprimento — ver a constante LADO em `resumoFinanceiro.ts`.
 *
 * ── Por que uma tabela, e não só os dois movimentos ─────────────────────────
 * Os dois movimentos sozinhos não sabem que são a mesma transferência: para
 * montar o histórico seria preciso adivinhar pelo par (valor, horário), e um
 * dia dois lançamentos coincidiriam. A linha aqui é o que dá o "de onde para
 * onde" ao relatório, e é a ela que os dois movimentos apontam.
 *
 * ── ⚠️ O caixa entra na conferência do turno ────────────────────────────────
 * Transferir da gaveta para o banco é, na prática, uma sangria — e o esperado
 * do fechamento tem que cair no mesmo valor. Como os movimentos são lançados
 * com o turno aberto da conta, isso acontece sozinho. Quem tira dinheiro do
 * caixa e não registra é que faz a contagem acusar falta.
 */
export function aplicar055Transferencias(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transferencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conta_origem_id INTEGER NOT NULL REFERENCES contas_financeiras(id),
      conta_destino_id INTEGER NOT NULL REFERENCES contas_financeiras(id),
      valor REAL NOT NULL,
      observacao TEXT,
      -- Quem fez. É a primeira pergunta quando o saldo não bate.
      vendedor_id INTEGER,
      criada_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_transferencias_data ON transferencias(criada_em);
  `)
}
