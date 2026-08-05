// O cupom sai numa bobina térmica de 80mm, e "80mm" não é a largura que a
// impressora desenha: sobram ~68mm de faixa útil. Um cupom que passe disso não
// dá erro nenhum — ele simplesmente sai picado, com os preços e os totais
// faltando, e ninguém descobre até o lojista mostrar o papel. Estes testes
// existem pra que a régua da bobina viva no repositório, e não só no papel.

import { describe, it, expect } from 'vitest'
import { gerarHtmlCupomVenda, type DadosCupomVenda } from '../cupomVenda'
import { gerarHtmlComprovanteDevolucao } from '../comprovanteDevolucao'
import { LOJA_PADRAO, type DadosLoja } from '../dadosLoja'

const LOJA: DadosLoja = {
  ...LOJA_PADRAO,
  nome: 'Loja Teste',
  razao_social: 'Loja Teste Comércio Ltda',
  cnpj: '00.000.000/0001-00',
  endereco: 'Rua Um, 100',
  cidade: 'Cidade',
  uf: 'CE',
  cep: '60000-000',
  telefone: '(88) 90000-0000'
}

// Venda com desconto E entrada de propósito: são elas que fazem aparecer as
// linhas secundárias do bloco de total ("Subtotal", "Desconto", "Entrada"), que
// vivem dentro de condicionais. Uma venda simples não renderiza nenhuma delas —
// e um teste que só olha a venda simples não enxerga defeito nessas linhas.
function venda(sobrepor: Partial<DadosCupomVenda> = {}): DadosCupomVenda {
  return {
    id: 59,
    data: '2026-08-01T16:06:00',
    total: 1234.5,
    desconto: 50,
    entrada: 200,
    valor_pago: 200,
    status_pagamento: 'pendente',
    data_vencimento: '2026-08-03',
    num_parcelas: null,
    cliente_nome: 'Cliente Teste',
    itens: [{ produto_nome: 'Produto Teste', quantidade: 2, preco_unitario: 617.25 }],
    parcelas: [],
    ...sobrepor
  }
}

// ---------------------------------------------------------------------------
// Régua da bobina
// ---------------------------------------------------------------------------

// Courier New avança 0,6 do corpo por caractere — é a propriedade que faz a
// fonte ser monoespaçada, então a conta abaixo é exata pra ela e só pra ela.
const PX_POR_MM = 96 / 25.4
const LARGURA_UTIL_MM = 68
// Lido do driver POS80 desta impressora (PageImageableSize): a cabeça alcança
// 72,07mm a partir da origem, e origem é 0. O que passar disso não é impresso.
const ALCANCE_CABECA_MM = 72.07
const CORPO_TABELA_PX = 10.5
const PADDING_CELULA_PX = 4 // 2px de cada lado, do `table th, table td`

const charsQueCabem = (mm: number): number => (mm * PX_POR_MM) / (CORPO_TABELA_PX * 0.6)

/** Menor largura em que uma coluna numérica cabe: ela tem `white-space: nowrap`,
 *  então não quebra — ou cabe inteira, ou empurra a tabela pra fora do papel. */
const largura = (texto: string): number => texto.length

