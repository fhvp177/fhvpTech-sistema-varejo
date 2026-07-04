import type Database from 'better-sqlite3'

export function aplicar001ModuloBackup(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT UNIQUE NOT NULL,
      data_aplicacao DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS backup_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data DATETIME DEFAULT CURRENT_TIMESTAMP,
      tipo TEXT CHECK(tipo IN ('automatico','diario','manual','pre-update','pre-restauracao')) NOT NULL,
      caminho_arquivo TEXT NOT NULL,
      tamanho_bytes INTEGER,
      sucesso INTEGER NOT NULL,
      mensagem_erro TEXT
    );
  `)

  const inserirConfig = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)')

  const defaults: [string, string][] = [
    ['backup_pasta_padrao', ''],       // preenchido no boot pelo BackupManager (requer app.getPath)
    ['backup_pasta_secundaria', ''],
    ['backup_frequencia_horas', '2'],
    ['backup_ao_fechar', 'perguntar'], // 'perguntar' | 'sempre' | 'nunca'
    ['backup_timestamp_ultima_alteracao', ''],
    ['backup_timestamp_ultimo_backup', ''],
    ['backup_falhas_consecutivas', '0'],
    ['cliente_id', ''],               // extraído da licença no boot
    ['backup_ativo', '0'],            // feature flag — desativado por padrão
  ]

  db.transaction(() => {
    for (const [chave, valor] of defaults) {
      inserirConfig.run(chave, valor)
    }
    db.prepare("INSERT OR IGNORE INTO _migrations (nome) VALUES (?)").run('001_modulo_backup')
  })()
}
