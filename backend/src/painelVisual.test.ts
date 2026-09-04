// A reforma visual do painel FHVP: ícones, menu de ações e vocabulário.
// node:test + node:assert (nativos). Rodar: npx tsx --test src/painelVisual.test.ts
//
// ── O que estes testes seguram ─────────────────────────────────────────────
//
//   1. O MENU PRECISA VIVER NO <body>. A tabela mora num contêiner com
//      `overflow-x: auto`, e qualquer filho posicionado dentro dele é recortado
//      na borda. O menu abria pela metade, com uma barra de rolagem surgindo do
//      nada. Foi assim que o defeito apareceu, e é invisível em teste de lógica.
//
//   2. O VOCABULÁRIO NÃO VOLTA. "Estrangular" e "Cortar" descreviam cobrança de
//      parceiro com metáfora de violência. A tela é lida por quem administra a
//      operação todo dia, e o produto tem um padrão de linguagem.
//
//   3. VENCIMENTO É VISÍVEL. A coluna de situação mostrava um traço para loja
//      vencida: o estado mais importante do painel estava invisível, e só
//      aparecia para quem conferisse data por data na coluna do lado.
//
//   4. ANIMAÇÃO SÓ QUANDO INFORMA. Regra da casa. O destaque da linha existe
//      para dizer "foi esta que mudou"; nada aqui se mexe por enfeite.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const PAINEL = readFileSync(join(AQUI, 'painel-fhvp.html'), 'utf8')
const REVENDA = readFileSync(join(AQUI, 'painel.html'), 'utf8')
const UI = readFileSync(join(AQUI, 'painel-ui.js'), 'utf8')
const CSS = readFileSync(join(AQUI, 'painel.css'), 'utf8')
const BACKEND = readFileSync(join(AQUI, 'index.ts'), 'utf8')
const WORKER_FHVP = readFileSync(
  join(AQUI, '..', '..', 'tools', 'cloudflare', 'painel-fhvp.worker.js'), 'utf8'
)
const WORKER_REVENDA = readFileSync(
  join(AQUI, '..', '..', 'tools', 'cloudflare', 'painel-do-revendedor.worker.js'), 'utf8'
)

// ── O menu não pode ser recortado ──────────────────────────────────────────

test('o menu de ações é criado no body, não dentro da linha', () => {
  assert.ok(
    UI.includes('document.body.appendChild(lista)'),
    'o menu voltou para dentro da tabela e será recortado pelo overflow'
  )
  assert.ok(UI.includes('lista.style.position = '))
})

test('e o right do CSS base é desligado ao portar', () => {
  // `right: 0` somado ao `left` calculado estica a caixa de ponta a ponta.
  // Aconteceu: o menu saiu com 326px em vez de 190px.
  assert.ok(UI.includes('lista.style.right = '))
})

test('rolar ou redimensionar FECHA o menu', () => {
  // Com posição fixa a caixa não acompanha mais a tabela. Menu que descola do
  // botão que o abriu é pior que menu fechado.
  assert.ok(UI.includes('window.addEventListener(\'scroll\', fechar, true)'))
  assert.ok(UI.includes('window.addEventListener(\'resize\', fechar)'))
})

test('e o menu some do body ao fechar', () => {
  // Sem remover, cada abertura deixaria uma caixa órfã acumulada no documento.
  assert.ok(UI.includes('document.body.removeChild(lista)'))
})

test('só um menu aberto por vez', () => {
  // Dois abertos confundem sobre qual linha vai receber a ação.
  assert.ok(UI.includes('body > .menu-lista'))
})

// ── Vocabulário ────────────────────────────────────────────────────────────

