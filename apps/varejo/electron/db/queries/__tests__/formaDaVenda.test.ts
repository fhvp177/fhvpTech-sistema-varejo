/**
 * Como a venda decide COMO foi paga.
 *
 * ── O que está em jogo ───────────────────────────────────────────────────────
 * Este campo alimenta duas coisas de peso: o relatório de faturamento por meio
 * de pagamento e a tag tPag da NFC-e. Errar aqui não dá erro nenhum na hora —
 * gera número mentiroso e nota autorizada com informação errada, que é o pior
 * tipo de defeito.
 *
 * Os casos que mais importam são os DERIVADOS. Perguntar ao operador o que o
 * sistema já sabe é convite pra contradição: se a venda é a prazo, ela é
 * crediário, ponto; se o crédito da loja cobriu tudo, não entrou dinheiro nem
 * cartão. Nesses dois a resposta do operador tem que ser ignorada, e é isso que
 * a maior parte destes testes prova.
 */
import { describe, expect, it } from 'vitest'
import { formaDaVenda, formaDoDinheiroQueEntrou } from '../vendas'
import type { DadosNovaVenda } from '../vendas'

const venda = (extra: Partial<DadosNovaVenda> = {}): DadosNovaVenda => ({
  cliente_id: null,
  vendedor_id: 1,
  status_pagamento: 'pago',
  data_vencimento: null,
  itens: [{ produto_id: 1, quantidade: 1, preco_unitario: 100 }],
  ...extra
})

describe('à vista — o operador escolhe', () => {
  it.each(['dinheiro', 'debito', 'credito', 'pix'])('aceita %s', (forma) => {
    expect(formaDaVenda(venda({ forma_pagamento: forma }), 100, 0)).toBe(forma)
  })

  it('normaliza caixa e espaço em volta', () => {
    expect(formaDaVenda(venda({ forma_pagamento: '  PIX  ' }), 100, 0)).toBe('pix')
  })

  it('recusa valor que não está na lista', () => {
    expect(() => formaDaVenda(venda({ forma_pagamento: 'bitcoin' }), 100, 0)).toThrow(
      /Forma de pagamento inválida/
    )
  })

  // Nem 'crediario' nem 'credito_loja' são escolha — são consequência. Aceitar
  // pelo campo abriria caminho pra uma venda à vista se declarar fiado.
  it.each(['crediario', 'credito_loja'])('recusa %s vindo como escolha', (forma) => {
    expect(() => formaDaVenda(venda({ forma_pagamento: forma }), 100, 0)).toThrow(
      /Forma de pagamento inválida/
    )
  })

  it('devolve null quando ninguém informou', () => {
    // Null é "não sabemos", que é a verdade. É este caso que mantém a entrega
    // de Ordem de Serviço funcionando: ela cria venda sem passar pelo caixa.
    expect(formaDaVenda(venda(), 100, 0)).toBeNull()
    expect(formaDaVenda(venda({ forma_pagamento: '' }), 100, 0)).toBeNull()
    expect(formaDaVenda(venda({ forma_pagamento: null }), 100, 0)).toBeNull()
  })
})

describe('a prazo é crediário por definição', () => {
  it.each(['pendente', 'parcelado', 'inadimplente'] as const)('%s vira crediario', (status) => {
    expect(formaDaVenda(venda({ status_pagamento: status }), 100, 0)).toBe('crediario')
  })

  it('ignora o que o operador tiver mandado', () => {
    // A tela nem pergunta a prazo, mas se um dia mandar, a definição do prazo
    // ganha. Mesma regra que a emissão da NFC-e já aplicava — os dois caminhos
    // não podem divergir, senão a nota e o relatório contam histórias
    // diferentes sobre a mesma venda.
    expect(
      formaDaVenda(venda({ status_pagamento: 'pendente', forma_pagamento: 'pix' }), 100, 0)
    ).toBe('crediario')
  })

  it('não explode com forma inválida a prazo', () => {
    expect(
      formaDaVenda(venda({ status_pagamento: 'pendente', forma_pagamento: 'bitcoin' }), 100, 0)
    ).toBe('crediario')
  })
})

