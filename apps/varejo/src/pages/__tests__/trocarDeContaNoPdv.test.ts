/**
 * Trocar de conta dentro do caixa, sem perder a venda em andamento.
 *
 * ── O que a funcionalidade resolve ──────────────────────────────────────────
 * Dois vendedores, um balcão, um computador. Quem chega para atender precisa
 * que a venda saia no nome DELE — a comissão sai de lá. Antes disto o único
 * caminho era Ctrl+L, que ninguém descobre sozinho, e o botão Bloquear mora na
 * barra lateral, que some justamente dentro do PDV.
 *
 * ── Por que ler o fonte em vez de montar a tela ─────────────────────────────
 * O que precisa ser garantido aqui não é um valor de saída: é a FORMA da
 * ligação entre três peças que moram longe uma da outra — o listener de
 * atalhos, o estado do carrinho e a sessão do servidor. Um teste de
 * comportamento precisaria montar o PDV inteiro com IPC falso, e ainda assim
 * passaria feliz na única regressão que importa (a do carrinho velho, abaixo),
 * porque em teste o carrinho é preenchido antes do listener ser registrado.
 *
 * Mesma escolha do abaComissoesSegueSessao.test.ts.
 *
 * ── Os três modos de falha, todos silenciosos ───────────────────────────────
 *
 * 1. CARRINHO VELHO. O listener de atalhos NÃO tem `carrinho` nas dependências,
 *    e isso é de propósito: reregistrar o listener a cada bipe do leitor seria
 *    caro. A consequência é que qualquer função chamada direto de dentro dele
 *    enxerga o carrinho de quando o listener foi registrado — quase sempre
 *    vazio. Alguém "simplificando" o ref para uma chamada direta apagaria o
 *    aviso sem quebrar teste nenhum, e sem mudar nada na tela.
 *
 * 2. A TECLA AO LADO DO F9. F9 finaliza a venda e é a tecla mais apertada do
 *    caixa. Pôr "trocar de conta" no F8 transforma um erro de dedo num troca-
 *    dono de venda. F7 tem um vão de uma tecla até o F9.
 *
 * 3. PERGUNTAR DEPOIS DE TROCAR. `bloquear()` abre a tela de login POR CIMA de
 *    tudo. Confirmar depois disso é confirmar debaixo de uma sobreposição — na
 *    prática, não confirmar.
 *
 * ── E uma decisão de produto que o teste segura ─────────────────────────────
 * O carrinho NÃO é limpo na troca. Foi escolha explícita do dono do produto:
 * jogar fora o que o colega já bipou é pior que avisar. Se alguém achar que
 * limpar é "mais seguro", este teste obriga a conversa a acontecer antes.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ConfirmOptions } from '@fhvptech/core/ui/confirm'

const VENDAS = readFileSync(join(__dirname, '..', 'Vendas.tsx'), 'utf8')
const APP = readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf8')
const LOGIN = readFileSync(join(__dirname, '..', 'LoginSistema.tsx'), 'utf8')
const CONFIRM = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'packages', 'core', 'src', 'ui', 'confirm.tsx'),
  'utf8'
)

// ── Guarda de TIPO, cobrada pelo `npm run typecheck` ────────────────────────
//
// Não é um teste do vitest: é o compilador. `@ts-expect-error` EXIGE que a
// linha abaixo continue sendo um erro. No dia em que alguém alargar a união do
// ConfirmOptions e permitir foco no confirmar de um diálogo de EXCLUSÃO, este
// diretivo vira "unused" e o build quebra — antes de qualquer Enter apagar algo
// no computador de um lojista.
//
// Fica aqui, e não no core, porque é esta funcionalidade que criou a opção.
// A diretiva fica na LINHA DA ATRIBUIÇÃO porque é ali que o TypeScript acusa
// incompatibilidade de união — não na propriedade culpada. Todo o resto do
// objeto é válido de propósito: assim o único erro possível aqui é a combinação
// que queremos manter proibida.
// @ts-expect-error diálogo destrutivo NÃO pode focar o botão de confirmar
const _combinacaoProibida: ConfirmOptions = {
  mensagem: 'Apagar o cliente?',
  variante: 'destructive',
  focoInicial: 'confirmar'
}
void _combinacaoProibida

/** O corpo da função `trocarDeConta`, do cabeçalho até a chave que o fecha. */
function corpoDoTrocarDeConta(): string {
  const i = VENDAS.indexOf('const trocarDeConta = async ()')
  expect(i, 'a função trocarDeConta sumiu do PDV').toBeGreaterThan(-1)
  const fim = VENDAS.indexOf('\n  }', i)
  return VENDAS.slice(i, fim)
}

