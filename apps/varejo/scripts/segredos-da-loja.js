/**
 * Manda para uma loja hospedada os segredos que ela precisa.
 *
 * Uso:  node scripts/segredos-da-loja.js fhvp-netoimports
 *
 * ── Por que um script, e não `fly secrets set` na mão ────────────────────────
 * Duas razões, e a segunda é a que importa.
 *
 * A primeira é lembrança: são sete variáveis, e esquecer uma não dá erro
 * visível — dá uma loja que abre pedindo ativação (faltou chave de licença) ou
 * que roda meses sem backup nenhum (faltou credencial do R2). Aqui a lista é
 * conferida antes de sair.
 *
 * A segunda é que valor em linha de comando fica no histórico do terminal, para
 * sempre, em texto puro. Este script escreve um arquivo temporário, entrega ao
 * `fly secrets import` pela entrada padrão e apaga em seguida — nenhum segredo
 * aparece num comando.
 *
 * ── O par de credenciais do R2 que confunde ──────────────────────────────────
 * São DOIS tokens diferentes, e trocá-los é fácil:
 *
 *   R2_ACCESS_KEY_ID          → publica INSTALADOR no bucket público
 *   R2_BACKUPS_ACCESS_KEY_ID  → grava BACKUP no bucket privado
 *
 * A loja recebe o segundo, sob o nome que o servidor procura. Mandar o primeiro
 * daria à loja permissão de sobrescrever o instalador que todos os clientes
 * baixam.
 */
const { existsSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { execFileSync } = require('node:child_process')

const loja = process.argv[2]
if (!loja) {
  console.error('Uso: node scripts/segredos-da-loja.js <nome-do-app-no-fly>')
  process.exit(1)
}

const arquivoEnv = resolve(__dirname, '..', '.env')
if (!existsSync(arquivoEnv)) {
  console.error(`[segredos] .env não encontrado em ${arquivoEnv}`)
  process.exit(1)
}

const env = {}
for (const linha of readFileSync(arquivoEnv, 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

/** O que a loja recebe → de onde sai no .env. */
const MAPA = {
  CHAVE_HMAC: 'CHAVE_HMAC',
  CHAVE_AES: 'CHAVE_AES',
  SALT_AES: 'SALT_AES',
  R2_ACCOUNT_ID: 'R2_ACCOUNT_ID',
  R2_ACCESS_KEY_ID: 'R2_BACKUPS_ACCESS_KEY_ID',
  R2_SECRET_ACCESS_KEY: 'R2_BACKUPS_SECRET_ACCESS_KEY',
  R2_BUCKET_BACKUPS: 'R2_BUCKET_BACKUPS'
}

const faltando = Object.entries(MAPA)
  .filter(([, origem]) => !env[origem])
  .map(([, origem]) => origem)

if (faltando.length > 0) {
  console.error(`[segredos] faltam no .env: ${faltando.join(', ')}`)
  process.exit(1)
}

const pasta = mkdtempSync(join(tmpdir(), 'fhvp-segredos-'))
const arquivo = join(pasta, 'segredos.env')

try {
  writeFileSync(
    arquivo,
    Object.entries(MAPA)
      .map(([destino, origem]) => `${destino}=${env[origem]}`)
      .join('\n') + '\n',
    'utf8'
  )

  console.log(`[segredos] enviando ${Object.keys(MAPA).length} variáveis para ${loja}...`)
  execFileSync('fly', ['secrets', 'import', '--app', loja], {
    input: readFileSync(arquivo),
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32'
  })
  console.log(`[segredos] pronto. Confira com: fly secrets list --app ${loja}`)
} finally {
  // Apaga mesmo se o envio falhar — o arquivo não pode sobreviver ao erro.
  try {
    unlinkSync(arquivo)
  } catch {
    /* já não existe */
  }
}