describe('largura do cupom na bobina de 80mm', () => {
  // O nome do produto é a única coluna que quebra linha; as numéricas são
  // nowrap. Se as numéricas comerem a faixa toda, o nome fica com 2 ou 3 letras
  // por linha — ilegível — ou a tabela transborda e a impressora corta.
  const MIN_CHARS_NOME = 14

  /** A sarjeta declarada no CSS, em px — lida do próprio documento pra que este
   *  teste acompanhe o código em vez de repetir um número à mão. */
  const sarjetaPx = (html: string): number => {
    const m = /\.col-num\s*{[^}]*padding-left:\s*(\d+)px/.exec(html)
    expect(m).not.toBeNull()
    return Number(m![1])
  }

  it('separa as colunas de número por pelo menos um caractere', () => {
    // Elas são alinhadas à direita e não quebram: sem sarjeta, o último dígito
    // de uma encosta no primeiro da outra e o olho lê "2189,90" como um número
    // só. A sarjeta é o padding da esquerda somado ao da direita da vizinha.
    const px = sarjetaPx(gerarHtmlCupomVenda(venda(), LOJA)) + PADDING_CELULA_PX / 2
    expect(px / (CORPO_TABELA_PX * 0.6)).toBeGreaterThanOrEqual(1)
  })

  it('deixa espaço legível para o nome do item mesmo com os maiores valores', () => {
    // Valores propositalmente absurdos pra uma loja de varejo: se couberem
    // estes, cabe o dia a dia. É este teste que impede a sarjeta de crescer
    // sem limite — cada pixel de respiro entre os números sai do nome.
    const html = gerarHtmlCupomVenda(venda(), LOJA)
    const colunasNumericas = ['Qtd.', '9.999,99', '99.999,99']
      .map(largura)
      .reduce((a, b) => a + b, 0)

    // Célula do nome (2px de cada lado) + as três numéricas (sarjeta + 2px).
    const paddingPx = PADDING_CELULA_PX + 3 * (sarjetaPx(html) + PADDING_CELULA_PX / 2)
    const padding = paddingPx / (CORPO_TABELA_PX * 0.6)

    const sobraParaONome = charsQueCabem(LARGURA_UTIL_MM) - colunasNumericas - padding

    expect(sobraParaONome).toBeGreaterThan(MIN_CHARS_NOME)
  })

  it('não gasta uma coluna inteira com o desconto por item, que nunca é preenchido', () => {
    const html = gerarHtmlCupomVenda(venda(), LOJA)
    const cabecalho = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'))

    expect(cabecalho).not.toContain('Desc.')
    // `<th ` com espaço — senão o próprio `<thead>` entra na conta.
    expect((cabecalho.match(/<th /g) ?? []).length).toBe(4)
  })

  it('escreve a quantidade sem as três casas decimais quando ela é inteira', () => {
    const html = gerarHtmlCupomVenda(
      venda({ itens: [{ produto_nome: 'Cabo', quantidade: 2, preco_unitario: 10 }] }),
      LOJA
    )
    expect(html).toContain('<td class="col-num">2</td>')
    expect(html).not.toContain('2,000')
  })

  it('mantém as casas decimais quando a quantidade é fracionada', () => {
    const html = gerarHtmlCupomVenda(
      venda({ itens: [{ produto_nome: 'Cabo', quantidade: 0.75, preco_unitario: 10 }] }),
      LOJA
    )
    expect(html).toContain('<td class="col-num">0,750</td>')
  })
})

// ---------------------------------------------------------------------------
// O bug de verdade: a largura solta na hora de imprimir
// ---------------------------------------------------------------------------