test('a tela não fala em estrangular nem em cortar', () => {
  // TODO texto entre aspas simples da página, e não só o que vem logo depois de
  // `texto:`. Duas versões deste teste falharam antes:
  //
  //   1ª — pegava a linha inteira, e `texto: 'Bloquear rede', aoClicar: () =>
  //        modalCortar(rv)` acusava o nome interno da função, que ninguém vê.
  //   2ª — pegava só `chave: '...'`, e passava batido em rótulo escrito como
  //        ternário: `texto: rv.bloqueado ? 'Reativar' : 'Estrangular'`. Vários
  //        rótulos desta tela são ternários, então o guarda era quase inútil.
  //
  // Comentários usam aspas DUPLAS ao citar os nomes antigos, então não entram.
  const rotulos = PAINEL.match(/'[^'\n]*'/g) || []
  const juntos = rotulos.join('\n')
  assert.ok(!/[Ee]strangul/.test(juntos), 'voltou "estrangular" a um rótulo da tela')
  assert.ok(!/Cortar/.test(juntos), 'voltou "Cortar" a um rótulo da tela')
})

test('os nomes novos estão lá, e dizem o que a ação faz', () => {
  assert.ok(PAINEL.includes('Bloquear rede'))
  assert.ok(PAINEL.includes('Suspender emissão'))
  assert.ok(PAINEL.includes('Reativar'))
})

test('a diferença entre suspender e bloquear a rede fica escrita na tela', () => {
  // As duas ações moram no mesmo menu. Quem não souber a diferença vai
  // descobrir errando, e uma delas para a operação de um parceiro.
  assert.ok(PAINEL.includes('Diferente de suspender'))
  assert.ok(PAINEL.includes('Use para fraude, não para atraso de pagamento.'))
})

// ── Situação da loja ───────────────────────────────────────────────────────

test('loja vencida aparece como vencida, não como traço', () => {
  assert.ok(PAINEL.includes('Vencida'))
  assert.ok(PAINEL.includes('validade < hojeIso'))
})

test('e quem está perto de vencer avisa antes de parar', () => {
  assert.ok(PAINEL.includes('diasAteVencer <= 7'))
  assert.ok(PAINEL.includes('Vence hoje'))
})

test('a conta de dias usa horário local, não UTC', () => {
  // `new Date('2026-09-03')` sem hora é lido como UTC, e no Brasil isso vira
  // 21h do dia ANTERIOR: a conta erraria por um dia toda tarde.
  const i = PAINEL.indexOf('function diasEntre')
  assert.ok(i > -1, 'sumiu o cálculo de dias')
  const corpo = PAINEL.slice(i, PAINEL.indexOf('\n  }', i))
  assert.ok(corpo.includes('T00:00'), 'a data voltou a ser interpretada como UTC')
})

test('a ordem das situações é por gravidade', () => {
  // `lastIndexOf`: há duas colunas de situação na página (revendedores e
  // lojas), e a das lojas é a segunda. Buscar do início pegava a errada, onde
  // nada disto existe, e o teste falhava sem haver problema nenhum.
  const i = PAINEL.lastIndexOf('const tdSit = document.createElement')
  const bloco = PAINEL.slice(i, PAINEL.indexOf('tdSit.appendChild(et)', i))
  const posBloqueio = bloco.indexOf('cl.bloqueadoPor')
  const posVencida = bloco.indexOf('validade < hojeIso')
  const posVencendo = bloco.indexOf('diasAteVencer !==')
  assert.ok(posBloqueio > -1 && posVencida > -1 && posVencendo > -1, 'a coluna mudou de forma')
  assert.ok(posBloqueio < posVencida, 'bloqueio precisa ganhar de vencimento')
  assert.ok(posVencida < posVencendo, '"vencida" precisa ganhar de "vence em breve"')
})

// ── Espaço colado junto da senha ───────────────────────────────────────────

test('★ os dois painéis cortam espaço em volta da senha antes de enviar', () => {
  // Quem administra recebe a senha por mensagem e COLA no campo. Colar traz
  // espaço no fim com facilidade, e sem o corte a senha certa volta como
  // "senha incorreta", sem pista nenhuma na tela, ainda gastando uma das 10
  // tentativas por hora. Aconteceu em 2026-09-04.
  assert.match(
    PAINEL,
    /const senha = \$\('campoSenha'\)\.value\.trim\(\)/,
    'o painel da FHVP voltou a enviar a senha com o espaço colado junto'
  )
  assert.match(
    REVENDA,
    /senha: \$\('campoSenha'\)\.value\.trim\(\)/,
    'o painel do revendedor voltou a enviar a senha com o espaço colado junto'
  )
})

