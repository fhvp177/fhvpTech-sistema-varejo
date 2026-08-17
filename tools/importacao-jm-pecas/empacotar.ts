// Empacota o database.sqlite importado no formato EXATO que o Restaurador do
// app espera: zip com `database.sqlite` + `metadata.json` na raiz, nome
// backup_AAAA-MM-DD_HH-MM-SS_manual.zip. Usa o mesmo criarZip do core e o mesmo
// formato de nome do BackupManager, pra não haver "quase igual".
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import AdmZip from 'adm-zip'
import { DatabaseSync } from 'node:sqlite'
import { criarZip } from '@fhvptech/core/electron/backup/Compactador'

const DB = process.argv[2] ?? join(process.env.USERPROFILE ?? '', 'Downloads', 'jm_pecas_importado', 'database.sqlite')
const PASTA_SAIDA = process.argv[3] ?? join(process.env.USERPROFILE ?? '', 'Desktop')

if (!existsSync(DB)) throw new Error(`Banco não encontrado: ${DB}`)

const versaoApp = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'apps', 'varejo', 'package.json'), 'utf8')
).version as string

const agora = new Date()
const p = (n: number) => String(n).padStart(2, '0')
const nome =
  `backup_${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}` +
  `_${p(agora.getHours())}-${p(agora.getMinutes())}-${p(agora.getSeconds())}_manual.zip`
const destino = join(PASTA_SAIDA, nome)

const metadata = {
  versao_app: versaoApp,
  data: agora.toISOString(),
  tipo: 'manual',
  tamanho_db_bytes: statSync(DB).size
}

async function main(): Promise<void> {
const r = await criarZip(DB, destino, metadata)
if (!r.sucesso) throw new Error(`Falha ao compactar: ${r.erro}`)

// ---- prova de que o Restaurador vai aceitar: repete o caminho dele ----
console.log(`zip: ${destino}  (${((r.tamanhoBytes ?? 0) / 1024).toFixed(0)} KB)`)
console.log(`metadata: ${JSON.stringify(metadata)}`)

const zip = new AdmZip(destino)
const entradas = zip.getEntries().map((e) => e.entryName).sort()
console.log(`entradas: ${entradas.join(', ')}`)
if (entradas.join(',') !== 'database.sqlite,metadata.json') {
  throw new Error('O zip não tem exatamente as duas entradas esperadas.')
}

const temp = join(dirname(destino), `_conferencia_${Date.now()}`)
zip.extractAllTo(temp, true)
const extraido = join(temp, 'database.sqlite')

// validarSQLite() do Restaurador exige estas quatro tabelas.
const db = new DatabaseSync(extraido, { readOnly: true })
const tabelas = new Set(
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
    .map((t) => t.name)
)
for (const obrigatoria of ['produtos', 'clientes', 'vendas', 'config']) {
  if (!tabelas.has(obrigatoria)) throw new Error(`validarSQLite recusaria: falta "${obrigatoria}"`)
}
const n = (sql: string) => Number(Object.values(db.prepare(sql).get() as object)[0])
console.log(
  `conteúdo do zip: ${n('SELECT COUNT(*) FROM produtos')} produtos, ` +
    `${n('SELECT COUNT(*) FROM vendas')} vendas, ` +
    `${n('SELECT COUNT(*) FROM itens_venda')} itens, ` +
    `${n('SELECT COUNT(*) FROM devolucoes')} devoluções, ` +
    `${n('SELECT COUNT(*) FROM _migrations')} migrations`
)
const dono = db.prepare("SELECT nome FROM vendedores WHERE papel='dono'").get() as { nome: string }
console.log(`dono: ${dono.nome} | loja: ${(db.prepare("SELECT valor FROM config WHERE chave='loja_nome'").get() as { valor: string }).valor}`)
db.close()
rmSync(temp, { recursive: true, force: true })

console.log('\n✔ zip válido — o Restaurador aceita este arquivo')
console.log(`\nComo usar: copiar para a subpasta "manuais" da pasta de backups na`)
console.log(`máquina do cliente → Tela de Restauração → senha de técnico.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
