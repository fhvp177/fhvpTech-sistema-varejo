import type Database from 'better-sqlite3'

// Schema do domínio veterinário. Começo com tutores + pets (o núcleo do
// domínio); cresce depois com consultas, vacinas, agenda. Note que este
// schema é SÓ da veterinária — o varejo tem o dele. O que é compartilhado
// (conexão, runner de migrations) vem do @fhvptech/core.
export function criarTabelas(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tutores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT,
      email TEXT,
      data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tutor_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      especie TEXT,
      raca TEXT,
      nascimento DATE,
      data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tutor_id) REFERENCES tutores(id)
    );

    -- Tabela de plataforma (licença). Mesma estrutura do varejo; o código que
    -- a usa vem do @fhvptech/core. A licença em si é validada/assinada pelo
    -- mesmo backend (mesmas chaves), só muda o identificador de cada cliente.
    CREATE TABLE IF NOT EXISTS licenca (
      id INTEGER PRIMARY KEY,
      chave TEXT NOT NULL,
      data_expiracao DATE NOT NULL,
      ativo BOOLEAN DEFAULT 1
    );
  `)
}
