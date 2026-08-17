// A data por extenso do recibo, e o que o documento mostra ou esconde.
//
// A armadilha da data merece o teste: "2026-08-16" passado por `new Date()` é
// lido como meia-noite UTC, e em qualquer fuso a oeste de Greenwich — o Brasil
// inteiro — vira o dia 15. Num recibo isso muda o dia declarado do pagamento,
// que é justamente o que ele existe para provar.
//
// Para ver falhar: troque `dataPorExtenso` por algo baseado em
// `new Date(iso).toLocaleDateString('pt-BR', …)` e rode com TZ=America/Sao_Paulo.

import { describe, it, expect } from 'vitest'
import { dataPorExtenso, localDoRecibo, montarRecibo } from '../documentoRecibo'
import { LOJA_PADRAO } from '../dadosLoja'

const loja = {
  ...LOJA_PADRAO,
  nome: 'INFORMATICA AVP',
  razao_social: 'INFORMATICA AVP LTDA',
  cnpj: '12.345.678/0001-99',
  cidade: 'Fortaleza',
  uf: 'CE'
}

const recibo = {
  numero: 7,
  valor: 1530.5,
  recebedor_nome: 'INFORMATICA AVP LTDA',
  recebedor_documento: '12.345.678/0001-99',
  recebedor_rg: null,
  pagador_nome: 'Maria Francisca',
  pagador_documento: '222.222.222-22',
  pagador_rg: '11.111.111-1',
  referente: 'conserto do notebook Dell',
  cidade: 'Fortaleza',
  uf: 'CE',
  data_recibo: '2026-08-16',
  observacao: null
}

describe('data por extenso', () => {
  it('escreve o dia que está na string', () => {
    expect(dataPorExtenso('2026-08-16')).toBe('16 de agosto de 2026')
  })

  it('★ não anda um dia para trás', () => {
    // O primeiro dia do mês é onde o bug de fuso aparece mais feio: viraria
    // "31 de dezembro" do ano anterior. O zero à esquerda é de propósito — é
    // como o talão de papelaria escreve ("04 de maio de 2018").
    expect(dataPorExtenso('2026-01-01'), 'a data recuou um dia').toBe('01 de janeiro de 2026')
    expect(dataPorExtenso('2026-03-01')).toBe('01 de março de 2026')
  })

  it('cobre os doze meses', () => {
    const meses = Array.from({ length: 12 }, (_, i) =>
      dataPorExtenso(`2026-${String(i + 1).padStart(2, '0')}-10`)
    )
    expect(meses[0]).toContain('janeiro')
    expect(meses[11]).toContain('dezembro')
    expect(new Set(meses).size, 'dois meses saíram com o mesmo nome').toBe(12)
  })

  it('entrada estranha volta como veio, em vez de inventar data', () => {
    expect(dataPorExtenso('')).toBe('')
    expect(dataPorExtenso('16/08/2026')).toBe('16/08/2026')
    expect(dataPorExtenso('2026-13-01')).toBe('2026-13-01')
  })
})

describe('o lugar, com o estado por extenso', () => {
  it('★ cidade e estado, como o dono pediu', () => {
    // "Pacoti" sozinho não identifica o lugar pra quem lê o recibo em outro
    // estado — e é justamente a cidade pequena que precisa do complemento.
    expect(localDoRecibo('PACOTI', 'CE')).toBe('PACOTI - CEARÁ')
  })

  it('a grafia do estado acompanha a da cidade', () => {
    // Cadastro fiscal costuma guardar tudo em maiúscula; quem digitou bonito
    // merece "Ceará", não "CEARÁ" gritando no meio da linha.
    expect(localDoRecibo('Pacoti', 'CE')).toBe('Pacoti - Ceará')
    expect(localDoRecibo('São Paulo', 'SP')).toBe('São Paulo - São Paulo')
  })

  it('minúscula não conta como grafia bonita nem como grito', () => {
    expect(localDoRecibo('pacoti', 'CE')).toBe('pacoti - Ceará')
  })

  it('aceita a sigla em minúscula', () => {
    expect(localDoRecibo('PACOTI', 'ce')).toBe('PACOTI - CEARÁ')
  })

  it('sem estado, imprime só a cidade — como era antes', () => {
    // Recibo emitido antes desta mudança cai aqui. Ele já foi assinado assim, e
    // a segunda via tem que sair igual ao papel que a pessoa levou.
    expect(localDoRecibo('Fortaleza', null)).toBe('Fortaleza')
    expect(localDoRecibo('Fortaleza', '')).toBe('Fortaleza')
    expect(localDoRecibo('Fortaleza', 'ZZ')).toBe('Fortaleza')
  })

  it('sem cidade, não inventa linha', () => {
    expect(localDoRecibo(null, 'CE')).toBe('')
    expect(localDoRecibo('   ', 'CE')).toBe('')
  })

  it('cidade só com número não é tratada como grito', () => {
    expect(localDoRecibo('123', 'CE')).toBe('123 - Ceará')
  })
})

describe('o corpo do recibo', () => {
  const html = montarRecibo(loja, recibo)

  it('traz o valor duas vezes: em algarismo e por extenso', () => {
    // Num documento de quitação vale o extenso quando os dois discordam. Ter os
    // dois é o ponto.
    expect(html).toContain('1.530,50')
    expect(html).toContain('MIL QUINHENTOS E TRINTA REAIS E CINQUENTA CENTAVOS')
  })

  it('a linha de local e data traz o estado', () => {
    expect(html).toContain('Fortaleza - Ceará, 16 de agosto de 2026')
  })

  it('diz quem recebeu, de quem e por quê', () => {
    expect(html).toContain('INFORMATICA AVP LTDA')
    expect(html).toContain('Maria Francisca')
    expect(html).toContain('conserto do notebook Dell')
  })

  it('só cita o RG de quem tem RG cadastrado', () => {
    // A pagadora tem; a loja não. Imprimir o rótulo sem o número deixaria uma
    // lacuna no meio da frase.
    expect(html).toContain('RG nº 11.111.111-1')
    expect(html.match(/RG nº/g) ?? []).toHaveLength(1)
  })

  it('não carimba CANCELADO num recibo válido', () => {
    expect(html).not.toContain('>CANCELADO<')
  })

  it('carimba CANCELADO no que foi cancelado', () => {
    // Reimprimir um cancelado é legítimo (arquivo, contador). Confundi-lo com
    // um válido, não.
    expect(montarRecibo(loja, { ...recibo, cancelado: 1 })).toContain('CANCELADO')
  })
})

describe('a logo no lugar do nome', () => {
  const comLogo = { ...loja, logo: 'data:image/png;base64,AAA', exibir_logo: true }

  it('desligada: o nome aparece escrito', () => {
    expect(montarRecibo(comLogo, recibo)).toContain('class="loja-nome"')
  })

  it('ligada: o nome escrito some e a logo cresce', () => {
    const html = montarRecibo({ ...comLogo, logo_no_lugar_do_nome: true }, recibo)
    expect(html).not.toContain('class="loja-nome"')
    expect(html).toContain('logo-titulo')
  })

  it('sem logo, a chave ligada não deixa o documento sem identificação', () => {
    // A tela e o backend já impedem essa combinação, mas o cabeçalho é o único
    // lugar onde o estrago apareceria — e apareceria em papel timbrado mudo.
    const html = montarRecibo({ ...loja, logo_no_lugar_do_nome: true }, recibo)
    expect(html).toContain('INFORMATICA AVP')
    expect(html).toContain('class="loja-nome"')
  })
})
