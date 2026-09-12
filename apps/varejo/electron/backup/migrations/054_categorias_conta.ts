import type Database from 'better-sqlite3'

/**
 * Categorias de conta a pagar, cadastráveis pelo lojista.
 *
 * ── O que existia antes ─────────────────────────────────────────────────────
 * O campo era texto livre com uma lista fixa de sugestões escrita no código.
 * Quem quisesse uma categoria própria digitava — e digitava de novo na conta
 * seguinte, às vezes com outra grafia. "Energia", "energia" e "Enegia" viravam
 * três linhas no relatório de despesas por categoria, que é justamente a tela
 * onde ele quer ver para onde o dinheiro está indo.
 *
 * ── ⚠️ A categoria continua morando como TEXTO na conta ─────────────────────
 * `contas_pagar.categoria` segue sendo o nome escrito, e não um id. É a mesma
 * modelagem das categorias de produto, pelo mesmo motivo: as contas antigas —
 * e os relatórios já exportados — carregam o nome, e trocar por chave
 * estrangeira obrigaria a converter tudo para ganhar o quê. Renomear propaga,
 * como já acontece nos produtos.
 *
 * ── A tabela nasce com o que a loja JÁ USA ──────────────────────────────────
 * Duas fontes: as sugestões que o código oferecia e as categorias que o lojista
 * de fato digitou nas contas dele. Sem a segunda, ele abriria a tela nova e não
 * encontraria as próprias categorias — pareceria que o sistema as perdeu.
 */
export function aplicar054CategoriasConta(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categorias_conta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE COLLATE NOCASE
    );
  `)

  const inserir = db.prepare('INSERT OR IGNORE INTO categorias_conta (nome) VALUES (?)')

  // As que o código sugeria desde a migration 024.
  for (const nome of [
    'Mercadoria',
    'Aluguel',
    'Energia',
    'Água',
    'Internet/Telefone',
    'Salário',
    'Impostos',
    'Manutenção',
    'Outros'
  ]) {
    inserir.run(nome)
  }

  /*
   * E as que a loja já escreveu nas contas. `COLLATE NOCASE` no UNIQUE faz
   * "energia" e "Energia" contarem como a mesma, e a primeira grafia é a que
   * fica — arbitrário, mas melhor que duas linhas para a mesma despesa.
   */
  const usadas = db
    .prepare(
      `SELECT DISTINCT TRIM(categoria) AS nome FROM contas_pagar
        WHERE categoria IS NOT NULL AND TRIM(categoria) != ''`
    )
    .all() as Array<{ nome: string }>
  for (const { nome } of usadas) inserir.run(nome)
}
