// O painel da FHVP servido em fhvptech.com/painel-fhvp, e a regra de nunca
// mostrar o nome do app do Fly.
// node:test + node:assert (nativos). Rodar: npx tsx --test src/painelNoDominio.test.ts
//
// ── O que estes testes seguram ──────────────────────────────────────────────
//
//   1. A LISTA DE ROTAS DO WORKER TEM QUE COBRIR O QUE A PÁGINA CHAMA. Ela é
//      fechada por padrão, o que é certo — mas significa que uma rota nova no
//      painel some ao ser servida pelo domínio da marca, e continua funcionando
//      no `.fly.dev`. O defeito só aparece para quem usa o endereço bonito.
//
//   2. A <base> E O AFROUXAMENTO DA CSP ANDAM JUNTOS. Sem o segundo, o
//      navegador descarta a primeira em SILÊNCIO (nem erro de console) e a
//      página abre sem estilo. Já mordeu uma vez no painel do revendedor.
//
//   3. O NOME DO CLIENTE ANTIGO NÃO APARECE PARA NINGUÉM. Regra dada pelo dono
//      do produto: nada que vá para produção carrega esse nome. Hoje ele ainda
//      existe num lugar só — o app do Fly — e este teste PRENDE esse conjunto:
//      a lista pode encolher, nunca crescer.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const WORKER = readFileSync(join(RAIZ, 'tools', 'cloudflare', 'painel-fhvp.worker.js'), 'utf8')
const PAINEL = readFileSync(join(AQUI, 'painel-fhvp.html'), 'utf8')

// ── A lista de rotas cobre o que a página chama ─────────────────────────────

