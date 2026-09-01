/**
 * Três travas estruturais do módulo de Comissões.
 *
 * Elas leem o FONTE, e não o comportamento, porque o que está sob risco aqui não
 * é um cálculo errado — é alguém, meses adiante, registrar um canal novo e
 * esquecer a permissão. Um teste de comportamento só pegaria isso se já
 * existisse um caso cobrindo o canal novo, que por definição ainda não existe.
 * É a mesma escolha do canais.test.ts e do emprestimosIsolamento.test.ts da
 * assistência.
 *
 * ── Trava 1: comissão é do gerente ──────────────────────────────────────────
 * Comissão é folha de pagamento. O vazamento perigoso não é pra fora da loja: é
 * pra dentro. Vendedor que descobre quanto o colega ganhou vira um problema de
 * gente que o software não desfaz. A proteção mora no BACKEND — esconder a rota
 * na interface não protege nada, porque a ponte IPC é por string e responde a
 * quem chamar.
 *
 * ── Trava 2: folha de pagamento não anda na rede ────────────────────────────
 * O notebook do multi-caixa pode estar fora da loja. Mesmo com `requerDono()`
 * em tudo, manter estes canais locais é a segunda camada — e o dia em que
 * alguém quiser consultar comissão do notebook, que seja uma decisão tomada de
 * propósito, e não o efeito colateral de um canal criado no automático.
 *
 * ── Trava 3: quem pagou é quem estava logado ────────────────────────────────
 * `pago_por_id` tem que sair da sessão. Se viesse no payload, qualquer chamada
 * poderia assinar o pagamento com o nome de outra pessoa — e assinatura que o
 * próprio chamador escolhe não é assinatura, é decoração.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { CANAIS_LOCAIS, CANAIS_REDE } from '../multicaixa/canais'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ELECTRON = join(AQUI, '..')

const fonte = readFileSync(join(ELECTRON, 'ipc/comissoes.ts'), 'utf8')

/**
 * Fatia o arquivo em (nome do canal → corpo do handler). O corpo vai do
 * `registrarCanal` até o próximo — grosseiro de propósito: qualquer coisa mais
 * esperta precisaria de um parser, e um parser que erra silenciosamente é pior
 * que um recorte bruto que erra pra mais.
 */
function handlersDeComissao(): Array<{ canal: string; corpo: string }> {
  const partes = fonte.split(/registrarCanal\(\s*/).slice(1)
  return partes
    .map((parte) => {
      const nome = /^'([^']+)'/.exec(parte)?.[1] ?? ''
      return { canal: nome, corpo: parte }
    })
    .filter((h) => h.canal.startsWith('comissoes:'))
}

const handlers = handlersDeComissao()

describe('inventário', () => {
  it('encontra os canais no fonte — se este teste some, os outros viram enfeite', () => {
    // Sem esta asserção, renomear `registrarCanal` faria a lista vir vazia e
    // TODOS os `it.each` abaixo passariam por vacuidade, sem verificar nada.
    expect(handlers.length).toBeGreaterThanOrEqual(8)
  })
})

describe('todo canal de comissão exige gerente', () => {
  it.each(handlers.map((h) => h.canal))('%s chama requerDono()', (canal) => {
    const h = handlers.find((x) => x.canal === canal)!
    expect(h.corpo).toMatch(/requerDono\(\)/)
  })

  it('não há exceção "só leitura" na lista', () => {
    // A tentação futura é liberar `configurado` ou `resumo` "porque é só
    // leitura". Leitura é justamente o que vaza salário. A regra vale para
    // todos, e é isso que a torna verificável sem julgamento caso a caso.
    for (const h of handlers) expect(h.corpo).toMatch(/requerDono\(\)/)
  })
})

describe('folha de pagamento não trafega para o segundo caixa', () => {
  it.each(handlers.map((h) => h.canal))('%s está em CANAIS_LOCAIS', (canal) => {
    expect(CANAIS_LOCAIS as readonly string[]).toContain(canal)
  })

  it.each(handlers.map((h) => h.canal))('%s NÃO está em CANAIS_REDE', (canal) => {
    expect(CANAIS_REDE as readonly string[]).not.toContain(canal)
  })
})

describe('a assinatura do pagamento vem da sessão', () => {
  it('pago_por_id sai de obterSessaoId(), não do payload', () => {
    expect(fonte).toMatch(/pago_por_id:\s*obterSessaoId\(\)/)
  })

  it('o handler de pagamento não aceita pago_por_id vindo de fora', () => {
    const pagamento = handlers.find((h) => h.canal === 'comissoes:registrarPagamento')!
    // O tipo do payload declarado no handler não pode citar pago_por_id.
    const assinatura = pagamento.corpo.slice(0, pagamento.corpo.indexOf('=>'))
    expect(assinatura).not.toMatch(/pago_por_id/)
  })
})

describe('o valor pago é apurado no backend', () => {
  it('o canal não aceita valor de comissão vindo da tela', () => {
    // Registro contábil que aceita número de fora é registro fabricável. O
    // valor tem que ser recalculado por registrarPagamentoComissao.
    const pagamento = handlers.find((h) => h.canal === 'comissoes:registrarPagamento')!
    expect(pagamento.corpo).not.toMatch(/valor_comissao:\s*dados\./)
    expect(pagamento.corpo).not.toMatch(/valor_base:\s*dados\./)
  })
})
