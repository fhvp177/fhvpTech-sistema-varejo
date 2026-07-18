/**
 * CLI para configurar a senha de restauração de backup.
 *
 * A senha é lida de process.env.CHAVE_SECRETA_RESTAURACAO para evitar
 * que apareça no histórico do terminal ou em logs do processo.
 *
 * Uso (Windows):
 *   set CHAVE_SECRETA_RESTAURACAO=sua-senha-aqui
 *   npm run senha:gerar
 *
 *   Ou especificando o banco manualmente:
 *   npm run senha:gerar -- --db "C:\Users\Joao\AppData\Roaming\Sistema RT\database.sqlite"
 *
 * Uso (Linux/macOS):
 *   CHAVE_SECRETA_RESTAURACAO=sua-senha npm run senha:gerar
 */

import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'

const BCRYPT_ROUNDS = 12
const CHAVE_HASH = 'backup_hash_senha_restauracao'

// ─── Resolução do caminho do banco ────────────────────────────────────────────

function resolverCaminhoDb(): string {
  const argDb = process.argv.find((a) => a.startsWith('--db='))?.slice(5) ??
                process.argv[process.argv.indexOf('--db') + 1]

  if (argDb && argDb !== 'undefined') return argDb

  // Caminho padrão do Electron (app.getPath('userData')) por plataforma.
  // O nome da pasta mudou ao longo das versões (ver electron/pastaDadosLogica.ts):
  // procura na ordem oficial → legadas e usa a primeira que tem banco.
  const nomes = ['FHVP Tech Varejo', 'Sistema RT', 'sistema-rt']
  let basePorPlataforma: string
  if (process.platform === 'win32') {
    basePorPlataforma = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  } else if (process.platform === 'darwin') {
    basePorPlataforma = join(homedir(), 'Library', 'Application Support')
  } else {
    basePorPlataforma = join(homedir(), '.config')
  }
  const candidatos = nomes.map((nome) => join(basePorPlataforma, nome, 'database.sqlite'))
  return candidatos.find((c) => existsSync(c)) ?? candidatos[0]
}

// ─── Script principal ─────────────────────────────────────────────────────────

async function main() {
  const senha = process.env.CHAVE_SECRETA_RESTAURACAO?.trim()

  if (!senha) {
    console.error('Erro: variável de ambiente CHAVE_SECRETA_RESTAURACAO não definida.')
    console.error('  Windows: set CHAVE_SECRETA_RESTAURACAO=sua-senha && npm run senha:gerar')
    console.error('  Linux/Mac: CHAVE_SECRETA_RESTAURACAO=sua-senha npm run senha:gerar')
    process.exit(1)
  }

  if (senha.length < 8) {
    console.error('Erro: a senha deve ter pelo menos 8 caracteres.')
    process.exit(1)
  }

  const caminhoDb = resolverCaminhoDb()

  if (!existsSync(caminhoDb)) {
    console.error(`Erro: banco de dados não encontrado em:\n  ${caminhoDb}`)
    console.error('Use --db "caminho/para/database.sqlite" para especificar o caminho.')
    process.exit(1)
  }

  console.log(`Banco de dados: ${caminhoDb}`)
  console.log('Gerando hash bcrypt (pode levar alguns segundos)...')

  const hash = await bcrypt.hash(senha, BCRYPT_ROUNDS)

  const db = new Database(caminhoDb)

  try {
    // INSERT OR REPLACE garante atualização se a chave já existir
    db.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').run(CHAVE_HASH, hash)
    console.log('Senha de restauração configurada com sucesso!')
    console.log('O sistema já pode usar a senha para liberar a tela de restauração.')
    console.log('')
    console.log('─── Hash para embutir na migration (Opção B) ────────────────────')
    console.log(hash)
    console.log('─────────────────────────────────────────────────────────────────')
  } finally {
    db.close()
  }
}

main().catch((err) => {
  console.error('Erro inesperado:', err)
  process.exit(1)
})
