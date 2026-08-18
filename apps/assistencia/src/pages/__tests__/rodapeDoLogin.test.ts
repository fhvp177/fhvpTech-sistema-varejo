// O rodapé da tela de login — telefone do suporte, "recupere por e-mail" e o
// atalho "Configurar este computador" — é a saída de quem NÃO consegue entrar.
// O atalho, em particular, é a única porta pra virar caixa adicional ou trazer
// os dados de outra máquina: numa instalação nova ninguém sabe o PIN do técnico
// que veio junto, então não há como logar e chegar às Configurações.
//
// ── O bug que estes testes existem pra impedir ───────────────────────────────
// A gate era `!selecionado` — "só na lista de contas". Mas a tela PULA a lista
// quando existe uma conta só: seleciona sozinha e vai direto pro PIN. Sem
// lista, `selecionado` nunca é null e o rodapé inteiro sumia. Nem havia volta: o
// botão "trocar" também se esconde com uma conta só.
//
// E sumia justamente onde importa — instalação nova nasce com UM técnico
// ('Gerente', migration 013), que é exatamente a máquina que alguém está
// tentando transformar em caixa adicional.
//
// Nada disso quebra typecheck, teste ou build: o rodapé simplesmente não pinta.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { deveMostrarRodapeDoLogin } from '@fhvptech/core/lib/rodapeDoLogin'

const raiz = join(__dirname, '..', '..', '..', '..', '..')
const ler = (rel: string): string => readFileSync(join(raiz, rel), 'utf-8')
const APP = 'apps/assistencia'

describe('quando mostrar o rodapé da tela de login', () => {
  it('aparece com uma conta só, mesmo já estando na tela do PIN', () => {
    // A REGRESSÃO. Com uma conta a tela auto-seleciona e vai direto pro PIN;
    // se o rodapé depender de "ninguém selecionado", some pra sempre.
    expect(
      deveMostrarRodapeDoLogin({ alguemSelecionado: true, totalDeContas: 1 }),
      'Com uma conta só não há lista pra voltar: escondido aqui é escondido pra sempre.'
    ).toBe(true)
  })

  it('aparece na máquina recém-instalada, antes de a lista carregar', () => {
    expect(deveMostrarRodapeDoLogin({ alguemSelecionado: false, totalDeContas: 0 })).toBe(true)
  })

  it('aparece enquanto a pessoa escolhe entre várias contas', () => {
    expect(deveMostrarRodapeDoLogin({ alguemSelecionado: false, totalDeContas: 4 })).toBe(true)
  })

  it('fica discreto depois de escolher uma conta entre várias', () => {
    // Aqui esconder é de propósito, e é seguro: o botão "trocar" devolve a
    // pessoa pra lista, onde o rodapé está.
    expect(deveMostrarRodapeDoLogin({ alguemSelecionado: true, totalDeContas: 4 })).toBe(false)
  })
})

describe('a tela de login usa a regra compartilhada', () => {
  const fonte = ler(`${APP}/src/pages/LoginSistema.tsx`)

  it('tem os dois blocos do rodapé e chama deveMostrarRodapeDoLogin', () => {
    // Sentinela: sem isto, os testes acima passariam de graça se o rodapé
    // mudasse de arquivo ou a tela voltasse a decidir sozinha.
    expect(fonte).toContain('(85) 9.2187-1975')
    expect(fonte).toContain('Configurar este computador')
    expect(fonte, 'A tela voltou a decidir sozinha quando mostrar o rodapé.').toContain(
      'deveMostrarRodapeDoLogin('
    )
  })

  it('os dois blocos passam pela mesma regra', () => {
    // Suporte e atalho já divergiram uma vez; separá-los de novo faria um
    // sumir sem o outro, que é o defeito voltando pela metade.
    const usos = fonte.match(/mostrarRodape &&/g) ?? []
    expect(
      usos.length,
      'Suporte e "Configurar este computador" precisam da MESMA condição.'
    ).toBe(2)
  })

  it('não voltou a esconder o rodapé só por haver alguém selecionado', () => {
    expect(
      /\{!selecionado && \(/.test(fonte),
      '`{!selecionado && (` é exatamente a gate que sumia com uma conta só — a ' +
        'tela auto-seleciona e nunca mais mostra o rodapé.'
    ).toBe(false)
  })

  it('ainda auto-seleciona quando há uma conta só', () => {
    // Não é para desfazer: pular a lista com uma conta só é o comportamento
    // desejado. Este teste marca a origem da armadilha — se o rodapé um dia
    // voltar a depender de `!selecionado`, é daqui que o sumiço vem.
    expect(fonte).toMatch(/vendedores\.length === 1[\s\S]{0,80}setSelecionado/)
  })

  it('não repete o "esqueci meu PIN" na etapa em que ele já está na tela', () => {
    // O formulário do PIN já oferece "Esqueci meu PIN". O rodapé encurta ali
    // para não entregar a mesma saída duas vezes seguidas.
    expect(fonte).toContain('Esqueci meu PIN')
    expect(
      /selecionado \? \(\s*'Precisa de ajuda\?/.test(fonte),
      'O rodapé precisa encurtar o texto quando alguém já está selecionado.'
    ).toBe(true)
  })
})
