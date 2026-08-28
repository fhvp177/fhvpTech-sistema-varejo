/**
 * O carnê impresso tem que ser o mesmo carnê que será cobrado.
 *
 * ── O risco que estes testes prendem ────────────────────────────────────────
 * O carnê existe em três lugares ao mesmo tempo: a prévia na tela, as linhas
 * gravadas no banco e o papel que o cliente leva pra casa. Se os três não
 * saírem da MESMA conta, eles divergem — e a divergência só aparece meses
 * depois, na hora de quitar, com o cliente segurando um papel que diz um número
 * e o sistema mostrando outro. Não há como decidir quem está certo nessa hora.
 *
 * Por isso `montarParcelas` mora no core e é importada pelos dois lados. Estes
 * testes afirmam as propriedades que fazem o papel valer:
 *   1. a soma das parcelas é EXATAMENTE o total (nem um centavo a mais ou menos);
 *   2. as datas andam mês a mês, sem pular nem embaralhar a ordem;
 *   3. parcela já paga não leva QR — reimprimir não pode convidar a pagar de novo.
 */
import { describe, it, expect } from 'vitest'
import { montarParcelas } from '@fhvptech/core/lib/parcelas'
import { carneEmprestimoHtml, promissoriaEmprestimoHtml } from '../../utils/documentosEmprestimo'
import { LOJA_PADRAO } from '../../utils/dadosLoja'

const LOJA = {
  ...LOJA_PADRAO,
  nome: 'FHVP Assistência',
  razao_social: 'FHVP TECH LTDA',
  cnpj: '12.345.678/0001-90',
  cidade: 'PACOTI',
  uf: 'CE',
  // Chave válida faz o QR ser realmente desenhado; sem ela o teste do QR não
  // provaria nada (o bloco sairia vazio nos dois casos).
  pix_chave: 'fhvp17@gmail.com',
  pix_tipo: 'email' as const
}

const EMPRESTIMO = {
  id: 7,
  devedor_nome: 'João da Silva',
  devedor_documento: '111.222.333-44',
  valor_principal: 500,
  valor_acordado: 600,
  data_emprestimo: '2026-03-10',
  vencimento: '2026-06-10',
  observacao: null
}

describe('a divisão em parcelas', () => {
  it('a soma fecha exatamente o total, mesmo quando não divide certo', () => {
    // 100/3 = 33,333... O centavo tem que ir pra algum lugar, e não pode sumir.
    for (const [total, n] of [
      [100, 3],
      [600, 7],
      [1000, 6],
      [55.55, 4],
      [999.99, 11]
    ] as [number, number][]) {
      const parcelas = montarParcelas(total, n, '2026-01-15')
      const soma = +parcelas.reduce((s, p) => s + p.valor, 0).toFixed(2)
      expect(soma).toBe(total)
      expect(parcelas).toHaveLength(n)
    }
  })

  it('a sobra vai na PRIMEIRA parcela, não na última', () => {
    // Quem confere o carnê é o cliente, na frente do vendedor, no dia do
    // acordo. Um centavo a mais explicado ali custa dois segundos; descoberto
    // sozinho na última parcela, meses depois, vira discussão.
    const p = montarParcelas(100, 3, '2026-01-10')
    expect(p[0].valor).toBe(33.34)
    expect(p[1].valor).toBe(33.33)
    expect(p[2].valor).toBe(33.33)
  })

  it('as datas andam mês a mês, na ordem', () => {
    const p = montarParcelas(300, 4, '2026-01-20')
    expect(p.map((x) => x.vencimento)).toEqual([
      '2026-01-20',
      '2026-02-20',
      '2026-03-20',
      '2026-04-20'
    ])
  })

  it('dia 31 cai no último dia do mês curto, sem pular pro mês seguinte', () => {
    // Vazar pro mês seguinte embaralharia a ordem: a 2ª venceria depois da 3ª.
    const p = montarParcelas(400, 4, '2026-01-31')
    expect(p.map((x) => x.vencimento)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30'
    ])
  })

  it('recusa carnê de menos de 2 parcelas', () => {
    expect(() => montarParcelas(100, 1, '2026-01-10')).toThrow(/2 parcelas/i)
    expect(() => montarParcelas(100, 0, '2026-01-10')).toThrow(/2 parcelas/i)
  })

  it('recusa data inválida em vez de inventar uma', () => {
    expect(() => montarParcelas(100, 3, '10/01/2026')).toThrow(/inválida/i)
    expect(() => montarParcelas(100, 3, '')).toThrow(/inválida/i)
  })
})

