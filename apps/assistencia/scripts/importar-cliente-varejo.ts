/**
 * Converte o backup de um cliente do VAREJO num backup restaurável na
 * ASSISTÊNCIA.
 *
 * Uso:  npx tsx scripts/importar-cliente-varejo.ts <backup.zip> <saida.zip> [--aplicar]
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 * O backup do varejo já restaura na assistência: as migrations casam por NOME, e
 * as 8 próprias do nicho rodam por cima sozinhas no primeiro boot. O que NÃO sai
 * de graça é a classificação: no varejo o cliente cadastrou os serviços como
 * produtos-fantasma (estoque 100, custo zero) porque não havia outro jeito, e
 * restaurar cru deixaria todos eles como mercadoria.
 *
 * Este script roda as migrations REAIS do app (não uma cópia do SQL) e aplica a
 * classificação decidida com o dono, para que a restauração seja um passo só.
 *
 * ── Sem `--aplicar` ele não grava nada ───────────────────────────────────────
 * O padrão é ensaio: mostra o que faria e sai. Converter banco de cliente é
 * operação de uma vez só, e o modo seguro tem que ser o que acontece quando
 * alguém roda sem ler.
 */
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { MIGRATIONS } from '../electron/backup/migrations'
import { executarMigrations } from '@fhvptech/core/electron/db/migrations'
// Zip pelas MESMAS funções que o app usa pra fazer e restaurar backup — assim o
// arquivo gerado aqui é indistinguível de um backup nascido no próprio sistema.
import { criarZip, extrairZip } from '@fhvptech/core/electron/backup/Compactador'

// ── Decisões tomadas com o dono (2026-08-17) ────────────────────────────────
//
// Os 24 cadastros que na verdade são MÃO DE OBRA. Vinte e três saltam aos olhos
// pelo nome e pelo estoque redondo (100, 99, 98…) com custo zero; o último,
// PASTA TÉRMICA - REPOSIÇÃO, foi decisão do dono — na casa dele o item é o ato
// de reaplicar a pasta, não o tubo vendido à parte.
const SERVICOS: Record<number, string> = {
  5: 'SERVIÇO DE CFTV',
  6: 'SERVIÇO DE INTERNET',
  7: 'INTERNET 100',
  8: 'INTERNET 80',
  9: 'INTERNET 70',
  11: 'FORMATAÇÃO',
  12: 'ATIVAÇÃO DO WINDOWS',
  13: 'ATIVAÇÃO DO PACOTE DA MICROSOFT',
  23: 'SISTEMA ASSOCIAÇÃO - AGUÁ',
  25: 'REPARO DVR',
  29: 'RESET IMPRESSORA',
  30: 'RESET IMPRESSORA + LIMPEZA DA ALMOFADA',
  31: 'FORMATAÇÃO E INSTALAÇÃO DO WINDOWS',
  32: 'FORMATAÇÃO E INSTALAÇÃO DO WINDOWS + BACKUP',
  33: 'CONCERTO DATA SHOW',
  37: 'CONCERTO IMPRESSORA',
  45: 'SERVIÇO DE MANUTENÇÃO (placa fonte + cabeça de impressão)',
  47: 'IMPOSTO DE RENDA',
  51: 'LIMPEZA DESKTOP',
  52: 'PASTA TERMICA - REPOSIÇÃO',
  60: 'FRETE',
  81: 'SERVIÇO DE INTERNET',
  87: 'SERVIÇO',
  89: 'SERVIÇO'
}

// Preço e custo trocados na digitação. O dono confirmou o preço de venda (o
// valor que estava no campo errado) e pediu custo zero, como no resto do
// cadastro dele. Sem isto o relatório de lucro nasce com prejuízo falso.
const PRECOS_CORRIGIDOS: Record<number, { nome: string; preco: number; custo: number }> = {
  34: { nome: 'SSD MV240GB MACROVIP', preco: 347, custo: 0 },
  35: { nome: 'HD THOHIBA 500GB SLIM', preco: 280, custo: 0 }
}

