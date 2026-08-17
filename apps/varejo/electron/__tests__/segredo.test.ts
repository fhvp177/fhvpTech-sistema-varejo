/**
 * Cofre de credenciais (`@fhvptech/core/electron/segredoLogica`).
 *
 * ── O que está sendo protegido ───────────────────────────────────────────────
 * O token da maquininha COBRA DINHEIRO em nome do lojista. O banco desta loja
 * viaja em backup, pen drive e pasta secundária — é por aí que um segredo em
 * texto puro vazaria.
 *
 * Como quase toda criptografia, o que garante alguma coisa aqui não é o caminho
 * feliz: é o conjunto de coisas que precisam FALHAR do jeito certo. Os dois
 * testes mais importantes são:
 *
 * 1. **Cofre indisponível não cai pra texto puro.** Gravar sem cifrar seria dar
 *    ao lojista uma sensação de proteção que não existe — pior do que recusar.
 * 2. **Máquina trocada devolve null, não explode.** É o caso REAL de restaurar
 *    backup noutro PC. Se isto lançasse, uma credencial ilegível derrubaria o
 *    app no boot — exatamente o tipo de "abre vazio" que já mordeu antes.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  guardarSegredoCom,
  lerSegredoCom,
  temSegredoCom,
  type Cofre,
  type Deposito
} from '@fhvptech/core/electron/segredoLogica'

// Cofre de mentira que imita a DPAPI: "cifrar" é embaralhar com uma marca de
// máquina, e decifrar só funciona se a marca bater. É o suficiente pra provar
// as regras — a criptografia de verdade é responsabilidade do sistema
// operacional, não nossa.
const cofreFake = (maquina = 'pc-1', disponivel = true): Cofre => ({
  disponivel: () => disponivel,
  cifrar: (texto) => Buffer.from(`${maquina}|${texto}`, 'utf8'),
  decifrar: (blob) => {
    const [dona, ...resto] = blob.toString('utf8').split('|')
    if (dona !== maquina) throw new Error('selado por outra máquina')
    return resto.join('|')
  }
})

const depositoFake = (inicial: Record<string, string> = {}) => {
  const dados = { ...inicial }
  const deposito: Deposito = {
    ler: (c) => dados[c] ?? '',
    gravar: (c, v) => {
      dados[c] = v
    }
  }
  return { deposito, dados }
}

describe('ida e volta', () => {
  it('devolve o mesmo segredo', () => {
    const cofre = cofreFake()
    const { deposito } = depositoFake()
    guardarSegredoCom(cofre, deposito, 'token', 'APP_USR-123')

    expect(lerSegredoCom(cofre, deposito, 'token')).toBe('APP_USR-123')
  })

  it('não deixa o segredo legível no depósito', () => {
    // O ponto inteiro do exercício: é ISTO que vai dentro do arquivo de backup.
    const cofre = cofreFake()
    const { deposito, dados } = depositoFake()
    guardarSegredoCom(cofre, deposito, 'token', 'APP_USR-123')

    expect(dados.token).not.toContain('APP_USR-123')
    expect(dados.token.startsWith('v1:')).toBe(true)
  })

  it('preserva acentuação e símbolos', () => {
    const cofre = cofreFake()
    const { deposito } = depositoFake()
    const segredo = 'chave-ção+/=|áé#$%'
    guardarSegredoCom(cofre, deposito, 'k', segredo)

    expect(lerSegredoCom(cofre, deposito, 'k')).toBe(segredo)
  })

  it('tira espaço em volta antes de guardar', () => {
    const cofre = cofreFake()
    const { deposito } = depositoFake()
    guardarSegredoCom(cofre, deposito, 'k', '  APP_USR-123  ')

    expect(lerSegredoCom(cofre, deposito, 'k')).toBe('APP_USR-123')
  })
})

describe('o que precisa dar errado', () => {
  it('RECUSA gravar quando o cofre não existe — nunca cai pra texto puro', () => {
    const cofre = cofreFake('pc-1', false)
    const { deposito, dados } = depositoFake()

    expect(() => guardarSegredoCom(cofre, deposito, 'token', 'APP_USR-123')).toThrow(
      /cofre de credenciais/
    )
    // E não deixou rastro: nada gravado, nem cifrado nem cru.
    expect(dados.token).toBeUndefined()
  })

  it('máquina trocada devolve null em vez de lançar', () => {
    // Backup restaurado noutro PC: o borrão veio junto, mas a chave do SO não.
    const { deposito } = depositoFake()
    guardarSegredoCom(cofreFake('pc-antigo'), deposito, 'token', 'APP_USR-123')

    expect(lerSegredoCom(cofreFake('pc-novo'), deposito, 'token')).toBeNull()
  })

  it('cofre sumido na leitura devolve null em vez de lançar', () => {
    const { deposito } = depositoFake()
    guardarSegredoCom(cofreFake(), deposito, 'token', 'APP_USR-123')

    expect(lerSegredoCom(cofreFake('pc-1', false), deposito, 'token')).toBeNull()
  })

  it('valor corrompido devolve null em vez de lançar', () => {
    const { deposito } = depositoFake({ token: 'v1:isso-nao-e-base64-valido!!!' })

    expect(lerSegredoCom(cofreFake(), deposito, 'token')).toBeNull()
  })

  it('depósito quebrado devolve null em vez de derrubar o boot', () => {
    const deposito: Deposito = {
      ler: () => {
        throw new Error('banco travado')
      },
      gravar: () => {}
    }

    expect(lerSegredoCom(cofreFake(), deposito, 'token')).toBeNull()
    expect(temSegredoCom(deposito, 'token')).toBe(false)
  })

  it('ignora texto puro gravado sem a marca de versão', () => {
    // Se algum dia um valor cru caiu nessa chave, ele NÃO é devolvido como
    // segredo válido — sem a marca, não passou pelo cofre.
    const { deposito } = depositoFake({ token: 'APP_USR-cru' })

    expect(lerSegredoCom(cofreFake(), deposito, 'token')).toBeNull()
  })

  it('nunca lança na leitura, aconteça o que acontecer', () => {
    const cofreCaotico: Cofre = {
      disponivel: () => true,
      cifrar: () => Buffer.from(''),
      decifrar: () => {
        throw new Error('boom')
      }
    }
    const { deposito } = depositoFake({ token: 'v1:AAAA' })

    expect(() => lerSegredoCom(cofreCaotico, deposito, 'token')).not.toThrow()
  })
})

describe('apagar', () => {
  it('valor vazio apaga o segredo', () => {
    const cofre = cofreFake()
    const { deposito } = depositoFake()
    guardarSegredoCom(cofre, deposito, 'token', 'APP_USR-123')
    guardarSegredoCom(cofre, deposito, 'token', '')

    expect(lerSegredoCom(cofre, deposito, 'token')).toBeNull()
    expect(temSegredoCom(deposito, 'token')).toBe(false)
  })

  it('apagar funciona mesmo sem cofre disponível', () => {
    // Remover credencial não pode depender do SO cooperar — se dependesse, um
    // lojista sem cofre ficaria preso a um segredo que não consegue tirar.
    const { deposito } = depositoFake()
    guardarSegredoCom(cofreFake(), deposito, 'token', 'APP_USR-123')

    expect(() => guardarSegredoCom(cofreFake('pc-1', false), deposito, 'token', '')).not.toThrow()
    expect(temSegredoCom(deposito, 'token')).toBe(false)
  })
})

describe('temSegredo distingue "nunca configurou" de "não consigo abrir"', () => {
  it('é falso quando nunca se gravou nada', () => {
    const { deposito } = depositoFake()

    expect(temSegredoCom(deposito, 'token')).toBe(false)
  })

  it('é VERDADEIRO quando há segredo de outra máquina', () => {
    // A distinção que a tela precisa: aqui ela diz "reconecte a maquininha
    // neste computador", não "configure pela primeira vez".
    const { deposito } = depositoFake()
    guardarSegredoCom(cofreFake('pc-antigo'), deposito, 'token', 'APP_USR-123')

    expect(temSegredoCom(deposito, 'token')).toBe(true)
    expect(lerSegredoCom(cofreFake('pc-novo'), deposito, 'token')).toBeNull()
  })
})
