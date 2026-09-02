import type Database from 'better-sqlite3'

// Runner genérico de migrations, compartilhado por todos os nichos. Recebe a
// lista de migrations do app (domínio) e aplica as ainda não registradas. As
// migrations de conteúdo (e a ordem) vivem em cada app — aqui fica só o motor.
export type Migration = {
  nome: string
  aplicar: (db: Database.Database) => void
}

/**
 * Quais migrations ainda não rodaram neste banco, na ordem.
 *
 * Serve a quem precisa AGIR antes de aplicá-las — hoje, o servidor web, que faz
 * backup se houver o que aplicar. No aplicativo instalado esse cuidado já
 * existia noutro lugar: o backup pré-atualização roda antes de instalar a
 * versão nova. Na nuvem não há instalação — o contêiner novo sobe e migra o
 * banco vivo no mesmo instante, sem ninguém no meio.
 *
 * Cria a tabela de controle se não existir, igual ao runner; por isso chamar um
 * depois do outro é inócuo.
 */
export function migrationsPendentes(
  db: Database.Database,
  migrations: Migration[]
): { pendentes: string[]; jaAplicadas: number } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL,
      data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const consulta = db.prepare('SELECT 1 FROM _migrations WHERE nome = ?')
  const pendentes = migrations.filter((m) => !consulta.get(m.nome)).map((m) => m.nome)

  // Quantas já rodaram distingue "banco recém-nascido" de "banco em uso". Num
  // banco que acabou de ser criado, TODAS estão pendentes e não há o que
  // proteger — fazer backup ali só geraria lixo a cada loja nova.
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM _migrations').get() as { n: number }
  return { pendentes, jaAplicadas: n }
}

export function executarMigrations(db: Database.Database, migrations: Migration[]): void {
  // Garante que a tabela de controle existe antes de qualquer verificação
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL,
      data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  for (const migration of migrations) {
    const jaAplicada = db
      .prepare('SELECT 1 FROM _migrations WHERE nome = ?')
      .get(migration.nome)

    if (!jaAplicada) {
      console.log(`[migrations] Aplicando: ${migration.nome}`)
      migration.aplicar(db)
      // O runner carimba a migration como aplicada. As migrations atuais também
      // se carimbam por dentro (INSERT OR IGNORE), o que é redundante mas inócuo;
      // garantir o registro AQUI é a rede de segurança contra uma migration nova
      // que esqueça essa linha e, sem isso, re-rodaria em todo boot pra sempre.
      db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(migration.nome)
      console.log(`[migrations] Concluído: ${migration.nome}`)
    }
  }
}
