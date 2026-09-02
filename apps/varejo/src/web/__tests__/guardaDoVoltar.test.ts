/**
 * O "voltar" do navegador não pode tirar o lojista do sistema.
 *
 * ── Por que ler o fonte em vez de simular ────────────────────────────────────
 * Provar isto de verdade exige histórico de navegador, um gesto de borda no
 * Android e o React montado — três coisas que não existem aqui. O jsdom tem
 * `pushState`, mas não tem botão de voltar: nada dispara `popstate` sozinho, e
 * o teste acabaria conferindo que o próprio teste chamou a própria função.
 *
 * Então este arquivo cobre o que um teste de fonte cobre bem: que as peças
 * continuem lá, e na ordem certa. As três abaixo são exatamente as que somem
 * numa refatoração distraída, e nenhuma delas quebra nada visível quando some —
 * o sintoma aparece no balcão, no meio de uma venda.
 *
 * O comportamento em si é verificado à mão, no roteiro do navegador.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const GUARDA = readFileSync(join(AQUI, '..', 'GuardaDoVoltar.tsx'), 'utf8')
const APP = readFileSync(join(AQUI, '..', '..', 'App.tsx'), 'utf8')

describe('guarda do botão voltar', () => {
  /**
   * A armadilha principal. Sem repor a entrada de histórico, o guarda funciona
   * UMA vez: o segundo toque em voltar encontra a pilha vazia e o navegador sai
   * do site. É o tipo de bug que passa em qualquer teste rápido e aparece na
   * segunda vez que alguém aperta.
   */
  it('repõe a entrada de histórico dentro do próprio tratador', () => {
    const tratador = GUARDA.slice(
      GUARDA.indexOf('const aoVoltar'),
      GUARDA.indexOf("window.addEventListener('popstate'")
    )
    expect(tratador, 'tratador de voltar não encontrado — o nome mudou?').not.toBe('')
    expect(
      tratador.includes('window.history.pushState'),
      'o tratador precisa repor a entrada de histórico, senão o voltar só ' +
        'funciona uma vez e o segundo toque sai do site'
    ).toBe(true)
  })

  /**
   * A ordem importa. Se `navigate(-1)` viesse antes, voltar estando no PDV
   * mudaria de tela COM o PDV ainda ligado — a barra lateral some, a tela
   * errada aparece, e não há como sair.
   */
  it('fecha o PDV antes de tentar a tela anterior', () => {
    const posPdv = GUARDA.indexOf('setPdvAtivo(false)')
    const posVoltar = GUARDA.indexOf('navigate(-1)')
    expect(posPdv, 'o fechamento do PDV sumiu').toBeGreaterThan(-1)
    expect(posVoltar, 'a volta para a tela anterior sumiu').toBeGreaterThan(-1)
    expect(posPdv, 'fechar o PDV tem que vir antes de trocar de tela').toBeLessThan(posVoltar)
  })

  it('escuta o evento de voltar do navegador', () => {
    expect(GUARDA).toContain("addEventListener('popstate'")
    expect(GUARDA, 'sem remover o ouvinte, cada remontagem deixa um para trás').toContain(
      "removeEventListener('popstate'"
    )
  })

  /**
   * No aplicativo instalado não existe botão de voltar, e a constante literal
   * faz o componente sumir do pacote. Montado sem condição, ele empilharia
   * entradas de histórico numa janela do Electron sem motivo nenhum.
   */
  it('só é montado no build do navegador', () => {
    expect(APP).toContain('<GuardaDoVoltar')
    const trecho = APP.slice(APP.indexOf('<MemoryRouter>'), APP.indexOf('<GuardaDoVoltar'))
    expect(
      trecho.includes("__ALVO__ === 'web'"),
      'o guarda tem que estar atrás da constante de alvo, senão entra também ' +
        'no aplicativo instalado'
    ).toBe(true)
  })

  it('fica dentro do roteador — precisa do histórico dele', () => {
    expect(APP.indexOf('<MemoryRouter>')).toBeLessThan(APP.indexOf('<GuardaDoVoltar'))
  })
})
