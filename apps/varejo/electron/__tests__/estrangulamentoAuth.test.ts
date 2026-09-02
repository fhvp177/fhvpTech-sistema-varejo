/**
 * O freio contra adivinhação de PIN.
 *
 * ── O que estes testes protegem ──────────────────────────────────────────────
 * Servido pelo navegador, o endereço da loja é público e o PIN do gerente tem
 * quatro dígitos. Sem freio, dez mil combinações caem em minutos — e com elas o
 * caixa, o estoque e o cadastro de clientes.
 *
 * Um freio que existe mas não freia é pior que nenhum, porque dá sossego falso.
 * Por isso o teste central aqui não é de comportamento: é a CONTA do ataque.
 * Ele mede quanto tempo custaria varrer o espaço inteiro e reprova se o número
 * cair para algo tolerável.
 *
 * ── E o outro lado ───────────────────────────────────────────────────────────
 * Freio demais tranca o lojista para fora da própria loja no meio do movimento.
 * Então há teste dos dois lados: errar três vezes digitando não custa nada, e a
 * espera nunca vira bloqueio permanente.
 */
import { describe, expect, it } from 'vitest'
import {
  aposFalha,
  ERROS_LIVRES,
  ESPERAS_MS,
  ESQUECER_APOS_MS,
  Estrangulador,
  esperaRestante,
  mensagemDeEspera,
  type Tentativas
} from '@fhvptech/core/electron/auth/estrangulamento'

const T0 = 1_700_000_000_000

/** Erra `n` vezes seguidas, sempre no instante liberado. Devolve o estado e o relógio. */
function errar(n: number): { estado: Tentativas | undefined; agora: number } {
  let estado: Tentativas | undefined
  let agora = T0
  for (let i = 0; i < n; i++) {
    agora += esperaRestante(estado, agora)
    estado = aposFalha(estado, agora)
  }
  return { estado, agora }
}

describe('quem erra digitando não é castigado', () => {
  it('os primeiros erros não custam espera nenhuma', () => {
    for (let n = 1; n <= ERROS_LIVRES; n++) {
      const { estado, agora } = errar(n)
      expect(esperaRestante(estado, agora), `${n}º erro cobrou espera`).toBe(0)
    }
  })

  it('acertar zera a contagem', () => {
    const freio = new Estrangulador()
    for (let i = 0; i < 6; i++) freio.falhou('login:1', T0)
    expect(freio.espera('login:1', T0)).toBeGreaterThan(0)

    freio.acertou('login:1')
    expect(freio.espera('login:1', T0)).toBe(0)
  })

  it('a contagem some sozinha depois de um tempo parada', () => {
    const { estado, agora } = errar(7)
    expect(esperaRestante(estado, agora)).toBeGreaterThan(0)
    expect(esperaRestante(estado, agora + ESQUECER_APOS_MS)).toBe(0)
  })

  it('a espera nunca vira bloqueio permanente', () => {
    const { estado, agora } = errar(50)
    const maior = ESPERAS_MS[ESPERAS_MS.length - 1]
    expect(esperaRestante(estado, agora)).toBeLessThanOrEqual(maior)
  })
})

describe('quem varre senhas leva anos', () => {
  /**
   * A conta que justifica o arquivo inteiro. Cada tentativa espera o mínimo
   * possível, que é o melhor caso do atacante.
   */
  function tempoParaVarrer(combinacoes: number): number {
    let estado: Tentativas | undefined
    let agora = T0
    for (let i = 0; i < combinacoes; i++) {
      agora += esperaRestante(estado, agora)
      estado = aposFalha(estado, agora)
    }
    // Laço de contagem fixa: não pendura nem com o freio quebrado — só devolve
    // um tempo pequeno, e a asserção reprova.
    return agora - T0
  }

  it('um PIN de 4 dígitos passa de um mês', () => {
    const dias = tempoParaVarrer(10_000) / 86_400_000
    expect(dias, `10.000 PINs em ${dias.toFixed(1)} dias — freio fraco demais`).toBeGreaterThan(30)
  })

  /**
   * O código de recuperação tem seis dígitos, mas a conta certa não é varrer o
   * milhão: ele VENCE em 15 minutos, e três erros já o invalidam por conta
   * própria (ver gerarCodigoRecuperacao). O freio é a segunda camada, e o que
   * importa medir é quantas tentativas cabem enquanto o código vale.
   */
  it('quase nada pode ser tentado enquanto o código de recuperação vale', () => {
    const VALIDADE_MS = 15 * 60_000
    // O teto não é decoração. Com o freio quebrado, `esperaRestante` devolve
    // sempre zero, o relógio nunca anda e o laço roda para sempre — um teste
    // que PENDURA em vez de reprovar, que é o pior dos dois. Com o teto, ele
    // sai e reprova dizendo o número.
    const TETO = 100_000
    let estado: Tentativas | undefined
    let agora = T0
    let tentativas = 0
    while (agora - T0 < VALIDADE_MS && tentativas < TETO) {
      agora += esperaRestante(estado, agora)
      if (agora - T0 >= VALIDADE_MS) break
      estado = aposFalha(estado, agora)
      tentativas++
    }

    expect(tentativas, `couberam ${tentativas} tentativas em 15 minutos`).toBeLessThan(12)
    // Com tão poucas tentativas, acertar 1 em 1.000.000 é sorte, não ataque.
    expect(tentativas / 1_000_000).toBeLessThan(0.0001)
  })
})

describe('as contagens não se contaminam', () => {
  it('castigo de um vendedor não tranca outro', () => {
    const freio = new Estrangulador()
    for (let i = 0; i < 6; i++) freio.falhou('login:1', T0)

    expect(freio.espera('login:1', T0)).toBeGreaterThan(0)
    expect(freio.espera('login:2', T0), 'o vendedor 2 foi castigado junto').toBe(0)
  })

  it('recuperação por e-mail não tranca o login de ninguém', () => {
    const freio = new Estrangulador()
    for (let i = 0; i < 8; i++) freio.falhou('recuperacao:alguem@exemplo.com', T0)
    expect(freio.espera('login:1', T0)).toBe(0)
  })

  /**
   * Sem faxina, um ataque com e-mails inventados encheria o mapa até o processo
   * ficar sem memória — trocando um problema de segurança por outro.
   */
  it('não acumula contagem velha para sempre', () => {
    const freio = new Estrangulador()
    for (let i = 0; i < 5000; i++) freio.falhou(`recuperacao:lixo${i}@x.com`, T0)
    // Uma falha muito depois dispara a limpeza das antigas.
    freio.falhou('login:1', T0 + ESQUECER_APOS_MS + 1)
    expect(freio.espera('recuperacao:lixo0@x.com', T0 + ESQUECER_APOS_MS + 1)).toBe(0)
  })
})

describe('a mensagem que o lojista lê', () => {
  it('fala em segundos quando é pouco, e em minutos quando é muito', () => {
    expect(mensagemDeEspera(5_000)).toContain('5 segundos')
    expect(mensagemDeEspera(1_000)).toContain('1 segundo')
    expect(mensagemDeEspera(300_000)).toContain('5 minutos')
  })

  it('não conta se o PIN estava certo ou errado', () => {
    // A frase é sobre o excesso de tentativas, e só. Dizer "PIN correto, mas
    // aguarde" entregaria o acerto a quem está varrendo.
    const frase = mensagemDeEspera(60_000).toLowerCase()
    for (const vazamento of ['correto', 'certo', 'existe', 'inválido']) {
      expect(frase, `a frase menciona "${vazamento}"`).not.toContain(vazamento)
    }
  })
})
