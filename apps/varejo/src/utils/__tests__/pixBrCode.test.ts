// O QR do PIX impresso no cupom é dinheiro do cliente indo pra algum lugar. Se
// o texto sair errado por um caractere, ou o QR não lê, ou — pior — lê e leva o
// dinheiro pro lugar errado. E nada disso aparece em dev: só aparece quando um
// cliente de verdade escaneia um papel de verdade.
//
// Por isso estes testes não conferem "parece um PIX". Eles DESMONTAM o texto
// gerado campo a campo, do jeito que o app do banco desmonta, e conferem cada
// pedaço. O parser abaixo é proposital: escrever um leitor independente é o que
// impede o teste de repetir o mesmo engano do gerador.

import { describe, it, expect } from 'vitest'
import {
  analisarChavePix,
  crc16,
  montarBrCodePix,
  normalizarTextoPix
} from '@fhvptech/core/lib/pixBrCode'

// CPF e CNPJ de teste com dígitos verificadores realmente válidos.
const CPF = '111.444.777-35'
const CNPJ = '11.222.333/0001-81'
const ALEATORIA = '123e4567-e12b-12d1-a456-426655440000'

const LOJA = { beneficiario: 'Loja do Joao', cidade: 'Sao Paulo' }

/** Desmonta ID+TAMANHO+VALOR num mapa, do jeito que o app do banco faria. */
function desmontar(payload: string): Record<string, string> {
  const campos: Record<string, string> = {}
  let i = 0
  while (i < payload.length) {
    const id = payload.slice(i, i + 2)
    const tamanho = Number(payload.slice(i + 2, i + 4))
    expect(Number.isNaN(tamanho), `tamanho ilegível no campo ${id}`).toBe(false)
    campos[id] = payload.slice(i + 4, i + 4 + tamanho)
    i += 4 + tamanho
  }
  // Se as contas de tamanho batem, o cursor termina exatamente no fim.
  expect(i, 'os tamanhos declarados não fecham com o texto').toBe(payload.length)
  return campos
}

const gerar = (extra: Partial<Parameters<typeof montarBrCodePix>[0]> = {}) =>
  montarBrCodePix({ chave: ALEATORIA, ...LOJA, valor: 15, ...extra })

const exigirOk = (r: ReturnType<typeof montarBrCodePix>): string => {
  if (!r.ok) throw new Error(`esperava sucesso, veio erro: ${r.erro}`)
  return r.payload
}

describe('dígito de verificação (CRC-16/CCITT-FALSE)', () => {
  it('reproduz o valor de conferência universal do algoritmo', () => {
    // "123456789" → 0x29B1 é o valor publicado que identifica ESTE CRC entre as
    // dezenas de variantes de CRC-16. Se este teste passa, o algoritmo é o
    // certo — independente de qualquer coisa relativa a PIX.
    expect(crc16('123456789')).toBe('29B1')
  })

  it('sempre devolve quatro caracteres, com zero à esquerda quando precisa', () => {
    for (const texto of ['', 'a', 'pix', 'A'.repeat(200)]) {
      expect(crc16(texto)).toMatch(/^[0-9A-F]{4}$/)
    }
  })

  it('fecha sobre o payload inteiro, incluindo o "6304" que o anuncia', () => {
    const payload = exigirOk(gerar())
    const corpo = payload.slice(0, -4)
    expect(corpo.endsWith('6304'), 'o payload tem que terminar anunciando o CRC').toBe(true)
    expect(payload.slice(-4)).toBe(crc16(corpo))
  })

  it('acusa qualquer adulteração do texto', () => {
    const payload = exigirOk(gerar())
    // Troca o valor de 15.00 pra 75.00 sem recalcular o dígito — é exatamente o
    // que um QR adulterado seria.
    const adulterado = payload.replace('540515.00', '540575.00')
    expect(adulterado).not.toBe(payload)
    expect(crc16(adulterado.slice(0, -4))).not.toBe(adulterado.slice(-4))
  })
})

describe('estrutura do BR Code', () => {
  const campos = desmontar(exigirOk(gerar()))

  it('declara o formato, a moeda e o país que o PIX exige', () => {
    expect(campos['00']).toBe('01')
    expect(campos['52']).toBe('0000')
    expect(campos['53']).toBe('986') // real
    expect(campos['58']).toBe('BR')
  })

  it('guarda a chave dentro da conta PIX, junto do identificador do BC', () => {
    const conta = desmontar(campos['26'])
    expect(conta['00']).toBe('br.gov.bcb.pix')
    expect(conta['01']).toBe(ALEATORIA)
  })

  it('leva nome e cidade do recebedor', () => {
    expect(campos['59']).toBe('Loja do Joao')
    expect(campos['60']).toBe('Sao Paulo')
  })

  it('manda o valor com ponto e duas casas', () => {
    expect(campos['54']).toBe('15.00')
    expect(desmontar(exigirOk(gerar({ valor: 1234.5 })))['54']).toBe('1234.50')
    expect(desmontar(exigirOk(gerar({ valor: 0.05 })))['54']).toBe('0.05')
  })

  it('usa "***" como identificador da transação', () => {
    // Decisão documentada no pixBrCode.ts: número da venda no txid é recusado
    // por parte dos bancos, e QR recusado no papel ninguém depura no balcão.
    expect(desmontar(campos['62'])['05']).toBe('***')
  })

  it('não declara o QR como de uso único', () => {
    // O campo 01 diria "só pode ler uma vez" — e travaria o cliente que
    // escaneou, desistiu e voltou.
    expect(campos['01']).toBeUndefined()
  })

  it('sai em ASCII puro, senão os tamanhos declarados mentiriam', () => {
    // O tamanho de cada campo é contado em BYTES. Um acento que escapasse
    // ocuparia dois bytes e um caractere, e o QR inteiro seria rejeitado.
    const payload = exigirOk(
      montarBrCodePix({
        chave: ALEATORIA,
        beneficiario: 'Padaria Açúcar & Canela',
        cidade: 'Ribeirão Preto',
        valor: 10
      })
    )
    expect(payload).toMatch(/^[\x20-\x7E]*$/)
    expect(Buffer.byteLength(payload, 'utf8')).toBe(payload.length)
    const c = desmontar(payload)
    expect(c['59']).toBe('Padaria Acucar & Canela')
    expect(c['60']).toBe('Ribeirao Preto')
  })

  it('respeita os limites de 25 e 15 caracteres do padrão', () => {
    const c = desmontar(
      exigirOk(
        gerar({
          beneficiario: 'Comercio de Materiais de Construcao Ltda',
          cidade: 'Sao Jose dos Campos'
        })
      )
    )
    expect(c['59'].length).toBeLessThanOrEqual(25)
    expect(c['60'].length).toBeLessThanOrEqual(15)
  })
})

