/**
 * O sistema tem que servir num tablet — deitado e em pé.
 *
 * ── Por que este arquivo lê CSS e JSX em vez de medir a tela ─────────────────
 * O que se quer provar aqui é layout: alvo grande o bastante para o dedo,
 * tabela que rola em vez de cortar, menu que sai da frente numa tela estreita.
 * Nada disso o jsdom calcula — ele não faz layout, não tem viewport de verdade
 * e não conhece `any-pointer`. Medir de mentira daria um teste que passa
 * enquanto o lojista não consegue tocar no botão.
 *
 * Então aqui ficam as travas estruturais: as peças existem, e continuam ligadas
 * onde precisam estar. A conferência de olho é no roteiro manual, no aparelho.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SRC = join(AQUI, '..', '..')
const CSS = readFileSync(join(SRC, 'index.css'), 'utf8')
const APP = readFileSync(join(SRC, 'App.tsx'), 'utf8')

/**
 * Só o bloco de toque, delimitado pelo `@media print` que vem logo depois.
 *
 * Recortar por número de caracteres pareceria mais simples e seria uma
 * armadilha: bastaria um seletor mais longo para a janela deixar de alcançar o
 * que se quer conferir, e o teste reprovaria sem nada estar errado.
 */
function blocoDeToque(): string {
  const inicio = CSS.indexOf('any-pointer: coarse')
  if (inicio === -1) return ''
  const resto = CSS.slice(inicio)
  const fim = resto.indexOf('@media print')
  return fim > 0 ? resto.slice(0, fim) : resto
}

function arquivosDeTela(dir: string): string[] {
  const achados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      if (nome === '__tests__') continue
      achados.push(...arquivosDeTela(caminho))
    } else if (nome.endsWith('.tsx')) {
      achados.push(caminho)
    }
  }
  return achados
}

describe('tela 1 — o Painel no celular', () => {
  const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')

  it('★ zero cor literal: toda cor de estado vem de token', () => {
    // Cor literal não tem tema escuro e não há como redefini-la num lugar só.
    // O diagnóstico chamou isso de "cores de estado sem sistema" (§1, item 10).
    const literais = PAINEL.split('\n')
      .map((l, i) => ({ l: l.trim(), n: i + 1 }))
      .filter(({ l }) => /\b(text|bg|border-t|border)-(red|amber|yellow|green|blue|slate|orange|indigo|purple|pink)-\d{2,3}\b/.test(l))
      .map(({ l, n }) => `${n}: ${l.slice(0, 70)}`)
    expect(literais, 'cor literal sobrando no Painel').toEqual([])
  })

  it('★ o título que repete o nome da aba some no celular', () => {
    // A pílula acesa na ilha já diz onde você está. O título de 24px mais o
    // parágrafo de três linhas gastavam ~40% da primeira tela antes de aparecer
    // um número (§5.1).
    expect(PAINEL).toMatch(/<div className="hidden lg:block">\s*\n\s*<h2/)
  })

  it('★ o filtro de período cabe numa linha só', () => {
    // Antes "7 dias" quebrava em "7 / dias" e o botão "Mês" era empurrado para
    // fora da caixa cinza (§1, item 11).
    expect(PAINEL).toContain('flex w-full lg:w-auto gap-1 p-1 bg-muted rounded-lg')
    expect(PAINEL).toContain('flex-1 lg:flex-none')
    expect(PAINEL).toContain('whitespace-nowrap')

    const MES = readFileSync(join(SRC, 'components', 'FiltroMesPopover.tsx'), 'utf8')
    expect(MES).toContain('shrink-0 whitespace-nowrap')
  })

  it('valores usam a monoespaçada que alinha a vírgula', () => {
    // Sem `tabular-nums` os algarismos têm larguras diferentes e a coluna dança
    // a cada linha (§6).
    // O tamanho virou par responsivo (14 no celular, 15 no monitor); o que
    // importa guardar é a monoespaçada, que é quem alinha a vírgula.
    expect(PAINEL).toContain('className="num text-[14px] lg:text-[15px] text-critical"')
    expect(PAINEL).toContain('text-[14px] lg:text-[15px] text-warn shrink-0')
  })

  it('★ nenhuma tabela, e nenhuma largura fixa de layout', () => {
    // As duas primeiras causas de rolagem lateral que a §11 nomeia.
    expect(PAINEL).not.toContain('<table')
    const fixas = (PAINEL.match(/(^|[^-])w-\[(\d+)px\]/g) || [])
      .map((m) => Number(m.match(/(\d+)/)![1]))
      .filter((px) => px > 40)
    expect(fixas, 'largura fixa de layout no Painel').toEqual([])
  })

  it('a linha de cliente tem alvo de toque e não estoura com nome longo', () => {
    // `min-w-0` é a terceira causa de rolagem lateral: sem ele o nome se recusa
    // a encolher e empurra o valor para fora da tela.
    const linha = PAINEL.slice(
      PAINEL.indexOf('Ver dívidas e parcelas em atraso') - 400,
      PAINEL.indexOf('Ver dívidas e parcelas em atraso') + 400
    )
    expect(linha).toContain('min-h-[56px]')
    expect(linha).toContain('min-w-0')
  })
})