describe('o carnê impresso', () => {
  const parcelas = montarParcelas(600, 3, '2026-04-10').map((p) => ({ ...p, paga: 0 }))

  it('mostra todas as parcelas, com número, data e valor', () => {
    const html = carneEmprestimoHtml(EMPRESTIMO, parcelas, LOJA)
    for (const p of parcelas) {
      expect(html).toContain(`Parcela ${p.numero}/3`)
      expect(html).toContain(
        `${p.vencimento.slice(8, 10)}/${p.vencimento.slice(5, 7)}/${p.vencimento.slice(0, 4)}`
      )
    }
    expect(html).toContain('João da Silva')
  })

  it('cada parcela em aberto leva o QR do PIX', () => {
    const html = carneEmprestimoHtml(EMPRESTIMO, parcelas, LOJA)
    // 3 parcelas abertas = 3 QRs desenhados.
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('⚠️ parcela JÁ PAGA não leva QR — reimprimir não pode fazer pagar de novo', () => {
    const comUmaPaga = parcelas.map((p) => (p.numero === 1 ? { ...p, paga: 1 } : p))
    const html = carneEmprestimoHtml(EMPRESTIMO, comUmaPaga, LOJA)
    expect(html).toContain('PAGA')
    // Sobraram 2 abertas, logo 2 QRs.
    expect((html.match(/<svg/g) ?? []).length).toBe(2)
  })

  it('sem chave PIX cadastrada, o carnê sai igual — só sem QR', () => {
    const html = carneEmprestimoHtml(EMPRESTIMO, parcelas, { ...LOJA, pix_chave: '' })
    expect(html).toContain('Parcela 1/3')
    expect(html).not.toContain('<svg')
  })

  it('mostra quanto ainda falta, e em quantas parcelas', () => {
    const comUmaPaga = parcelas.map((p) => (p.numero === 1 ? { ...p, paga: 1 } : p))
    const html = carneEmprestimoHtml(EMPRESTIMO, comUmaPaga, LOJA)
    expect(html).toContain('2 parcela(s)')
  })
})

describe('a promissória', () => {
  const html = promissoriaEmprestimoHtml(EMPRESTIMO, LOJA)

  it('traz o valor em número E por extenso', () => {
    // Num título de crédito, divergir entre os dois é o defeito clássico. Os
    // dois saem da mesma fonte justamente por isso.
    expect(html).toContain('600,00')
    expect(html.toLowerCase()).toContain('seiscentos reais')
  })

  it('nomeia o credor e o emitente', () => {
    expect(html).toContain('FHVP TECH LTDA')
    expect(html).toContain('João da Silva')
    expect(html).toContain('111.222.333-44')
  })

  it('traz a fórmula que a torna uma promissória', () => {
    expect(html).toContain('NOTA PROMISSÓRIA')
    expect(html).toContain('pagarei por esta')
    expect(html).toContain('ou à sua ordem')
  })

  it('⚠️ NÃO leva QR de PIX — título de crédito não é boleto', () => {
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('PAGUE COM PIX')
  })

  it('usa a data de vencimento; sem ela, cai na data do empréstimo', () => {
    expect(html).toContain('10 de junho de 2026')
    const semVenc = promissoriaEmprestimoHtml({ ...EMPRESTIMO, vencimento: null }, LOJA)
    expect(semVenc).toContain('10 de março de 2026')
  })
})
