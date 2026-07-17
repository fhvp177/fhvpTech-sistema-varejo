import { describe, it, expect } from 'vitest'
import {
  analisarXmlNfe,
  extrairTamanho,
  sugerirGrades,
  calcularPrecoVenda,
  formatarCnpj
} from '../nfe'

// NF-e 4.00 de exemplo com os casos que importam:
// - item 1/2: vestuário (NCM 6109) em dois tamanhos, SEM GTIN → sugestão de grade
// - item 3: peça de moto (NCM 8714) com EAN, frete + IPI rateados → custo real
// - item 4: vestuário com desconto
const XML_NFE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35260712345678000199550010000012341000012349" versao="4.00">
      <ide>
        <cUF>35</cUF><mod>55</mod><serie>1</serie><nNF>1234</nNF>
        <dhEmi>2026-07-10T14:30:00-03:00</dhEmi><natOp>VENDA</natOp>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>CONFECCOES EXEMPLO LTDA</xNome>
        <xFant>Exemplo Modas</xFant>
        <enderEmit>
          <xLgr>RUA DAS FABRICAS</xLgr><nro>100</nro><xBairro>CENTRO</xBairro>
          <xMun>FORTALEZA</xMun><UF>CE</UF><CEP>60000000</CEP><fone>8533334444</fone>
        </enderEmit>
      </emit>
      <dest><CNPJ>98765432000188</CNPJ><xNome>LOJA DESTINO</xNome></dest>
      <det nItem="1">
        <prod>
          <cProd>0451</cProd><cEAN>SEM GTIN</cEAN>
          <xProd>VESTIDO LONGO AZUL M</xProd>
          <NCM>61044400</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
          <qCom>3.0000</qCom><vUnCom>45.0000000000</vUnCom><vProd>135.00</vProd>
        </prod>
        <imposto><ICMS><ICMS00><vICMS>0.00</vICMS></ICMS00></ICMS></imposto>
      </det>
      <det nItem="2">
        <prod>
          <cProd>0452</cProd><cEAN>SEM GTIN</cEAN>
          <xProd>VESTIDO LONGO AZUL G</xProd>
          <NCM>61044400</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
          <qCom>2.0000</qCom><vUnCom>45.0000000000</vUnCom><vProd>90.00</vProd>
        </prod>
        <imposto><ICMS><ICMS00><vICMS>0.00</vICMS></ICMS00></ICMS></imposto>
      </det>
      <det nItem="3">
        <prod>
          <cProd>PM-889</cProd><cEAN>7891234567895</cEAN>
          <xProd>PNEU DIANTEIRO MOTO 90/90-19</xProd>
          <NCM>40114000</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
          <qCom>2.0000</qCom><vUnCom>100.0000000000</vUnCom><vProd>200.00</vProd>
          <vFrete>20.00</vFrete>
        </prod>
        <imposto>
          <ICMS><ICMS10><vICMSST>10.00</vICMSST></ICMS10></ICMS>
          <IPI><IPITrib><vIPI>6.00</vIPI></IPITrib></IPI>
        </imposto>
      </det>
      <det nItem="4">
        <prod>
          <cProd>0500</cProd><cEAN></cEAN>
          <xProd>CINTO COURO MARROM</xProd>
          <NCM>62171000</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
          <qCom>4.0000</qCom><vUnCom>25.0000000000</vUnCom><vProd>100.00</vProd>
          <vDesc>10.00</vDesc>
        </prod>
        <imposto><ICMS><ICMS00><vICMS>0.00</vICMS></ICMS00></ICMS></imposto>
      </det>
      <total><ICMSTot><vNF>541.00</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
  <protNFe><infProt><chNFe>35260712345678000199550010000012341000012349</chNFe><cStat>100</cStat></infProt></protNFe>
