// Testes da autenticação do painel do revendedor.
// Rodar: npx tsx --test src/revendaAuth.test.ts
//
// O foco é a propriedade de segurança central: um revendedor NÃO alcança a
// carteira de outro, nem os clientes diretos da FHVP. Se só um teste deste
// arquivo puder existir, é esse.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gerarHashSenha,
  conferirSenha,
  senhaAceitavel,
  gerarToken,
  hashToken,
  montarSessao,
  sessaoExpirada,
  tokenDoCabecalho,
  passouDoLimiteDeTentativas,
  clienteEhDoRevendedor,
  gerarCodigoRecuperacao,
  codigoExpirado,
  codigoQueimado,
  emailAceitavel,
  HORAS_DE_SESSAO,
  MAX_TENTATIVAS_LOGIN_POR_HORA,
  MINUTOS_CODIGO_RECUPERACAO,
  MAX_CHUTES_NO_CODIGO
} from './revendaAuth.ts'

// ── A trava que separa as carteiras ────────────────────────────────────────

test('revendedor não alcança cliente de outro revendedor', () => {
  assert.equal(clienteEhDoRevendedor({ revendedorId: 'RV07' }, 'RV03'), false)
})

test('revendedor não alcança cliente DIRETO da FHVP', () => {
  // Cliente sem `revendedorId` é da FHVP (a GN Modas é um). Se "sem dono"
  // fosse lido como "de qualquer um", o painel de um revendedor qualquer
  // bloquearia o único cliente pagante do usuário.
  assert.equal(clienteEhDoRevendedor({}, 'RV03'), false)
  assert.equal(clienteEhDoRevendedor({ revendedorId: undefined }, 'RV03'), false)
})

test('revendedor alcança os clientes dele', () => {
  assert.equal(clienteEhDoRevendedor({ revendedorId: 'RV03' }, 'RV03'), true)
})

test('id parecido não passa', () => {
  // Nada de prefixo/`startsWith` nessa comparação: 'RV3' não é 'RV30'.
  assert.equal(clienteEhDoRevendedor({ revendedorId: 'RV30' }, 'RV3'), false)
  assert.equal(clienteEhDoRevendedor({ revendedorId: 'RV3' }, 'RV30'), false)
})

// ── Senha ─────────────────────────────────────────────────────────────────

test('senha correta confere e errada não', async () => {
  const hash = await gerarHashSenha('revenda-do-ze-2026')
  assert.equal(await conferirSenha('revenda-do-ze-2026', hash), true)
  assert.equal(await conferirSenha('revenda-do-ze-2025', hash), false)
  assert.equal(await conferirSenha('', hash), false)
})

test('mesma senha gera hashes diferentes (o sal existe e é usado)', async () => {
  const a = await gerarHashSenha('senha-igualzinha')
  const b = await gerarHashSenha('senha-igualzinha')
  assert.notEqual(a, b)
  // ...e as duas continuam conferindo.
  assert.equal(await conferirSenha('senha-igualzinha', a), true)
  assert.equal(await conferirSenha('senha-igualzinha', b), true)
})

test('a senha em claro não sobra dentro do hash', async () => {
  const hash = await gerarHashSenha('batata-frita-123')
  assert.equal(hash.includes('batata'), false)
})

test('hash corrompido ou ausente devolve false em vez de explodir', async () => {
  // Um throw aqui viraria 500 na rota de login — que já é meio caminho para
  // contar ao atacante que aquela conta existe.
  for (const ruim of [undefined, '', 'lixo', 'scrypt$soUmaParte', 'bcrypt$aa$bb', 'scrypt$zz$zz']) {
    assert.equal(await conferirSenha('qualquer', ruim as string), false, String(ruim))
  }
})

test('senha fraca é recusada na hora de definir', () => {
  assert.equal(senhaAceitavel('curta').ok, false)
  assert.equal(senhaAceitavel('123456789012').ok, false) // só dígitos
  assert.equal(senhaAceitavel('revenda-do-ze-2026').ok, true)
})

// ── Token e sessão ────────────────────────────────────────────────────────

test('dois tokens nunca saem iguais', () => {
  const vistos = new Set(Array.from({ length: 200 }, () => gerarToken()))
  assert.equal(vistos.size, 200)
})

test('o que fica gravado é o HASH do token, não o token', () => {
  const { token, sessao } = montarSessao('RV03')
  assert.notEqual(sessao.tokenHash, token)
  assert.equal(sessao.tokenHash, hashToken(token))
  // Se o banco vazar, o que está lá não abre nada.
  assert.equal(JSON.stringify(sessao).includes(token), false)
})