describe('o aviso enxerga o carrinho de agora, não o de quando a tela abriu', () => {
  /**
   * A regressão que isto trava não dá erro, não muda a tela e não fica
   * vermelha em lugar nenhum: o aviso simplesmente para de aparecer, e a venda
   * do colega passa a trocar de dono em silêncio.
   */
  it('o atalho chama a função pelo ref, nunca direto', () => {
    const bloco = VENDAS.slice(VENDAS.indexOf("case 'F7'"), VENDAS.indexOf("case 'F9'"))
    expect(bloco, 'o F7 sumiu do PDV').toContain('trocarDeContaRef.current()')
    expect(
      bloco,
      'chamar trocarDeConta() direto do listener lê um carrinho velho — o aviso morre'
    ).not.toMatch(/[^.]\btrocarDeConta\(\)/)
  })

  it('e o ref é reapontado a cada render, que é o que o mantém fresco', () => {
    // Um efeito SEM array de dependências roda em todo render. É o que garante
    // que o ref aponte para a versão da função que enxerga o carrinho atual.
    const i = VENDAS.indexOf('trocarDeContaRef.current =')
    expect(i, 'o ref nunca é atualizado — ele apontaria para a função vazia inicial').toBeGreaterThan(-1)

    const fecha = VENDAS.indexOf('})', i)
    const depois = VENDAS.slice(fecha, fecha + 6)
    expect(
      depois,
      'o efeito que atualiza o ref ganhou dependências; com elas o ref congela entre renders'
    ).toBe('})\n\n  ')
  })

  it('o listener de atalhos continua sem `carrinho` nas dependências', () => {
    // Se um dia alguém puser `carrinho` ali para "resolver" o problema, o
    // listener passa a ser recriado a cada bipe do leitor. O ref existe
    // justamente para não precisar disso.
    const i = VENDAS.indexOf("case 'F7'")
    const deps = VENDAS.slice(i, VENDAS.indexOf('])', i))
    expect(deps).not.toContain('carrinho')
  })
})