// ── Adaptador node:sqlite → cara de better-sqlite3 ──────────────────────────
// As migrations recebem um `Database.Database`, mas só usam exec/prepare/
// transaction. O better-sqlite3 do repo é compilado pro ABI do Electron e não
// carrega aqui — mesmo truque dos testes de migration.
function adaptar(db: DatabaseSync): Database.Database {
  let profundidade = 0
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      const st = db.prepare(sql)
      return {
        run: (...a: unknown[]) => st.run(...(a as never[])),
        get: (...a: unknown[]) => st.get(...(a as never[])),
        all: (...a: unknown[]) => st.all(...(a as never[]))
      }
    },
    transaction:
      (fn: (...a: never[]) => unknown) =>
      (...args: never[]) => {
        const sp = `sp_${profundidade}`
        db.exec(profundidade === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
        profundidade++
        try {
          const r = fn(...args)
          profundidade--
          db.exec(profundidade === 0 ? 'COMMIT' : `RELEASE ${sp}`)
          return r
        } catch (e) {
          profundidade--
          db.exec(profundidade === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
          throw e
        }
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const zipEntrada = process.argv[2]
const zipSaida = process.argv[3]
const aplicar = process.argv.includes('--aplicar')
if (!zipEntrada || !zipSaida) {
  console.error('Uso: npx tsx scripts/importar-cliente-varejo.ts <backup.zip> <saida.zip> [--aplicar]')
  process.exit(1)
}

const trabalho = mkdtempSync(path.join(tmpdir(), 'import-varejo-'))
const extracao = extrairZip(path.resolve(zipEntrada), trabalho)
if (!extracao.sucesso || !extracao.caminhoDb || !existsSync(extracao.caminhoDb)) {
  console.error(`Não consegui abrir o backup: ${extracao.erro ?? 'database.sqlite não encontrado'}`)
  process.exit(1)
}
const dbPath = extracao.caminhoDb
console.log(`origem: ${path.basename(zipEntrada)}  (app ${extracao.metadata?.versao_app ?? '?'}, ${extracao.metadata?.data?.slice(0, 10) ?? '?'})`)

const db = new DatabaseSync(dbPath)
const ad = adaptar(db)

const conta = (sql: string): number => (db.prepare(sql).get() as Record<string, number>).n

console.log('\n── ANTES ──────────────────────────────────────────────')
console.log(`  produtos ${conta('SELECT COUNT(*) n FROM produtos')} · vendas ${conta('SELECT COUNT(*) n FROM vendas')} · clientes ${conta('SELECT COUNT(*) n FROM clientes')} · itens ${conta('SELECT COUNT(*) n FROM itens_venda')}`)
const migsAntes = conta('SELECT COUNT(*) n FROM _migrations')
console.log(`  migrations registradas: ${migsAntes}`)

console.log('\n── MIGRATIONS DA ASSISTÊNCIA ──────────────────────────')
executarMigrations(ad, MIGRATIONS)
const migsDepois = conta('SELECT COUNT(*) n FROM _migrations')
console.log(`  ${migsDepois - migsAntes} aplicadas (${migsAntes} → ${migsDepois})`)

console.log('\n── CLASSIFICAÇÃO ──────────────────────────────────────')
const marcar = db.prepare(
  // Serviço não tem estoque nem código de barras — é a mesma regra que o
  // cadastro da assistência impõe. A `referencia` FICA: lá ela é atalho de
  // digitação no PDV, e serviço tem direito a ela.
  "UPDATE produtos SET tipo = 'servico', estoque = 0, codigo_barras = NULL, fornecedor_id = NULL WHERE id = ?"
)
let marcados = 0
for (const [id, nome] of Object.entries(SERVICOS)) {
  const antes = db.prepare('SELECT nome, estoque FROM produtos WHERE id = ?').get(Number(id)) as
    | { nome: string; estoque: number }
    | undefined
  if (!antes) {
    console.log(`  ⚠️  #${id} não existe mais no banco (${nome}) — pulado`)
    continue
  }
  console.log(`  #${id.padStart(2)} estoque ${String(antes.estoque).padStart(3)} → 0   ${antes.nome}`)
  marcar.run(Number(id))
  marcados++
}
console.log(`  ${marcados} cadastros viraram SERVIÇO`)

console.log('\n── PREÇO/CUSTO CORRIGIDOS ─────────────────────────────')
for (const [id, alvo] of Object.entries(PRECOS_CORRIGIDOS)) {
  const antes = db.prepare('SELECT nome, preco, custo FROM produtos WHERE id = ?').get(Number(id)) as
    | { nome: string; preco: number; custo: number }
    | undefined
  if (!antes) continue
  console.log(`  #${id} ${antes.nome}`)
  console.log(`       preço ${antes.preco.toFixed(2)} → ${alvo.preco.toFixed(2)}   custo ${antes.custo.toFixed(2)} → ${alvo.custo.toFixed(2)}`)
  db.prepare('UPDATE produtos SET preco = ?, custo = ? WHERE id = ?').run(alvo.preco, alvo.custo, Number(id))
}

console.log('\n── DEPOIS ─────────────────────────────────────────────')
console.log(`  produtos ${conta('SELECT COUNT(*) n FROM produtos')} (serviço: ${conta("SELECT COUNT(*) n FROM produtos WHERE tipo='servico'")} · peça: ${conta("SELECT COUNT(*) n FROM produtos WHERE tipo='produto'")})`)
console.log(`  vendas ${conta('SELECT COUNT(*) n FROM vendas')} · itens ${conta('SELECT COUNT(*) n FROM itens_venda')} · clientes ${conta('SELECT COUNT(*) n FROM clientes')}`)
console.log(`  serviço com estoque sobrando: ${conta("SELECT COUNT(*) n FROM produtos WHERE tipo='servico' AND estoque<>0")} (tem que ser 0)`)
console.log(`  integridade: ${(db.prepare('PRAGMA integrity_check').get() as Record<string, string>).integrity_check}`)

db.close()

if (!aplicar) {
  console.log('\n[ENSAIO] Nada foi gravado. Rode de novo com --aplicar para gerar o zip.')
  rmSync(trabalho, { recursive: true, force: true })
  process.exit(0)
}

// ── Reempacota no formato que a tela de Restauração espera ──────────────────
// Dentro de uma função async porque `criarZip` é assíncrona e o tsx compila
// este arquivo como CommonJS, onde `await` de topo não existe.
void (async () => {
  const saida = path.resolve(zipSaida)
  rmSync(saida, { force: true })
  const r = await criarZip(dbPath, saida, {
    versao_app: '0.1.0',
    data: new Date().toISOString(),
    tipo: 'manual',
    tamanho_db_bytes: readFileSync(dbPath).length
  })
  if (!r.sucesso) {
    console.error(`Falhou ao gerar o zip: ${r.erro}`)
    process.exit(1)
  }
  // Uma cópia solta do .sqlite ao lado, para conferência sem descompactar.
  copyFileSync(dbPath, saida.replace(/\.zip$/, '.sqlite'))
  rmSync(trabalho, { recursive: true, force: true })
  console.log(`
✓ gerado: ${saida}  (${((r.tamanhoBytes ?? 0) / 1024).toFixed(0)} KB)`)
})()
