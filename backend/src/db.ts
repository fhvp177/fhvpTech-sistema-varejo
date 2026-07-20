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
  CREATE TABLE IF NOT EXISTS chat_custo (
    cliente_id TEXT NOT NULL,
    mes TEXT NOT NULL,
    custo_micro INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (cliente_id, mes)
  );
  CREATE TABLE IF NOT EXISTS recuperacao_uso (
    email TEXT NOT NULL,
    hora TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (email, hora)
  );

  -- Token da ACBr API. Vive AQUI, no volume do Fly, e não em memória: o
  -- endpoint de token aceita só 4 pedidos por HORA, e cada deploy reinicia a
  -- máquina. Em memória, uma tarde com cinco deploys deixaria o backend de
  -- castigo por uma hora, sem emitir nota nenhuma. O token dura 30 dias, então
  -- o normal é pedir ~1 por mês.
  --
  -- A chave é o AMBIENTE (a URL base), não uma linha única: o token vem
  -- carimbado com a audiência do host que o emitiu, e um token de sandbox
  -- usado contra produção devolve 401 com "Audience [aud] claim". Separando
  -- por ambiente, trocar sandbox↔produção não reaproveita token errado.
  CREATE TABLE IF NOT EXISTS acbr_token (
    ambiente TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    escopos TEXT NOT NULL,
    obtido_em TEXT NOT NULL,
    expira_em TEXT NOT NULL
  );

  -- Quantos tokens já pedimos em cada hora, por ambiente. Serve pra recusar
  -- localmente ANTES de levar 429 do servidor e ficar sem saber quanto falta
  -- pra poder tentar de novo.
  CREATE TABLE IF NOT EXISTS acbr_token_tentativas (
    ambiente TEXT NOT NULL,
    hora TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ambiente, hora)
  );
