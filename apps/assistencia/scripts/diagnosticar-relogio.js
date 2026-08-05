#!/usr/bin/env node
/**
 * Diagnostico do guardiao de relogio (suporte).
 *
 * O destravar-relogio.bat conserta o caso comum, mas nao diz POR QUE travou —
 * e quando ele nao resolve, ficamos no escuro. Este script abre as duas ancoras
 * que o guardiao usa (packages/core/src/electron/licenca.ts, verificarRelogio)
 * e mostra qual delas esta no futuro:
 *
 *   ancora = max(licenca.heartbeat, MAX(vendas.data))
 *   trava se  agora < ancora - 48h
 *
 * RODE NA MAQUINA DE DEV, nao na do cliente: ele precisa das chaves do .env
 * (CHAVE_AES/SALT_AES) pra abrir o heartbeat, e essas chaves nao devem sair
 * daqui. Fluxo de suporte: copie da maquina travada os arquivos
 * `licenca.heartbeat` e `database.sqlite` (pasta %APPDATA%\FHVP Tech Assistencia)
 * pra uma pasta qualquer e aponte este script pra ela.
 *
 * Uso:
 *   node scripts/diagnosticar-relogio.js                  (usa o %APPDATA% local)
 *   node scripts/diagnosticar-relogio.js "C:\caminho\da\copia"
 *
 * Somente leitura: nao altera heartbeat, licenca nem banco.
 */
'use strict'

const { createDecipheriv, scryptSync } = require('node:crypto')
const { readFileSync, existsSync, readdirSync, statSync } = require('node:fs')
const { join, dirname } = require('node:path')
const { DatabaseSync } = require('node:sqlite')

const TOLERANCIA_MS = 48 * 60 * 60 * 1000
const RAIZ_APP = dirname(__dirname)

function lerEnv() {
  const caminho = join(RAIZ_APP, '.env')
  if (!existsSync(caminho)) return {}
  const env = {}
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)$/.exec(linha)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

function resolverPasta() {
  const arg = process.argv[2]
  if (arg) return arg
  const roaming = process.env.APPDATA
  if (!roaming) return null
  // Mesma lista do destravar-relogio.bat. Aqui tem um nome so (a assistencia
  // nunca mudou de pasta); fica em forma de lista pra acompanhar o varejo.
  for (const nome of ['FHVP Tech Assistencia']) {
    if (existsSync(join(roaming, nome))) return join(roaming, nome)
  }
  return null
}