test('★ o SERVIDOR não corta espaço: quem decide o que é a senha é o dono dela', () => {
  // O corte é conveniência de digitação, e lugar de conveniência é na tela. No
  // servidor ele mudaria QUAIS senhas são válidas para todo mundo, incluindo
  // uma que tenha espaço de propósito nas pontas.
  const corpo = BACKEND.slice(
    BACKEND.indexOf("app.post('/admin-login'"),
    BACKEND.indexOf("app.post('/admin-logout'")
  )
  assert.ok(corpo.length > 100, 'sumiu a rota de login do painel')
  assert.equal(
    /senha[^\n]*\.trim\(\)/.test(corpo),
    false,
    'o servidor passou a limpar a senha: isso muda quais senhas valem'
  )
})

// ── Excluir loja ───────────────────────────────────────────────────────────

test('★ excluir loja exige DIGITAR o código, não só clicar', () => {
  // Mesma proteção do "Bloquear rede". Sem ela, a ação mais destrutiva do
  // painel fica a um clique errado de distância, numa tela que lista todas as
  // lojas uma embaixo da outra.
  const modal = PAINEL.slice(
    PAINEL.indexOf('async function modalExcluirCliente'),
    PAINEL.indexOf('async function modalBloqueioCliente')
  )
  assert.ok(modal.length > 200, 'sumiu o diálogo de excluir loja')
  assert.match(modal, /v\.confirmar !== cl\.clienteId/)
  assert.match(modal, /perigo: true/)
  assert.match(modal, /metodo: 'DELETE'/)
})

test('★ a tela NÃO decide quem pode ser apagado: quem decide é o servidor', () => {
  // As travas (nota emitida, série reservada, renovação, CNPJ) moram na rota.
  // Repetidas aqui, divergiriam na primeira alteração, e a tela passaria a
  // prometer o que o servidor recusa — ou pior, a esconder o que ele permite.
  const modal = PAINEL.slice(
    PAINEL.indexOf('async function modalExcluirCliente'),
    PAINEL.indexOf('async function modalBloqueioCliente')
  )
  for (const trava of ['emissoes', 'seriesUsadas', 'renovado', 'cnpjEmitente']) {
    assert.equal(
      modal.includes(trava),
      false,
      `a tela passou a decidir por "${trava}", que é regra do servidor`
    )
  }
  assert.match(modal, /resp\.ok \? null : \{ mensagem: resp\.erro \}/)
})

test('a exclusão avisa que o sistema instalado NÃO para', () => {
  // A licença é validada offline: apagar o cadastro não fecha a loja. Sem este
  // aviso, apagar vira uma expectativa errada sobre o que aconteceu.
  const modal = PAINEL.slice(
    PAINEL.indexOf('async function modalExcluirCliente'),
    PAINEL.indexOf('async function modalBloqueioCliente')
  )
  assert.match(modal, /NÃO para/)
  assert.match(modal, /offline/)
})

test('a ação destrutiva fica no fim do menu, com o ícone dela', () => {
  assert.match(PAINEL, /texto: 'Excluir loja',\s*\n\s*icone: 'trash-2',\s*\n\s*perigo: true/)
  assert.ok(UI.includes("'trash-2':"), 'falta o ícone trash-2 em painel-ui.js')
})

test('★ a rota só aceita forçar quando o impedimento NÃO é fiscal', () => {
  const rota = BACKEND.slice(
    BACKEND.indexOf("app.delete('/admin/cliente/:clienteId'"),
    BACKEND.indexOf("app.post('/admin/cliente/:clienteId/bloqueio'")
  )
  assert.ok(rota.length > 200, 'sumiu a rota de exclusão')
  // O padrão é NÃO forçar. Um `!== '0'` no lugar do `=== '1'` faria toda
  // exclusão nascer forçada, e a trava comercial deixaria de existir sem
  // que nada na tela mudasse.
  assert.match(rota, /c\.req\.query\('forcar'\) === '1'/)
  assert.match(rota, /const travaFiscal = impedimentoFiscal\(impedimentos\)/)
  assert.match(rota, /!podeApagar\(impedimentos\) && \(!forcado \|\| travaFiscal\)/)
})

