import type Database from 'better-sqlite3'

// Importação de NF-e (XML) — três tabelas:
//
// `notas_entrada` guarda cada nota importada, com o XML bruto dentro: a chave
// de acesso UNIQUE impede importar a mesma nota duas vezes (e duplicar
// estoque), e o XML guardado é o que o contador quer receber todo mês. Nome e
// CNPJ do fornecedor ficam desnormalizados de propósito: a nota é um registro
// fiscal e não pode "mudar de fornecedor" se o cadastro for editado/excluído
// (por isso o fornecedor_id é só um atalho, com ON DELETE SET NULL).
//
// `notas_entrada_itens` é o histórico item a item (com NCM/CFOP, que os
// relatórios fiscais futuros vão precisar). produto_id com ON DELETE SET NULL:
// excluir um produto não pode travar nem apagar o histórico fiscal.
//
// `fornecedor_produtos` é a memória de vínculo da reposição: o código do item
// NO fornecedor (cProd) apontando pro nosso produto/tamanho. Na 1ª importação
// o lojista confirma o vínculo; nas seguintes o sistema já reconhece sozinho —
// essencial porque muito item vem "SEM GTIN". Sem o fornecedor ou o produto, o
// vínculo perde o sentido (CASCADE); sem o tamanho, cai pro produto (SET NULL).
export function aplicar028NotasEntrada(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notas_entrada (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chave TEXT NOT NULL UNIQUE,
        numero TEXT,
        serie TEXT,
        modelo TEXT,
        fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
        fornecedor_nome TEXT NOT NULL,
        fornecedor_cnpj TEXT,
        data_emissao TEXT,
        valor_total REAL NOT NULL DEFAULT 0,
        xml TEXT NOT NULL,
        importada_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_notas_entrada_emissao ON notas_entrada(data_emissao);

      CREATE TABLE IF NOT EXISTS notas_entrada_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nota_id INTEGER NOT NULL REFERENCES notas_entrada(id) ON DELETE CASCADE,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
        variacao_id INTEGER REFERENCES produto_variacoes(id) ON DELETE SET NULL,
        cprod TEXT,
        descricao TEXT NOT NULL,
        ncm TEXT,
        cfop TEXT,
        unidade TEXT,
        quantidade REAL NOT NULL,
        custo_unitario REAL NOT NULL,
        acao TEXT NOT NULL CHECK(acao IN ('novo','reposicao'))
      );
      CREATE INDEX IF NOT EXISTS idx_notas_itens_nota ON notas_entrada_itens(nota_id);

      CREATE TABLE IF NOT EXISTS fornecedor_produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
        cprod TEXT NOT NULL,
        produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
        variacao_id INTEGER REFERENCES produto_variacoes(id) ON DELETE SET NULL,
        UNIQUE(fornecedor_id, cprod)
      );
    `)
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('028_notas_entrada')
  })()
}
