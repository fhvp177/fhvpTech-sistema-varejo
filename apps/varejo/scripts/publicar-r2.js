// Publica os artefatos de uma edição (basico|pro) no canal dela do R2.
//
// Por que uploader próprio: o publisher S3 do electron-builder delega pro
// app-builder (Go, aws-sdk-go v1), cujo upload MULTIPARTE o R2 recusa com
// SignatureDoesNotMatch — incompatibilidade conhecida. Aqui fazemos PUT único
// assinado (SigV4) com o Node puro: R2 aceita objetos de até 5GB num PUT só.
//
// O que sobe (nomes com hífen, como o electron-builder publica no GitHub):
//   1. FHVP-Tech-Varejo-Setup-<versao>.exe            (cache longo — nome é único)
//   2. FHVP-Tech-Varejo-Setup-<versao>.exe.blockmap   (p/ update diferencial)
//   3. latest.yml (GERADO AQUI: versão+sha512+tamanho; sobe POR ÚLTIMO, com
//      no-cache, pra o canal nunca apontar pra um instalador pela metade)
//
// Uso: node scripts/publicar-r2.js <basico|pro>   (chamado pelo dist-edicao.js)
const { createHash, createHmac } = require('node:crypto')
const { readFileSync, readdirSync } = require('node:fs')
const path = require('node:path')
const https = require('node:https')

const edicao = process.argv[2]
if (edicao !== 'basico' && edicao !== 'pro') {
  console.error('Uso: node scripts/publicar-r2.js <basico|pro>')
  process.exit(1)
}

// ── Credenciais (.env, fora do git) ─────────────────────────────────────────
for (const linha of readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
}
const CONTA = process.env.R2_ACCOUNT_ID
const CHAVE = process.env.R2_ACCESS_KEY_ID
const SEGREDO = process.env.R2_SECRET_ACCESS_KEY
if (!CONTA || !CHAVE || !SEGREDO) {
  console.error('[publicar-r2] Faltam R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY no .env')
  process.exit(1)
}
const HOST = `${CONTA}.r2.cloudflarestorage.com`
const BUCKET = 'updates-fhvptech'

// ── Artefatos da edição ─────────────────────────────────────────────────────
const versao = require(path.join(__dirname, '..', 'package.json')).version
const pastaDist = path.join(__dirname, '..', 'dist', edicao)
// EXATAMENTE o instalador da versão atual: a pasta pode ter sobras de builds
// antigos (o electron-builder não limpa), e um ".find" solto já publicou o exe
// velho com latest.yml novo — o updater dos clientes caiu em 404.
const nomeExe = readdirSync(pastaDist).find((n) => n.endsWith(`Setup ${versao}.exe`))
if (!nomeExe) {
  console.error(
    `[publicar-r2] Não achei o instalador da v${versao} ("* Setup ${versao}.exe") em dist/${edicao} — rode o build antes.`
  )
  process.exit(1)
}
const exe = readFileSync(path.join(pastaDist, nomeExe))
const blockmap = readFileSync(path.join(pastaDist, `${nomeExe}.blockmap`))
const nomeRemoto = nomeExe.replace(/ /g, '-') // "FHVP Tech ... 1.26.0.exe" → "FHVP-Tech-...-1.26.0.exe"

const sha512b64 = createHash('sha512').update(exe).digest('base64')
const latestYml = [
  `version: ${versao}`,
  'files:',
  `  - url: ${nomeRemoto}`,
  `    sha512: ${sha512b64}`,
  `    size: ${exe.length}`,
  `path: ${nomeRemoto}`,
  `sha512: ${sha512b64}`,
  `releaseDate: '${new Date().toISOString()}'`,
  ''
].join('\n')

// ── SigV4 + PUT ─────────────────────────────────────────────────────────────
const sha256hex = (d) => createHash('sha256').update(d).digest('hex')
const hmac = (k, d) => createHmac('sha256', k).update(d).digest()

function put(chaveObjeto, corpo, contentType, cacheControl) {
  const caminho = `/${BUCKET}/` + chaveObjeto.split('/').map(encodeURIComponent).join('/')
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dataStamp = amzDate.slice(0, 8)
  const payloadHash = sha256hex(corpo)
  const headersCanon = `host:${HOST}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const reqCanon = ['PUT', caminho, '', headersCanon, signedHeaders, payloadHash].join('\n')
  const escopo = `${dataStamp}/auto/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, escopo, sha256hex(reqCanon)].join('\n')
  const kAssin = hmac(hmac(hmac(hmac(`AWS4${SEGREDO}`, dataStamp), 'auto'), 's3'), 'aws4_request')
  const assinatura = createHmac('sha256', kAssin).update(stringToSign).digest('hex')
  const headers = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${CHAVE}/${escopo}, SignedHeaders=${signedHeaders}, Signature=${assinatura}`,
    'content-type': contentType,
    'cache-control': cacheControl,
    'content-length': corpo.length
  }
  return new Promise((resolve, reject) => {
    const req = https.request({ host: HOST, method: 'PUT', path: caminho, headers }, (res) => {
      let dados = ''
      res.on('data', (c) => (dados += c))
      res.on('end', () =>
        res.statusCode === 200
          ? resolve()
          : reject(new Error(`HTTP ${res.statusCode} em ${chaveObjeto}: ${dados.slice(0, 300)}`))
      )
    })
    req.on('error', reject)
    req.end(corpo)
  })
}

async function principal() {
  const mb = (exe.length / 1024 / 1024).toFixed(1)
  console.log(`[publicar-r2:${edicao}] subindo ${nomeRemoto} (${mb} MB)...`)
  await put(`${edicao}/${nomeRemoto}`, exe, 'application/octet-stream', 'public, max-age=31536000, immutable')
  console.log(`[publicar-r2:${edicao}] subindo blockmap...`)
  await put(`${edicao}/${nomeRemoto}.blockmap`, blockmap, 'application/octet-stream', 'public, max-age=31536000, immutable')
  console.log(`[publicar-r2:${edicao}] subindo latest.yml (v${versao})...`)
  await put(`${edicao}/latest.yml`, Buffer.from(latestYml), 'text/yaml', 'no-cache')
  console.log(`[publicar-r2:${edicao}] canal atualizado: https://updates.fhvptech.com/${edicao}/latest.yml`)
}

principal().catch((e) => {
  console.error(`[publicar-r2:${edicao}] FALHOU: ${e.message}`)
  process.exit(1)
})