</nfeProc>`

describe('analisarXmlNfe', () => {
  const nota = analisarXmlNfe(XML_NFE)

  it('lê a identidade da nota (chave, número, série, modelo, emissão)', () => {
    expect(nota.chave).toBe('35260712345678000199550010000012341000012349')
    expect(nota.numero).toBe('1234')
    expect(nota.serie).toBe('1')
    expect(nota.modelo).toBe('55')
    expect(nota.dataEmissao).toBe('2026-07-10T14:30:00-03:00')
    expect(nota.valorTotal).toBe(541)
  })

  it('lê o fornecedor (emitente) com endereço montado', () => {
    expect(nota.fornecedor.cnpj).toBe('12345678000199')
    expect(nota.fornecedor.nome).toBe('CONFECCOES EXEMPLO LTDA')
    expect(nota.fornecedor.fantasia).toBe('Exemplo Modas')
    expect(nota.fornecedor.telefone).toBe('8533334444')
    expect(nota.fornecedor.endereco).toBe('RUA DAS FABRICAS, 100 - CENTRO - FORTALEZA/CE')
  })

  it('lê o CNPJ do destinatário pra conferência', () => {
    expect(nota.destinatarioCnpj).toBe('98765432000188')
  })

  it('lê os itens preservando cProd como texto (zeros à esquerda)', () => {
    expect(nota.itens).toHaveLength(4)
    expect(nota.itens[0].cprod).toBe('0451')
    expect(nota.itens[0].quantidade).toBe(3)
    expect(nota.itens[0].ncm).toBe('61044400')
    expect(nota.itens[0].cfop).toBe('5102')
  })

  it('trata "SEM GTIN" e cEAN vazio como sem código de barras', () => {
    expect(nota.itens[0].ean).toBeNull()
    expect(nota.itens[3].ean).toBeNull()
    expect(nota.itens[2].ean).toBe('7891234567895')
  })

  it('calcula o custo REAL rateando frete, IPI e ICMS-ST', () => {
    // Item 3: (200 vProd + 20 frete + 6 IPI + 10 ST) / 2 un = 118,00
    expect(nota.itens[2].custoUnitario).toBe(118)
    expect(nota.itens[2].valorUnitario).toBe(100)
  })

  it('desconta o vDesc do custo', () => {
    // Item 4: (100 − 10) / 4 = 22,50
    expect(nota.itens[3].custoUnitario).toBe(22.5)
  })

  it('marca vestuário pelo NCM e extrai o tamanho da descrição', () => {
    expect(nota.itens[0].vestuario).toBe(true)
    expect(nota.itens[0].tamanho).toBe('M')
    expect(nota.itens[0].descricaoBase).toBe('VESTIDO LONGO AZUL')
    expect(nota.itens[1].tamanho).toBe('G')
    // Pneu não é vestuário; cinto é NCM 62 mas sem tamanho no nome
    expect(nota.itens[2].vestuario).toBe(false)
    expect(nota.itens[3].vestuario).toBe(true)
    expect(nota.itens[3].tamanho).toBeNull()
    expect(nota.itens[3].descricaoBase).toBe('CINTO COURO MARROM')
  })

  it('aceita XML sem o envelope nfeProc (só NFe)', () => {
    const semProc = XML_NFE.replace(/<\/?nfeProc[^>]*>/g, '')
      .replace(/<protNFe>.*<\/protNFe>/s, '')
    const n = analisarXmlNfe(semProc)
    expect(n.chave).toBe('35260712345678000199550010000012341000012349')
    expect(n.itens).toHaveLength(4)
  })

  it('lê nota de item único (det não vira array à toa)', () => {
    const umItem = `<NFe><infNFe Id="NFe35260712345678000199550010000012341000012349">
      <ide><mod>55</mod><serie>1</serie><nNF>77</nNF><dhEmi>2026-07-01T10:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>12345678000199</CNPJ><xNome>FORNECEDOR UNICO</xNome></emit>
      <det nItem="1"><prod><cProd>A1</cProd><cEAN>SEM GTIN</cEAN><xProd>PRODUTO UNICO</xProd>
        <NCM>87141000</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
        <qCom>1.0000</qCom><vUnCom>50.00</vUnCom><vProd>50.00</vProd></prod></det>
      <total><ICMSTot><vNF>50.00</vNF></ICMSTot></total>
    </infNFe></NFe>`
    const n = analisarXmlNfe(umItem)
    expect(n.itens).toHaveLength(1)
    expect(n.itens[0].cprod).toBe('A1')
    expect(n.itens[0].custoUnitario).toBe(50)
  })

  it('rejeita XML que não é NF-e com mensagem amigável', () => {
    expect(() => analisarXmlNfe('<pedido><item>x</item></pedido>')).toThrow(/não parece ser uma nota fiscal/)
  })

  it('rejeita arquivo que nem é XML', () => {
    expect(() => analisarXmlNfe('%PDF-1.4 blablabla')).toThrow(/não é um XML válido/)
  })
})

describe('extrairTamanho', () => {
  it('extrai letras de grade no fim da descrição', () => {
    expect(extrairTamanho('CAMISETA BASICA PRETA GG')).toEqual({
      base: 'CAMISETA BASICA PRETA',
      tamanho: 'GG'
    })
    expect(extrairTamanho('BLUSA REGATA - P')).toEqual({ base: 'BLUSA REGATA', tamanho: 'P' })
    expect(extrairTamanho('VESTIDO FLORAL (M)')).toEqual({ base: 'VESTIDO FLORAL', tamanho: 'M' })
  })

  it('entende o prefixo TAM/TAMANHO', () => {
    expect(extrairTamanho('CALCA SOCIAL TAM 42')).toEqual({ base: 'CALCA SOCIAL', tamanho: '42' })
    expect(extrairTamanho('SAIA MIDI TAMANHO: G')).toEqual({ base: 'SAIA MIDI', tamanho: 'G' })
  })

  it('extrai tamanho numérico só na faixa de roupa/calçado (33–56)', () => {
    expect(extrairTamanho('TENIS CASUAL BRANCO 38')).toEqual({
      base: 'TENIS CASUAL BRANCO',
      tamanho: '38'
    })
    expect(extrairTamanho('PNEU MOTO 90')).toBeNull()
    expect(extrairTamanho('KIT 12')).toBeNull()
  })

  it('não confunde palavra comum com tamanho', () => {
    expect(extrairTamanho('CINTO COURO MARROM')).toBeNull()
    expect(extrairTamanho('CAMISA POLO')).toBeNull()
  })
})

describe('sugerirGrades', () => {
  const nota = analisarXmlNfe(XML_NFE)

  it('agrupa itens de vestuário que só diferem no tamanho', () => {
    const grades = sugerirGrades(nota.itens)
    expect(grades).toHaveLength(1)
    expect(grades[0].map((i) => i.tamanho)).toEqual(['M', 'G'])
    expect(grades[0][0].descricaoBase).toBe('VESTIDO LONGO AZUL')
  })

  it('não agrupa item sozinho nem tamanhos repetidos', () => {
    const soUm = sugerirGrades([nota.itens[0]])
    expect(soUm).toHaveLength(0)
    const repetidos = sugerirGrades([nota.itens[0], { ...nota.itens[1], tamanho: 'M' }])
    expect(repetidos).toHaveLength(0)
  })
})

describe('calcularPrecoVenda', () => {
  it('markup em %: 30% em cima de 100 = 130', () => {
    expect(calcularPrecoVenda(100, 30, 'pct')).toBe(130)
    expect(calcularPrecoVenda(22.5, 100, 'pct')).toBe(45)
  })

  it('lucro em R$: soma direta', () => {
    expect(calcularPrecoVenda(118, 50, 'reais')).toBe(168)
  })
})

describe('formatarCnpj', () => {
  it('formata 14 dígitos e deixa o resto em paz', () => {
    expect(formatarCnpj('12345678000199')).toBe('12.345.678/0001-99')
    expect(formatarCnpj(null)).toBe('')
    expect(formatarCnpj('123')).toBe('123')
  })
})
