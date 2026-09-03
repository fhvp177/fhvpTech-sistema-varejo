/**
 * Worker do Cloudflare — publica o painel do revendedor em
 * `https://fhvptech.com/painel-do-revendedor`.
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
 * ── O endereço fica limpo, sem barra no fim ─────────────────────────────────
 * A página usa caminhos RELATIVOS (`painel.css`, `revenda/login`) — é o que a
 * faz servir os dois endereços com o mesmo arquivo. Só que o navegador resolve
 * relativo contra o DIRETÓRIO do endereço atual, e o diretório de
 * `/painel-do-revendedor` é a raiz: `painel.css` sairia para
 * `fhvptech.com/painel.css`, fora do que este Worker escuta. A página abriria
 * sem estilo e sem conseguir falar com a API.
 *
 * A saída óbvia seria redirecionar para `/painel-do-revendedor/` — com a barra,
 * o diretório passa a ser o próprio prefixo e tudo resolve certo. Funciona, mas
 * deixa a barra na cara do revendedor.
 *
 * Então em vez de mexer no endereço, mexe-se na PÁGINA: o `HTMLRewriter` injeta
 * `<base href="/painel-do-revendedor/">` no `<head>` antes de entregar. A tag
 * `<base>` troca a referência contra a qual todo caminho relativo é resolvido —
 * inclusive os `fetch()` do JavaScript, que usam a base do documento. O
 * endereço fica `fhvptech.com/painel-do-revendedor`, sem barra, e os caminhos
 * saem certos mesmo assim.
 *
 * Custa uma passada de reescrita só no HTML (que é pequeno); CSS, imagem e as
 * chamadas de API passam direto, sem tocar no corpo.
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
    caminho === '/painel-ui.js' ||
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

    // `/painel-do-revendedor` e `/painel-do-revendedor/` são a mesma coisa: a
    // página. Qualquer outro sufixo é o caminho real no backend.
    //   /painel-do-revendedor/revenda/login  →  /revenda/login
    let caminho = url.pathname.slice(PREFIXO.length)
    if (caminho === '' || caminho === '/') caminho = '/painel'

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
    saida.headers.set(
      'Cache-Control',
      caminho === '/painel-logo.png'
        ? 'public, max-age=86400'
        : caminho === '/painel.css'
          ? 'public, max-age=300'
          : 'no-store'
    )

    // Só o HTML precisa da <base>; o resto passa intocado.
    if (caminho !== '/painel') return saida

    // ⚠️ A CSP da página traz `base-uri 'none'`, que PROÍBE a tag <base>.
    //
    // Não é descuido do backend: é defesa contra exatamente o que este Worker
    // faz de propósito — injetar uma <base> e com isso redirecionar todo
    // caminho relativo da página. Contra um atacante, essa diretiva é o que
    // impede sequestrar o CSS e as chamadas de API de uma vez.
    //
    // Servido direto pelo Fly, nada injeta <base> e a proibição continua
    // valendo inteira. Aqui, e só aqui, ela é afrouxada para `'self'`: a <base>
    // passa a ser permitida, mas apenas apontando para a própria origem. É a
    // menor abertura que resolve — trocar por `*` ou remover a diretiva
    // devolveria o buraco que ela existe para fechar.
    //
    // Sem isto o navegador descarta a <base> em silêncio (nem erro de console
    // aparece), os caminhos voltam a resolver contra a raiz do domínio, e a
    // página abre sem estilo nenhum. Foi assim que este bug apareceu.
    const csp = saida.headers.get('content-security-policy')
    if (csp) {
      saida.headers.set('content-security-policy', csp.replace("base-uri 'none'", "base-uri 'self'"))
    }

    return new HTMLRewriter()
      .on('head', {
        element(head) {
          // `prepend` põe a tag como PRIMEIRO filho do <head>. A posição
          // importa: a <base> só vale para o que vem depois dela, e o
          // <link rel="stylesheet"> da página está logo ali em cima.
          head.prepend(`<base href="${PREFIXO}/">`, { html: true })
        }
      })
      .transform(saida)
  }
}