test('a recusa fiscal DIZ que não tem como forçar, em vez de só negar', () => {
  const rota = BACKEND.slice(
    BACKEND.indexOf("app.delete('/admin/cliente/:clienteId'"),
    BACKEND.indexOf("app.post('/admin/cliente/:clienteId/bloqueio'")
  )
  assert.match(rota, /não tem como ser forçada/)
  assert.match(rota, /forcavel: !travaFiscal/)
})

test('a exclusão forçada fica no log, separada da comum', () => {
  // Apagar cadastro com pagamento é decisão que alguém vai querer reconstituir
  // depois. O log é o único lugar onde ela sobra.
  const rota = BACKEND.slice(
    BACKEND.indexOf("app.delete('/admin/cliente/:clienteId'"),
    BACKEND.indexOf("app.post('/admin/cliente/:clienteId/bloqueio'")
  )
  assert.match(rota, /À FORÇA/)
})

test('a tela oferece a força, e explica o que ela NÃO alcança', () => {
  const modal = PAINEL.slice(
    PAINEL.indexOf('async function modalExcluirCliente'),
    PAINEL.indexOf('async function modalBloqueioCliente')
  )
  // ⚠️ Casar só com /valor: 'nao'/ não serve: a LISTA DE OPÇÕES tem uma opção
  // com esse mesmo valor, então a asserção passava mesmo com o campo abrindo
  // em 'sim'. A mutação pegou isso.
  assert.match(
    modal,
    /id: 'forcar', rotulo: '[^']+', valor: 'nao'/,
    'a força não pode vir marcada por padrão'
  )
  assert.match(modal, /nota emitida/)
  assert.match(modal, /forcar === 'sim' \? '\?forcar=1' : ''/)
})

// ── Ícones ─────────────────────────────────────────────────────────────────

test('os ícones são embutidos, porque a CSP proíbe buscar de fora', () => {
  // `default-src 'none'`: imagem de CDN seria bloqueada, e afrouxar a CSP para
  // enfeitar a tela é troca ruim.
  assert.ok(UI.includes('const ICONES = {'))
  assert.ok(!/<img[^>]+https?:/.test(PAINEL), 'entrou imagem externa na página')
})

test('★ todo ícone nasce com tamanho, sem depender de onde foi posto', () => {
  // O bug: na lista de máquinas o monitor ocupou a largura inteira da caixa e
  // jogou nome, data e botão para fora da tela. A causa não foi aquela tela:
  // o tamanho vinha SÓ de regras de contêiner, e SVG com viewBox e sem largura
  // estica até o pai. Toda tela nova erraria igual, em silêncio.
  assert.match(
    UI,
    /'<svg class="icone'/,
    'o ícone deixou de carregar a própria classe: tela nova volta a sair gigante'
  )
  const regra = CSS.match(/\.icone \{([^}]*)\}/)
  assert.ok(regra, 'sumiu o tamanho padrão do ícone no CSS')
  assert.match(regra[1], /width:\s*\d+px/)
  assert.match(regra[1], /height:\s*\d+px/)
})

