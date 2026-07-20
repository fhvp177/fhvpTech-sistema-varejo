import { describe, it, expect } from 'vitest'
import {
  DIGITOS_IE_POR_UF,
  apenasDigitos,
  formatoEsperadoIE,
  maxDigitosIE,
  validarEmail,
  validarInscricaoEstadual,
  validarRegime,
  validarSerie,
  SERIE_MAX
} from '../validacaoFiscal'
import { UFS } from '../../data/ufs'

describe('apenasDigitos', () => {
  it('descarta tudo que não é número', () => {
    expect(apenasDigitos('06.123.456-7')).toBe('061234567')
    expect(apenasDigitos('abc')).toBe('')
    expect(apenasDigitos('')).toBe('')
  })
})

describe('tabela de inscrição estadual', () => {
  it('cobre os 27 estados', () => {
    // Loja em qualquer UF do país precisa conseguir se cadastrar; um estado
    // faltando aqui vira campo sem validação nenhuma, silenciosamente.
    for (const { sigla } of UFS) {
      expect(DIGITOS_IE_POR_UF[sigla], `faltou ${sigla}`).toBeDefined()
    }
    expect(Object.keys(DIGITOS_IE_POR_UF)).toHaveLength(27)
  })

  it('maxDigitos usa o maior tamanho aceito pela UF', () => {
    expect(maxDigitosIE('SP')).toBe(12)
    expect(maxDigitosIE('PE')).toBe(14) // aceita 9 ou 14
    expect(maxDigitosIE('rj')).toBe(8) // minúscula também
  })

  it('sem UF conhecida, libera o maior tamanho do país', () => {
    expect(maxDigitosIE('')).toBe(14)
    expect(maxDigitosIE('XX')).toBe(14)
  })

  it('descreve o formato esperado em português', () => {
    expect(formatoEsperadoIE('CE')).toBe('9 dígitos')
    expect(formatoEsperadoIE('RN')).toBe('9 ou 10 dígitos')
    expect(formatoEsperadoIE('XX')).toBeNull()
  })
})

describe('validarInscricaoEstadual', () => {
  it('aceita o tamanho certo do estado', () => {
    expect(validarInscricaoEstadual('061234567', 'CE').valido).toBe(true)
    expect(validarInscricaoEstadual('123456789012', 'SP').valido).toBe(true)
  })

  it('aceita qualquer um dos tamanhos quando o estado tem dois', () => {
    expect(validarInscricaoEstadual('123456789', 'PE').valido).toBe(true)
    expect(validarInscricaoEstadual('12345678901234', 'PE').valido).toBe(true)
  })

  it('recusa tamanho errado dizendo quanto falta', () => {
    const r = validarInscricaoEstadual('12345', 'CE')
    expect(r.valido).toBe(false)
    expect(r.erro).toContain('9')
    expect(r.erro).toContain('5') // quantos ele digitou
  })

  it('recusa campo vazio', () => {
    expect(validarInscricaoEstadual('', 'CE').valido).toBe(false)
  })

  it('recusa dígito repetido — engano ou preenchimento de teste', () => {
    expect(validarInscricaoEstadual('000000000', 'CE').valido).toBe(false)
    expect(validarInscricaoEstadual('111111111', 'CE').valido).toBe(false)
  })

  it('ignora máscara digitada pelo lojista', () => {
    expect(validarInscricaoEstadual('06.123.456-7', 'CE').valido).toBe(true)
  })

  it('não inventa regra quando a UF é desconhecida', () => {
    // Loja sem endereço preenchido ainda: a tela cobra o endereço, não é aqui
    // que se barra o cadastro.
    expect(validarInscricaoEstadual('123', '').valido).toBe(true)
  })
})

describe('validarEmail', () => {
  it('aceita endereço comum', () => {
    expect(validarEmail('contato@loja.com.br').valido).toBe(true)
    expect(validarEmail('  contato@loja.com  ').valido).toBe(true)
  })

  it('recusa o que claramente não é e-mail', () => {
    for (const ruim of ['', 'contato', 'contato@', '@loja.com', 'a b@loja.com', 'contato@loja']) {
      expect(validarEmail(ruim).valido, ruim).toBe(false)
    }
  })
})

describe('validarSerie', () => {
  it('aceita a faixa normal', () => {
    expect(validarSerie(1).valido).toBe(true)
    expect(validarSerie(0).valido).toBe(true)
    expect(validarSerie(SERIE_MAX).valido).toBe(true)
  })

  it('recusa faixa reservada ao Fisco', () => {
    // 890-899 é avulsa do Fisco e 900-999 é SCAN: digitar aqui daria nota
    // rejeitada na hora da venda.
    expect(validarSerie(890).valido).toBe(false)
    expect(validarSerie(900).valido).toBe(false)
  })

  it('recusa o que não é inteiro positivo', () => {
    for (const ruim of ['', 'abc', '1.5', '-1', '1e3']) {
      expect(validarSerie(ruim).valido, ruim).toBe(false)
    }
  })
})

describe('validarRegime', () => {
  it('aceita só os três códigos da SEFAZ', () => {
    expect(validarRegime('1').valido).toBe(true)
    expect(validarRegime('2').valido).toBe(true)
    expect(validarRegime('3').valido).toBe(true)
  })

  it('recusa vazio ou qualquer outro valor', () => {
    expect(validarRegime('').valido).toBe(false)
    expect(validarRegime('4').valido).toBe(false)
  })
})
