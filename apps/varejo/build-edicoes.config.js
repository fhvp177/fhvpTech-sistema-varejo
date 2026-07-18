// Config do electron-builder pros builds POR PLANO (Fase 2 — canais no R2).
//
// Usada SOMENTE via --config pelos scripts dist:basico / dist:pro. O nome é
// de propósito um que o electron-builder NÃO detecta sozinho: o bloco "build"
// do package.json continua mandando no fluxo clássico (GitHub), intacto.
//
// Como funciona: parte do bloco "build" do package.json, troca a saída pra
// dist/<edicao> e configura o publish "generic" — que aqui serve SÓ pra gravar
// o app-update.yml dentro do instalador (o endereço que o app instalado
// consulta pra sempre). O upload em si é do scripts/publicar-r2.js: o
// publisher S3 embutido do electron-builder (app-builder/Go) falha no
// multiparte com o R2 (SignatureDoesNotMatch), então rodamos sempre com
// --publish never e subimos por fora.
//
// Release de TRANSIÇÃO (levar as lojas antigas do GitHub pro R2): rodar o
// dist:basico normal e subir os MESMOS 3 arquivos de dist/basico também na
// release do GitHub (gh release upload vX.Y.Z exe blockmap latest.yml) — as
// lojas antigas pegam essa versão pelo GitHub e, por causa do app-update.yml
// dela, passam a olhar pro canal novo dali em diante.
const base = require('./package.json').build

const edicao = process.env.EDICAO
if (edicao !== 'basico' && edicao !== 'pro') {
  throw new Error(
    `[build-edicoes] EDICAO deve ser "basico" ou "pro" (recebido: "${edicao}"). ` +
      'Use os scripts npm run dist:basico / dist:pro.'
  )
}

module.exports = {
  ...base,
  directories: { ...base.directories, output: `dist/${edicao}` },
  publish: [{ provider: 'generic', url: `https://updates.fhvptech.com/${edicao}` }]
}
