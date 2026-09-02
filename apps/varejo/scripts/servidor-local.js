/**
 * Sobe o servidor web AQUI na máquina de desenvolvimento.
 *
 * ── Por que não é só `node dist-servidor/servidor.mjs` ───────────────────────
 * O `better-sqlite3` é um binário compilado, e é compilado para UM motor. O do
 * `node_modules` deste repositório foi construído para o Electron (é o que o
 * `electron-builder install-app-deps` faz), então o Node comum recusa carregá-lo:
 * "compiled against a different Node.js version".
 *
 * Reconstruir o compartilhado resolveria o servidor e quebraria o aplicativo —
 * e vice-versa, para sempre. Então existe uma segunda cópia, só de dev, na
 * pasta `.servidor-local`. O Node procura `node_modules` a partir da pasta do
 * arquivo e vai subindo: rodando o servidor de lá, ele acha primeiro o
 * better-sqlite3 do Node, e continua achando o resto (bcryptjs, adm-zip) aqui
 * em cima. Nenhum dos dois lados sabe do outro.
 *
 * Em produção nada disso existe: o contêiner instala as dependências para o
 * Node e pronto.
 *
 * Uso:
 *   npm run build:web
 *   npm run servidor:local
 *
 * Variáveis: FHVP_DADOS (pasta da loja), PORT (padrão 8080).
 */
const { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } = require('fs')
const { join, resolve } = require('path')
const { execFileSync, spawn } = require('child_process')

const APP = resolve(__dirname, '..')
const SOMBRA = join(APP, '.servidor-local')
const BUNDLE = join(APP, 'dist-servidor', 'servidor.mjs')

if (!existsSync(BUNDLE)) {
  console.error('[fhvp] Falta compilar. Rode antes:  npm run build:web')
  process.exit(1)
}

if (!existsSync(join(SOMBRA, 'node_modules', 'better-sqlite3'))) {
  console.log('[fhvp] Preparando o better-sqlite3 do Node (uma vez só)...')
  mkdirSync(SOMBRA, { recursive: true })
  writeFileSync(
    join(SOMBRA, 'package.json'),
    JSON.stringify(
      {
        name: 'fhvp-servidor-local',
        private: true,
        type: 'module',
        description: 'Sombra de dev: better-sqlite3 para o Node, sem tocar no do Electron.',
        dependencies: { 'better-sqlite3': '^12.10.0' }
      },
      null,
      2
    ) + '\n'
  )
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: SOMBRA,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
}

copyFileSync(BUNDLE, join(SOMBRA, 'servidor.mjs'))

// ── Segredos vêm do .env ────────────────────────────────────────────────────
// As chaves de licença deixaram de ser assadas no pacote e passaram a ser lidas
// do ambiente, para a imagem do contêiner não carregar segredo. O efeito
// colateral é este: rodando na mão, elas precisam vir de algum lugar — e o
// lugar é o mesmo .env que já gera os instaladores.
//
// Sem isto o servidor recusa subir, dizendo quais faltam. Recusar é o certo (um
// servidor com chave `undefined` reprovaria toda licença, e o lojista veria
// "sua licença venceu"), mas em desenvolvimento não deve haver o que faltar.
const doEnv = {}
const arquivoEnv = resolve(APP, '.env')
if (existsSync(arquivoEnv)) {
  for (const linha of readFileSync(arquivoEnv, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m) doEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

// O backup na nuvem usa o token do bucket privado, não o que publica
// instalador — no .env eles têm nomes diferentes de propósito.
const backupR2 = {}
if (doEnv.R2_BACKUPS_ACCESS_KEY_ID) {
  backupR2.R2_ACCESS_KEY_ID = doEnv.R2_BACKUPS_ACCESS_KEY_ID
  backupR2.R2_SECRET_ACCESS_KEY = doEnv.R2_BACKUPS_SECRET_ACCESS_KEY
}

spawn(process.execPath, [join(SOMBRA, 'servidor.mjs')], {
  stdio: 'inherit',
  env: {
    CHAVE_HMAC: doEnv.CHAVE_HMAC,
    CHAVE_AES: doEnv.CHAVE_AES,
    SALT_AES: doEnv.SALT_AES,
    R2_ACCOUNT_ID: doEnv.R2_ACCOUNT_ID,
    ...backupR2,
    // O de verdade fica de fora por padrão: desenvolvimento não deve sujar o
    // bucket de produção com backup de banco de teste. Defina na mão se quiser
    // exercitar o envio.
    ...process.env,
    FHVP_WEB: process.env.FHVP_WEB ?? join(APP, 'dist-web'),
    FHVP_DADOS: process.env.FHVP_DADOS ?? join(APP, '.servidor-local', 'dados')
  }
}).on('exit', (codigo) => process.exit(codigo ?? 0))
