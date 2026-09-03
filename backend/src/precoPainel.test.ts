// O campo de preço da mensalidade no painel FHVP.
// node:test + node:assert (nativos), igual ao exclusaoCliente.test.ts.
// Rodar: npx tsx --test src/precoPainel.test.ts
//
// ── Por que ler o HTML ──────────────────────────────────────────────────────
// O painel é uma página solta, sem build e sem imports: não há como importar
// uma função dele. Mas as duas coisas que podem quebrar em silêncio são
// estruturais, e essas o texto revela:
//
//   1. A COLUNA E O COLSPAN andam juntos. Quem acrescenta uma coluna e esquece
//      o `colSpan` da linha "nenhuma loja cadastrada" só descobre quando a
//      base está vazia — ou seja, quase nunca, e nunca na hora de testar.
//   2. O PADRÃO APARECE EM DOIS LUGARES: no backend (`?? 10000`, quem decide de
//      verdade) e na tela (só pra rotular a coluna). Se um mudar sem o outro, a
//      tela passa a mentir um valor que o cliente não vai pagar.
//
// E uma regra de negócio que o painel precisa respeitar: loja de REVENDEDOR não
// paga a FHVP — a rota de renovação a recusa. Oferecer preço pra ela seria
// prometer uma cobrança que nunca acontece.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// `fileURLToPath` e não `.pathname`: o caminho do projeto tem espaço no nome
// ("FHVP Tech - Apps"), e o pathname cru devolve `%20` — que o fs não abre.
const AQUI = dirname(fileURLToPath(import.meta.url))
const PAINEL = readFileSync(join(AQUI, 'painel-fhvp.html'), 'utf8')
const BACKEND = readFileSync(join(AQUI, 'index.ts'), 'utf8')

// ── A coluna existe e a linha vazia acompanha ───────────────────────────────

test('a tabela de clientes tem a coluna de mensalidade', () => {
  assert.ok(PAINEL.includes('<th class="num">Mensalidade</th>'))
})

test('o colspan da linha vazia bate com o número de colunas', () => {
  // Conta os <th> do cabeçalho da tabela de clientes (a 2ª <thead> do arquivo).
  const inicio = PAINEL.indexOf('<th>Loja</th>')
  assert.ok(inicio > -1, 'o cabeçalho da tabela de clientes mudou de forma')
  const cabecalho = PAINEL.slice(inicio, PAINEL.indexOf('</tr>', inicio))
  const colunas = (cabecalho.match(/<th/g) ?? []).length

  const iVazio = PAINEL.indexOf("'Nenhuma loja cadastrada.'")
  assert.ok(iVazio > -1, 'sumiu a linha de base vazia')
  const trecho = PAINEL.slice(iVazio - 300, iVazio)
  const m = trecho.match(/colSpan = (\d+)/)
  assert.ok(m, 'a linha vazia não define colSpan')

  assert.equal(
    Number(m[1]),
    colunas,
    `colSpan ${m[1]} contra ${colunas} colunas — a mensagem de base vazia para no meio da largura`
  )
})

test('a célula entra na linha, senão a coluna fica órfã', () => {
  // Um <th> a mais sem o <td> correspondente desalinha a tabela INTEIRA: cada
  // célula passa a cair debaixo do título da coluna seguinte.
  assert.ok(PAINEL.includes('tdPreco'), 'a célula de preço não é criada')
  assert.match(
    PAINEL,
    /tr\.append\([^)]*tdValidade, tdPreco,/,
    'a célula de preço não foi inserida na linha, ou saiu de ordem com o cabeçalho'
  )
})

// ── O padrão mostrado na tela é o mesmo que o backend cobra ─────────────────

test('o padrão da tela é o mesmo do backend', () => {
  const naTela = PAINEL.match(/const PRECO_PADRAO_CENTAVOS = (\d+)/)
  assert.ok(naTela, 'a tela não declara mais o padrão')

  // A última defesa da rota de cobrança: `cliente.valorCentavosRenovacao ??
  // body.valorCentavos ?? 10000`.
  const noBackend = BACKEND.match(/cliente\.valorCentavosRenovacao \?\? body\.valorCentavos \?\? (\d+)/)
  assert.ok(noBackend, 'a rota de cobrança mudou de forma — conferir o padrão na mão')

  assert.equal(
    naTela[1],
    noBackend[1],
    'a tela rotula um padrão diferente do que o backend cobra — o cliente veria um preço e pagaria outro'
  )
})

// ── Loja de revendedor não paga a FHVP ──────────────────────────────────────

test('a tela avisa que preço não vale para loja de revendedor', () => {
  // A rota de renovação recusa essas lojas com 403. Sem o aviso, dava pra
  // "definir o preço" e esperar uma cobrança que nunca sai.
  assert.ok(
    PAINEL.includes('a renovação dela nem passa pela FHVP'),
    'sumiu o aviso de que preço não tem efeito em loja de revendedor'
  )
})

test('e a coluna não inventa um valor para ela', () => {
  const i = PAINEL.indexOf('const tdPreco')
  const bloco = PAINEL.slice(i, PAINEL.indexOf('const tdNotas', i))
  const posRevenda = bloco.indexOf('cl.revendedorId')
  const posValor = bloco.indexOf('cl.valorCentavosRenovacao')
  assert.ok(posRevenda > -1, 'a coluna não distingue loja de revendedor')
  assert.ok(
    posRevenda < posValor,
    'a checagem de revendedor tem que vir ANTES, senão a coluna mostra um preço que ninguém cobra'
  )
})

