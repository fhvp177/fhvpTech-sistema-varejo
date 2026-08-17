// Gera o banco pós-boot num arquivo temporário e imprime o schema final —
// serve pra escrever o importador contra o schema REAL, não contra memória.
import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { criarBancoPosBoot } from './bancoBase'

const caminho = join(tmpdir(), `posboot_${Date.now()}.sqlite`)
const db = criarBancoPosBoot(caminho)

const tabelas = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as Array<{ name: string; sql: string }>

console.log(`=== ${tabelas.length} tabelas ===\n`)
for (const t of tabelas) console.log(`${t.sql};\n`)

const migs = db.prepare('SELECT nome FROM _migrations ORDER BY id').all() as Array<{ nome: string }>
console.log(`=== migrations carimbadas: ${migs.length} ===`)
console.log(migs.map((m) => m.nome).join(', '))

const cfg = db.prepare('SELECT chave, valor FROM config ORDER BY chave').all() as Array<{ chave: string; valor: string }>
console.log(`\n=== config semeada (${cfg.length}) ===`)
for (const c of cfg) console.log(`${c.chave} = ${String(c.valor).slice(0, 60)}`)

const cats = db.prepare('SELECT id, nome, usa_tamanhos FROM categorias ORDER BY id').all()
console.log('\n=== categorias ===')
console.log(JSON.stringify(cats))

db.close()
if (existsSync(caminho)) rmSync(caminho, { force: true })
