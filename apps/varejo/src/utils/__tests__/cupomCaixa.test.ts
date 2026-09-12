/**
 * Abertura e fechamento de caixa na bobina térmica.
 *
 * ── O que este arquivo prende ───────────────────────────────────────────────
 *
 *  1. ★ **A abertura continua sem valor esperado e sem contagem**, agora nos
 *     DOIS papéis. O fechamento desta loja é às cegas de propósito, e a versão
 *     de bobina é nova: seria o lugar mais fácil do mundo para o número vazar.
 *
 *  2. ★ **As medidas térmicas.** 68mm de corpo e 2mm de margem de página. O que
 *     passa disso não sai cortado no papel: some. Como não dá para medir papel
 *     num teste, o que se prende é o número no CSS.
 *
 *  3. **Nada de divisória dupla.** A 203dpi o vão do meio de uma `double` some
 *     no arredondamento e ela imprime como uma tarja preta grossa.
 */
import { describe, it, expect } from 'vitest'
import {
  gerarHtmlCupomAberturaCaixa,
  gerarHtmlCupomFechamentoCaixa,
  type ContagemCupom,
  type TurnoCupom
} from '../cupomCaixa'
import { LOJA_PADRAO, type DadosLoja } from '../dadosLoja'

const LOJA: DadosLoja = {
  ...LOJA_PADRAO,
  nome: 'Loja Teste',
  razao_social: 'Loja Teste Comércio Ltda',
  cnpj: '00.000.000/0001-00',
  cidade: 'Cidade',
  uf: 'CE',
  telefone: '(88) 90000-0000'
}

const TURNO: TurnoCupom = {
  id: 7,
  conta_nome: 'Caixa da loja',
  aberto_por_nome: 'Ana',
  aberto_em: '2026-09-11 08:03:00',
  fundo_troco: 150,
  fechado_por_nome: 'Ana',
  fechado_em: '2026-09-11 18:40:00',
  confirmado_por_nome: 'Gerente',
  confirmado_em: '2026-09-11 18:55:00',
  justificativa: null,
  fora_de_hora: 0
}

const CONTAGENS: ContagemCupom[] = [
  { forma: 'dinheiro', valor_contado: 480, valor_esperado: 500, diferenca: -20 },
  { forma: 'pix', valor_contado: 300, valor_esperado: 300, diferenca: 0 }
]

describe('a bobina: as medidas que não dá para medir no papel', () => {
  const papeis = {
    abertura: gerarHtmlCupomAberturaCaixa(TURNO, LOJA),
    fechamento: gerarHtmlCupomFechamentoCaixa(TURNO, CONTAGENS, LOJA)
  }

  for (const [nome, html] of Object.entries(papeis)) {
    it(`${nome}: corpo de 68mm e margem de página de 2mm`, () => {
      // A cabeça térmica alcança 72,07mm da borda esquerda. 68 + 2 + 2 = 72.
      expect(html).toContain('width: 68mm')
      expect(html).toContain('@page { margin: 2mm; }')
    })

    it(`${nome}: tudo em negrito, senão a 203dpi a letra sai falhada`, () => {
      expect(html).toContain('font-weight: bold')
    })

    it(`${nome}: divisória tracejada, nunca dupla`, () => {
      expect(html).toContain('1px dashed')
      expect(html).not.toContain('double')
    })

    it(`${nome}: traz a identidade da loja`, () => {
      expect(html).toContain('Loja Teste')
      expect(html).toContain('00.000.000/0001-00')
    })
  }
})

describe('abertura na bobina', () => {
  const html = gerarHtmlCupomAberturaCaixa(TURNO, LOJA)

  it('traz quem abriu, quando e o fundo de troco', () => {
    expect(html).toContain('ABERTURA DE CAIXA No 7')
    expect(html).toContain('Caixa da loja')
    expect(html).toContain('Ana')
    expect(html).toContain('150,00')
    expect(html).toContain('11/09/2026')
  })

  it('★ NÃO traz valor esperado nem contagem', () => {
    const minusculo = html.toLowerCase()
    expect(minusculo).not.toContain('esperado')
    expect(minusculo).not.toContain('esper.')
    expect(minusculo).not.toContain('contado')
    expect(minusculo).not.toContain('cont.')
    expect(minusculo).not.toContain('diferen')
  })

  it('tem linha de assinatura', () => {
    expect(html).toContain('Responsavel pela abertura')
  })

  it('operador sem nome não quebra o papel', () => {
    expect(gerarHtmlCupomAberturaCaixa({ ...TURNO, aberto_por_nome: null }, LOJA)).toContain(
      'ABERTURA DE CAIXA No 7'
    )
  })
})

describe('fechamento na bobina', () => {
  const html = gerarHtmlCupomFechamentoCaixa(TURNO, CONTAGENS, LOJA)

  it('★ AQUI o esperado aparece, e é o contrário da abertura', () => {
    // No fechamento o operador já entregou a contagem dele: o número deixou de
    // ser segredo e virou prestação de contas.
    expect(html).toContain('Esper.')
    expect(html).toContain('Cont.')
    expect(html).toContain('500,00')
    expect(html).toContain('480,00')
  })

  it('a falta na gaveta sai escrita, não só como sinal de menos', () => {
    expect(html).toContain('FALTA 20,00')
  })

  it('caixa que fecha certo diz CONFERE', () => {
    const certo = gerarHtmlCupomFechamentoCaixa(
      TURNO,
      [{ forma: 'dinheiro', valor_contado: 500, valor_esperado: 500, diferenca: 0 }],
      LOJA
    )
    expect(certo).toContain('CONFERE')
    expect(certo).not.toContain('FALTA')
    expect(certo).not.toContain('SOBRA')
  })

  it('sobra também sai escrita', () => {
    const sobrando = gerarHtmlCupomFechamentoCaixa(
      TURNO,
      [{ forma: 'dinheiro', valor_contado: 530, valor_esperado: 500, diferenca: 30 }],
      LOJA
    )
    expect(sobrando).toContain('SOBRA 30,00')
  })

  it('turno ainda não conferido diz isso, em vez de deixar em branco', () => {
    const semConferir = gerarHtmlCupomFechamentoCaixa(
      { ...TURNO, confirmado_por_nome: null, confirmado_em: null },
      CONTAGENS,
      LOJA
    )
    expect(semConferir).toContain('ainda nao')
  })

  it('fechamento fora do horário sai marcado', () => {
    expect(
      gerarHtmlCupomFechamentoCaixa({ ...TURNO, fora_de_hora: 1 }, CONTAGENS, LOJA)
    ).toContain('fora do horario')
  })

  it('a justificativa do gerente aparece quando existe', () => {
    const comObs = gerarHtmlCupomFechamentoCaixa(
      { ...TURNO, justificativa: 'troco dado a mais no fim do dia' },
      CONTAGENS,
      LOJA
    )
    expect(comObs).toContain('troco dado a mais no fim do dia')
  })

  it('texto do lojista é escapado, como no cupom de venda', () => {
    const comTag = gerarHtmlCupomFechamentoCaixa(
      { ...TURNO, justificativa: '<b>erro</b>' },
      CONTAGENS,
      LOJA
    )
    expect(comTag).not.toContain('<b>erro</b>')
    expect(comTag).toContain('&lt;b&gt;erro&lt;/b&gt;')
  })
})
