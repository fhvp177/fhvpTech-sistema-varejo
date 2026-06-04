// Camada de persistência usando SQLite (better-sqlite3). Substitui o KV
// que usávamos no Cloudflare Workers. Mesmas funções, mesma assinatura
// — exceto que agora são síncronas (better-sqlite3 é sync).
//
// O arquivo do banco vai em DB_PATH (env var). Em produção no Fly.io
// fica em /data/licenca.db (volume persistente). Em dev, ./data/licenca.db.

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Cliente, Cobranca } from './tipos.ts'

const DB_PATH = process.env.DB_PATH ?? './data/licenca.db'

// Garante que o diretório existe antes de abrir o banco.
mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    clienteId TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cobrancas (
    txid TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_uso (
    cliente_id TEXT NOT NULL,
    dia TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (cliente_id, dia)
  );
`)

const stmts = {
  getCliente: db.prepare('SELECT data FROM clientes WHERE clienteId = ?'),
  setCliente: db.prepare(
    'INSERT INTO clientes (clienteId, data) VALUES (?, ?) ON CONFLICT(clienteId) DO UPDATE SET data = excluded.data'
  ),
  getCobranca: db.prepare('SELECT data FROM cobrancas WHERE txid = ?'),
  setCobranca: db.prepare(
    'INSERT INTO cobrancas (txid, data) VALUES (?, ?) ON CONFLICT(txid) DO UPDATE SET data = excluded.data'
  ),
  getUsoChat: db.prepare('SELECT total FROM chat_uso WHERE cliente_id = ? AND dia = ?'),
  incUsoChat: db.prepare(
    `INSERT INTO chat_uso (cliente_id, dia, total) VALUES (?, ?, 1)
     ON CONFLICT(cliente_id, dia) DO UPDATE SET total = total + 1`
  )
}

export function obterCliente(clienteId: string): Cliente | null {
  const row = stmts.getCliente.get(clienteId) as { data: string } | undefined
  return row ? (JSON.parse(row.data) as Cliente) : null
}

export function gravarCliente(cliente: Cliente): void {
  stmts.setCliente.run(cliente.clienteId, JSON.stringify(cliente))
}

export function obterCobranca(txid: string): Cobranca | null {
  const row = stmts.getCobranca.get(txid) as { data: string } | undefined
  return row ? (JSON.parse(row.data) as Cobranca) : null
}

export function gravarCobranca(cobranca: Cobranca): void {
  stmts.setCobranca.run(cobranca.txid, JSON.stringify(cobranca))
}

// Contador diário de perguntas ao chatbot por cliente. Conta PERGUNTAS, não
// rodadas de tool — o app só marca a 1ª chamada de cada pergunta. Se já atingiu
// o limite do dia, não incrementa e devolve permitido=false. Dia em UTC.
export function registrarPerguntaChat(
  clienteId: string,
  limiteDiario: number
): { permitido: boolean; usadas: number } {
  const dia = new Date().toISOString().slice(0, 10) // AAAA-MM-DD
  const row = stmts.getUsoChat.get(clienteId, dia) as { total: number } | undefined
  const usadas = row?.total ?? 0
  if (usadas >= limiteDiario) return { permitido: false, usadas }
  stmts.incUsoChat.run(clienteId, dia)
  return { permitido: true, usadas: usadas + 1 }
}
