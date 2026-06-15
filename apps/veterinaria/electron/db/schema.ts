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

    -- Tabela de plataforma (config chave/valor). O auto-lock do auth lê/grava
    -- aqui via @fhvptech/core/electron/backup/configBackup. No varejo nasce na
    -- migration de backup; na vet criamos direto pois o backup ainda não entrou.
    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );

    -- Usuários do sistema (dono + funcionários da clínica). É a "loja de
    -- usuários" que o motor de auth do @fhvptech/core consome (ver AuthStore).
    -- pin_hash NUNCA sai do main process. papel: 'dono' | 'funcionario'.
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
      ativo INTEGER NOT NULL DEFAULT 1,
      papel TEXT NOT NULL DEFAULT 'funcionario',
      pin_hash TEXT,
      email TEXT,
      data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Códigos de recuperação de PIN por email (hash bcrypt, validade, tentativas).
    -- 1 código ativo por usuário. Gerado/validado localmente; o backend Fly só
    -- envia o email.
    CREATE TABLE IF NOT EXISTS recuperacao_codigos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      codigo_hash TEXT NOT NULL,
      expira_em TEXT NOT NULL,
      tentativas INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_recuperacao_usuario ON recuperacao_codigos(usuario_id);

    -- Catálogo de serviços (consulta, banho, cirurgia, vacina aplicada...).
    -- ativo permite aposentar um serviço sem apagar o histórico de vendas.
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco REAL NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1,
      data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Catálogo de produtos/medicamentos com estoque simples (ração, remédio...).
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco REAL NOT NULL DEFAULT 0,
      estoque INTEGER NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1,
      data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
}
