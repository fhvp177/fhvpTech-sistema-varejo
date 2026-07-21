import type Database from 'better-sqlite3'

// Troca/devolução com crédito na loja (v1). Desenho fechado em 2026-06-04.
// - devolucoes: cabeçalho de uma devolução vinculada à venda original. tipo
//   'credito' (dinheiro fica na loja) ou 'dinheiro' (sai do caixa → exige gerente,
//   gravado em autorizado_por_id). vendedor_id = quem registrou. valor_total =
//   soma dos itens devolvidos.
// - itens_devolucao: linhas devolvidas. valor_unitario_devolvido já é o valor
//   EFETIVO pago pelo item (proporcional ao desconto da venda, calculado na
//   camada de queries). restocado=1 devolve a unidade ao estoque; 0 quando o
//   item voltou danificado.
// - creditos_cliente: LEDGER de crédito por cliente. saldo = SUM(valor):
//   'entrada' (+, gerado por devolução), 'uso' (−, abatido numa venda),
//   'ajuste' (manual). data_expiracao fica NULL no v1 (sem validade); o campo
//   já existe pra ligar expiração na fase 2 sem migration nova.
export function aplicar016Devolucoes(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS devolucoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER NOT NULL REFERENCES vendas(id),
        data DATETIME DEFAULT CURRENT_TIMESTAMP,
        vendedor_id INTEGER NOT NULL REFERENCES vendedores(id),
        autorizado_por_id INTEGER REFERENCES vendedores(id),
        tipo TEXT NOT NULL CHECK(tipo IN ('credito','dinheiro')),
        valor_total REAL NOT NULL,
        motivo TEXT
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS itens_devolucao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        devolucao_id INTEGER NOT NULL REFERENCES devolucoes(id),
        item_venda_id INTEGER NOT NULL REFERENCES itens_venda(id),
        produto_id INTEGER NOT NULL REFERENCES produtos(id),
        quantidade INTEGER NOT NULL,
        valor_unitario_devolvido REAL NOT NULL,
        restocado INTEGER NOT NULL DEFAULT 1
      )
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS creditos_cliente (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        data DATETIME DEFAULT CURRENT_TIMESTAMP,
        tipo TEXT NOT NULL CHECK(tipo IN ('entrada','uso','ajuste')),
        valor REAL NOT NULL,
        devolucao_id INTEGER REFERENCES devolucoes(id),
        venda_id INTEGER REFERENCES vendas(id),
        data_expiracao DATE
      )
    `)

    // Índices pros lookups quentes: saldo de crédito por cliente (em toda venda
    // que usa crédito e ao exibir o saldo), itens de uma devolução, e devoluções
    // de uma venda (pra saber o que já foi devolvido daquele pedido).
    db.exec(`CREATE INDEX IF NOT EXISTS idx_creditos_cliente_cliente ON creditos_cliente(cliente_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_itens_devolucao_devolucao ON itens_devolucao(devolucao_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_devolucoes_venda ON devolucoes(venda_id)`)

    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('016_devolucoes')
  })()
}
