const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const { buildSync } = require('esbuild')

const raiz = path.resolve(__dirname, '../..')
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'reabertura-codex-'))
const bundle = path.join(pasta, 'encerramento.cjs')
buildSync({
  entryPoints: [path.join(raiz, 'packages/core/src/electron/encerramentoJanela.ts')],
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', external: ['electron']
})
const executavel = require('electron')
const processos = []
const esperar = ms => new Promise(r => setTimeout(r, ms))
async function ate(condicao, limite = 15000) {
  const inicio = Date.now()
  while (!condicao()) {
    if (Date.now() - inicio > limite) throw new Error('Tempo esgotado na verificação isolada.')
    await esperar(100)
  }
}
function eventos(p) {
  const log = path.join(p, 'eventos.log')
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : ''
}
function iniciar(p, modo) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const filho = spawn(executavel, [path.join(__dirname, 'cenario.cjs'), p, modo, bundle], {
    env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']
  })
  let erros = ''
  filho.stderr.on('data', b => { erros += b.toString() })
  filho.on('error', e => { erros += e.message })
  processos.push({ filho, pasta: p })
  return { filho, erros: () => erros }
}

;(async () => {
  try {
    for (const modo of ['antigo', 'corrigido']) {
      const p = path.join(pasta, modo)
      fs.mkdirSync(p, { recursive: true })
      const principal = iniciar(p, modo)
      await ate(() => eventos(p).includes('principal-fechada'))
      if (modo === 'corrigido') await ate(() => principal.filho.exitCode !== null)
      const sonda = iniciar(p, 'sonda')
      await ate(() => sonda.filho.exitCode !== null)
      if (modo === 'antigo') {
        assert.equal(principal.filho.exitCode, null, 'A reprodução antiga deveria permanecer viva sem janela principal.')
        assert(eventos(p).includes('sonda-bloqueada'), 'A reprodução antiga deveria impedir reabrir.')
      } else {
        assert(eventos(p).includes('sonda-abriu'), 'A correção deve liberar a próxima abertura.')
        assert.equal(principal.filho.exitCode, 0)
      }
      console.log(`${modo}: ${modo === 'antigo' ? 'defeito reproduzido, processo invisível bloqueou nova abertura' : 'processo encerrou e nova abertura obteve a trava'}`)
      fs.writeFileSync(path.join(p, 'encerrar-teste'), '')
      await ate(() => principal.filho.exitCode !== null)
    }
    console.log('Verificação concluída com Electron real. Sem banco de loja, rede ou impressão física.')
    console.log('Evidências: ' + pasta)
  } finally {
    for (const { filho, pasta: p } of processos) {
      if (filho.exitCode === null) {
        fs.writeFileSync(path.join(p, 'encerrar-teste'), '')
        await ate(() => filho.exitCode !== null).catch(() => filho.kill())
      }
    }
  }
})().catch(erro => { console.error(erro); process.exitCode = 1 })