// ── O que o campo manda para a API ──────────────────────────────────────────

test('vazio devolve a loja ao padrão', () => {
  // `null` é o que a rota entende como "remover o preço fixo". Mandar 0 ou
  // string vazia cairia no ramo de valor inválido e não limparia nada.
  assert.ok(PAINEL.includes('corpo.valorCentavos = null'))
})

test('o valor é convertido de reais para centavos', () => {
  // A rota espera CENTAVOS. Mandar 149,90 como 149 cobraria um real e meio.
  assert.ok(PAINEL.includes('Math.round(n * 100)'))
})

test('vírgula e ponto são aceitos, porque é assim que se digita preço', () => {
  assert.ok(PAINEL.includes("replace(',', '.')"))
})

test('a tela chama a rota certa', () => {
  assert.ok(PAINEL.includes("'/admin/cliente/' + encodeURIComponent(cl.clienteId) + '/preco'"))
  assert.ok(BACKEND.includes("app.post('/admin/cliente/:clienteId/preco'"), 'a rota sumiu do backend')
})

// ── O aviso do QR já aberto ─────────────────────────────────────────────────

test('a tela avisa que um QR já aberto mantém o valor antigo', () => {
  // O valor CONGELA dentro da cobrança quando ela é criada. Trocar o preço não
  // alcança um PIX que já está na tela do lojista — ele paga o antigo até
  // aquele QR expirar. Sem o aviso, isso vira "mudei e não pegou".
  assert.ok(
    PAINEL.includes('Um QR já aberto mantém o valor com que foi criado'),
    'sumiu o aviso sobre cobrança já gerada'
  )
})

// ── Login por senha (substituiu o ADMIN_TOKEN) ──────────────────────────────
//
// O painel deixou de pedir o ADMIN_TOKEN colado à mão. O motivo prático: o Fly
// nunca devolve o valor de um secret, então quem não anotou o token perdeu o
// acesso — foi o que aconteceu. O motivo de fundo: token de servidor não é
// credencial de pessoa, e não dá para trocar sem redeploy.

test('a tela pede senha, não mais o token', () => {
  assert.ok(PAINEL.includes('id="campoSenha"'))
  assert.ok(!PAINEL.includes('campoToken'), 'sobrou referência ao campo de token')
  assert.ok(!PAINEL.includes('ADMIN_TOKEN'), 'a tela ainda fala do token antigo')
})

test('a senha vai uma vez e vira sessão — nenhum pedido seguinte a carrega', () => {
  // O que estaria errado: guardar a senha e mandá-la em todo pedido, como o
  // token era mandado. Aí um vazamento de qualquer request entregaria a senha,
  // que não expira, em vez de um token de 12h.
  assert.ok(PAINEL.includes("api('/admin-login'"), 'a tela não troca senha por sessão')
  assert.ok(
    PAINEL.includes("sessionStorage.setItem(CHAVE_SESSAO, token)"),
    'a sessão não é guardada'
  )
  assert.ok(
    !PAINEL.includes('sessionStorage.setItem(CHAVE_SESSAO, senha'),
    'a SENHA está sendo guardada no navegador'
  )
})

test('o campo é limpo mesmo quando a senha erra', () => {
  // Limpar só no sucesso deixaria a senha errada parada no DOM — e senha errada
  // costuma ser a senha certa de outro lugar.
  const i = PAINEL.indexOf("const login = await api('/admin-login'")
  const ateOErro = PAINEL.slice(i, PAINEL.indexOf('if (!login.ok)', i))
  assert.ok(
    ateOErro.includes("$('campoSenha').value = ''"),
    'a senha só é limpa depois de dar certo'
  )
})

test('sessionStorage, não localStorage', () => {
  // localStorage sobrevive a fechar o navegador. Painel que abre todas as lojas
  // não deve ficar destrancado num PC compartilhado.
  assert.ok(!PAINEL.includes('localStorage'), 'a sessão passou a sobreviver ao navegador fechado')
})

test('recarregar a página retoma a sessão', () => {
  // É a razão de existir deste trabalho: com o token, todo F5 expulsava.
  assert.ok(PAINEL.includes('abrirPainel().catch'), 'o F5 voltou a expulsar quem já entrou')
})

test('401 no próprio login não derruba a tela de entrada', () => {
  // Lá 401 é só "senha errada". Mandar para a tela de entrada apagaria a
  // mensagem antes de a pessoa conseguir lê-la.
  assert.ok(PAINEL.includes("!caminho.startsWith('/admin-login')"))
})

test('sair avisa o servidor, para o token morrer agora', () => {
  // Sem isso, "Sair" só limparia a aba e o token seguiria válido por até 12h.
  assert.ok(PAINEL.includes("fetch('admin-logout'"))
  assert.ok(PAINEL.includes('sessionStorage.removeItem(CHAVE_SESSAO)'))
})

test('o backend não conhece mais o ADMIN_TOKEN', () => {
  assert.ok(!BACKEND.includes('ADMIN_TOKEN'), 'o token antigo ainda é lido em algum lugar')
  assert.ok(BACKEND.includes("obrigatoria('ADMIN_SENHA')"))
})
