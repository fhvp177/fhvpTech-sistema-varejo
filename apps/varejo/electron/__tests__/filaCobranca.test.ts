/**
 * Fila de cobrança na maquininha (`@fhvptech/core/electron/pagamento/filaLogica`).
 *
 * ── O que está sendo protegido ───────────────────────────────────────────────
 * O cliente pagar duas vezes. É o pior defeito possível numa loja, porque
 * quando alguém percebe o cliente já foi embora, e não existe relatório que
 * conserte isso depois.
 *
 * O risco não vem de bug de conta: vem de o dinheiro sair da mão do cliente
 * ANTES do sistema saber. Quando a resposta da maquininha se perde, o sistema
 * fica sem saber se foi pago, e a tentação natural é tratar silêncio como
 * recusa. Estes testes existem pra que ele nunca faça isso.
 *
 * Como em toda regra de dinheiro, o que garante alguma coisa aqui não é o
 * caminho feliz. São os casos torcidos: a resposta que some, o cancelamento que
 * corre junto com o cartão encostando, a mensagem que chega atrasada.
 */
import { describe, expect, it } from 'vitest'
import {
  aplicarNoticia,
  cobrancasOrfas,
  decidirCobranca,
  type Cobranca
} from '@fhvptech/core/electron/pagamento/filaLogica'

function cobranca(sobrescrever: Partial<Cobranca> = {}): Cobranca {
  return {
    referencia: 'ref-1',
    provedor: 'pagbank',
    valor: 100,
    meio: 'credito',
    parcelas: null,
    situacao: 'aguardando',
    idExterno: 'ext-1',
    vendaId: null,
    ...sobrescrever
  }
}

describe('decidirCobranca: o que o caixa pode fazer agora', () => {
  it('deixa cobrar quando não há cobrança nenhuma', () => {
    expect(decidirCobranca(null).acao).toBe('cobrar')
  })

  // ★ O teste mais importante do arquivo. Resposta perdida não é recusa: a
  // cobrança pode estar aprovada na adquirente. Se isto virar 'cobrar', o
  // caixa passa o cartão de novo num cliente que já pagou.
  it('NÃO deixa cobrar quando a resposta anterior se perdeu, e manda consultar', () => {
    const decisao = decidirCobranca(cobranca({ situacao: 'desconhecido' }))

    expect(decisao.acao).toBe('consultar')
    expect(decisao.acao).not.toBe('cobrar')
    expect(decisao.motivo).toMatch(/não sabe se o cliente pagou/i)
  })

  it('bloqueia quando esta venda já foi paga', () => {
    const decisao = decidirCobranca(cobranca({ situacao: 'aprovada' }))

    expect(decisao.acao).toBe('bloquear')
    expect(decisao.motivo).toMatch(/duas vezes/i)
  })

  it('manda acompanhar, e não cobrar de novo, com uma cobrança em andamento', () => {
    expect(decidirCobranca(cobranca({ situacao: 'aguardando' })).acao).toBe('acompanhar')
  })

  // Cartão negado é o caso mais comum do balcão: o cliente tira outro da
  // carteira. Travar aqui quebraria a loja em nome de um risco que não existe.
  it('deixa tentar outra vez depois de recusa ou cancelamento', () => {
    expect(decidirCobranca(cobranca({ situacao: 'recusada' })).acao).toBe('cobrar')
    expect(decidirCobranca(cobranca({ situacao: 'cancelada' })).acao).toBe('cobrar')
  })
})

describe('aplicarNoticia: notícia de aprovação sempre vence', () => {
  // ★ A corrida real: o operador desiste no mesmo segundo em que o cliente
  // encosta o cartão. Se o cancelamento vencesse, a loja teria recebido um
  // dinheiro que o sistema jura não ter recebido.
  it('aprovação vence um cancelamento já registrado', () => {
    expect(aplicarNoticia('cancelada', 'aprovada')).toBe('aprovada')
  })

  it('aprovação vence uma recusa já registrada', () => {
    expect(aplicarNoticia('recusada', 'aprovada')).toBe('aprovada')
  })

  // ★ Uma vez pago, sempre pago. Devolver dinheiro é estorno, outro caminho,
  // e não desfaz o fato de a cobrança ter acontecido.
  it('aprovada nunca desaprova, venha a notícia que vier', () => {
    expect(aplicarNoticia('aprovada', 'recusada')).toBe('aprovada')
    expect(aplicarNoticia('aprovada', 'cancelada')).toBe('aprovada')
    expect(aplicarNoticia('aprovada', 'desconhecido')).toBe('aprovada')
    expect(aplicarNoticia('aprovada', 'aguardando')).toBe('aprovada')
  })

  // 'desconhecido' é ausência de informação, nunca uma informação. Deixar ele
  // apagar um desfecho conhecido trocaria uma certeza por uma dúvida e mandaria
  // o operador consultar uma cobrança já resolvida.
  it('uma falha de comunicação não apaga um desfecho que já se conhecia', () => {
    expect(aplicarNoticia('recusada', 'desconhecido')).toBe('recusada')
    expect(aplicarNoticia('cancelada', 'desconhecido')).toBe('cancelada')
  })

  it('mas uma cobrança ainda em andamento pode sim virar desconhecida', () => {
    expect(aplicarNoticia('aguardando', 'desconhecido')).toBe('desconhecido')
  })

  it('o desfecho normal passa direto', () => {
    expect(aplicarNoticia('aguardando', 'aprovada')).toBe('aprovada')
    expect(aplicarNoticia('aguardando', 'recusada')).toBe('recusada')
    expect(aplicarNoticia('desconhecido', 'recusada')).toBe('recusada')
    expect(aplicarNoticia('desconhecido', 'aguardando')).toBe('aguardando')
  })
})

describe('cobrancasOrfas: dinheiro cobrado que não virou venda', () => {
  // A fresta entre a maquininha aprovar e a venda ser gravada. Falta de luz
  // bem ali deixa o cliente cobrado, o estoque intacto e ninguém sabendo.
  it('acha a cobrança aprovada que ficou sem venda', () => {
    const orfas = cobrancasOrfas([
      cobranca({ referencia: 'a', situacao: 'aprovada', vendaId: null }),
      cobranca({ referencia: 'b', situacao: 'aprovada', vendaId: 7 })
    ])

    expect(orfas.map((c) => c.referencia)).toEqual(['a'])
  })

  // ★ Cobrança em dúvida não é dinheiro recebido. Tratá-la como órfã faria o
  // sistema oferecer ao operador a criação de uma venda que talvez nunca tenha
  // sido paga.
  it('NÃO trata como órfã a cobrança que ficou em dúvida', () => {
    const orfas = cobrancasOrfas([cobranca({ situacao: 'desconhecido', vendaId: null })])

    expect(orfas).toEqual([])
  })

  it('ignora recusada e em andamento', () => {
    const orfas = cobrancasOrfas([
      cobranca({ referencia: 'a', situacao: 'recusada', vendaId: null }),
      cobranca({ referencia: 'b', situacao: 'aguardando', vendaId: null })
    ])

    expect(orfas).toEqual([])
  })
})
