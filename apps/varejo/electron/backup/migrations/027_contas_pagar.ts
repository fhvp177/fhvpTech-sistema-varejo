import type Database from 'better-sqlite3'

// Contas a pagar da loja — o espelho do "A receber". Registra o que a loja DEVE:
// mercadoria de fornecedor, mas também aluguel, luz, água, salário, imposto (por
// isso `fornecedor_id` é opcional e a `categoria` é texto livre).
//
// `valor_pago` é a fonte da verdade do quanto já foi quitado (restante =
// valor_total − valor_pago), o mesmo invariante das vendas. O status é derivado
// na consulta, não gravado: "paga" quando valor_pago >= valor_total; "vencida" é
// uma leitura de (aberta + vencimento no passado). `vencimento` pode ser NULL
// (conta sem data certa). `pago_em` marca quando a conta foi quitada por inteiro.
export function aplicar027ContasPagar(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS contas_pagar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        descricao TEXT NOT NULL,
        categoria TEXT,
        fornecedor_id INTEGER,
        valor_total REAL NOT NULL,
        valor_pago REAL NOT NULL DEFAULT 0,
        vencimento DATE,
        observacao TEXT,
        criada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        pago_em DATETIME,
        FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
      )
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON contas_pagar(vencimento)`)
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('027_contas_pagar')
  })()
}
