import { describe, it, expect } from 'vitest'
import {
  formatarEnderecoLoja,
  separarEnderecoLegado,
  separacaoConfiavel
} from '@fhvptech/core/lib/enderecoLoja'

// A função mora no core (o processo main e o renderer precisam da MESMA), mas é
// testada aqui porque o core não tem vitest e o varejo é quem a consome hoje.
//
// O que está em jogo: essa lógica decide o endereço impresso no cupom de TODA
// loja instalada, e alimenta o cadastro do emitente na nota fiscal. Endereço
// errado no cupom é constrangimento; endereço errado na nota é problema com o
// Fisco.

describe('formatarEnderecoLoja', () => {
  it('monta a linha completa', () => {
    expect(
      formatarEnderecoLoja({
        logradouro: 'Rua das Flores',
        numero: '123',
        complemento: 'Sala 2',
        bairro: 'Centro'
      })
    ).toBe('Rua das Flores, 123 - Sala 2 - Centro')
  })

  it('omite o que estiver vazio, sem deixar separador solto', () => {
    expect(formatarEnderecoLoja({ logradouro: 'Rua X', numero: '10' })).toBe('Rua X, 10')
    expect(formatarEnderecoLoja({ logradouro: 'Rua X', bairro: 'Centro' })).toBe('Rua X - Centro')
    expect(formatarEnderecoLoja({ logradouro: 'Rua X' })).toBe('Rua X')
  })

  it('sem logradouro não imprime nada', () => {
    // Evita cupom com uma linha ", 123 - Centro" pendurada.
    expect(formatarEnderecoLoja({ numero: '123', bairro: 'Centro' })).toBe('')
    expect(formatarEnderecoLoja({})).toBe('')
  })

  it('ignora espaço em excesso digitado pelo lojista', () => {
    expect(formatarEnderecoLoja({ logradouro: '  Rua X  ', numero: ' 10 ' })).toBe('Rua X, 10')
  })
})

describe('separarEnderecoLegado', () => {
  const casos: Array<[string, { logradouro: string; numero: string; complemento: string; bairro: string }]> = [
    [
      'Rua das Flores, 123 - Centro',
      { logradouro: 'Rua das Flores', numero: '123', complemento: '', bairro: 'Centro' }
    ],
    [
      'Av. Paulista, 1000 - Sala 3 - Bela Vista',
      { logradouro: 'Av. Paulista', numero: '1000', complemento: 'Sala 3', bairro: 'Bela Vista' }
    ],
    [
      'Rua X, 45',
      { logradouro: 'Rua X', numero: '45', complemento: '', bairro: '' }
    ],
    [
      'Rua X - Centro',
      { logradouro: 'Rua X', numero: '', complemento: '', bairro: 'Centro' }
    ],
    [
      'Praça da Sé',
      { logradouro: 'Praça da Sé', numero: '', complemento: '', bairro: '' }
    ],
    [
      'Rua B, 12A - Jardim',
      { logradouro: 'Rua B', numero: '12A', complemento: '', bairro: 'Jardim' }
    ],
    [
      // Bairro separado por vírgula em vez de travessão — formato comum.
      'Rua X, 123, Centro',
      { logradouro: 'Rua X', numero: '123', complemento: '', bairro: 'Centro' }
    ],
    [
      'Rua X 123',
      { logradouro: 'Rua X', numero: '123', complemento: '', bairro: '' }
    ]
  ]

  for (const [entrada, esperado] of casos) {
    it(`separa "${entrada}"`, () => {
      expect(separarEnderecoLegado(entrada)).toEqual(esperado)
    })
  }

  it('não confunde vírgula do nome da rua com número', () => {
    // "Rua Coronel, Silva" partido daria logradouro "Rua Coronel" e número
    // "Silva" — o filtro exige que o pedaço depois da vírgula seja numérico.
    const r = separarEnderecoLegado('Rua Coronel, Silva')
    expect(r.numero).toBe('')
    expect(r.logradouro).toBe('Rua Coronel, Silva')
  })

  it('texto vazio devolve tudo vazio', () => {
    expect(separarEnderecoLegado('')).toEqual({
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: ''
    })
  })
})

describe('separacaoConfiavel — a trava que protege o cupom', () => {
  it('aceita quando a separação remonta o texto original', () => {
    const original = 'Rua das Flores, 123 - Centro'
    expect(separacaoConfiavel(original, separarEnderecoLegado(original))).toBe(true)
  })

  it('aceita o endereço legado REAL da primeira loja do sistema', () => {
    // Caso de verdade, vindo da migration 030: endereço SEM número. Serve de
    // prova de que a conversão não inventa dado que não existe.
    const original = 'Praça Claudemiro Lopes Bezerra - Mercado Central'
    const partes = separarEnderecoLegado(original)
    expect(partes.logradouro).toBe('Praça Claudemiro Lopes Bezerra')
    expect(partes.bairro).toBe('Mercado Central')
    expect(partes.numero).toBe('') // não inventou número
    expect(separacaoConfiavel(original, partes)).toBe(true)
  })

  it('recusa quando remontar mudaria o texto impresso, mesmo separando bem', () => {
    // Aqui a separação em partes está CERTA (Rua X / 123 / Centro), mas a
    // remontagem sai "Rua X, 123 - Centro" (travessão no lugar da vírgula) —
    // diferente do que era impresso. A trava recusa: a migration vai preencher
    // as partes como sugestão, mas NÃO troca o texto do cupom automaticamente.
    // Quem decide imprimir o novo formato é o lojista, ao salvar.
    const original = 'Rua X, 123, Centro'
    const partes = separarEnderecoLegado(original)
    expect(partes).toEqual({ logradouro: 'Rua X', numero: '123', complemento: '', bairro: 'Centro' })
    expect(separacaoConfiavel(original, partes)).toBe(false)
  })

  it('recusa texto que não vira endereço nenhum', () => {
    expect(separacaoConfiavel('', separarEnderecoLegado(''))).toBe(false)
  })

  it('tolera espaço em excesso, nunca conteúdo diferente', () => {
    const original = 'Rua  das   Flores,  123  -  Centro'
    expect(separacaoConfiavel(original, separarEnderecoLegado(original))).toBe(true)
    expect(
      separacaoConfiavel('Rua das Flores, 123 - Centro', {
        logradouro: 'Rua das Flores',
        numero: '124', // um dígito diferente
        complemento: '',
        bairro: 'Centro'
      })
    ).toBe(false)
  })

  it('ida e volta preserva o texto em todos os casos aceitos', () => {
    // Invariante geral: se a separação foi aceita, imprimir pelas partes dá
    // exatamente o que era impresso antes. É essa propriedade que garante que
    // nenhuma loja veja o cupom mudar depois da atualização.
    const exemplos = [
      'Rua das Flores, 123 - Centro',
      'Av. Paulista, 1000 - Sala 3 - Bela Vista',
      'Rua X, 45',
      'Rua X - Centro',
      'Praça da Sé',
      'Praça Claudemiro Lopes Bezerra - Mercado Central'
    ]
    for (const original of exemplos) {
      const partes = separarEnderecoLegado(original)
      if (separacaoConfiavel(original, partes)) {
        expect(formatarEnderecoLoja(partes), original).toBe(original)
      }
    }
  })
})
