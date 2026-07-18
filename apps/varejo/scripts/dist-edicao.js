// Empacota e publica UMA edição (basico|pro) no canal dela do R2.
//
// Uso:  node scripts/dist-edicao.js basico          → build + publica no R2
//       node scripts/dist-edicao.js pro --dir        → só empacota (ensaio, sem upload)
//       TRANSICAO_GITHUB=1 ... basico                → publica no R2 E no GitHub
//
// Lê as credenciais R2_* do .env (mesmo arquivo dos segredos de licença, fora
// do git) e roda o build do electron-vite com a EDICAO certa — é aí que o
// tree-shaking remove do binário as features fora do plano.
const { spawnSync } = require('node:child_process')
const { readFileSync, rmSync } = require('node:fs')
const path = require('node:path')

const edicao = process.argv[2]
if (edicao !== 'basico' && edicao !== 'pro') {
  console.error('Uso: node scripts/dist-edicao.js <basico|pro> [--dir]')
  process.exit(1)
}
const soEmpacotar = process.argv.includes('--dir')

// Carrega o .env sem sobrescrever o que já veio do ambiente
for (const linha of readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
}
for (const chave of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT']) {
  if (!process.env[chave]) {
    console.error(`[dist-edicao] Falta ${chave} no apps/varejo/.env`)
    process.exit(1)
  }
}

const env = { ...process.env, EDICAO: edicao }

function rodar(cmd, args) {
  console.log(`\n[dist-edicao:${edicao}] ${cmd} ${args.join(' ')}`)
  // cwd fixo na raiz do app + caminhos relativos nos args: com shell:true no
  // Windows, um caminho absoluto com espaço ("FHVP Tech - Apps") seria partido.
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    env,
    cwd: path.join(__dirname, '..'),
    shell: process.platform === 'win32'
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

// Limpa a saída da edição: o electron-builder não remove instaladores de
// versões anteriores, e sobras já fizeram o publicar-r2 subir o exe errado.
rmSync(path.join(__dirname, '..', 'dist', edicao), { recursive: true, force: true })

rodar('npm', ['run', 'build'])
// O electron-builder SÓ empacota (--publish never): o upload é do publicar-r2.js,
// porque o publisher S3 embutido (app-builder/Go) falha no multiparte com o R2.
rodar('npx', [
  'electron-builder',
  '--win',
  '--config',
  'build-edicoes.config.js',
  ...(soEmpacotar ? ['--dir'] : ['--publish', 'never'])
])
if (!soEmpacotar) rodar('node', ['scripts/publicar-r2.js', edicao])
console.log(`\n[dist-edicao:${edicao}] pronto — saída em dist/${edicao}`)