test('a classe do ícone é a mesma nos dois lados', () => {
  // Renomear de um lado só devolve o bug inteiro, e nada quebra visivelmente
  // até alguém abrir a tela certa.
  const noJs = UI.match(/'<svg class="([a-z-]+)/)
  assert.ok(noJs, 'não achei a classe que o ícone recebe')
  assert.ok(
    CSS.includes('.' + noJs[1] + ' {'),
    `o CSS não define .${noJs[1]}: o tamanho padrão do ícone virou letra morta`
  )
})

test('as regras de contêiner continuam existindo, e continuam ganhando', () => {
  // Especificidade maior que `.icone`, então o que já estava certo não muda.
  for (const seletor of ['.com-icone svg', '.etiqueta svg', '.icone-card svg']) {
    assert.ok(CSS.includes(seletor), `sumiu a regra ${seletor}`)
  }
})

test('nenhum ícone ficou pela metade', () => {
  // A primeira extração pulava os nós em formato multi-linha do lucide, e o
  // `octagon-alert` saiu sem o octógono: só as duas linhas do "!".
  const i = UI.indexOf('const ICONES = {')
  const mapa = UI.slice(i, UI.indexOf('\n  }', i))
  const octogono = mapa.match(/'octagon-alert':\s*'([^']*)'/)
  assert.ok(octogono, 'sumiu o ícone de bloquear rede')
  assert.ok(octogono[1].includes('<polygon'), 'o octógono não voltou a ser extraído')

  // Ícone sem nenhum nó desenhável é extração quebrada.
  const pobres: string[] = []
  for (const m of mapa.matchAll(/'([a-z0-9-]+)':\s*'([^']*)'/g)) {
    const nos = (m[2].match(/<[a-z]+ /g) || []).length
    if (nos === 0) pobres.push(m[1])
  }
  assert.deepEqual(pobres, [], 'ícone sem nenhum nó desenhável')
})

// ── Animação que informa ───────────────────────────────────────────────────

test('a linha que mudou pisca, para a pessoa achar o que pediu', () => {
  // Nas DUAS tabelas. A primeira versão só checava se a string existia em
  // algum lugar do arquivo, e passava verde com o destaque removido de uma
  // delas: quem mexesse numa loja deixava de ver qual tinha mudado.
  assert.ok(
    PAINEL.includes("destacar === rv.revendedorId) tr.className = 'anim-linha-entra'"),
    'a linha do revendedor não pisca mais'
  )
  assert.ok(
    PAINEL.includes("destacar === cl.clienteId) tr.className = 'anim-linha-entra'"),
    'a linha da loja não pisca mais'
  )
  assert.ok(CSS.includes('.anim-linha-entra'))
})

test('e o destaque é limpo depois, senão pisca de novo à toa', () => {
  assert.ok(PAINEL.includes('destacar = null'))
})

test('os cartões seguem a ordem do Dashboard do app', () => {
  // Ícone, rótulo, valor. Duas telas nossas com a mesma informação em ordens
  // diferentes fazem a pessoa reler as duas.
  const i = UI.indexOf('function cartao(')
  const corpo = UI.slice(i, UI.indexOf('\n  }', i))
  assert.ok(corpo.includes('d.append(cx, r, v)'), 'a ordem do cartão mudou')
})

// ── As peças compartilhadas pelos dois painéis ─────────────────────────────
//
// Ícones, cartão e menu moram em `painel-ui.js`, servido pelo backend. Estavam
// embutidos só no painel da FHVP; copiá-los para o do revendedor criaria duas
// versões que divergem na segunda alteração. É a mesma razão já escrita no
// código sobre o `painel.css`.
//
// O modo de falha novo, e ele é feio: se a CSP voltar a proibir script da
// própria origem, o arquivo é BLOQUEADO e os DOIS painéis perdem ícones e
// menus de uma vez. A página ainda abre, então passa por "funcionando".

test('as duas páginas carregam o arquivo compartilhado', () => {
  assert.ok(PAINEL.includes('src="painel-ui.js"'), 'o painel da FHVP não carrega mais as peças')
  assert.ok(REVENDA.includes('src="painel-ui.js"'), 'o painel do revendedor não carrega as peças')
})

test('o caminho é relativo, senão quebra atrás do Worker', () => {
  // Uma barra inicial faria o pedido sair para a raiz de fhvptech.com, onde o
  // Worker não escuta. Mesma regra de todo caminho destas páginas.
  assert.ok(!PAINEL.includes('src="/painel-ui.js"'))
  assert.ok(!REVENDA.includes('src="/painel-ui.js"'))
})

