// Empacotar sem passar pelo dist-edicao.js é uma armadilha, e ela já mordeu:
// dois notebooks em produção ficaram presos na 1.32.0 por causa disto.
//
// `electron-builder` sem `--config build-edicoes.config.js` usa o `publish` do
// package.json, que aponta pro GitHub — onde a última release é bem mais antiga
// que os canais do R2. E `EDICAO` sem valor cai no padrão 'pro'. O resultado é
// o pior instalador possível: recursos do plano Pro, com um endereço de
// atualização que nunca mais vai ter versão nova. A máquina instalada assim
// responde "você já está na versão mais recente" pra sempre, e está tecnicamente
// certa — só está perguntando no lugar errado.
//
// Não dá pra consertar só tirando o `publish` do package.json: sem ele o
// electron-builder DEDUZ o repositório GitHub pelo campo `repository`, e a
// armadilha volta calada. Bloquear o caminho é o que funciona.

console.error(`
  Este atalho de empacotamento foi desativado de propósito.

  Ele gerava um instalador com os recursos do plano Pro e o endereço de
  atualização apontando pro GitHub, que não recebe mais release. Quem instalasse
  por ele ficava presa na versão instalada, sem nunca mais detectar atualização.

  Use um destes:

    npm run dist:basico        empacota e publica no canal Básico
    npm run dist:pro           empacota e publica no canal Pro

    node scripts/dist-edicao.js pro --dir       só empacota, sem publicar
                                                (para testar o instalador)
`)
process.exit(1)