test('sessão nasce válida e vence na hora combinada', () => {
  const agora = Date.parse('2026-08-07T09:00:00Z')
  const { sessao } = montarSessao('RV03', agora)
  assert.equal(sessaoExpirada(sessao, agora), false)
  assert.equal(sessaoExpirada(sessao, agora + (HORAS_DE_SESSAO - 1) * 3_600_000), false)
  assert.equal(sessaoExpirada(sessao, agora + HORAS_DE_SESSAO * 3_600_000), true)
})

test('sessão com data ilegível conta como expirada', () => {
  // Na dúvida, fecha a porta.
  assert.equal(
    sessaoExpirada({ tokenHash: 'x', revendedorId: 'RV03', criadaEm: 'x', expiraEm: 'nunca' }),
    true
  )
})

test('cabeçalho Authorization é lido só no formato esperado', () => {
  assert.equal(tokenDoCabecalho('Bearer abc123'), 'abc123')
  assert.equal(tokenDoCabecalho('bearer abc123'), 'abc123')
  for (const ruim of [undefined, '', 'abc123', 'Basic abc123', 'Bearer ', 'Bearer a b']) {
    assert.equal(tokenDoCabecalho(ruim as string), null, String(ruim))
  }
})

test('limite de tentativas de login fecha no número combinado', () => {
  assert.equal(passouDoLimiteDeTentativas(MAX_TENTATIVAS_LOGIN_POR_HORA - 1), false)
  assert.equal(passouDoLimiteDeTentativas(MAX_TENTATIVAS_LOGIN_POR_HORA), true)
})

// ── Recuperação de senha ──────────────────────────────────────────────────

test('código tem sempre 6 dígitos, inclusive quando sorteia número pequeno', () => {
  // Sem o padStart, o sorteio de 42 viraria um código de 2 dígitos — e um
  // código curto é um código fácil de chutar.
  for (let i = 0; i < 500; i++) {
    const c = gerarCodigoRecuperacao()
    assert.match(c, /^\d{6}$/, 'código fora do formato: ' + c)
  }
})

test('os códigos variam (não é constante nem sequência)', () => {
  const vistos = new Set(Array.from({ length: 300 }, () => gerarCodigoRecuperacao()))
  // 300 sorteios em 1 milhão: repetir muito indicaria gerador quebrado.
  assert.ok(vistos.size > 290, 'variedade baixa demais: ' + vistos.size)
})

test('código vence na hora combinada', () => {
  const agora = Date.parse('2026-08-07T09:00:00Z')
  const p = {
    revendedorId: 'RV03', chutes: 0,
    codigoHash: 'x',
    expiraEm: new Date(agora + MINUTOS_CODIGO_RECUPERACAO * 60_000).toISOString()
  }
  assert.equal(codigoExpirado(p, agora), false)
  assert.equal(codigoExpirado(p, agora + (MINUTOS_CODIGO_RECUPERACAO - 1) * 60_000), false)
  assert.equal(codigoExpirado(p, agora + MINUTOS_CODIGO_RECUPERACAO * 60_000), true)
})

test('código com data ilegível conta como expirado', () => {
  assert.equal(codigoExpirado({ revendedorId: 'RV03', codigoHash: 'x', expiraEm: 'nunca', chutes: 0 }), true)
})

test('código queima depois do teto de chutes', () => {
  // Seis dígitos é 1 milhão de possibilidades — sem teto, um script chega lá.
  const p = (chutes: number) => ({ revendedorId: 'RV03', codigoHash: 'x', expiraEm: 'z', chutes })
  assert.equal(codigoQueimado(p(MAX_CHUTES_NO_CODIGO - 1)), false)
  assert.equal(codigoQueimado(p(MAX_CHUTES_NO_CODIGO)), true)
  assert.equal(codigoQueimado(p(MAX_CHUTES_NO_CODIGO + 3)), true)
})

test('o código é guardado com hash, e o hash confere', async () => {
  const codigo = gerarCodigoRecuperacao()
  const hash = await gerarHashSenha(codigo)
  assert.equal(hash.includes(codigo), false, 'o código em claro sobrou no hash')
  assert.equal(await conferirSenha(codigo, hash), true)
  assert.equal(await conferirSenha('000000', hash), codigo === '000000')
})

test('e-mail: aceita o plausível e recusa o que não é endereço', () => {
  for (const bom of ['a@b.co', 'ze.silva@fhvptech.com', 'REV+tag@dominio.com.br']) {
    assert.equal(emailAceitavel(bom), true, bom)
  }
  for (const ruim of ['', 'ze', 'ze@', '@dominio.com', 'ze@dominio', 'a b@c.com', 'ze@do minio.com']) {
    assert.equal(emailAceitavel(ruim), false, ruim)
  }
})
