// Login do painel da FHVP — o que substituiu o ADMIN_TOKEN.
// node:test + node:assert (nativos), igual ao exclusaoCliente.test.ts.
// Rodar: npx tsx --test src/adminAuth.test.ts
//
// O que estes testes seguram:
//   • A COMPARAÇÃO NÃO PODE VAZAR PELO RELÓGIO. `===` em string sai no primeiro
//     caractere diferente, e isso permite descobrir a senha caractere a
//     caractere em vez de chutá-la inteira. É o tipo de defeito que passa em
//     todo teste funcional: a senha certa entra, a errada não, e ninguém vê o
//     vazamento.
//   • O LIMITE É POR IP, NÃO GLOBAL. Global, qualquer estranho tranca o dono do
//     lado de fora só gastando as tentativas — negação de serviço barata contra
//     a única conta que existe.
//   • FORÇA = TAMANHO **E** VARIEDADE. Um sozinho não serve: só tamanho aceita
//     "senhasenhasenha", só variedade aceita "Ab1!".
//   • DATA ILEGÍVEL EXPIRA. Errar para o lado de pedir login de novo é
//     incômodo; errar para o outro é sessão eterna.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  HORAS_DE_SESSAO_ADMIN,
  MAX_TENTATIVAS_LOGIN_ADMIN_POR_HORA,
  MIN_SENHA_ADMIN,
  hashTokenAdmin,
  montarSessaoAdmin,
  origemDoPedido,
  passouDoLimiteAdmin,
  senhaAdminAceitavel,
  senhaAdminConfere,
  sessaoAdminExpirada,
  tokenAdminDoCabecalho
} from './adminAuth.ts'

// ── A senha que abre a carteira inteira ─────────────────────────────────────

test('senha forte é aceita', () => {
  assert.deepEqual(senhaAdminAceitavel('Trov@o-Azul-2026!'), { ok: true })
})

test('curta demais é recusada mesmo sendo variada', () => {
  const r = senhaAdminAceitavel('Ab1!xY2@')
  assert.equal(r.ok, false)
})

test('longa mas sem variedade é recusada', () => {
  // O engano clássico: exigir só tamanho deixa passar isto.
  const r = senhaAdminAceitavel('senhasenhasenhasenha')
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /três tipos/)
})

test('só números é recusada por não ter variedade', () => {
  assert.equal(senhaAdminAceitavel('12345678901234567890').ok, false)
})

test('três classes bastam — não exigimos as quatro', () => {
  // Exigir as quatro empurra as pessoas para "Senha123!" — previsível.
  // Comprimento é o que mais protege, e ele já é cobrado.
  assert.deepEqual(senhaAdminAceitavel('cavalo-bateria-Grampo7').ok, true)
})

test('acento conta como símbolo', () => {
  // Recusar acentuado empurraria o usuário brasileiro para senhas piores.
  //
  // A senha é escolhida para o acento ser a ÚNICA terceira classe: minúscula,
  // MAIÚSCULA e o `ç`/`ã`. Sem dígito e sem símbolo ASCII. Se a regra deixar de
  // aceitar acento, ela cai para duas classes e é recusada — que é o que faz
  // este teste valer alguma coisa. A primeira versão usava
  // 'coraçãoValente9x', que tinha um dígito: passava com ou sem o acento.
  assert.equal(senhaAdminAceitavel('Coracaobonitoção').ok, true)
})

test('o mínimo é maior que o do revendedor', () => {
  // Esta conta abre TODAS as lojas; a do revendedor abre só a carteira dele.
  assert.ok(MIN_SENHA_ADMIN >= 14)
})

test('valor não-string não derruba nem passa', () => {
  assert.equal(senhaAdminAceitavel(undefined).ok, false)
  assert.equal(senhaAdminAceitavel(12345678901234).ok, false)
})

// ── A conferência ───────────────────────────────────────────────────────────

test('a senha certa confere', () => {
  assert.equal(senhaAdminConfere('Trov@o-Azul-2026!', 'Trov@o-Azul-2026!'), true)
})

test('a errada não confere', () => {
  assert.equal(senhaAdminConfere('Trov@o-Azul-2025!', 'Trov@o-Azul-2026!'), false)
})

test('senha de comprimento diferente não confere nem quebra', () => {
  // Sem o hash antes de comparar, `timingSafeEqual` LANÇA com tamanhos
  // diferentes — e um erro 500 aqui contaria que o comprimento não bateu.
  assert.equal(senhaAdminConfere('curta', 'Trov@o-Azul-2026!'), false)
  assert.equal(senhaAdminConfere('T'.repeat(500), 'Trov@o-Azul-2026!'), false)
})

test('servidor sem senha configurada não deixa ninguém entrar', () => {
  // O modo de falha que isto trava: `ADMIN_SENHA` esquecida no Fly viraria
  // "qualquer coisa entra" se a comparação tratasse vazio como vazio.
  assert.equal(senhaAdminConfere('', undefined), false)
  assert.equal(senhaAdminConfere('', ''), false)
  assert.equal(senhaAdminConfere('qualquer', ''), false)
})