describe('a peça que faz o carrinho sobreviver mora no App, e é frágil', () => {
  /**
   * ── A dependência escondida ─────────────────────────────────────────────────
   * "Trocar de conta sem perder a venda" não é mérito do PDV: é consequência de
   * a tela de login ser uma SOBREPOSIÇÃO. O App inteiro continua montado embaixo
   * dela, e por isso o carrinho está lá quando o próximo vendedor entra.
   *
   * Trocar isso por `if (bloqueado) return <LoginSistema />` parece uma limpeza
   * — é até a forma mais comum de escrever tela de login. Só que ela desmonta a
   * árvore, e com ela o carrinho, em TODA troca. O PDV não teria como perceber:
   * nenhum teste do Vendas.tsx ficaria vermelho, e a tela continuaria abrindo
   * normalmente. O lojista é que descobriria, no balcão, perdendo uma venda já
   * bipada.
   *
   * Por isso a asserção mora aqui, no teste da funcionalidade que depende dela,
   * e não num teste de App.tsx onde ninguém ligaria uma coisa à outra.
   */
  it('o login é irmão da árvore do app, não substituto dela', () => {
    expect(
      APP,
      'a tela de login deixou de ser sobreposição — trocar de conta agora perde o carrinho'
    ).toContain("{estadoAuth === 'bloqueado' && <LoginSistema")
  })

  it('e nada devolve o login no lugar do app', () => {
    // A forma que quebraria tudo, escrita das maneiras usuais.
    expect(APP).not.toMatch(/return\s*\(?\s*<LoginSistema/)
  })
})

describe('a tecla escolhida não fica colada na que finaliza a venda', () => {
  it('é F7', () => {
    expect(VENDAS).toContain("case 'F7'")
  })

  it('e o F8, vizinho do F9, segue livre', () => {
    expect(
      VENDAS,
      'F8 fica colado no F9 (Finalizar): errar a tecla trocaria o dono da venda no meio do atendimento'
    ).not.toContain("case 'F8'")
  })
})

describe('carrinho cheio pergunta antes, e pergunta a coisa certa', () => {
  it('só pergunta quando há o que perder', () => {
    expect(corpoDoTrocarDeConta()).toContain('carrinho.length > 0')
  })

  it('a pergunta vem ANTES de abrir a tela de login', () => {
    const corpo = corpoDoTrocarDeConta()
    const posConfirma = corpo.indexOf('await confirmar(')
    const posBloqueia = corpo.indexOf('bloquear()')
    expect(posConfirma, 'sumiu a confirmação').toBeGreaterThan(-1)
    expect(posBloqueia, 'sumiu a troca de sessão').toBeGreaterThan(-1)
    expect(
      posConfirma,
      'a tela de login abre por cima de tudo — confirmar depois dela é não confirmar'
    ).toBeLessThan(posBloqueia)
  })

  it('e cancelar realmente cancela', () => {
    expect(corpoDoTrocarDeConta()).toContain('if (!ok) return')
  })

  it('o aviso diz o que está em jogo: a comissão', () => {
    // "Tem certeza?" não informa nada. O que a pessoa precisa saber é que a
    // venda inteira, incluindo o que o colega já bipou, muda de dono.
    const corpo = corpoDoTrocarDeConta()
    expect(corpo, 'o aviso não menciona a comissão, que é o que muda de dono').toContain('comissão')
    expect(corpo, 'o aviso não diz quantos itens estão em risco').toContain('totalItens')
  })
})

describe('a troca inteira se faz sem tirar a mão do teclado', () => {
  /**
   * ── O atrito que isto remove ────────────────────────────────────────────────
   * Quem opera um caixa não larga o teclado no meio de um atendimento. Um F7 que
   * abre uma caixa e obriga a pegar o mouse não é um atalho — é um passo a mais
   * que o botão já resolvia.
   *
   * O caminho completo tem que ser: F7 → Enter → PIN. O login já colabora: a
   * lista de vendedores é feita de <button> (Tab alcança), o campo do PIN pega
   * o foco sozinho, e o PIN confirma ao completar, sem Enter.
   */
  it('o diálogo abre com o foco no botão de trocar, não no cancelar', () => {
    expect(
      corpoDoTrocarDeConta(),
      'sem isto o Enter cai no Cancelar e o atalho obriga a pegar o mouse'
    ).toContain("focoInicial: 'confirmar'")
  })

  it('e o diálogo base sabe respeitar esse pedido', () => {
    // O Radix foca o primeiro elemento ao abrir. Sem interceptar, o pedido do
    // chamador seria ignorado em silêncio — atalho continua exigindo mouse.
    expect(CONFIRM, 'o confirm não intercepta mais o foco inicial').toContain('onOpenAutoFocus')
    expect(CONFIRM).toContain("opts.focoInicial !== 'confirmar'")
    expect(CONFIRM, 'sem o ref, não há o que focar').toContain('confirmarBtnRef.current?.focus()')
  })

  /**
   * ── E a razão de o aviso não ser mais "destrutivo" ──────────────────────────
   * Trocar de conta não apaga nada. Marcar como destrutivo daria o vermelho de
   * exclusão a uma ação que não exclui — e, mais importante, o tipo proíbe foco
   * no confirmar justamente ali, porque 23 dos 31 usos deste diálogo SÃO
   * exclusões e o Enter precisa ser inofensivo nelas.
   */
  it('a troca de conta não se apresenta como exclusão', () => {
    expect(
      corpoDoTrocarDeConta(),
      'nada é apagado aqui — e destrutivo bloquearia o foco no confirmar'
    ).not.toContain("variante: 'destructive'")
    expect(corpoDoTrocarDeConta()).toContain("variante: 'aviso'")
  })

  it('mas continua com cara de aviso, que é o ponto', () => {
    // Sem o ícone, a caixa vira "tem certeza?" e ninguém lê.
    expect(CONFIRM, "a variante 'aviso' não mostra mais o ícone de alerta").toMatch(
      /destrutivo \|\| opts\?\.variante === 'aviso'/
    )
  })
})

describe('a escolha de quem entra também se faz pelo teclado', () => {
  /**
   * ── O beco sem saída que isto abre ──────────────────────────────────────────
   * Focar o botão de confirmar resolveu o diálogo, e o campo do PIN já se
   * focava sozinho. Sobrava o MEIO do caminho: escolher quem está entrando.
   *
   * Esta tela é uma sobreposição — o app segue montado atrás dela, e os botões
   * dele seguem na ordem de tabulação. Medido num caixa com o carrinho aberto:
   * os três vendedores eram os focáveis 19, 20 e 21 de 24. Ou seja, uns vinte
   * Tabs às cegas por cima de uma tela invisível.
   *
   * E este é o caso ÚNICO da funcionalidade: com um vendedor só a lista nem
   * aparece (auto-seleciona). Ela só existe quando há dois ou mais — que é
   * exatamente a loja de dois vendedores dividindo o balcão.
   */
  it('o primeiro nome da lista recebe o foco sozinho', () => {
    expect(LOGIN, 'sem isto, chegar na lista exige ~20 Tabs às cegas').toContain(
      'primeiroVendedorRef.current?.focus()'
    )
    expect(LOGIN, 'o ref não está preso a nenhum botão').toContain(
      'ref={i === 0 ? primeiroVendedorRef : undefined}'
    )
  })

  it('e as setas andam entre os nomes, sem depender do Tab', () => {
    expect(LOGIN).toContain("e.key !== 'ArrowDown' && e.key !== 'ArrowUp'")
    expect(LOGIN, 'a lista não anda em roda — esbarrar na ponta com 2 nomes irrita').toContain(
      '% botoes.length'
    )
  })

  it('o foco fica visível — foco invisível é o mesmo que foco nenhum', () => {
    expect(LOGIN).toMatch(/focus-visible:ring-2/)
  })

  it('a lista não rouba o foco por cima de um modal aberto', () => {
    // Recuperação de PIN e "configurar este computador" abrem POR CIMA desta
    // tela. Focar a lista embaixo deles jogaria o cursor pra fora do que a
    // pessoa está usando.
    //
    // A asserção olha a DEFINIÇÃO de `listaVisivel`, não o arquivo inteiro: a
    // mesma condição aparece na chamada do useFocoAoLiberar logo acima, e
    // procurá-la solta deixava o teste verde mesmo com a proteção removida
    // daqui. Foi assim que este guarda nasceu falso — pego na mutação.
    const i = LOGIN.indexOf('const listaVisivel')
    expect(i, 'sumiu o cálculo de quando a lista está visível').toBeGreaterThan(-1)
    const definicao = LOGIN.slice(i, LOGIN.indexOf('useEffect', i))
    expect(definicao).toContain('!mostrarRecuperacao')
    expect(definicao).toContain('!mostrarConfigurarMaquina')
  })
})

describe('nada navega pra fora do caixa por conta própria', () => {
  /**
   * ── O defeito, encontrado testando a própria funcionalidade ─────────────────
   * Um vendedor novo entrando pela primeira vez dispara o tour guiado, e o tour
   * NAVEGA. Isso desmonta o PDV e leva o carrinho junto.
   *
   * Antes do F7 isso quase não acontecia; agora é o caminho normal: o colega
   * chama, a pessoa entra no próprio nome pra venda sair no nome dela — e é
   * justamente a PRIMEIRA venda dela, na frente do cliente, que perde o
   * carrinho. Uma vez por vendedor, no pior momento possível.
   *
   * A saída antecipada vem ANTES de gravar a flag de "já viu", de propósito:
   * assim o tour é ADIADO, não cancelado. Ele aparece no próximo login dessa
   * pessoa fora do caixa, que é onde ele serve pra alguma coisa.
   */
  it('o tour de primeiro acesso não começa com o caixa aberto', () => {
    const i = APP.indexOf('fhvp-tour-visto-vendedor')
    expect(i, 'o tour do vendedor sumiu do App').toBeGreaterThan(-1)
    const efeito = APP.slice(APP.lastIndexOf('useEffect(', i), i)
    expect(
      efeito,
      'sem esta saída, o tour navega pra fora do PDV e apaga o carrinho'
    ).toContain('if (pdvAtivo) return')
  })

  it('e o tour é adiado, não perdido: a saída vem antes de marcar "já viu"', () => {
    const i = APP.indexOf('fhvp-tour-visto-vendedor')
    const posSai = APP.lastIndexOf('if (pdvAtivo) return', i)
    const posMarca = APP.indexOf('localStorage.setItem(chave', i)
    expect(posSai).toBeGreaterThan(-1)
    expect(
      posSai,
      'marcar antes de sair faria o vendedor perder o tour para sempre'
    ).toBeLessThan(posMarca)
  })

  it('o efeito reage a entrar e sair do caixa', () => {
    // Sem `pdvAtivo` nas dependências, o tour adiado não voltaria ao fechar o
    // caixa — ficaria esperando um outro login.
    const i = APP.indexOf('fhvp-tour-visto-vendedor')
    const deps = APP.slice(i, APP.indexOf('])', i))
    expect(deps).toContain('pdvAtivo')
  })
})

describe('a troca não joga fora o trabalho de ninguém', () => {
  /**
   * Decisão registrada do dono do produto: avisar e MANTER. Limpar seria
   * destruir o que o colega já bipou para proteger de um erro que o aviso já
   * cobre.
   */
  it('trocar de conta não limpa o carrinho', () => {
    expect(
      corpoDoTrocarDeConta(),
      'limpar o carrinho na troca foi decidido como NÃO — mudar isso precisa de conversa, não de commit'
    ).not.toContain('setCarrinho([])')
  })
})

describe('um atalho que ninguém descobre não resolve o problema', () => {
  /**
   * A funcionalidade existe porque Ctrl+L já fazia isso e ninguém usava: não
   * estava escrito em lugar nenhum. Repetir o erro com F7 seria entregar nada.
   */
  it('o F7 está na barra de dicas do caixa', () => {
    expect(VENDAS).toContain('<DicaTecla tecla="F7"')
  })

  it('e existe botão para quem opera no toque, sem teclado', () => {
    // O cliente que motivou isto usa tablet. Atalho sozinho não o atende.
    const i = VENDAS.indexOf('onClick={() => void trocarDeConta()}')
    expect(i, 'sem botão, quem está no tablet não tem como trocar de conta').toBeGreaterThan(-1)
  })

  it('o botão mostra quem está no caixa', () => {
    // Sem isso a tela não responde "esta venda vai sair no nome de quem?" — e a
    // barra lateral, que mostraria, some dentro do PDV.
    expect(VENDAS).toContain('{vendedor.nome}')
  })
})
