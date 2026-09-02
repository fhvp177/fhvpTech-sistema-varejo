/**
 * Publica a versão atual em TODAS as lojas hospedadas.
 *
 * Uso:
 *   node scripts/publicar-lojas.js            # lista o que faria, sem fazer
 *   node scripts/publicar-lojas.js --publicar # publica de verdade
 *   node scripts/publicar-lojas.js --publicar --so fhvp-netoimports
 *
 * ── Por que existe ───────────────────────────────────────────────────────────
 * Cada loja hospedada é um app próprio no Fly (uma loja, uma máquina, um
 * disco — ver o cabeçalho de servidor/index.ts). Isso é ótimo para isolamento e
 * péssimo para publicar: com dez lojas são dez comandos, e basta um falhar no
 * meio para metade ficar numa versão e metade noutra — sem ninguém perceber,
 * porque o terminal já rolou.
 *
 * Aqui a lista sai do próprio Fly, cada loja é publicada em sequência, e no fim
 * há um resumo do que subiu e do que não subiu.
 *
 * ── Uma de cada vez, de propósito ────────────────────────────────────────────
 * Publicar em paralelo seria mais rápido e bem pior: cada `fly deploy` derruba
 * e sobe a máquina daquela loja, e o boot aplica migrations. Falhando em
 * paralelo, várias lojas ficam meio-migradas ao mesmo tempo e não há como saber
 * a ordem dos acontecimentos no registro. Em sequência, a primeira falha
 * interrompe tudo e as lojas seguintes continuam intactas na versão anterior.
 *
 * ── Confere antes de sair publicando ─────────────────────────────────────────
 * Sem `--publicar`, só mostra a lista. Publicar em produção não deve ser o que
 * acontece quando se erra o comando.
 */
const { existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const APP = resolve(__dirname, '..')
// Relativo, e não absoluto, de propósito: no Windows o `spawn` com shell passa
// os argumentos por dentro do cmd, e o caminho deste repositório tem espaços
// ("FHVP Tech - Apps"). Absoluto, ele chegava ao `fly` quebrado em três
// argumentos — "accepts at most 1 arg(s), received 3". Como o comando roda com
// `cwd` na pasta do app, o nome simples basta.
const CONFIG = 'fly.loja.toml'

/**
 * Toda loja hospedada é um app cujo nome começa assim. É convenção, e é a
 * única coisa que separa uma loja do backend de licenças (`licenca-gnmodas`)
 * na mesma conta. App novo que fuja disto não recebe atualização — e o modo de
 * falha é silencioso, então o nome importa.
 */
const PREFIXO = 'fhvp-'

const publicar = process.argv.includes('--publicar')
const soIndice = process.argv.indexOf('--so')
const soEsta = soIndice > -1 ? process.argv[soIndice + 1] : null

const versao = require(join(APP, 'package.json')).version
const win = process.platform === 'win32'

function lojasHospedadas() {
  const saida = execFileSync('fly', ['apps', 'list', '--json'], {
    encoding: 'utf8',
    shell: win,
    maxBuffer: 10 * 1024 * 1024
  })
  return JSON.parse(saida)
    .map((a) => a.Name ?? a.name)
    .filter((nome) => typeof nome === 'string' && nome.startsWith(PREFIXO))
    .filter((nome) => !soEsta || nome === soEsta)
    .sort()
}

function principal() {
  if (!existsSync(join(APP, 'dist-servidor', 'servidor.mjs'))) {
    console.error('[publicar-lojas] Falta compilar. Rode antes:  npm run build:web')
    process.exit(1)
  }

  const lojas = lojasHospedadas()
  if (lojas.length === 0) {
    console.error(`[publicar-lojas] Nenhuma loja encontrada com o prefixo "${PREFIXO}".`)
    process.exit(1)
  }

  console.log(`\n  Versão a publicar: ${versao}`)
  console.log(`  Lojas (${lojas.length}): ${lojas.join(', ')}\n`)

  if (!publicar) {
    console.log('  Isto foi só a lista. Para publicar de verdade:')
    console.log('    node scripts/publicar-lojas.js --publicar\n')
    return
  }

  const feitas = []
  for (const loja of lojas) {
    console.log(`\n── ${loja} ${'─'.repeat(Math.max(0, 60 - loja.length))}`)
    const r = spawnSync(
      'fly',
      ['deploy', '--config', CONFIG, '--app', loja, '--yes'],
      { cwd: APP, stdio: 'inherit', shell: win }
    )

    if (r.status !== 0) {
      // Para na primeira falha: as lojas seguintes continuam na versão
      // anterior, que é um estado conhecido. Seguir em frente espalharia a
      // dúvida por todas.
      console.error(`\n[publicar-lojas] ${loja} FALHOU. Parando aqui.`)
      console.error(`[publicar-lojas] Publicadas antes desta: ${feitas.join(', ') || 'nenhuma'}`)
      console.error(`[publicar-lojas] Intactas na versão anterior: ${
        lojas.slice(lojas.indexOf(loja) + 1).join(', ') || 'nenhuma'
      }`)
      process.exit(1)
    }
    feitas.push(loja)
  }

  console.log(`\n  ${feitas.length} loja(s) na versão ${versao}: ${feitas.join(', ')}`)
  console.log('\n  Confira o backup de cada uma com:')
  for (const loja of feitas) {
    console.log(`    fly logs --app ${loja} --no-tail | grep -E "cópia guardada|migration"`)
  }
  console.log('')
}

principal()