describe('a ilha de navegação do celular (roteiro §3)', () => {
  const ILHA = readFileSync(
    join(SRC, '..', '..', '..', 'packages', 'core', 'src', 'ui', 'BarraInferiorMobile.tsx'),
    'utf8'
  )

  /** Só o bloco da ilha, recortado pelo `@media` seguinte. */
  function blocoDaIlha(): string {
    // ⚠️ Começa no `@media`, e não em `.ilha-abas`: aquele é o MEIO do seletor
    // `[data-alvo='web'] .ilha-abas`, e a fatia sairia sem o escopo justamente
    // no primeiro pedaço — fazendo a guarda de escopo acusar um vazamento que
    // não existe.
    const inicio = CSS.indexOf('@media (max-width: 1023.98px)')
    if (inicio === -1) return ''
    const resto = CSS.slice(inicio)
    const fim = resto.indexOf('@media print')
    return fim > 0 ? resto.slice(0, fim) : resto
  }

  it('★ é fixa, e descolada da borda', () => {
    // `fixed` faz a barra aparecer sem rolar; o `bottom` com folga é o que dá o
    // ar de aplicativo e a tira de cima da barra de gestos. O relato que gerou
    // isto foi "eu tinha que descer a tela toda pra ela aparecer".
    const bloco = blocoDaIlha()
    expect(bloco).toContain('position: fixed')
    expect(bloco).toContain('bottom: calc(14px + env(safe-area-inset-bottom, 0px))')
    expect(bloco).not.toMatch(/\.ilha-abas\s*\{[^}]*bottom:\s*0/)
  })

  it('★ é uma ilha: arredondada, com sombra e largura limitada', () => {
    const bloco = blocoDaIlha()
    expect(bloco).toContain('border-radius: 999px')
    expect(bloco).toContain('max-width: 404px')
    expect(bloco).toMatch(/box-shadow:/)
  })

  it('★ a pílula é IRMÃ das abas e vem ANTES delas no DOM', () => {
    // Fundo de link não escorrega, e dentro do link a pílula passaria POR CIMA
    // do ícone de cada aba que atravessasse.
    const pilula = ILHA.indexOf('className="ilha-pilula"')
    const primeiraAba = ILHA.indexOf('className="ilha-aba"')
    expect(pilula).toBeGreaterThan(-1)
    expect(primeiraAba).toBeGreaterThan(pilula)
  })

  it('★ ela fica POR BAIXO, e as abas por cima', () => {
    const bloco = blocoDaIlha()
    expect(bloco).toMatch(/\.ilha-pilula\s*\{[^}]*z-index:\s*0/)
    expect(bloco).toMatch(/\.ilha-aba\s*\{[^}]*z-index:\s*1/)
  })

  it('★ a posição vem da GRADE, sem conta de pixel', () => {
    // A pílula ocupa a mesma célula da aba ativa: ela tem a largura da aba
    // sempre, e acompanha sozinha se o rótulo crescer.
    const bloco = blocoDaIlha()
    expect(bloco).toMatch(/grid-template-columns: repeat\(var\(--n\), 1fr\)/)
    expect(bloco).toMatch(/\.ilha-pilula\s*\{[^}]*grid-column: var\(--i\)/)
    expect(ILHA).toContain("'--i': atual + 1")
  })

  it('★ ela ESCORREGA, em 0,28s, e só com movimento permitido', () => {
    const bloco = blocoDaIlha()
    expect(bloco).toContain('@keyframes escorregar-aba')
    expect(bloco).toContain('animation: escorregar-aba 0.28s cubic-bezier(0.4, 0, 0.2, 1) both')
    // Todo o movimento tem que estar dentro da preferência do sistema: com
    // movimento reduzido a pílula simplesmente aparece no lugar.
    const abre = bloco.indexOf('prefers-reduced-motion: no-preference')
    expect(abre, 'a animação saiu de dentro do prefers-reduced-motion').toBeGreaterThan(-1)
    expect(bloco.indexOf('@keyframes escorregar-aba')).toBeGreaterThan(abre)
  })

  it('★ a animação TOCA DE NOVO a cada troca de aba', () => {
    // Sem a `key`, a animação do CSS roda uma vez só, na montagem.
    expect(ILHA).toContain('key={atual}')
    expect(ILHA).toContain("'--aba-de': casas")
  })

  it('★ quem rola reserva a altura dela', () => {
    // `fixed` faz a barra aparecer; o respiro faz o CONTEÚDO terminar acima
    // dela. Faltando o segundo, a última linha da lista fica escondida para
    // sempre — nas capturas antigas a barra cortava a venda nº 66.
    expect(blocoDaIlha()).toContain('padding-bottom: calc(92px + env(safe-area-inset-bottom, 0px))')
    expect(APP).toContain('tem-ilha')
  })

  it('★ vale só na web, e só abaixo de 1024px', () => {
    const bloco = blocoDaIlha()
    for (const regra of bloco.split('}').filter((r) => r.includes('.ilha-'))) {
      expect(regra, `regra sem escopo de web: ${regra.trim().slice(0, 50)}`).toContain(
        "[data-alvo='web']"
      )
    }
    // 1023.98 e não 767: em 1024 já é painel, e o tablet em pé continua com a
    // ilha (§3.8).
    expect(CSS).toContain('@media (max-width: 1023.98px)')
  })

  it('★ ou hambúrguer, ou ilha — não os dois', () => {
    expect(APP).toContain("{__ALVO__ !== 'web' && (")
    // "Mais" é uma rota, não a gaveta abrindo por cima.
    expect(APP).toMatch(/id: 'mais'[\s\S]{0,120}aoTocar: ir\('\/mais'\)/)
    expect(APP).toContain('path="/mais"')
  })

  it('a aba tem alvo de toque de sobra, e o foco aparece', () => {
    const bloco = blocoDaIlha()
    expect(bloco).toContain('min-height: 52px')
    expect(bloco).toContain(':focus-visible')
  })

  it('★ o toque tem resposta própria depois de apagar a do sistema', () => {
    // Desligar o retângulo do navegador e não pôr nada no lugar é PIOR que o
    // retângulo: aquele lampejo é a única confirmação de que o toque pegou.
    const bloco = blocoDaIlha()
    expect(bloco).toContain('-webkit-tap-highlight-color: transparent')
    expect(bloco).toMatch(/\.ilha-aba:active/)
  })

  it('★ todo hover nasce dentro de (hover: hover)', () => {
    // Sem isto o celular entra no estado de hover ao tocar e FICA PRESO nele.
    const TW = readFileSync(join(SRC, '..', 'tailwind.config.js'), 'utf8')
    expect(TW).toContain('hoverOnlyWhenSupported: true')
  })

  it('★ a entrada é escalonada, roda uma vez e tem TETO', () => {
    // Sem o teto o 12º bloco chegaria quase um segundo depois do primeiro, e a
    // tela pareceria travada em vez de animada.
    expect(CSS).toContain('entrada-escalonada')
    expect(CSS).toContain('nth-child(n + 6)')
    const bloco = CSS.slice(CSS.indexOf('surgir-bloco') - 600, CSS.indexOf('entrada-escalonada'))
    expect(bloco).toContain('prefers-reduced-motion: no-preference')
  })

  it('★ o Painel é DENSO: o respiro do monitor não vai para a tela de 360', () => {
    // O pedido não era fonte menor, era TAMANHO. Cada redução carrega o par
    // `lg:` com o valor antigo, então o monitor fica onde estava.
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')

    // respiro entre blocos: 12 no celular, 24 no monitor
    expect(PAINEL).toContain('gap-3 mb-3 lg:gap-4 lg:mb-6')
    // respiro interno dos cartões de alerta
    expect(PAINEL).toContain('p-3 lg:p-5')

    /*
     * ⚠️ Nenhuma redução de PADDING pode ficar sem o par de desktop, senão ela
     * vaza para o monitor.
     *
     * A busca é por `p-3` como classe inteira e precedida de espaço ou aspas:
     * procurar a sequência solta encontrava `gap-3`, `mb-3` e `space-y-3`, que
     * não são padding e têm par próprio.
     */
    const semPar = PAINEL.split('\n')
      .filter((l) => /["' ]p-3(?![\d.])/.test(l) && !l.includes('lg:p-'))
      .map((l) => l.trim().slice(0, 60))
    expect(semPar, 'padding reduzido sem o par lg: vaza para o desktop').toEqual([])
  })

  it('★ o alvo de toque NÃO encolheu junto com o respiro', () => {
    // O que saiu foi o espaço em volta do texto, nunca a área do dedo.
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('min-h-[56px]')
    expect(PAINEL).toContain('min-h-[44px]')
  })

  it('★ o cartão recolhido continua dizendo o total', () => {
    // Lição do SecaoConfig: sem resumo, seção fechada vira caixa preta e a
    // pessoa reabre todas — e aí recolher não economizou nada.
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('const CabecalhoAlerta')
    expect(PAINEL).toContain('resumo={fmt(inadimplentes.reduce')
    // até 2 itens nasce aberto; do 3º em diante, fechado
    expect(PAINEL).toContain('quantos <= 2')
    // e no monitor ele nunca recolhe
    expect(PAINEL).toContain("aberto ? 'block' : 'hidden lg:block'")
  })

  it('★ o Assistente NASCE fora do caminho, mas continua arrastável', () => {
    // ⚠️ A primeira tentativa fixava a posição dele pelo CSS. Isso tirava o
    // botão de cima do conteúdo e MATAVA o arraste junto, que era justamente o
    // que o dono usava. A regra certa não é amarrar: é mudar o padrão.
    const CHAT = readFileSync(join(SRC, 'components', 'ChatAssistente.tsx'), 'utf8')

    // 88 = 14 (folga da ilha) + 62 (altura dela) + 12 de respiro.
    expect(CHAT).toMatch(/window\.innerWidth < 1024/)
    expect(CHAT).toContain('{ right: 14, bottom: 88 }')

    // O arraste segue vivo: sem `touch-none` o navegador lê o gesto como
    // rolagem e o botão não sai do lugar.
    expect(CHAT).toContain('onPointerDown={aoPressionar}')
    expect(CHAT).toContain('touch-none')

    // E nada no CSS pode voltar a amarrar as duas propriedades.
    expect(blocoDaIlha()).not.toContain('.fab-assistente')
  })

  it('★ e ele TEM deslocamento: `fixed` sem right/bottom é um botão invisível', () => {
    /*
     * Foi assim que ele sumiu de verdade, e o defeito é traiçoeiro: a posição
     * tinha virado VARIÁVEL de CSS para uma media query poder sobrepô-la, mas
     * nunca houve uma regra BASE lendo essas variáveis — só a da media query.
     * Quando ela saiu, o botão ficou `position: fixed` sem `right` nem
     * `bottom` e parou onde calhou, fora da vista.
     *
     * Nada disso quebra build, typecheck ou teste de comportamento: o elemento
     * existe e está no DOM. Só aparece no aparelho.
     */
    const CHAT = readFileSync(join(SRC, 'components', 'ChatAssistente.tsx'), 'utf8')
    expect(CHAT).toContain('style={{ right: pos.right, bottom: pos.bottom }}')
    // Variável de CSS aqui só volta a valer com uma regra base que a leia.
    expect(CHAT).not.toContain('--fab-right')
  })

  it('★ no celular ele é só o círculo, sem o rótulo', () => {
    // A cápsula com a palavra "Assistente" tinha quase 150px numa tela de 360 e
    // cobria nome de cliente, preço e valor de venda nas quatro capturas.
    const CHAT = readFileSync(join(SRC, 'components', 'ChatAssistente.tsx'), 'utf8')
    expect(CHAT).toContain('h-12 w-12 touch-none')
    expect(CHAT).toMatch(/hidden text-sm font-medium lg:inline/)
    expect(CHAT).toContain('aria-label="Assistente de IA"')
  })

  it('★ existe UMA faixa branca no topo, não duas', () => {
    // A tira antiga continuou renderizando VAZIA quando o hambúrguer e o sino
    // saíram dela, e o celular ficou com duas barras empilhadas. Ela some
    // abaixo de 1024 — mas NÃO pode sumir da web inteira: na loja aberta num PC
    // é ela que carrega o sino.
    expect(APP).toContain("__ALVO__ === 'web' ? 'hidden lg:flex' : 'flex'")
  })

  it('★ o sino mora à direita da marca, e o painel dele cabe na tela', () => {
    // Ele já esteve flutuando no canto inferior esquerdo, e isso quebrou o
    // popup: ele se ancora ABAIXO do sino e alinhado à direita dele, então lá
    // o topo caía fora da dobra e a âncora da direita empurrava os 320px
    // do painel para fora pela esquerda.
    expect(APP).not.toContain('fixed left-[14px] z-[19]')
    const naMarca = APP.slice(APP.indexOf('<BarraMarca>'), APP.indexOf('</BarraMarca>'))
    expect(naMarca).toContain('SinoNotificacoesHost')

    const MARCA = readFileSync(join(SRC, 'components', 'BarraMarca.tsx'), 'utf8')
    expect(MARCA).toContain('min-w-0 flex-1 truncate')
  })

  it('★ a faixa de topo é a marca, e só no celular', () => {
    const MARCA = readFileSync(join(SRC, 'components', 'BarraMarca.tsx'), 'utf8')
    expect(MARCA).toContain('lg:hidden')
    expect(MARCA).toContain('sticky top-0')
    // Abaixo do 20 da ilha: a faixa nunca cobre a navegação.
    expect(MARCA).toContain('z-[15]')
    // O nome é texto de verdade, não recorte da imagem: acompanha o tema
    // escuro e o leitor de tela o lê.
    expect(MARCA).toMatch(/FHVP <span className="text-primary">Tech<\/span>/)
  })

  it('a barra do núcleo não conhece o roteador', () => {
    expect(ILHA).not.toContain('react-router')
  })
})

describe('o dedo alcança os alvos', () => {
  /**
   * A regra mora no CSS, e não espalhada em 67 classes, por um motivo: subir
   * o tamanho nas telas engordaria também a janela do desktop, onde o mouse
   * acerta 32px sem esforço.
   */
  it('existe um bloco para ponteiro grosso', () => {
    expect(CSS, 'o bloco de toque sumiu do index.css').toContain('any-pointer: coarse')
  })

  it('e ele é `any-pointer`, não `pointer`', () => {
    // O tablet do lojista tem teclado acoplado, e nesse arranjo o navegador
    // pode declarar o ponteiro PRINCIPAL como fino. `pointer: coarse` deixaria
    // as regras de fora justamente no aparelho para o qual foram escritas.
    expect(blocoDeToque()).toContain('min-height: 44px')
  })

  /**
   * Ponteiro grosso sozinho não basta: um notebook Windows com tela sensível
   * também casa, e receberia os alvos maiores — mudando a aparência de quem já
   * usa o aplicativo instalado e nunca pediu isso.
   */
  it('as regras valem só na página servida pelo navegador', () => {
    const seletores = blocoDeToque()
      .split(/\r?\n/)
      .filter((l) => l.trim().endsWith(',') || l.trim().endsWith('{'))
      .filter((l) => !l.includes('@media') && !l.trim().startsWith('*') && !l.trim().startsWith('/'))
      .filter((l) => l.trim().length > 1)

    const soltos = seletores.filter((l) => !l.includes("[data-alvo='web']"))
    expect(soltos, 'seletor sem [data-alvo=web] vaza para o app instalado').toEqual([])
  })

  it('e a página web se identifica no boot', () => {
    const entrada = readFileSync(join(SRC, 'main.web.tsx'), 'utf8')
    expect(entrada, 'sem esta marca, nenhuma regra de toque aplica').toContain(
      "dataset.alvo = 'web'"
    )
  })

  it('44px, que é o mínimo que o dedo pede', () => {
    expect(CSS).toMatch(/min-height:\s*44px/)
    expect(CSS, 'botão só de ícone também precisa de largura').toMatch(/min-width:\s*44px/)
  })

  /**
   * A tabela corta o nome e deixa o inteiro no `title`, que no toque não
   * existe. Sem isto, "aliança ouro 18k 4mm" e "aliança ouro 18k 6mm" ficam
   * indistinguíveis na tela do lojista.
   */
  it('nome cortado volta a caber quando não há hover', () => {
    const bloco = blocoDeToque()
    expect(bloco).toContain('td .truncate')
    expect(bloco).toMatch(/white-space:\s*normal/)
  })
})

describe('a tela estreita cabe', () => {
  it('a barra lateral vira gaveta abaixo de lg', () => {
    expect(APP, 'a gaveta perdeu o estado').toContain('menuAberto')
    expect(APP, 'sem `lg:static` ela ficaria por cima também na tela larga').toContain('lg:static')
    expect(APP).toContain('lg:translate-x-0')
  })

  it('há como abrir e como fechar sem escolher nada', () => {
    expect(APP, 'sumiu o botão que abre').toContain('Abrir menu')
    expect(APP, 'sumiu o véu que fecha ao tocar fora').toContain('Fechar menu')
  })

  /**
   * O desktop não pode ganhar uma faixa vazia que nunca existiu: a barra de
   * cima só aparecia para o gerente, por causa do sino.
   */
  it('a barra de cima continua escondida para vendedor em tela larga', () => {
    expect(APP).toContain("vendedor?.papel === 'dono' ? '' : 'lg:hidden'")
  })

  /**
   * Tabela sem rolagem horizontal corta coluna em silêncio — o lojista não vê
   * que existe mais à direita. Já aconteceu antes com `overflow-hidden`.
   */
  it('toda tabela pode rolar de lado', () => {
    const semRolagem = arquivosDeTela(SRC)
      .filter((f) => {
        const fonte = readFileSync(f, 'utf8')
        return fonte.includes('<table') && !/overflow-(x-)?auto|overflow-x-scroll/.test(fonte)
      })
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, '/'))

    expect(
      semRolagem,
      'tabela sem rolagem horizontal: em tela estreita ela corta coluna sem avisar'
    ).toEqual([])
  })
})