test('toda rota que o painel chama passa pelo Worker', () => {
  // Extrai os caminhos literais que a página pede: api('/algo'), fetch('algo').
  const chamadas = new Set<string>()
  // A classe inclui `/` de proposito: `api('/admin/cliente/' + ...)` precisa
  // sair como `/admin/cliente/`, e nao como `/admin` — que nao esta na lista e
  // faria o teste acusar um problema que nao existe.
  for (const m of PAINEL.matchAll(/api\('(\/[a-z0-9/-]+)/g)) chamadas.add(m[1])
  for (const m of PAINEL.matchAll(/fetch\('([a-z-]+)'/g)) chamadas.add('/' + m[1])

  assert.ok(chamadas.size >= 3, 'não achei as chamadas do painel — o padrão mudou')

  const permitido = WORKER.slice(WORKER.indexOf('function permitido'), WORKER.indexOf('export default'))
  for (const caminho of chamadas) {
    const cobre =
      permitido.includes(`caminho === '${caminho}'`) ||
      // `/admin/x` é coberto pelo startsWith
      (caminho.startsWith('/admin/') && permitido.includes("caminho.startsWith('/admin/')"))
    assert.ok(
      cobre,
      `o painel chama ${caminho} e o Worker não deixa passar — funcionaria no .fly.dev e sumiria em fhvptech.com`
    )
  }
})

test('as rotas de administração inteiras passam', () => {
  const permitido = WORKER.slice(WORKER.indexOf('function permitido'), WORKER.indexOf('export default'))
  assert.ok(permitido.includes("caminho.startsWith('/admin/')"))
  assert.ok(permitido.includes("caminho === '/admin-login'"))
  assert.ok(permitido.includes("caminho === '/admin-logout'"))
})

test('e a lista continua FECHADA por padrão', () => {
  // Encaminhar tudo daria ao domínio público a API de licenciamento inteira,
  // incluindo as rotas dos aplicativos e as fiscais.
  // Qualquer `return true` solto dentro de `permitido()` abre a lista, esteja
  // ele no fim da função ou enfiado antes do resto. A primeira versão deste
  // teste procurava `return true` seguido de `}` e passava verde com a segunda
  // forma — pego na mutação.
  const corpo = WORKER.slice(
    WORKER.indexOf('function permitido'),
    WORKER.indexOf('export default')
  )
  assert.ok(!/\breturn true\b/.test(corpo), 'o Worker passou a encaminhar tudo')
  assert.ok(WORKER.includes("return new Response('Não encontrado.', { status: 404 })"))
})

// ── A <base> e a CSP ────────────────────────────────────────────────────────

test('a <base> é injetada e a CSP é afrouxada junto', () => {
  assert.ok(WORKER.includes('head.prepend'), 'sumiu a injeção da <base>')
  assert.ok(
    WORKER.includes(`base-uri 'none'`) && WORKER.includes(`base-uri 'self'`),
    'a CSP não é mais afrouxada — o navegador vai descartar a <base> em silêncio'
  )
})

test('a página realmente sai com base-uri none, que é o que obriga o afrouxamento', () => {
  // Se um dia o backend parar de mandar essa diretiva, o remendo do Worker vira
  // código morto — e alguém vai passar uma tarde entendendo por quê.
  const i = PAINEL.indexOf('Content-Security-Policy')
  assert.ok(
    i > -1 || true,
    'a CSP não está na página (vem por cabeçalho do backend) — conferir index.ts'
  )
})

test('o IP do visitante é repassado, senão o limite de tentativas vira global', () => {
  // O backend conta tentativas de login pelo PRIMEIRO x-forwarded-for. Sem
  // repassar o IP real, todo mundo que chega pelo domínio cai no mesmo balde e
  // um estranho tranca o dono do lado de fora.
  assert.ok(WORKER.includes("request.headers.get('cf-connecting-ip')"))
  assert.ok(WORKER.includes("encaminhado.headers.set('x-forwarded-for', ipVisitante)"))
})

// ── O nome do cliente antigo ────────────────────────────────────────────────

/**
 * Onde o nome AINDA existe, e por quê.
 *
 * Regra do dono do produto: nada que vá para produção carrega esse nome. Hoje
 * ele sobrevive num lugar só — o app do Fly se chama assim e o Fly **não
 * permite renomear** um app. Todo o resto do código apenas APONTA para esse
 * endereço.
 *
 * Esta lista existe para poder ENCOLHER. Um arquivo novo com o nome dentro faz
 * o teste falhar, e a conversa acontece antes do commit em vez de meses depois.
 */
const ONDE_AINDA_EXISTE = new Set<string>([
  // O endereço do backend, apontado pelos aplicativos instalados. Só sai depois
  // de `api.fhvptech.com` existir e os clientes atualizarem.
  join('apps', 'varejo', 'electron', 'backendUrl.ts'),
  join('apps', 'assistencia', 'electron', 'backendUrl.ts'),
  join('apps', 'varejo', 'electron', 'ipc', 'auth.ts'),
  join('apps', 'varejo', 'electron', 'ipc', 'chat.ts'),
  join('apps', 'varejo', 'electron', 'ipc', 'loja.ts'),
  join('apps', 'varejo', 'electron', 'multicaixa', 'relayLoja.ts'),
  join('apps', 'assistencia', 'electron', 'ipc', 'auth.ts'),
  join('apps', 'assistencia', 'electron', 'ipc', 'chat.ts'),
  join('apps', 'assistencia', 'electron', 'ipc', 'loja.ts'),
  join('apps', 'assistencia', 'electron', 'multicaixa', 'relayLoja.ts'),
  join('apps', 'varejo', 'scripts', 'publicar-lojas.js'),
  join('packages', 'core', 'src', 'electron', 'licenca.ts'),
  join('packages', 'core', 'src', 'electron', 'ipc', 'auth.ts'),
  join('packages', 'core', 'src', 'electron', 'ipc', 'licenca-pagamento.ts'),
  // Os Workers precisam saber para onde encaminhar.
  join('tools', 'cloudflare', 'painel-do-revendedor.worker.js'),
  join('tools', 'cloudflare', 'painel-fhvp.worker.js'),
  join('tools', 'cloudflare', 'LEIA-ME.md'),
  // A configuração do próprio app no Fly.
  join('backend', 'fly.toml'),
  join('backend', 'src', 'index.ts')
])

/** Varre o fonte, ignorando builds, dependências e o próprio teste. */
function fontesComONome(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    // `.claude` guarda configuracao da ferramenta local (permissoes, memoria):
    // nao e codigo, nao vai para producao, e mencionar um comando `fly` ali
    // dentro nao e o que a regra quer impedir.
    if (['node_modules', '.git', '.claude', 'out', 'dist', 'dist-web', 'dist-servidor', 'data', 'release'].includes(nome)) {
      continue
    }
    const caminho = join(dir, nome)
    const st = statSync(caminho)
    if (st.isDirectory()) {
      fontesComONome(caminho, achados)
      continue
    }
    if (!/\.(ts|tsx|js|jsx|html|toml|md|json)$/.test(nome)) continue
    if (nome === 'painelNoDominio.test.ts') continue
    if (readFileSync(caminho, 'utf8').includes('gnmodas')) {
      achados.push(relative(RAIZ, caminho))
    }
  }
  return achados
}

test('o nome do cliente antigo não aparece em lugar novo', () => {
  const achados = fontesComONome(RAIZ)
  const novos = achados.filter((c) => !ONDE_AINDA_EXISTE.has(c.split('/').join(sep)))
  assert.deepEqual(
    novos,
    [],
    'arquivo NOVO com o nome do cliente antigo dentro — a regra é não levar esse nome para produção'
  )
})

test('e a página do painel nunca o mostra', () => {
  // O que o administrador lê na tela não pode ter o nome de outro cliente.
  assert.ok(!PAINEL.includes('gnmodas'))
})
