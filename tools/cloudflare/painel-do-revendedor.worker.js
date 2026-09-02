/**
 * Worker do Cloudflare — publica o painel do revendedor em
 * `https://fhvptech.com/painel-do-revendedor/`.
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 * O painel mora no Fly, em `licenca-gnmodas.fly.dev` — um endereço com nome de
 * um cliente antigo, que é o que o revendedor veria ao abrir o link. Este
 * Worker põe a marca na frente sem mover nada de lugar.
 *
 * ⚠️ Ele SOMA um endereço, nunca substitui. O `.fly.dev` continua respondendo
 * porque está compilado dentro de todo instalador que já saiu: ativação de
 * licença, PIX, chatbot, recuperação de PIN, emissão de NFC-e e o relay do
 * segundo caixa apontam para lá. Uma loja que nunca atualizar vai falar com
 * aquele endereço para sempre. Desligá-lo derruba tudo isso de uma vez.
 *
 * ── A barra no fim não é detalhe ────────────────────────────────────────────
 * A página usa caminhos RELATIVOS (`painel.css`, `revenda/login`). O navegador
 * os resolve contra o diretório do endereço atual:
 *
 *   /painel-do-revendedor    → diretório é `/`         → /painel.css          ✗
 *   /painel-do-revendedor/   → diretório é o próprio   → /painel-do-.../css   ✓
 *
 * Sem a barra, o CSS e a API saem para a raiz de fhvptech.com, onde este Worker
 * não escuta: a página abre sem estilo e o login não responde. Por isso a
 * primeira coisa aqui é o redirecionamento — e por isso ele não é opcional.
 *
 * ── Só a superfície do revendedor passa ─────────────────────────────────────
 * A lista abaixo é fechada por padrão. As rotas `/admin/*` existem no mesmo
 * backend e exigem o ADMIN_TOKEN, mas não têm por que ficar alcançáveis a
 * partir de um endereço público de marca: o painel da FHVP continua só no
 * `.fly.dev`. Encaminhar tudo seria mais curto de escrever e ampliaria a
 * superfície sem ninguém ganhar nada.
 */

const PREFIXO = '/painel-do-revendedor'
const DESTINO = 'https://licenca-gnmodas.fly.dev'

/** O que o painel do revendedor precisa, e nada além disso. */
function permitido(caminho) {
  return (
    caminho === '/painel' ||
    caminho === '/painel.css' ||
    caminho === '/painel-logo.png' ||
    caminho === '/revenda' ||
    caminho.startsWith('/revenda/')
  )
}

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (!url.pathname.startsWith(PREFIXO)) {
      return new Response('Não encontrado.', { status: 404 })
    }

    // Sem barra no fim, os caminhos relativos da página escapam do prefixo.
    if (url.pathname === PREFIXO) {
      return Response.redirect(`${url.origin}${PREFIXO}/${url.search}`, 301)
    }

    // `/painel-do-revendedor/revenda/login` → `/revenda/login`
    let caminho = url.pathname.slice(PREFIXO.length)
    if (caminho === '/') caminho = '/painel'

    if (!permitido(caminho)) {
      return new Response('Não encontrado.', { status: 404 })
    }

    const alvo = DESTINO + caminho + url.search
    // `new Request(alvo, request)` preserva método, cabeçalhos e corpo — é o
    // que faz o POST do login chegar inteiro do outro lado.
    const encaminhado = new Request(alvo, request)
    encaminhado.headers.set('Host', new URL(DESTINO).host)

    const resposta = await fetch(encaminhado)

    // Resposta copiada para poder mexer nos cabeçalhos (a original é imutável).
    const saida = new Response(resposta.body, resposta)
    // O backend não sabe que está atrás de um domínio de marca; garantir aqui
    // evita que um proxy no meio guarde a página de um revendedor e sirva para
    // outro.
    saida.headers.set('Cache-Control', caminho === '/painel-logo.png'
      ? 'public, max-age=86400'
      : caminho === '/painel.css'
        ? 'public, max-age=300'
        : 'no-store')
    return saida
  }
}
