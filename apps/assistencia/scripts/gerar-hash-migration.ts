/**
 * Gera o hash bcrypt da senha de restauração para ser embutido na migration.
 * Não acessa o banco de dados — apenas imprime o hash na tela.
 *
 * Uso (Windows):
 *   set CHAVE_SECRETA_RESTAURACAO=sua-senha && npm run hash:gerar
 * Uso (Linux/macOS):
 *   CHAVE_SECRETA_RESTAURACAO=sua-senha npm run hash:gerar
 */

import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12

async function main() {
  const senha = process.env.CHAVE_SECRETA_RESTAURACAO?.trim()

  if (!senha) {
    console.error('Erro: variável CHAVE_SECRETA_RESTAURACAO não definida.')
    process.exit(1)
  }

  if (senha.length < 8) {
    console.error('Erro: a senha deve ter pelo menos 8 caracteres.')
    process.exit(1)
  }

  console.log('Gerando hash bcrypt (pode levar alguns segundos)...')
  const hash = await bcrypt.hash(senha, BCRYPT_ROUNDS)

  console.log('')
  console.log('─── Hash para a migration ────────────────────────────────────────')
  console.log(hash)
  console.log('──────────────────────────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('Erro:', err)
  process.exit(1)
})
