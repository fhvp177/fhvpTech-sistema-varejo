/**
 * Sigilo ponta a ponta.
 *
 * É o que impede o servidor do meio de ler as vendas das lojas. Os testes aqui
 * são quase todos sobre o que deve DAR ERRADO, porque é assim que se prova
 * criptografia: o caminho feliz só mostra que dá para escrever e ler de volta —
 * quem garante alguma coisa é o conjunto de tentativas que precisam falhar.
 *
 * O teste mais importante é o do nonce, que é a falha catastrófica do GCM:
 * repetir nonce com a mesma chave revela a diferença entre as duas mensagens e
 * permite forjar novas.
 */
import { describe, expect, it } from 'vitest'
import {
  abrir,
  gerarChaveSigilo,
  mesmaChave,
  selar
} from '@fhvptech/core/electron/multicaixa/sigilo'

const VENDA = {
  canal: 'vendas:criar',
  args: [{ itens: [{ produto_id: 7, quantidade: 2, preco_unitario: 19.9 }], total: 39.8 }]
}

describe('ida e volta', () => {
  it('devolve o mesmo conteúdo', () => {
    const chave = gerarChaveSigilo()

    expect(abrir(chave, selar(chave, VENDA))).toEqual(VENDA)
  })

  it('preserva acentuação', () => {
    const chave = gerarChaveSigilo()
    const dados = { nome: 'Ação & Cia — Comércio de Peças', obs: 'não conferido' }

    expect(abrir(chave, selar(chave, dados))).toEqual(dados)
  })

  it('preserva centavos e nulos', () => {
    const chave = gerarChaveSigilo()
    const dados = { total: 1234.56, desconto: 0.07, cliente_id: null, itens: [] }

    expect(abrir(chave, selar(chave, dados))).toEqual(dados)
  })

  it('aguenta conteúdo grande', () => {
    // Uma lista de produtos de loja grande passa por aqui inteira.
    const chave = gerarChaveSigilo()
    const dados = Array.from({ length: 5000 }, (_, i) => ({ id: i, nome: `Produto ${i}` }))

    expect(abrir(chave, selar(chave, dados))).toEqual(dados)
  })
})

describe('o que o servidor do meio enxerga', () => {
  it('não enxerga nada do conteúdo', () => {
    const chave = gerarChaveSigilo()

    const pacote = selar(chave, VENDA)

    // O pacote é o que trafega. Se qualquer pedaço legível aparecesse aqui, a
    // promessa de ponta a ponta estaria quebrada.
    const bruto = pacote.toString('utf8')
    expect(bruto).not.toContain('vendas:criar')
    expect(bruto).not.toContain('produto_id')
    expect(bruto).not.toContain('19.9')
  })
})

describe('nonce — a falha catastrófica do GCM', () => {
  it('nunca repete, mesmo com chave e conteúdo idênticos', () => {
    const chave = gerarChaveSigilo()

    const nonces = new Set(
      Array.from({ length: 500 }, () => selar(chave, VENDA).subarray(0, 12).toString('hex'))
    )

    // Repetir nonce com a mesma chave revela a diferença entre as mensagens e
    // permite forjar outras. 500 sorteios sem colisão é o esperado.
    expect(nonces.size).toBe(500)
  })

  it('gera pacotes diferentes para o mesmo conteúdo', () => {
    const chave = gerarChaveSigilo()

    // Se dois pacotes iguais saíssem do mesmo conteúdo, quem observa a rede
    // saberia que a mesma operação se repetiu, sem precisar decifrar.
    expect(selar(chave, VENDA).equals(selar(chave, VENDA))).toBe(false)
  })
})