/**
 * ── O guarda que faltou na primeira versão ──────────────────────────────────
 * Os testes acima conferem COMPORTAMENTO: senha certa entra, errada não. E
 * `===` faz exatamente isso — passa em todos eles.
 *
 * Só que `===` sai no primeiro caractere diferente, e a diferença de tempo,
 * medida em muitas tentativas, permite descobrir a senha caractere a caractere
 * em vez de chutá-la inteira. É um defeito que nenhum teste funcional vê.
 *
 * Foi assim que ele passou: trocar a implementação por `===` deixava a suíte
 * inteira verde. Daí este teste ler o FONTE — é a forma da comparação que
 * precisa ser garantida, não o resultado dela.
 */
test('a comparação é de tempo constante, e continua sendo', () => {
  const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'adminAuth.ts'), 'utf8')
  const i = fonte.indexOf('export function senhaAdminConfere')
  assert.ok(i > -1, 'a função de conferência sumiu')
  const corpo = fonte.slice(i, fonte.indexOf('\n}', i))

  assert.ok(
    corpo.includes('timingSafeEqual'),
    'a conferência deixou de usar comparação de tempo constante'
  )
  assert.ok(
    !/enviada === esperada/.test(corpo),
    'comparar as senhas com === vaza o prefixo correto pelo tempo de resposta'
  )
  assert.ok(
    corpo.includes("createHash('sha256')"),
    'sem hashear antes, timingSafeEqual lança com tamanhos diferentes — e o erro revela o comprimento'
  )
})

// ── A sessão ────────────────────────────────────────────────────────────────

test('o banco guarda o hash, nunca o token', () => {
  // Se o banco vazar, o que estiver lá não pode abrir o painel.
  const { token, sessao } = montarSessaoAdmin()
  assert.notEqual(sessao.tokenHash, token)
  assert.equal(sessao.tokenHash, hashTokenAdmin(token))
})

test('dois logins geram tokens diferentes', () => {
  assert.notEqual(montarSessaoAdmin().token, montarSessaoAdmin().token)
})

test('a sessão vale as horas combinadas', () => {
  const agora = Date.parse('2026-09-03T12:00:00.000Z')
  const { sessao } = montarSessaoAdmin(agora)
  assert.equal(sessaoAdminExpirada(sessao, agora), false)
  assert.equal(
    sessaoAdminExpirada(sessao, agora + HORAS_DE_SESSAO_ADMIN * 3_600_000 - 1),
    false
  )
  assert.equal(sessaoAdminExpirada(sessao, agora + HORAS_DE_SESSAO_ADMIN * 3_600_000), true)
})

test('data ilegível conta como expirada', () => {
  assert.equal(sessaoAdminExpirada({ tokenHash: 'x', criadaEm: 'x', expiraEm: 'nao-e-data' }), true)
})

// ── O cabeçalho ─────────────────────────────────────────────────────────────

test('lê o token do Bearer', () => {
  assert.equal(tokenAdminDoCabecalho('Bearer abc123'), 'abc123')
  assert.equal(tokenAdminDoCabecalho('bearer abc123'), 'abc123')
})

test('cabeçalho ausente ou torto devolve null', () => {
  assert.equal(tokenAdminDoCabecalho(undefined), null)
  assert.equal(tokenAdminDoCabecalho(''), null)
  assert.equal(tokenAdminDoCabecalho('abc123'), null)
  assert.equal(tokenAdminDoCabecalho('Bearer'), null)
  assert.equal(tokenAdminDoCabecalho('Bearer a b'), null)
})

// ── O limite de tentativas ──────────────────────────────────────────────────

test('o limite corta na décima tentativa', () => {
  assert.equal(passouDoLimiteAdmin(MAX_TENTATIVAS_LOGIN_ADMIN_POR_HORA - 1), false)
  assert.equal(passouDoLimiteAdmin(MAX_TENTATIVAS_LOGIN_ADMIN_POR_HORA), true)
})

test('o IP do cliente é o PRIMEIRO do x-forwarded-for', () => {
  // Os seguintes são proxies. Confiar no último deixaria qualquer um escolher a
  // própria identidade e zerar o próprio contador mandando um cabeçalho falso.
  assert.equal(origemDoPedido('203.0.113.9, 10.0.0.1, 10.0.0.2'), '203.0.113.9')
})

test('sem cabeçalho cai num balde único, que é o mais restritivo', () => {
  assert.equal(origemDoPedido(undefined), 'local')
  assert.equal(origemDoPedido(''), 'local')
  assert.equal(origemDoPedido('   '), 'local')
})

test('IPs diferentes contam separado — senão um estranho tranca o dono', () => {
  // Este é o ponto do limite ser por IP. Não há como asseverar o balde aqui
  // sem o banco, mas garantimos que a CHAVE de contagem difere.
  assert.notEqual(origemDoPedido('203.0.113.9'), origemDoPedido('198.51.100.4'))
})
