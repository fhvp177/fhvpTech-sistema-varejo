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

/**
 * O fonte sem comentário nenhum.
 *
 * ⚠️ Guarda estrutural TEM que ler daqui. Já aconteceu três vezes nesta
 * reforma de um teste casar com o termo dentro do comentário que explica por
 * que aquele termo existe — e passar verde com o código apagado. O comentário
 * cita `min-w-0`, cita `key={aba}`, cita o nome da classe: ele é justamente o
 * lugar onde as palavras que a guarda procura aparecem de novo.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
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
      .filter(({ l }) =>
        // ⚠️ A lista precisa ser a paleta INTEIRA. Quando ela tinha só as
        // cores óbvias, um `text-emerald-600` passou batido no cartão de
        // lucro e ficou meses sem tema escuro.
        /\b(text|bg|border-t|border)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/.test(l)
      )
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
    // O tamanho é par responsível (14 no celular, 15 no monitor) e a cor sai do
    // tipo da linha, já que a mesma linha serve as duas listas. O que importa
    // guardar é a monoespaçada, que é quem alinha a vírgula.
    expect(PAINEL).toContain('num text-[14px] lg:text-[15px]')
    expect(PAINEL).toContain("atrasado ? 'text-critical' : 'text-warn'")
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
    // ⚠️ A janela é recortada pelo próprio `</button>`, e não por uma contagem
    // de caracteres: um comentário a mais dentro da linha faz a fatia parar
    // antes do que ela precisa ver, e aí a guarda reprova o código certo.
    const onde = PAINEL.indexOf('Ver dívidas e parcelas do cliente')
    const linha = PAINEL.slice(PAINEL.lastIndexOf('<button', onde), PAINEL.indexOf('</button>', onde))
    expect(linha).toContain('min-h-[56px]')
    // ⚠️ O JSX inteiro, não a palavra solta: o comentário acima da linha explica
    // por que o `min-w-0` existe e contém o termo. Procurando só o termo, esta
    // guarda passaria com o atributo apagado do código.
    expect(linha).toContain('<div className="min-w-0">')
  })
})

describe('tela 2 — Clientes no celular (roteiro §6)', () => {
  const CLIENTES = semComentarios(readFileSync(join(SRC, 'pages', 'Clientes.tsx'), 'utf8'))

  it('★ a tabela vira LISTA, e não existe duas vezes no DOM', () => {
    /*
     * Sete colunas não cabem em 360px, e as três saídas comuns são todas ruins:
     * deixar vazar dá rolagem lateral na página; `overflow-x` na tabela faz a
     * pessoa rolar de lado item por item; esconder coluna com classe some com o
     * dado sem avisar.
     *
     * ⚠️ E a escolha é em JavaScript, não por classe: com `hidden lg:table` as
     * vinte linhas da página existiriam DUAS vezes no DOM, e o navegador
     * pagaria por todas.
     */
    expect(CLIENTES).toContain('const ehCelular = useEhCelular()')
    expect(CLIENTES).toContain('{ehCelular ? (')
    expect(CLIENTES).not.toContain('hidden lg:table')
  })

  it('★ o item da lista tem a grade que impede rolagem lateral', () => {
    // `minmax(0,1fr)` na coluna do meio é obrigatório: sem ele um nome longo
    // estoura a grade em vez de cortar, e a página inteira passa a rolar de lado
    // (§11). O `truncate` sozinho não resolve — ele precisa de uma coluna que
    // aceite encolher.
    expect(CLIENTES).toContain('grid-cols-[auto_minmax(0,1fr)_auto]')
    expect(CLIENTES).toContain('<div className="min-w-0">')
    // A coluna do menu não encolhe.
    expect(CLIENTES).toContain('<div className="flex shrink-0 items-center gap-1">')
    /*
     * ⚠️ Na linha do metadado, quem cede espaço é o texto cinza e nunca o
     * dinheiro: `min-w-0 flex-1 truncate` no primeiro, `shrink-0` no segundo.
     * Invertido, o valor é que seria cortado — e valor cortado não é valor.
     */
    expect(CLIENTES).toContain('className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground"')
    expect(CLIENTES).toContain('className="num shrink-0 text-[13.5px] font-semibold text-critical"')
  })

  it('★ nenhum comando se perdeu na virada de tabela para lista', () => {
    // Ver dívidas, editar e excluir continuam sendo os mesmos três, chamando as
    // mesmas funções. A forma mudou; o que a tela FAZ, não.
    // ⚠️ A fatia para no começo do ramo do monitor: indo até a paginação ela
    // passava pela tabela do desktop e via coisas que só existem lá.
    const lista = CLIENTES.slice(
      CLIENTES.indexOf('{ehCelular ? ('),
      CLIENTES.indexOf('border rounded-lg overflow-x-auto')
    )
    expect(lista).toContain('setClienteDividas(c)')
    expect(lista).toContain('abrirEdicao(c)')
    expect(lista).toContain('excluir(c.id, c.nome)')
    // e só o dono edita e apaga, como no monitor
    expect(lista).toContain('...(ehDono')
  })

  it('★ UM identificador só, colorido por escolha do dono', () => {
    /*
     * ⚠️ A cor sorteada por cliente contraria o §6 do roteiro, que a chama de
     * ruído competindo com o vermelho da dívida. Ela JÁ esteve cinza aqui: o
     * dono viu a tela pronta e pediu a cor de volta.
     *
     * Esta guarda segura a escolha DELE. Quem for "consertar" citando o
     * roteiro encontra um teste vermelho e este comentário — a pergunta já
     * foi feita e respondida.
     *
     * ⚠️ A fatia para no começo do ramo do monitor: indo até a paginação ela
     * passava pela tabela do desktop e via coisas que só existem lá.
     */
    const lista = CLIENTES.slice(
      CLIENTES.indexOf('{ehCelular ? ('),
      CLIENTES.indexOf('border rounded-lg overflow-x-auto')
    )
    expect(lista, 'a cor do avatar é pedido do dono, não descuido')
      .toContain('corDoNome(c.nome)')
    // e continua sendo UM identificador só: empresa troca as iniciais pelo prédio
    expect(lista).toContain('<Building2 className="h-4 w-4" />')
  })

  it('★ as três ações cabem num gatilho só, e o item volta à altura do roteiro', () => {
    /*
     * Três botões de 44×44 lado a lado ocupavam uma linha inteira do item e
     * levavam a linha de 58 para ~106px — metade dos clientes por tela. O
     * roteiro previa as duas saídas ("§6: numa terceira linha ou num menu"), e
     * esta é a segunda.
     *
     * ⚠️ O menu NÃO pode virar desculpa para esconder ação: as três continuam
     * lá, chamando as mesmas funções, e editar/excluir seguem só para o dono.
     */
    const lista = CLIENTES.slice(
      CLIENTES.indexOf('{ehCelular ? ('),
      CLIENTES.indexOf('border rounded-lg overflow-x-auto')
    )
    expect(lista).toContain('<MenuAcoes')
    expect(lista).toContain("rotulo={`A\u00e7\u00f5es de ${c.nome}`}")
    // a terceira linha de botões foi embora
    expect(lista, 'a linha de botões voltou e o item cresce de novo')
      .not.toContain('mt-1 flex justify-end gap-1')
  })

  it('★ o menu segue as TRÊS regras do portal', () => {
    /*
     * Ele desenha num portal preso ao `document.body`, senão seria recortado
     * pela lista. Isso obriga às mesmas três regras do `select.tsx`, e elas só
     * funcionam juntas: sem a primeira o menu aparece e o mouse atravessa; sem
     * a segunda, escolher uma ação fecha o diálogo em volta; sem a terceira um
     * menu longo não rola.
     *
     * O `dropdownDentroDeModal.test.ts` já varre o core e cobraria isso
     * sozinho; aqui fica o registro de que este componente nasceu sabendo.
     */
    const MENU = readFileSync(
      join(SRC, '..', '..', '..', 'packages', 'core', 'src', 'ui', 'MenuAcoes.tsx'),
      'utf8'
    )
    expect(MENU).toContain("pointerEvents: 'auto'")
    expect(MENU).toContain('onPointerDown={(e) => e.stopPropagation()}')
    expect(MENU).toContain('onWheel={(e) => e.stopPropagation()}')
    // gatilho e itens são alvo de dedo
    expect(MENU).toContain('h-11 w-11')
    expect(MENU).toContain('min-h-[44px]')
    // e a decisão de abrir para cima ou para baixo continua sendo do ajudante
    // que já resolveu o defeito da caixa com o fim fora da tela
    expect(MENU).toContain('posicaoDropdown(')
  })

  it('★ o respiro da página encolhe no celular, e o do monitor fica', () => {
    // 32px de cada lado numa tela de 360 é 18% da largura em margem.
    expect(CLIENTES).toContain('<div className="p-4 lg:p-8">')
    // e o título que repete o nome da aba sai, como no Painel
    expect(CLIENTES).toContain('hidden lg:flex items-start justify-between')
    // o "novo cliente" vira botão de 44 ao lado da busca
    expect(CLIENTES).toContain('lg:hidden h-11 w-11 shrink-0 p-0')
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
    // respiro interno dos cartões
    expect(PAINEL).toContain('p-3 lg:p-4')

    /*
     * ⚠️ Nenhuma redução de PADDING pode ficar sem o par de desktop, senão ela
     * vaza para o monitor.
     *
     * A busca é por `p-3` como classe inteira e precedida de espaço ou aspas:
     * procurar a sequência solta encontrava `gap-3`, `mb-3` e `space-y-3`, que
     * não são padding e têm par próprio.
     */
    const semPar = PAINEL.split('\n')
      // `lg:hidden` dispensa o par: o que não existe no monitor não vaza para
      // ele. É o caso do cartão de Vencimentos, que só existe no celular.
      .filter((l) => /["' ]p-3(?![\d.])/.test(l) && !l.includes('lg:p-') && !l.includes('lg:hidden'))
      .map((l) => l.trim().slice(0, 60))
    expect(semPar, 'padding reduzido sem o par lg: vaza para o desktop').toEqual([])
  })

  it('★ o alvo de toque NÃO encolheu junto com o respiro', () => {
    // O que saiu foi o espaço em volta do texto, nunca a área do dedo.
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('min-h-[56px]')
    // A aba de Vencimentos também é alvo de dedo, e o 44 dela mora no CSS.
    // ⚠️ Dentro da REGRA dela: `min-height: 44px` aparece em outro ponto do
    // arquivo, e procurar solto deixava a guarda verde com a aba encolhida.
    const regraAba = CSS.slice(
      CSS.indexOf("[data-alvo='web'] .aba-vencimento {"),
      CSS.indexOf('}', CSS.indexOf("[data-alvo='web'] .aba-vencimento {"))
    )
    expect(regraAba).toContain('min-height: 44px')
  })

  it('★ Vencimentos são DUAS listas no celular, nunca uma fila só', () => {
    /*
     * ⚠️ Juntar as duas numa fila única já foi entregue e RECUSADO pelo dono:
     * misturar o vermelho do atraso com o âmbar do que vence hoje "dá um ar de
     * caos". Viraram duas abas, e cada lista continua sendo a sua.
     */
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('const CartaoVencimentos')
    expect(PAINEL).toContain('aba === 0')
    expect(PAINEL).toContain('inadimplentes.map')
    expect(PAINEL).toContain('vencendoHoje.map')
    expect(PAINEL, 'as duas listas voltaram a virar uma fila só')
      .not.toContain('...vencendoHoje.map')
  })

  it('★ a aba fechada não esconde informação: a contagem dela fica à vista', () => {
    // Mesma lição do cabeçalho recolhível que isto substituiu: se a aba fechada
    // não disser nada, a pessoa abre as duas toda vez — e aí a troca não
    // economizou tela nenhuma. O total da aba ABERTA fica no cabeçalho.
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('{a.quantos}')
    expect(PAINEL).toContain('{fmt(atual.total)}')
    // e a etiqueta da aba fechada continua legível, em cinza
    expect(PAINEL).toContain("'bg-foreground/10 text-muted-foreground'")
  })

  it('★ a pílula das abas é IRMÃ e vem ANTES dos botões', () => {
    // Mesma receita da ilha de navegação: elemento posicionado pinta na ordem do
    // DOM, então a pílula fica por baixo sem z-index em cada rótulo — e sem
    // abrir um contexto de empilhamento por botão.
    const PAINEL = semComentarios(readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8'))
    const bloco = PAINEL.slice(PAINEL.indexOf('<div className="abas-vencimento"'))
    // ⚠️ Exigir que ela EXISTA antes de comparar posição: `indexOf` devolve -1
    // quando não acha, e -1 é menor que qualquer índice — a guarda passava com a
    // pílula apagada.
    expect(bloco).toContain('aba-vencimento-pilula')
    expect(bloco.indexOf('aba-vencimento-pilula')).toBeLessThan(bloco.indexOf('role="tab"'))
    const regra = CSS.slice(
      CSS.indexOf('.aba-vencimento-pilula'),
      CSS.indexOf('}', CSS.indexOf('.aba-vencimento-pilula'))
    )
    expect(regra, 'z-index na pílula significa que a ordem do DOM deixou de bastar')
      .not.toContain('z-index')
  })

  it('★ a troca de aba anima, toca de novo, e NÃO deixa rastro', () => {
    /*
     * `key={aba}` é o que faz a animação rodar a cada troca: sem ela o React
     * reaproveita o mesmo nó e o navegador não vê animação nova.
     *
     * ⚠️ E sem `fill-mode`: animação de opacity/transform que fica "em vigor"
     * abre contexto de empilhamento permanente, que foi o que escondeu o filtro
     * de Mês atrás dos cartões.
     */
    const PAINEL = semComentarios(readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8'))
    expect(PAINEL).toContain('key={aba}')
    expect(PAINEL).toContain("style={{ '--de': sentido } as CSSProperties}")
    expect(CSS).toContain('animation: entrar-de-lado 0.24s cubic-bezier(0.2, 0.7, 0.3, 1);')
    expect(CSS, 'fill-mode aqui deixa contexto de empilhamento para trás')
      .not.toContain('entrar-de-lado 0.24s cubic-bezier(0.2, 0.7, 0.3, 1) both')
    // e ela mora dentro do respeito a quem pediu menos movimento
    const antes = CSS.slice(CSS.indexOf('@keyframes entrar-de-lado') - 500, CSS.indexOf('@keyframes entrar-de-lado'))
    expect(antes).toContain('prefers-reduced-motion: no-preference')
  })

  it('★ no monitor continuam os DOIS cartões, e o do celular não aparece lá', () => {
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('<div className="hidden lg:grid lg:grid-cols-2 lg:gap-4 lg:mb-6">')
    expect(PAINEL).toContain('Inadimplentes')
    expect(PAINEL).toContain('Vencem Hoje')
    expect(PAINEL).toContain('lg:hidden rounded-xl border border-t-2 bg-card')
  })

  it('★ o gráfico muda de desenho no celular sem levar o monitor junto', () => {
    /*
     * O Recharts desenha SVG por PROPRIEDADE, não por classe: não existe `lg:`
     * que alcance largura de barra ou passo do eixo. Daí o `ehCelular`.
     *
     * ⚠️ O ramo do monitor repete o valor de HOJE, inclusive quando ele é só o
     * padrão da biblioteca (`'10%'`, `'preserveEnd'`, `60`). Parece redundante
     * e não é: escrito assim, dá para provar lendo que o desktop ficou onde
     * estava. Apagar o ramo do monitor é exatamente como o desktop muda sem
     * ninguém perceber.
     */
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('barGap={ehCelular ? 1 : 2}')
    expect(PAINEL).toContain("barCategoryGap={ehCelular ? '26%' : '10%'}")
    expect(PAINEL).toContain('maxBarSize={ehCelular ? 10 : undefined}')
    expect(PAINEL).toContain("interval={ehCelular ? intervaloRotulos : 'preserveEnd'}")
    expect(PAINEL).toContain('width={ehCelular ? 40 : 60}')
  })

  it('★ o aplicativo INSTALADO nunca vira celular, por mais estreita que seja a janela', () => {
    // Decisão do dono: no Electron a janela pode estar em meia tela, num
    // monitor pequeno, e o desenho continua o de computador. Sem esta linha o
    // hook passaria a olhar só a largura e o app instalado mudaria de cara
    // sozinho, sem ninguém ter pedido.
    const HOOK = readFileSync(join(SRC, 'hooks', 'useEhCelular.ts'), 'utf8')
    expect(HOOK).toContain("if (__ALVO__ !== 'web') return false")
    expect(HOOK).toContain('(max-width: 1023.98px)')
    // Medido já na primeira renderização: nascer `false` e corrigir dentro do
    // efeito faz o gráfico trocar de desenho um quadro depois, na cara de quem
    // abriu a tela.
    expect(HOOK).toContain('useState(medirAgora)')
  })

  it('★ o rodapé do gráfico diz o total, e some no monitor', () => {
    // Mesma lição do cartão recolhido: quem só quer o número do período não
    // deveria ter que medir barra no olho. No monitor ele não vai, porque lá o
    // faturamento continua à vista no cartão de cima, sem rolagem.
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('{fmt(totalSerie)}')
    expect(PAINEL).toContain('<div className="lg:hidden mt-2 pt-2 border-t')
    // e a legenda do Recharts fica só no monitor, senão as duas aparecem juntas
    expect(PAINEL).toContain('{compararSerie && !ehCelular && (')
  })

  it('★ a legenda e a barra do período anterior leem a MESMA cor', () => {
    // Legenda de uma cor e barra de outra é pior do que não ter legenda: em vez
    // de explicar o gráfico, ela mente sobre ele.
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('const COR_PERIODO_ANTERIOR')
    expect(PAINEL).toContain('fill={COR_PERIODO_ANTERIOR}')
    expect(PAINEL).toContain('backgroundColor: COR_PERIODO_ANTERIOR')
    expect(PAINEL, 'a cor voltou a ser digitada solta na barra').not.toContain('fill="#94a3b8"')
  })

  it('★ a entrada não deixa contexto de empilhamento para trás', () => {
    /*
     * `both` mantém a animação "em vigor" depois de terminada, e animação de
     * `opacity`/`transform` em vigor abre um contexto de empilhamento próprio.
     * Com isso cada bloco do Painel virava uma ilha, e o `z-50` do filtro de
     * Mês não alcançava para fora do bloco dele: o painelzinho abria POR BAIXO
     * dos cartões de vencimento, impossível de usar.
     *
     * `backwards` dá a mesma entrada e não deixa rastro.
     */
    expect(CSS).toContain('cubic-bezier(0.2, 0.7, 0.3, 1) backwards')
    expect(CSS, 'o `both` voltou e o filtro de Mês some atrás dos cartões')
      .not.toContain('cubic-bezier(0.2, 0.7, 0.3, 1) both')
  })

  it('★ o eixo de valores do gráfico não vaza pela borda do cartão', () => {
    // Com "R$" o rótulo não cabia na faixa e o "R" saía pela borda esquerda; a
    // margem negativa, que é do monitor, ainda empurrava tudo mais 8px para
    // fora. As duas coisas juntas eram o defeito da foto.
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('tickFormatter={ehCelular ? fmtEixoSemMoeda : fmtCompacto}')
    expect(PAINEL).toContain('<div className="h-56 lg:h-64 lg:-ml-2">')
    expect(PAINEL, 'a margem negativa voltou a valer no celular')
      .not.toContain('h-56 lg:h-64 -ml-2')
  })

  it('★ o número do KPI segue o próprio comprimento, e nunca vaza', () => {
    // Dois cartões por linha em 360px deixam ~140px: "R$ 30.299,75" a 24px
    // pedia 165 e escorria para fora. Tamanho fixo menor resolveria hoje e
    // estouraria de novo no dia em que a loja vendesse mais.
    const PAINEL = readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8')
    expect(PAINEL).toContain('const tamanhoDoValor')
    expect(PAINEL).toContain('${tamanhoDoValor(valor)} lg:text-2xl')
    // e continua sem quebrar dinheiro em duas linhas
    expect(PAINEL).toContain('whitespace-nowrap`}>{valor}</p>')
    // quatro degraus: o maior valor que a loja pode mostrar ainda cabe
    for (const degrau of ['> 14', '> 12', '> 9']) {
      expect(PAINEL, `degrau ${degrau} sumiu`).toContain(degrau)
    }
  })

  it('★ no celular o gráfico sobe para perto do topo, e o Top 5 fica onde estava', () => {
    /*
     * Pedido do dono: o gráfico entre as primeiras coisas ao abrir o Painel,
     * antes dos cartões de Faturamento/Vendas/Ticket/Clientes — "passa um ar
     * estatístico".
     *
     * ⚠️ A reordenação é de CSS, não de JSX, e não é uma segunda cópia do
     * cartão: duas cópias dariam dois gráficos no DOM, e o escondido mede zero —
     * o Recharts desenha um SVG vazio. Reordenar no JSX mudaria o monitor
     * junto, que é o que esta reforma não pode fazer.
     */
    const PAINEL = semComentarios(readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8'))
    expect(PAINEL).toContain('ordem-vencimentos')
    expect(PAINEL).toContain('ordem-grafico')
    expect(PAINEL).toContain('par-grafico')
    // uma cópia só do cartão do gráfico
    expect(PAINEL.split('ordem-grafico').length - 1, 'o cartão do gráfico foi duplicado').toBe(1)

    const movel = CSS.slice(CSS.indexOf('@media (max-width: 1023.98px)'))
    expect(movel).toContain('.ordem-vencimentos { order: -2 }')
    expect(movel).toContain('.ordem-grafico { order: -1 }')
    // sem o flex no Painel, `order` não vale nada
    expect(movel).toMatch(/\.entrada-escalonada \{\s*display: flex;\s*flex-direction: column;/)
    // e sem o `display: contents` o Top 5 subiria junto
    expect(movel).toMatch(/\.par-grafico \{\s*display: contents;/)
  })

  it('★ o par gráfico/Top 5 continua ENTRANDO como os outros blocos', () => {
    // Ao virar `display: contents` a caixa deixa de ser `.entrada-escalonada > *`
    // e os dois cartões seriam os únicos do Painel a aparecer sem animação — um
    // solavanco no meio da tela.
    const movel = CSS.slice(CSS.indexOf('@media (max-width: 1023.98px)'))
    expect(movel).toMatch(/\.par-grafico > \* \{\s*animation: surgir-bloco 0\.36s cubic-bezier\(0\.2, 0\.7, 0\.3, 1\) backwards;/)
    // ⚠️ `backwards`, nunca `both`: `both` deixa contexto de empilhamento
    expect(movel).not.toContain('surgir-bloco 0.36s cubic-bezier(0.2, 0.7, 0.3, 1) both')
    // e só para quem não pediu menos movimento
    const antes = movel.slice(movel.indexOf('.par-grafico > *') - 400, movel.indexOf('.par-grafico > *'))
    expect(antes).toContain('prefers-reduced-motion: no-preference')
  })

  it('★ a subida do gráfico NÃO vaza para o monitor', () => {
    // Lá a ordem segue a do arquivo e os dois voltam a dividir a grade de três
    // colunas. O `mb-3` que separa o gráfico dos KPIs no celular tem o par que
    // o zera no monitor, senão ele viraria um respiro a mais dentro da grade.
    const PAINEL = semComentarios(readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8'))
    expect(PAINEL).toContain('ordem-grafico lg:col-span-2 border rounded-xl p-3 mb-3 lg:mb-0 lg:p-4 bg-card')
    expect(PAINEL).toContain('par-grafico grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4')
    // as regras de ordem moram TODAS dentro da consulta de tela estreita
    const fixo = CSS.slice(0, CSS.indexOf('@media (max-width: 1023.98px)'))
    for (const regra of ['ordem-vencimentos', 'ordem-grafico', 'par-grafico']) {
      expect(fixo, `${regra} escapou da consulta de tela estreita`).not.toContain(regra)
    }
  })

  it('★ o filtro de período mora DENTRO do cartão do gráfico, no celular', () => {
    /*
     * Ele filtra aquele gráfico, e no alto da página era a primeira coisa a
     * aparecer: uma barra cinza antes de qualquer número.
     *
     * ⚠️ Uma instância SÓ, escolhida em JavaScript. Com `hidden lg:flex` as
     * duas roupas existiriam ao mesmo tempo no DOM, e o "Mês" é um painelzinho
     * com estado próprio: duas cópias, dois estados, e um deles sempre errado.
     */
    const PAINEL = semComentarios(readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8'))
    expect(PAINEL).toContain('const FiltroPeriodo')
    expect(PAINEL).toContain('{ehCelular && (')
    expect(PAINEL).toContain('{!ehCelular && (')
    // \s+ em vez de \n literal: o arquivo é CRLF, e a âncora com \n não casa.
    expect(PAINEL).toMatch(/<FiltroPeriodo\s+compacto/)
    // e o painelzinho do Mês é usado uma vez em cada roupa, nunca as duas juntas
    expect(PAINEL.split('<FiltroPeriodo').length - 1, 'o filtro foi parar em mais de dois lugares').toBe(2)
  })

  it('★ o seletor de período tem cinco colunas IGUAIS e a pílula escorrega', () => {
    // Larguras diferentes pediriam uma conta de posição por botão; iguais, a
    // conta é uma só — a mesma das abas de Vencimentos.
    const PAINEL = semComentarios(readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8'))
    const bloco = PAINEL.slice(PAINEL.indexOf('<div className="filtro-periodo'))
    expect(bloco).toContain('filtro-periodo-pilula')
    expect(bloco.indexOf('filtro-periodo-pilula')).toBeLessThan(bloco.indexOf('PERIODOS.map'))

    const movel = CSS.slice(CSS.indexOf('@media (max-width: 1023.98px)'))
    expect(movel).toContain('grid-template-columns: repeat(5, 1fr)')
    expect(movel).toContain('width: calc(20% - 3.6px)')
    expect(movel).toContain('transform: translateX(calc(var(--i, 0) * (100% + 3px)))')
    const regra = movel.slice(
      movel.indexOf('.filtro-periodo-pilula'),
      movel.indexOf('}', movel.indexOf('.filtro-periodo-pilula'))
    )
    expect(regra, 'z-index na pílula significa que a ordem do DOM deixou de bastar')
      .not.toContain('z-index')
  })

  it('★ afinar o seletor NÃO baixou o alvo de dedo dos 44px', () => {
    /*
     * O que encolheu foi o desenho: recheio do trilho, corpo da letra, e o
     * ícone do "Mês" que saiu para a coluna caber. A ALTURA de toque continua
     * vindo do bloco de `any-pointer: coarse`, que é quem responde por ela.
     */
    const movel = CSS.slice(CSS.indexOf('@media (max-width: 1023.98px)'))
    expect(movel).toContain('font-size: 11.5px')
    const toque = CSS.slice(CSS.indexOf('@media (any-pointer: coarse)'))
    expect(toque).toContain('min-height: 44px')
    const PAINEL = semComentarios(readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8'))
    expect(PAINEL).toContain('semIcone')
  })

  it('★ tocar em "Mês" acende a pílula na hora, antes de aplicar', () => {
    /*
     * O painelzinho do "Mês" tem estado próprio e a pílula não tinha como saber
     * que ele foi tocado: o toque abria o painel e a pílula continuava acesa no
     * botão anterior até alguém aplicar um mês. O toque ficava sem resposta, e
     * isso lê como defeito mesmo quando o filtro funciona.
     */
    const PAINEL = semComentarios(readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8'))
    expect(PAINEL).toContain('const [mesAberto, setMesAberto] = useState(false)')
    expect(PAINEL).toContain("modo === 'mes' || mesAberto")
    expect(PAINEL).toContain('onAberto={setMesAberto}')
    // e o botão de janela apaga enquanto o painel do Mês está aberto
    expect(PAINEL).toContain('periodoDias === p.dias && !mesAberto')

    // ⚠️ O aviso sai de um EFEITO: mudar estado de outro componente durante o
    // render do seu é efeito colateral, e o React reclama em voz alta.
    const POPOVER = semComentarios(readFileSync(join(SRC, 'components', 'FiltroMesPopover.tsx'), 'utf8'))
    expect(POPOVER).toMatch(/useEffect\(\(\) => \{\s*onAberto\?\.\(aberto\)/)
  })

  it('★ a legenda de Forma de pagamento não empurra a porcentagem para fora', () => {
    // Com 176px de rosca sobravam ~130 para a legenda numa tela de 360, e
    // "Inadimplente" não cabe em 130: o rótulo se recusava a encolher e levava a
    // porcentagem para fora do cartão.
    const PAINEL = semComentarios(readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8'))
    expect(PAINEL).toContain('className="min-w-0 flex-1 truncate" title={d.nome}')
    expect(PAINEL).toContain('className="num shrink-0 text-muted-foreground text-xs"')
    // e a rosca cede largura no celular, com o par que a devolve no monitor
    expect(PAINEL).toContain('h-32 w-32 lg:h-44 lg:w-44 shrink-0')
  })

  it('★ a rosca de Forma de pagamento cabe na caixa que ela tem', () => {
    /*
     * ⚠️ Raio em PORCENTAGEM no celular, e não em pixel. Ao encolher a caixa
     * de 176 para 128px (para dar largura à legenda), um `outerRadius` de 70
     * num quadrado de 128 — centro em 64 — passou a pedir mais do que cabia: o
     * desenho parava na borda e a rosca saía com os quatro lados chanfrados,
     * com cara de octógono.
     *
     * Porcentagem é do menor lado, então ela acompanha a caixa. Trocar de volta
     * por pixel volta a cortar na próxima vez que a caixa mudar.
     */
    const PAINEL = semComentarios(readFileSync(join(SRC, 'pages', 'Dashboard.tsx'), 'utf8'))
    expect(PAINEL).toContain("innerRadius={ehCelular ? '52%' : 42}")
    expect(PAINEL).toContain("outerRadius={ehCelular ? '88%' : 70}")
    // e nenhum raio em pixel sobrou solto na tela
    expect(PAINEL, 'raio em pixel de novo: a caixa do celular corta').not.toContain('outerRadius={70}')
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

    /*
     * ⚠️ A cor do sino vem da FAIXA, de fora, e não do sino: ele é do núcleo e
     * serve os dois nichos, então não pode saber que existe uma faixa escura no
     * varejo web. Sem isto, o cinza que ele traz fica ilegível sobre o quase
     * preto da marca.
     */
    const MARCA = readFileSync(join(SRC, 'components', 'BarraMarca.tsx'), 'utf8')
    expect(MARCA).toContain('[&_button]:text-white/75')
    const SINO_NUCLEO = readFileSync(
      join(SRC, '..', '..', '..', 'packages', 'core', 'src', 'ui', 'SinoNotificacoes.tsx'),
      'utf8'
    )
    expect(SINO_NUCLEO, 'a faixa do varejo vazou para dentro do componente do núcleo')
      .not.toContain('bg-marca')
  })

  it('★ a faixa de topo é a marca, e só no celular', () => {
    const MARCA = readFileSync(join(SRC, 'components', 'BarraMarca.tsx'), 'utf8')
    expect(MARCA).toContain('lg:hidden')
    expect(MARCA).toContain('sticky top-0')
    // Abaixo do 20 da ilha: a faixa nunca cobre a navegação.
    expect(MARCA).toContain('z-[15]')
    /*
     * ⭐ O nome é o DESENHO da logo, recortado do próprio arquivo — antes era
     * um texto em caixa alta imitando a logo de longe, e o dono pediu o
     * desenho de verdade.
     *
     * ⚠️ Daí a faixa ser escura nos DOIS temas: as letras do desenho são
     * brancas e só têm contraste sobre o quase-preto em que foram desenhadas.
     * A cor é `--marca`, lida do arquivo da logo, e o `theme-color` do HTML
     * aponta para o mesmo valor — senão a barra de status do aparelho vira um
     * retalho de outra cor colado em cima da faixa.
     */
    expect(MARCA).toContain('marca-nome.png')
    expect(MARCA).toContain('bg-marca')
    expect(MARCA).toContain("alt=\"FHVP Tech\"")
    expect(CSS).toContain('--marca:')

    const HTML = readFileSync(join(SRC, '..', 'index.web.html'), 'utf8')
    expect(HTML, 'a barra de status deixou de acompanhar a faixa').toContain('content="#010310"')
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