`)

const stmts = {
  getCliente: db.prepare('SELECT data FROM clientes WHERE clienteId = ?'),
  listClientes: db.prepare('SELECT data FROM clientes'),
  setCliente: db.prepare(
    'INSERT INTO clientes (clienteId, data) VALUES (?, ?) ON CONFLICT(clienteId) DO UPDATE SET data = excluded.data'
  ),
  getCobranca: db.prepare('SELECT data FROM cobrancas WHERE txid = ?'),
  setCobranca: db.prepare(
    'INSERT INTO cobrancas (txid, data) VALUES (?, ?) ON CONFLICT(txid) DO UPDATE SET data = excluded.data'
  ),
  getCustoChat: db.prepare('SELECT custo_micro FROM chat_custo WHERE cliente_id = ? AND mes = ?'),
  addCustoChat: db.prepare(
    `INSERT INTO chat_custo (cliente_id, mes, custo_micro) VALUES (?, ?, ?)
     ON CONFLICT(cliente_id, mes) DO UPDATE SET custo_micro = custo_micro + excluded.custo_micro`
  ),
  getUsoRecuperacao: db.prepare('SELECT total FROM recuperacao_uso WHERE email = ? AND hora = ?'),
  incUsoRecuperacao: db.prepare(
    `INSERT INTO recuperacao_uso (email, hora, total) VALUES (?, ?, 1)
     ON CONFLICT(email, hora) DO UPDATE SET total = total + 1`
  ),
  getTokenAcbr: db.prepare(
    'SELECT access_token, escopos, obtido_em, expira_em FROM acbr_token WHERE ambiente = ?'
  ),
  setTokenAcbr: db.prepare(
    `INSERT INTO acbr_token (ambiente, access_token, escopos, obtido_em, expira_em)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ambiente) DO UPDATE SET
       access_token = excluded.access_token,
       escopos = excluded.escopos,
       obtido_em = excluded.obtido_em,
       expira_em = excluded.expira_em`
  ),
  apagarTokenAcbr: db.prepare('DELETE FROM acbr_token WHERE ambiente = ?'),
  getTentativasToken: db.prepare(
    'SELECT total FROM acbr_token_tentativas WHERE ambiente = ? AND hora = ?'
  ),
  incTentativasToken: db.prepare(
    `INSERT INTO acbr_token_tentativas (ambiente, hora, total) VALUES (?, ?, 1)
     ON CONFLICT(ambiente, hora) DO UPDATE SET total = total + 1`
  )
}

export type TokenAcbrGravado = {
  access_token: string
  escopos: string
  obtido_em: string
  expira_em: string
}

export function obterTokenAcbr(ambiente: string): TokenAcbrGravado | null {
  return (stmts.getTokenAcbr.get(ambiente) as TokenAcbrGravado | undefined) ?? null
}

export function gravarTokenAcbr(ambiente: string, token: TokenAcbrGravado): void {
  stmts.setTokenAcbr.run(
    ambiente,
    token.access_token,
    token.escopos,
    token.obtido_em,
    token.expira_em
  )
}

// Usado quando a ACBr responde 401 com um token que ainda não venceu (credencial
// revogada ou trocada no console): jogar fora força buscar um novo.
export function apagarTokenAcbr(ambiente: string): void {
  stmts.apagarTokenAcbr.run(ambiente)
}

// Conta os pedidos de token da hora corrente (UTC) e já registra mais um.
// A janela some sozinha na virada da hora, porque a chave inclui a hora.
export function registrarTentativaToken(
  ambiente: string,
  limitePorHora: number
): { permitido: boolean; usadas: number } {
  const hora = new Date().toISOString().slice(0, 13) // AAAA-MM-DDTHH (UTC)
  const row = stmts.getTentativasToken.get(ambiente, hora) as { total: number } | undefined
  const usadas = row?.total ?? 0
  if (usadas >= limitePorHora) return { permitido: false, usadas }
  stmts.incTentativasToken.run(ambiente, hora)
  return { permitido: true, usadas: usadas + 1 }
}

export function obterCliente(clienteId: string): Cliente | null {
  const row = stmts.getCliente.get(clienteId) as { data: string } | undefined
  return row ? (JSON.parse(row.data) as Cliente) : null
}

export function gravarCliente(cliente: Cliente): void {
  stmts.setCliente.run(cliente.clienteId, JSON.stringify(cliente))
}

// Lista todos os clientes (uso admin: conferir cadastro e preço de cada loja).
export function listarClientes(): Cliente[] {
  const rows = stmts.listClientes.all() as Array<{ data: string }>
  return rows.map((r) => JSON.parse(r.data) as Cliente)
}

export function obterCobranca(txid: string): Cobranca | null {
  const row = stmts.getCobranca.get(txid) as { data: string } | undefined
  return row ? (JSON.parse(row.data) as Cobranca) : null
}

export function gravarCobranca(cobranca: Cobranca): void {
  stmts.setCobranca.run(cobranca.txid, JSON.stringify(cobranca))
}

// Orçamento mensal de CUSTO do chatbot por cliente (loja), em microdólares
// (1 µ$ = US$0,000001). Conta o gasto real de cada chamada — input, output e
// cache, cada um pesado pelo seu preço (ver index.ts). Diferente de contar
// "perguntas", não é burlável pelo cliente: toda chamada que gasta entra na
// conta, e o limite vira teto de GASTO mensal, não de quantidade. Mês em UTC.
export function custoMicroChatMes(clienteId: string): number {
  const mes = new Date().toISOString().slice(0, 7) // AAAA-MM (UTC)
  const row = stmts.getCustoChat.get(clienteId, mes) as { custo_micro: number } | undefined
  return row?.custo_micro ?? 0
}

// Soma o custo (microdólares) de uma chamada ao total do mês. Ignora valores
// não positivos.
export function registrarCustoChat(clienteId: string, custoMicro: number): void {
  if (!Number.isFinite(custoMicro) || custoMicro <= 0) return
  const mes = new Date().toISOString().slice(0, 7) // AAAA-MM (UTC)
  stmts.addCustoChat.run(clienteId, mes, Math.round(custoMicro))
}

// Rate-limit de envio de código de recuperação por email, por janela de hora
// (UTC). Protege contra alguém usar o endpoint como gerador de spam pro email
// de um dono. Sem validade > 1h: a chave (email, hora) muda sozinha na virada.
export function registrarEnvioRecuperacao(
  email: string,
  limitePorHora: number
): { permitido: boolean; usadas: number } {
  const hora = new Date().toISOString().slice(0, 13) // AAAA-MM-DDTHH (UTC)
  const row = stmts.getUsoRecuperacao.get(email, hora) as { total: number } | undefined
  const usadas = row?.total ?? 0
  if (usadas >= limitePorHora) return { permitido: false, usadas }
  stmts.incUsoRecuperacao.run(email, hora)
  return { permitido: true, usadas: usadas + 1 }
}