describe('CSS de impressão', () => {
  const blocoPrint = (html: string): string => {
    const i = html.indexOf('@media print')
    expect(i).toBeGreaterThan(-1)
    // Do `@media print` até o fechamento do <style> — pega o bloco inteiro.
    return html.slice(i, html.indexOf('</style>', i))
  }

  for (const [nome, gerar] of [
    ['cupom de venda', () => gerarHtmlCupomVenda(venda(), LOJA)],
    [
      'comprovante de devolução',
      () =>
        gerarHtmlComprovanteDevolucao(
          {
            id: 3,
            venda_id: 59,
            data: '2026-08-01T16:06:00',
            tipo: 'credito',
            valor_total: 100,
            cliente_nome: 'Cliente Teste',
            motivo: null,
            saldo_credito_novo: 100,
            itens: [{ produto_nome: 'Produto Teste', quantidade: 1, valor_unitario: 100 }]
          },
          LOJA
        )
    ]
  ] as const) {
    describe(nome, () => {
      it('não solta a largura na impressão', () => {
        // Era exatamente isto — `html, body { width: auto }` dentro do
        // @media print — que espalhava o cupom por ~200mm numa impressora cujo
        // driver reporta folha Carta/A4, deixando na bobina só a coluna da
        // esquerda: sem número do pedido, sem preços, sem total, sem rodapé.
        expect(blocoPrint(gerar())).not.toMatch(/width:\s*auto/)
      })

      it('encosta o cupom à esquerda na impressão', () => {
        // `margin: 0 auto` centraliza no meio da FOLHA. Numa folha larga demais
        // isso joga a bobina inteira pra fora do papel — pior que o bug original.
        // `margin: 0;` e não `margin: 0 auto;` — daí o `;` obrigatório logo
        // depois do zero, que é justamente o que o `auto` empurraria pra longe.
        expect(blocoPrint(gerar())).toMatch(/margin:\s*0\s*;/)
      })

      it('declara uma largura que cabe na faixa impressa da bobina', () => {
        const mm = /body\s*{[^}]*width:\s*(\d+)mm/.exec(gerar())
        expect(mm).not.toBeNull()
        expect(Number(mm![1])).toBeLessThanOrEqual(LARGURA_UTIL_MM)
      })

      it('soma margem + corpo dentro dos 72,07mm que a cabeça térmica alcança', () => {
        // Número lido do próprio driver da impressora (POS80): a área impressa
        // começa na origem 0 e vai até 72,07mm. Margem e corpo somados têm que
        // caber aí — a conta inteira, não cada pedaço isolado.
        const html = gerar()
        const margem = /@page\s*{\s*margin:\s*(\d+)mm/.exec(html)
        const corpo = /body\s*{[^}]*width:\s*(\d+)mm/.exec(html)
        expect(margem).not.toBeNull()
        expect(corpo).not.toBeNull()

        // Com folga de verdade: encostar em 72,00mm contra um alcance de
        // 72,07mm é "cabe" no papel da conta e "não cabe" no papel de verdade,
        // porque arredondamento de pixel a 203dpi come mais que 0,07mm.
        const FOLGA_MINIMA_MM = 1
        expect(Number(margem![1]) + Number(corpo![1])).toBeLessThanOrEqual(
          ALCANCE_CABECA_MM - FOLGA_MINIMA_MM
        )
      })

      it('deixa qualquer texto quebrar, venha de que campo vier', () => {
        // Só o nome do produto e o bloco do cliente sabiam quebrar. Nome de
        // loja, razão social, endereço e as linhas de total não sabiam, e uma
        // palavra longa sem espaço nenhum passava reto pela borda do papel.
        // Medido: sem esta regra o cupom extremo vai a 291mm de largura numa
        // bobina de 68mm (scripts/medir-cupom).
        expect(gerar()).toMatch(/body\s*{[^}]*overflow-wrap:\s*anywhere/)
      })

      it('usa divisória tracejada, nunca a barra dupla', () => {
        // A 203dpi o vão do meio de uma borda `double` some no arredondamento e
        // ela sai como tarja preta grossa — foi o que apareceu no papel.
        expect(gerar()).toMatch(/\.divisoria\s*{[^}]*border-top:\s*1px dashed/)
        // Só a declaração — a palavra "double" ainda aparece no comentário que
        // explica por que ela saiu daqui.
        expect(gerar()).not.toMatch(/border-top:[^;]*double/)
      })

      it('mantém contínua só a linha onde o cliente assina', () => {
        // Tracejar esta seria estranho: é uma linha pra escrever em cima, não
        // uma divisória de seção.
        const solidas = gerar().match(/border-top:\s*\d+px solid/g) ?? []
        expect(solidas).toHaveLength(1)
        expect(gerar()).toMatch(/\.assinatura \.linha\s*{[^}]*border-top:\s*1px solid/)
      })

      it('imprime em negrito, que é o que a cabeça térmica consegue queimar inteiro', () => {
        // A 203dpi não existe cinza: cada ponto queima ou não queima. O traço
        // fino do Courier cai no meio-termo e sai picotado — foi a "letra
        // falhada". Isto vale pro corpo do documento…
        expect(gerar()).toMatch(/html,\s*body\s*{[^}]*font-weight:\s*bold/)
      })

      it('não deixa nenhum trecho solto em peso normal', () => {
        // …e também pras linhas secundárias do total, que tinham um
        // `font-weight: normal` no style inline. Se sobrar alguma, ela vira a
        // única linha falhada do cupom — pior que estar tudo fino por igual.
        expect(gerar()).not.toContain('font-weight: normal')
      })
    })
  }
})

// ---------------------------------------------------------------------------
// Conteúdo — o cupom continua dizendo o que precisa dizer
// ---------------------------------------------------------------------------

describe('conteúdo do cupom', () => {
  it('imprime o total do pedido com o valor ao lado', () => {
    const html = gerarHtmlCupomVenda(venda({ total: 1234.5 }), LOJA)
    expect(html).toContain('Total do pedido:')
    expect(html).toContain('1.234,50')
  })

  it('mostra o subtotal do item, e não só o preço unitário', () => {
    const html = gerarHtmlCupomVenda(
      venda({ itens: [{ produto_nome: 'Cabo', quantidade: 3, preco_unitario: 10 }] }),
      LOJA
    )
    expect(html).toContain('<td class="col-num">30,00</td>')
  })

  it('escapa o nome do produto (o cupom é HTML montado à mão)', () => {
    const html = gerarHtmlCupomVenda(
      venda({ itens: [{ produto_nome: '<script>x</script>', quantidade: 1, preco_unitario: 1 }] }),
      LOJA
    )
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