describe('reconhecimento da chave', () => {
  it.each([
    ['CPF pontuado', CPF, 'cpf', '11144477735'],
    ['CNPJ pontuado', CNPJ, 'cnpj', '11222333000181'],
    ['e-mail', 'Contato@Loja.com.br', 'email', 'contato@loja.com.br'],
    ['chave aleatória', ALEATORIA.toUpperCase(), 'aleatoria', ALEATORIA],
    ['celular com +55', '+55 (11) 99999-8888', 'telefone', '+5511999998888'],
    ['celular sem +55', '(21) 98888-7777', 'telefone', '+5521988887777']
  ])('entende %s', (_nome, entrada, tipo, valor) => {
    const r = analisarChavePix(entrada)
    expect(r.ok && r.tipo, `não reconheceu "${entrada}"`).toBe(tipo)
    expect(r.ok && r.valor).toBe(valor)
  })

  it('desempata 11 dígitos a favor do CPF quando os verificadores fecham', () => {
    // CPF e celular têm o mesmo tamanho. Sem desempate, um dos dois cairia no
    // formato errado e o PIX simplesmente não acharia a chave.
    const r = analisarChavePix('11144477735')
    expect(r.ok && r.tipo).toBe('cpf')
  })

  it('deixa o lojista corrigir o desempate na mão', () => {
    const r = analisarChavePix('11987654321', 'telefone')
    expect(r.ok && r.valor).toBe('+5511987654321')
  })

  it('explica que o CPF está errado em vez de dizer "não reconhecida"', () => {
    // 11 dígitos que não fecham como CPF nem parecem celular são quase sempre
    // um CPF com um número trocado. É o erro mais provável da tela, e uma
    // recusa genérica joga a pessoa de volta pro começo.
    const r = analisarChavePix('111.444.777-36')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erro).toContain('CPF')
  })

  it.each([
    ['vazia', ''],
    ['CPF com dedo trocado', '111.444.777-36'],
    ['CNPJ com dedo trocado', '11.222.333/0001-82'],
    ['e-mail sem domínio', 'contato@loja'],
    ['aleatória truncada', '123e4567-e12b-12d1-a456'],
    ['texto qualquer', 'minha chave pix']
  ])('recusa %s explicando o motivo', (_nome, entrada) => {
    const r = analisarChavePix(entrada)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erro.length, 'recusa sem explicação não ajuda ninguém').toBeGreaterThan(0)
  })
})

describe('recusas que protegem o cupom', () => {
  // Cupom sem QR é um cupom normal. Cupom com QR quebrado é dinheiro que não
  // chega e ninguém descobre por quê — por isso o gerador prefere não desenhar.
  it.each([
    ['chave inválida', { chave: 'nao é chave' }],
    ['loja sem nome', { beneficiario: '   ' }],
    ['loja sem cidade', { cidade: '' }],
    ['valor zero', { valor: 0 }],
    ['valor negativo', { valor: -10 }],
    ['valor inválido', { valor: Number.NaN }],
    // Sobra de centavo: maior que zero, mas arredonda pra zero. Sem conferir
    // DEPOIS de arredondar, sairia um QR pedindo R$ 0,00.
    ['sobra que arredonda pra zero', { valor: 0.004 }]
  ])('não gera QR com %s', (_nome, extra) => {
    const r = gerar(extra)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erro).toBeTruthy()
  })

  it('avisa qual campo da loja está faltando', () => {
    const semCidade = gerar({ cidade: '' })
    expect(!semCidade.ok && semCidade.erro).toContain('cidade')
    const semNome = gerar({ beneficiario: '' })
    expect(!semNome.ok && semNome.erro).toContain('nome')
  })

  it('nome que vira nada depois de tirar o que não é ASCII também é recusado', () => {
    // Loja cujo nome só tem emoji/símbolo: sobra string vazia, e campo 59 vazio
    // gera um QR que o banco rejeita.
    expect(normalizarTextoPix('🎉🎈', 25)).toBe('')
    expect(gerar({ beneficiario: '🎉🎈' }).ok).toBe(false)
  })
})

describe('arredondamento do valor', () => {
  it('fecha em centavos inteiros', () => {
    // 0.1 + 0.2 é o clássico 0.30000000000000004 do ponto flutuante. No QR isso
    // viraria um valor com casas demais e o campo seria inválido.
    expect(desmontar(exigirOk(gerar({ valor: 0.1 + 0.2 })))['54']).toBe('0.30')
    expect(desmontar(exigirOk(gerar({ valor: 19.999 })))['54']).toBe('20.00')
    expect(desmontar(exigirOk(gerar({ valor: 1 / 3 })))['54']).toBe('0.33')
  })
})