test('a CSP permite script da própria origem', () => {
  // Sem `self` no script-src o navegador bloqueia painel-ui.js e os dois
  // painéis abrem sem ícone e sem menu de ações.
  const csps = BACKEND.match(/script-src[^;]*/g) || []
  assert.ok(csps.length >= 2, 'as duas páginas precisam declarar CSP')
  for (const csp of csps) {
    assert.ok(csp.includes("'self'"), 'CSP sem self bloqueia o arquivo compartilhado: ' + csp)
  }
})

test('os dois Workers deixam o arquivo passar', () => {
  // Cada Worker tem lista fechada. Esquecer um faz o painel dele abrir sem
  // ícones APENAS no domínio da marca, e continuar certo no .fly.dev.
  assert.ok(WORKER_FHVP.includes("caminho === '/painel-ui.js'"))
  assert.ok(WORKER_REVENDA.includes("caminho === '/painel-ui.js'"))
})

test('o arquivo publica as três peças no escopo global', () => {
  assert.ok(UI.includes('raiz.icone = icone'))
  assert.ok(UI.includes('raiz.cartao = cartao'))
  assert.ok(UI.includes('raiz.menuAcoes = menuAcoes'))
})

test('e não sobrou cópia dos ícones dentro das páginas', () => {
  // Duas cópias divergem. Se voltar, é sinal de que alguém desfez a extração.
  assert.ok(!PAINEL.includes('const ICONES = {'), 'os ícones voltaram para dentro do painel FHVP')
  assert.ok(!REVENDA.includes('const ICONES = {'), 'os ícones foram copiados para o painel do revendedor')
})

// ── O painel do revendedor recebeu a mesma reforma ─────────────────────────

test('o revendedor também usa o menu, não botões soltos', () => {
  assert.ok(REVENDA.includes('menuAcoes(['), 'o painel do revendedor voltou aos botões soltos')
  assert.ok(REVENDA.includes("texto: 'Renovar licença'"))
  assert.ok(REVENDA.includes("texto: 'Bloquear loja'"))
})

test('e os cartões dele ganham ícone pelo data-icone', () => {
  // Os cartões do revendedor são estáticos no HTML, então o ícone entra por
  // hidratação em vez de ser montado por `cartao()`.
  assert.ok(REVENDA.includes('data-icone='))
  assert.ok(UI.includes('.card[data-icone]'))

  // A função precisa ser CHAMADA, não só existir. Renomeá-la para
  // `hidratarCartoesDesligado` mantinha a substring e passava verde: os
  // cartões do revendedor perdiam o ícone e nenhum teste percebia.
  assert.ok(
    UI.includes("document.addEventListener('DOMContentLoaded', hidratarCartoes)"),
    'a hidratação não roda mais no carregamento'
  )
  assert.ok(
    /\n\s*hidratarCartoes\(\)/.test(UI),
    'a hidratação não roda quando a página já está pronta'
  )
})

test('a situação da loja fala igual nos dois painéis', () => {
  // Mesma informação escrita de jeitos diferentes obriga quem usa os dois a
  // reler. Antes era "ativa" em minúscula e sem ícone de um lado.
  assert.ok(REVENDA.includes("span.dataset.texto = 'Ativa'"))
  assert.ok(REVENDA.includes("span.dataset.texto = 'Vencida'"))
})

test('loja vencida do revendedor sai em alerta, não em cinza', () => {
  // Cinza dizia "estado neutro" para uma loja que parou de funcionar.
  const i = REVENDA.indexOf('function etiquetaDoCliente')
  const corpo = REVENDA.slice(i, REVENDA.indexOf('\n  }', i))
  const posVencida = corpo.indexOf("'Vencida'")
  const trecho = corpo.slice(0, posVencida)
  assert.ok(
    trecho.lastIndexOf("'etiqueta alerta'") > trecho.lastIndexOf("'etiqueta neutra'"),
    'vencida voltou a ser cinza'
  )
})