describe('tentativas que precisam falhar', () => {
  const naoAbriu = /conteúdo inválido ou alterado/

  it('chave errada não abre', () => {
    const pacote = selar(gerarChaveSigilo(), VENDA)

    expect(() => abrir(gerarChaveSigilo(), pacote)).toThrow(naoAbriu)
  })

  it('conteúdo adulterado não abre', () => {
    const chave = gerarChaveSigilo()
    const pacote = selar(chave, VENDA)

    // Sem autenticação, alguém no meio poderia trocar o valor de uma venda e o
    // outro lado aceitaria sem perceber.
    pacote[pacote.length - 1] ^= 0x01

    expect(() => abrir(chave, pacote)).toThrow(naoAbriu)
  })

  it('assinatura adulterada não abre', () => {
    const chave = gerarChaveSigilo()
    const pacote = selar(chave, VENDA)
    pacote[13] ^= 0x01

    expect(() => abrir(chave, pacote)).toThrow(naoAbriu)
  })

  it('nonce adulterado não abre', () => {
    const chave = gerarChaveSigilo()
    const pacote = selar(chave, VENDA)
    pacote[0] ^= 0x01

    expect(() => abrir(chave, pacote)).toThrow(naoAbriu)
  })

  it('pacote truncado não abre', () => {
    const chave = gerarChaveSigilo()
    const pacote = selar(chave, VENDA)

    expect(() => abrir(chave, pacote.subarray(0, 10))).toThrow(/inválido/)
    expect(() => abrir(chave, pacote.subarray(0, pacote.length - 5))).toThrow(naoAbriu)
  })

  it('pacote vazio ou de outro tipo não abre', () => {
    const chave = gerarChaveSigilo()

    expect(() => abrir(chave, Buffer.alloc(0))).toThrow(/inválido/)
    expect(() => abrir(chave, 'texto' as unknown as Buffer)).toThrow(/inválido/)
  })

  it('não conta qual das causas falhou', () => {
    // Distinguir "chave errada" de "adulterado" ajudaria quem está tentando
    // adivinhar. As duas dão a mesma frase.
    const chave = gerarChaveSigilo()
    const adulterado = selar(chave, VENDA)
    adulterado[adulterado.length - 1] ^= 0x01

    const erroChave = (() => {
      try {
        abrir(gerarChaveSigilo(), selar(chave, VENDA))
      } catch (e) {
        return (e as Error).message
      }
    })()
    const erroAdulteracao = (() => {
      try {
        abrir(chave, adulterado)
      } catch (e) {
        return (e as Error).message
      }
    })()

    expect(erroChave).toBe(erroAdulteracao)
  })
})

describe('vínculo com o caixa', () => {
  it('abre quando o vínculo bate', () => {
    const chave = gerarChaveSigilo()

    expect(abrir(chave, selar(chave, VENDA, 'terminal-1'), 'terminal-1')).toEqual(VENDA)
  })

  it('não abre em nome de outro caixa', () => {
    const chave = gerarChaveSigilo()
    const pacote = selar(chave, VENDA, 'terminal-1')

    // Impede reapresentar um pacote legítimo como se fosse de outro caixa.
    expect(() => abrir(chave, pacote, 'terminal-2')).toThrow(/alterado/)
  })

  it('não abre sem o vínculo que foi usado ao selar', () => {
    const chave = gerarChaveSigilo()

    expect(() => abrir(chave, selar(chave, VENDA, 'terminal-1'))).toThrow(/alterado/)
  })
})

describe('chave', () => {
  it('tem 256 bits e muda a cada vez', () => {
    const a = gerarChaveSigilo()

    expect(a).toHaveLength(64)
    expect(a).not.toBe(gerarChaveSigilo())
  })

  it('recusa chave de tamanho errado em vez de cifrar mal', () => {
    expect(() => selar('abc', VENDA)).toThrow(/Chave de sigilo inválida/)
    expect(() => selar('', VENDA)).toThrow(/Chave de sigilo inválida/)
  })

  it('compara chaves sem quebrar com lixo', () => {
    const a = gerarChaveSigilo()

    expect(mesmaChave(a, a)).toBe(true)
    expect(mesmaChave(a, gerarChaveSigilo())).toBe(false)
    expect(mesmaChave(a, 'nao-hex')).toBe(false)
    expect(mesmaChave(a, '')).toBe(false)
  })
})