describe('crédito da loja', () => {
  it('cobrindo o total vira credito_loja', () => {
    expect(formaDaVenda(venda(), 100, 100)).toBe('credito_loja')
  })

  it('cobrindo só parte deixa a escolha valer', () => {
    // Sobrou R$ 60 pra pagar de algum jeito — quem manda é o operador.
    expect(formaDaVenda(venda({ forma_pagamento: 'pix' }), 100, 40)).toBe('pix')
  })

  it('cobrindo tudo ignora o que o operador escolheu', () => {
    expect(formaDaVenda(venda({ forma_pagamento: 'dinheiro' }), 100, 100)).toBe('credito_loja')
  })

  // A guarda do `> 0`. Sem ela, `0 >= 0` é verdade e QUALQUER venda de total
  // zero sem crédito nenhum sairia carimbada como "crédito da loja".
  it('venda de total zero sem crédito não vira credito_loja', () => {
    expect(formaDaVenda(venda(), 0, 0)).toBeNull()
    expect(formaDaVenda(venda({ forma_pagamento: 'dinheiro' }), 0, 0)).toBe('dinheiro')
  })
})

/**
 * COM QUE MEIO o dinheiro entrou AGORA — a outra pergunta.
 *
 * ⚠️ Ela existe porque as duas respostas convivem e discordam de propósito
 * numa venda a prazo com sinal: a VENDA é crediário (é o que vai para
 * `vendas.forma_pagamento` e para o relatório), e o SINAL é o meio pelo qual as
 * notas ou o PIX chegaram hoje (é o que vai para o movimento do livro-caixa).
 *
 * Antes de 12/09/2026 havia uma resposta só, e o sinal herdava "crediario".
 * Como a trava que manda especie para a gaveta compara com a palavra
 * "dinheiro", o sinal pago em notas ia parar na conta padrao de recebimento.
 */
describe('o meio do dinheiro que entrou agora', () => {
  it('na venda a vista, e a mesma resposta da venda', () => {
    expect(formaDoDinheiroQueEntrou(venda({ forma_pagamento: 'pix' }), 'pix')).toBe('pix')
    expect(formaDoDinheiroQueEntrou(venda({}), 'credito_loja')).toBe('credito_loja')
  })

  it.each(['dinheiro', 'debito', 'credito', 'pix'])(
    'na venda a prazo, aceita o sinal em %s',
    (forma) => {
      expect(
        formaDoDinheiroQueEntrou(
          venda({ status_pagamento: 'pendente', entrada: 50, forma_entrada: forma }),
          'crediario'
        )
      ).toBe(forma)
    }
  )

  it('★ sem forma declarada, presume especie', () => {
    /*
     * ⚠️ Presuncao deliberada, e nao chute. Sinal nasce no balcao, e especie e
     * a suposicao que a loja consegue DESMENTIR: se o dinheiro nao estiver na
     * gaveta, a contagem do fechamento acusa no mesmo dia. Supor banco erra em
     * silencio, e nenhuma conferencia percebe.
     */
    expect(
      formaDoDinheiroQueEntrou(venda({ status_pagamento: 'pendente', entrada: 50 }), 'crediario')
    ).toBe('dinheiro')
  })

  it('★ NUNCA devolve crediario para o livro', () => {
    // "crediario" e a condicao da venda, nao um meio de pagamento. No livro ele
    // vira uma linha que o operador nao sabe contar no fechamento.
    for (const dados of [
      venda({ status_pagamento: 'pendente', entrada: 50 }),
      venda({ status_pagamento: 'parcelado', entrada: 50, num_parcelas: 2 }),
      venda({ status_pagamento: 'pendente', entrada: 50, forma_entrada: 'pix' })
    ]) {
      expect(formaDoDinheiroQueEntrou(dados, 'crediario')).not.toBe('crediario')
    }
  })

  it('espaco e caixa alta nao atrapalham', () => {
    expect(
      formaDoDinheiroQueEntrou(
        venda({ status_pagamento: 'pendente', entrada: 50, forma_entrada: '  PIX ' }),
        'crediario'
      )
    ).toBe('pix')
  })

  it('recusa o que nao e meio de pagamento', () => {
    for (const invalida of ['boleto', 'crediario', 'credito_loja', 'fiado']) {
      expect(() =>
        formaDoDinheiroQueEntrou(
          venda({ status_pagamento: 'pendente', entrada: 50, forma_entrada: invalida }),
          'crediario'
        )
      ).toThrow(/inv[áa]lida/i)
    }
  })
})
