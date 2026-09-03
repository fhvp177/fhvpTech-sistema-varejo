/**
 * Worker do Cloudflare — publica o painel da FHVP em
 * `https://fhvptech.com/painel-fhvp`.
 *
 * ── Por que existe ───────────────────────────────────────────────────────────
 * O backend mora no Fly, num app cujo nome carrega o de um cliente antigo. Esse
 * endereço não deve aparecer para ninguém — nem para quem administra. Este
 * Worker põe o painel atrás do domínio da marca; o `.fly.dev` continua
 * respondendo, mas deixa de ser o endereço que se digita.
 *
 * ── Por que é um Worker separado do painel-do-revendedor ────────────────────
 * Aquele Worker recusa `/painel-fhvp` de propósito: a lista de rotas dele é
 * fechada, e a decisão registrada era manter a administração fora do domínio
 * público para reduzir superfície.
 *
 * O que mudou: o painel deixou de ser aberto por um segredo colado à mão e
 * passou a ter login de verdade — senha forte obrigatória, comparação de tempo
 * constante, limite de tentativas por IP, sessão de 12h revogável. A superfície
 * que a decisão antiga evitava é a mesma que já existe no `.fly.dev`, e agora
 * ela é defendida.
 *
 * Separado, e não somado ao outro, para que as duas listas de rotas continuem
 * independentes: um erro de digitação aqui não pode abrir nada do lado do
 * revendedor, nem o contrário.
 *
 * ⚠️ Ele SOMA um endereço, nunca substitui. Nada no `.fly.dev` deixa de
 * funcionar — inclusive os clientes instalados, que falam com ele direto.
 *
 * ── A armadilha que já mordeu uma vez ───────────────────────────────────────
 * A página usa caminhos RELATIVOS, e é isso que a deixa servir dos dois
 * endereços. Servida em `/painel-fhvp`, sem barra no fim, o navegador resolve
 * `painel.css` contra a RAIZ do domínio — fora do que este Worker escuta — e a
 * página abre sem estilo.
 *
 * A saída é injetar `<base href="/painel-fhvp/">` no `<head>`. E aí vem a
 * segunda parte: a CSP da página traz `base-uri 'none'`, que PROÍBE essa tag.
 * Sem afrouxar a diretiva, o navegador descarta a `<base>` em SILÊNCIO — nem
 * erro de console aparece — e a página abre quebrada do mesmo jeito. Foi
 * exatamente assim que o bug apareceu no painel do revendedor.
 */

const PREFIXO = '/painel-fhvp'
const DESTINO = 'https://licenca-gnmodas.fly.dev'

/**
 * O que o painel da FHVP precisa, e nada além disso.
 *
 * Lista fechada por padrão: rota nova no backend não fica alcançável por este
 * endereço sem alguém escrever aqui. Encaminhar tudo seria mais curto e daria
 * ao domínio público a API inteira de licenciamento, incluindo as rotas que os
 * aplicativos usam e as fiscais.
 */
function permitido(caminho) {
  return (
    caminho === '/painel-fhvp' ||
    caminho === '/painel.css' ||
    caminho === '/painel-ui.js' ||
    caminho === '/painel-logo.png' ||
    // A porta de entrada e a saída do painel.
    caminho === '/admin-login' ||
    caminho === '/admin-logout' ||
    // As rotas de administração, todas atrás da sessão criada no login.
    caminho.startsWith('/admin/')
  )
}

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (!url.pathname.startsWith(PREFIXO)) {
      return new Response('Não encontrado.', { status: 404 })
    }

    // `/painel-fhvp` e `/painel-fhvp/` são a mesma coisa: a página. Qualquer
    // outro sufixo é o caminho real no backend.
    //   /painel-fhvp/admin-login  →  /admin-login
    let caminho = url.pathname.slice(PREFIXO.length)
    if (caminho === '' || caminho === '/') caminho = '/painel-fhvp'

    if (!permitido(caminho)) {
      return new Response('Não encontrado.', { status: 404 })
    }

    const alvo = DESTINO + caminho + url.search
    // `new Request(alvo, request)` preserva método, cabeçalhos e corpo — é o
    // que faz o POST do login chegar inteiro do outro lado.
    const encaminhado = new Request(alvo, request)
    encaminhado.headers.set('Host', new URL(DESTINO).host)

    // O backend conta tentativas de login por IP, lendo o PRIMEIRO valor de
    // `x-forwarded-for`. O Cloudflare já põe o IP do visitante ali; garantimos
    // que ele exista mesmo se algum dia isso mudar — sem isso, todo mundo que
    // chega por este endereço cairia no mesmo balde e um estranho conseguiria
    // trancar o dono do lado de fora.
    const ipVisitante = request.headers.get('cf-connecting-ip')
    if (ipVisitante) encaminhado.headers.set('x-forwarded-for', ipVisitante)

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
    if (caminho !== '/painel-fhvp') return saida

    // Ver o cabeçalho: sem afrouxar `base-uri`, a <base> abaixo é descartada em
    // silêncio e a página abre sem estilo. `'self'` é a menor abertura que
    // resolve — `*` ou remover a diretiva devolveria o buraco que ela fecha.
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