// Depois de destravar, o arquivo vivo ja nasceu limpo — quem guarda a data
// envenenada e' o backup (.bkp). E' ele que conta de onde veio o problema,
// entao caimos pro backup mais recente quando o original nao existe.
function acharArquivoHeartbeat(pasta) {
  const vivo = join(pasta, 'licenca.heartbeat')
  if (existsSync(vivo)) return { caminho: vivo, backup: false }
  const backups = readdirSync(pasta)
    .filter((n) => n.startsWith('licenca.heartbeat.'))
    .map((n) => ({ nome: n, mtime: statSync(join(pasta, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (!backups.length) return null
  return { caminho: join(pasta, backups[0].nome), backup: true, nome: backups[0].nome }
}

function lerHeartbeat(pasta, env) {
  const alvo = acharArquivoHeartbeat(pasta)
  if (!alvo) return { estado: 'ausente' }
  if (!env.CHAVE_AES || !env.SALT_AES) {
    return { estado: 'erro', detalhe: 'CHAVE_AES/SALT_AES ausentes no .env' }
  }
  try {
    const cifrado = readFileSync(alvo.caminho, 'utf8').trim()
    const idx = cifrado.indexOf(':')
    if (idx === -1) throw new Error('formato invalido')
    const chave = scryptSync(env.CHAVE_AES, env.SALT_AES, 32)
    const decipher = createDecipheriv('aes-256-cbc', chave, Buffer.from(cifrado.slice(0, idx), 'hex'))
    const claro = Buffer.concat([
      decipher.update(Buffer.from(cifrado.slice(idx + 1), 'hex')),
      decipher.final()
    ]).toString('utf8')
    const ts = JSON.parse(claro).ts
    return typeof ts === 'number'
      ? { estado: 'ok', ts, backup: alvo.backup, nome: alvo.nome }
      : { estado: 'erro', detalhe: 'sem ts' }
  } catch (e) {
    return { estado: 'erro', detalhe: e.message }
  }
}

// Mesma conversao do app: vendas.data e' UTC ('AAAA-MM-DD HH:MM:SS').
function paraMs(texto) {
  const ms = new Date(String(texto).replace(' ', 'T') + 'Z').getTime()
  return isNaN(ms) ? null : ms
}

function lerVendas(pasta, agora) {
  const caminho = join(pasta, 'database.sqlite')
  if (!existsSync(caminho)) return { estado: 'ausente' }
  let db
  try {
    db = new DatabaseSync(caminho, { readOnly: true })
    const max = db.prepare('SELECT MAX(data) AS d FROM vendas').get()
    const futuras = db
      .prepare('SELECT id, data, total FROM vendas WHERE data > ? ORDER BY data DESC LIMIT 10')
      .all(new Date(agora).toISOString().slice(0, 19).replace('T', ' '))
    return { estado: 'ok', maxMs: max && max.d ? paraMs(max.d) : null, maxTexto: max ? max.d : null, futuras }
  } catch (e) {
    return { estado: 'erro', detalhe: e.message }
  } finally {
    if (db) try { db.close() } catch {}
  }
}

// Distancia em relacao a agora, ja com a palavra certa — "3 dias atras" le
// melhor que "-72h a frente" pra quem esta olhando isso as pressas no suporte.
function duracao(ms) {
  const abs = Math.abs(ms)
  return abs < 48 * 3_600_000 ? `${(abs / 3_600_000).toFixed(1)} h` : `${(abs / 86_400_000).toFixed(1)} dias`
}

function humanizar(ms) {
  return `${duracao(ms)} ${ms >= 0 ? 'a frente' : 'atras'}`
}

function main() {
  const pasta = resolverPasta()
  console.log('\n  Diagnostico do guardiao de relogio')
  console.log('  ----------------------------------')
  if (!pasta || !existsSync(pasta)) {
    console.log('  Pasta de dados nao encontrada. Passe o caminho como argumento.')
    process.exitCode = 1
    return
  }

  const agora = Date.now()
  const env = lerEnv()
  const hb = lerHeartbeat(pasta, env)
  const vendas = lerVendas(pasta, agora)

  console.log(`  Pasta : ${pasta}`)
  console.log(`  Agora : ${new Date(agora).toISOString()}  (relogio desta maquina)\n`)

  if (hb.estado === 'ok') {
    const origem = hb.backup ? `  [do backup ${hb.nome} — ja destravado]` : ''
    console.log(`  heartbeat     : ${new Date(hb.ts).toISOString()}   (${humanizar(hb.ts - agora)})${origem}`)
  } else {
    console.log(`  heartbeat     : ${hb.estado}${hb.detalhe ? ' - ' + hb.detalhe : ''}`)
  }

  if (vendas.estado === 'ok') {
    console.log(
      `  MAX(vendas.data): ${vendas.maxTexto || '(sem vendas)'}` +
        (vendas.maxMs ? `   (${humanizar(vendas.maxMs - agora)})` : '')
    )
    if (vendas.futuras && vendas.futuras.length) {
      console.log(`\n  Vendas com data NO FUTURO (${vendas.futuras.length} mostradas):`)
      for (const v of vendas.futuras) console.log(`    #${v.id}  ${v.data}  R$ ${v.total}`)
    }
  } else {
    console.log(`  MAX(vendas.data): ${vendas.estado}${vendas.detalhe ? ' - ' + vendas.detalhe : ''}`)
  }

  const ancora = Math.max(hb.estado === 'ok' ? hb.ts : 0, vendas.maxMs || 0)
  console.log('')
  if (ancora === 0) {
    console.log('  VEREDITO: sem ancora — o guardiao NAO bloqueia (nao e essa a causa).')
    return
  }
  const doHeartbeat = ancora === (hb.ts || 0)
  console.log(
    `  Ancora  : ${new Date(ancora).toISOString()}  ` +
      `(vem ${doHeartbeat ? 'do heartbeat' : 'de uma venda com data no futuro'})`
  )
  console.log(`  Limite  : ${new Date(ancora - TOLERANCIA_MS).toISOString()}  (ancora - 48h)`)
  if (agora < ancora - TOLERANCIA_MS) {
    // Lendo do .bkp o retrato e' de ANTES do destrave — nao confundir o suporte
    // dizendo "bloqueia" sobre uma maquina que ja voltou a abrir.
    const verbo = hb.backup && doHeartbeat ? 'BLOQUEAVA (retrato de antes do destrave)' : 'BLOQUEIA'
    console.log(`\n  VEREDITO: ${verbo}. Faltam ${duracao(ancora - TOLERANCIA_MS - agora)} pro relogio alcancar o limite.`)
    if (doHeartbeat) console.log('  Conserto: destravar-relogio.bat (renomeia o heartbeat) resolve.')
    else console.log('  Conserto: destravar-relogio.bat NAO resolve — a data da venda acima precisa ser corrigida no banco.')
  } else {
    console.log('\n  VEREDITO: NAO bloqueia. Se o sistema pede licenca, a causa e outra')
    console.log('  (licenca expirada, pasta de dados errada, arquivo corrompido).')
  }
}

main()
