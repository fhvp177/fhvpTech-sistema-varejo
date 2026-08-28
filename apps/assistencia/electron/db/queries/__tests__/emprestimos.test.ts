/**
 * Empréstimos: o dinheiro tem que fechar, sempre.
 *
 * ── O que estes testes realmente prendem ────────────────────────────────────
 * O módulo guarda dois espelhos do extrato — `valor_devido` e `valor_pago` — e
 * a tela lê o saldo desses espelhos. Espelho que se descola da coisa espelhada
 * é um defeito silencioso: nada quebra, nada dá erro, e o cliente aparece
 * devendo um número que não corresponde a lançamento nenhum.
 *
 * Isso não é hipótese. Aconteceu nas VENDAS: pagar parcela marcava a parcela
 * mas não somava no `valor_pago`, os dois divergiram em produção e foi preciso
 * uma migration de conserto (023_recalcular_valor_pago_parcelado) pra
 * reconstruir o histórico de todas as lojas.
 *
 * Aqui o desenho fecha esse vão — todo dinheiro passa por `inserirLancamento` +
 * `sincronizarTotais`, na mesma transação — e a `provaDosNove` abaixo é o
 * alarme de quem mexer nisso sem saber o que estava segurando.
 *
 * O schema vem da MIGRATION de verdade, não de um CREATE TABLE copiado: assim
 * um erro de DDL aparece aqui em vez de aparecer na máquina do cliente.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

let sqlite: typeof import('node:sqlite') | null = null
try {
  sqlite = await import('node:sqlite')
} catch {
  sqlite = null
}

type Adaptador = {
  exec: (sql: string) => void
  prepare: (sql: string) => {
    run: (...args: unknown[]) => unknown
    get: (...args: unknown[]) => unknown
    all: (...args: unknown[]) => unknown
  }
  transaction: (fn: (...a: never[]) => unknown) => (...args: never[]) => unknown
}

let banco: Adaptador | null = null

vi.mock('@fhvptech/core/electron/db/conexao', () => ({
  obterBancoDeDados: () => {
    if (!banco) throw new Error('banco de teste não inicializado')
    return banco
  }
}))

const {
  criarEmprestimo,
  registrarPagamentoEmprestimo,
  pagarParcelaEmprestimo,
  lancarAjuste,
  estornarLancamento,
  cancelarEmprestimo,
  buscarEmprestimoPorId,
  listarEmprestimos,
  resumoEmprestimos,
  montarParcelas,
  moduloEmprestimosAtivo,
  definirModuloEmprestimos
} = await import('../emprestimos')

const { aplicarAt005Emprestimos } = await import('../../../backup/migrations/os/at_005_emprestimos')

// Só o que o módulo encosta: a FK de clientes, a config (interruptor) e o
// controle de migrations que a própria migration carimba.
const SCHEMA_BASE = `
  CREATE TABLE _migrations (nome TEXT PRIMARY KEY);
  CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT
  );
  INSERT INTO clientes (id, nome, telefone) VALUES (1, 'João da Silva', '85999990000');
`

let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  db.exec(SCHEMA_BASE)

  let p = 0
  banco = {
    exec: (sql) => db!.exec(sql),
    prepare: (sql) => {
      const st = db!.prepare(sql)
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: (...a: unknown[]) => st.run(...(a as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: (...a: unknown[]) => st.get(...(a as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all: (...a: unknown[]) => st.all(...(a as any[]))
      }
    },
    transaction:
      (fn) =>
      (...args) => {
        const sp = `sp_${p}`
        db!.exec(p === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
        p++
        try {
          const r = fn(...args)
          p--
          db!.exec(p === 0 ? 'COMMIT' : `RELEASE ${sp}`)
          return r
        } catch (e) {
          p--
          db!.exec(p === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
          throw e
        }
      }
  }

  // A migration de verdade cria as três tabelas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aplicarAt005Emprestimos(banco as any)
})

const rodar = sqlite ? describe : describe.skip

// Datas LOCAIS, como o módulo calcula. Usar toISOString() aqui deixaria os
// testes de vencimento instáveis entre 21h e meia-noite no horário do Brasil.
const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const HOJE = iso(new Date())
const emDias = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}

const base = {
  cliente_id: 1,
  devedor_nome: 'João da Silva',
  devedor_documento: '111.222.333-44',
  valor_principal: 500,
  valor_acordado: 600,
  modo: 'unico' as const,
  data_emprestimo: HOJE,
  vencimento: emDias(30),
  observacao: null,
  criado_por: 'Gerente'
}

/**
 * A prova dos nove: os espelhos gravados têm que bater com a soma do extrato.
 * Rodada depois de CADA operação de dinheiro nos testes abaixo.
 */
function provaDosNove(id: number): void {
  const emp = buscarEmprestimoPorId(id)!
  const ativos = emp.lancamentos.filter((l) => l.estornado === 0)
  const soma = (tipo: string): number =>
    +ativos
      .filter((l) => l.tipo === tipo)
      .reduce((s, l) => s + l.valor, 0)
      .toFixed(2)

  const devidoEsperado = Math.max(
    0,
    +(emp.valor_acordado + soma('acrescimo') - soma('desconto')).toFixed(2)
  )
  expect(emp.valor_devido).toBe(devidoEsperado)
  expect(emp.valor_pago).toBe(soma('pagamento'))
  expect(emp.restante).toBe(Math.max(0, +(emp.valor_devido - emp.valor_pago).toFixed(2)))

  // Carnê: a soma das parcelas pagas nunca pode passar do que foi recebido.
  const somaParcelasPagas = +emp.parcelas
    .filter((p) => p.paga === 1)
    .reduce((s, p) => s + p.valor, 0)
    .toFixed(2)
  expect(somaParcelasPagas).toBeLessThanOrEqual(emp.valor_pago)
}

rodar('empréstimo — vencimento único', () => {
  it('nasce devendo o valor acordado, não o emprestado', () => {
    const emp = criarEmprestimo(base)
    expect(emp.valor_principal).toBe(500)
    expect(emp.valor_devido).toBe(600)
    expect(emp.restante).toBe(600)
    expect(emp.situacao).toBe('aberto')
    provaDosNove(emp.id)
  })

  it('pagamento parcial abate o saldo e o total quita', () => {
    const emp = criarEmprestimo(base)

    registrarPagamentoEmprestimo(emp.id, { valor: 200, data: HOJE })
    provaDosNove(emp.id)
    expect(buscarEmprestimoPorId(emp.id)!.restante).toBe(400)

    registrarPagamentoEmprestimo(emp.id, { valor: 400, data: HOJE })
    provaDosNove(emp.id)
    const quitado = buscarEmprestimoPorId(emp.id)!
    expect(quitado.restante).toBe(0)
    expect(quitado.situacao).toBe('quitado')
    expect(quitado.quitado_em).not.toBeNull()
  })

  it('receber mais do que devia credita só o que fecha a conta', () => {
    const emp = criarEmprestimo(base)
    // Devia 600, entregou 1000: o troco é dinheiro na mão, não crédito no
    // sistema. Guardar saldo negativo inventaria uma dívida do dono pro cliente.
    registrarPagamentoEmprestimo(emp.id, { valor: 1000, data: HOJE })
    provaDosNove(emp.id)
    const dep = buscarEmprestimoPorId(emp.id)!
    expect(dep.valor_pago).toBe(600)
    expect(dep.restante).toBe(0)
  })

  it('recusa pagamento em empréstimo já quitado', () => {
    const emp = criarEmprestimo(base)
    registrarPagamentoEmprestimo(emp.id, { valor: 600, data: HOJE })
    expect(() => registrarPagamentoEmprestimo(emp.id, { valor: 10, data: HOJE })).toThrow(
      /já está quitado/i
    )
  })

  it('fica vencido quando a data passa e volta ao normal ao quitar', () => {
    const emp = criarEmprestimo({ ...base, vencimento: emDias(-5) })
    expect(buscarEmprestimoPorId(emp.id)!.situacao).toBe('vencido')
    registrarPagamentoEmprestimo(emp.id, { valor: 600, data: HOJE })
    expect(buscarEmprestimoPorId(emp.id)!.situacao).toBe('quitado')
  })
})

rodar('acréscimo e desconto', () => {
  it('acréscimo aumenta o que ele deve, sem tocar no valor acordado', () => {
    const emp = criarEmprestimo(base)
    lancarAjuste(emp.id, 'acrescimo', { valor: 50, data: HOJE, observacao: 'juros de setembro' })
    provaDosNove(emp.id)

    const dep = buscarEmprestimoPorId(emp.id)!
    expect(dep.valor_acordado).toBe(600) // o acordo original não muda
    expect(dep.valor_devido).toBe(650)
    expect(dep.restante).toBe(650)
  })

  it('desconto diminui a dívida e nunca deixa o devido negativo', () => {
    const emp = criarEmprestimo(base)
    // Perdoar mais do que se deve não faz o cliente virar credor.
    lancarAjuste(emp.id, 'desconto', { valor: 900, data: HOJE, observacao: 'perdão' })
    provaDosNove(emp.id)
    expect(buscarEmprestimoPorId(emp.id)!.valor_devido).toBe(0)
  })

  it('quitação reabre quando um acréscimo entra depois', () => {
    const emp = criarEmprestimo(base)
    registrarPagamentoEmprestimo(emp.id, { valor: 600, data: HOJE })
    expect(buscarEmprestimoPorId(emp.id)!.situacao).toBe('quitado')

    lancarAjuste(emp.id, 'acrescimo', { valor: 30, data: HOJE, observacao: 'multa' })
    provaDosNove(emp.id)
    const dep = buscarEmprestimoPorId(emp.id)!
    expect(dep.restante).toBe(30)
    expect(dep.situacao).not.toBe('quitado')
    // O carimbo de quitação some junto — senão o empréstimo contaria como
    // quitado num mês e continuaria cobrando no outro.
    expect(dep.quitado_em).toBeNull()
  })
})

rodar('estorno', () => {
  it('devolve o saldo e deixa a linha visível, riscada', () => {
    const emp = criarEmprestimo(base)
    registrarPagamentoEmprestimo(emp.id, { valor: 200, data: HOJE })
    const lanc = buscarEmprestimoPorId(emp.id)!.lancamentos[0]

    estornarLancamento(lanc.id)
    provaDosNove(emp.id)

    const dep = buscarEmprestimoPorId(emp.id)!
    expect(dep.restante).toBe(600)
    // A linha CONTINUA no extrato: "esse pagamento foi lançado errado e
    // desfeito" é informação, não sujeira.
    expect(dep.lancamentos).toHaveLength(1)
    expect(dep.lancamentos[0].estornado).toBe(1)
  })

  it('recusa estornar duas vezes', () => {
    const emp = criarEmprestimo(base)
    registrarPagamentoEmprestimo(emp.id, { valor: 100, data: HOJE })
    const lanc = buscarEmprestimoPorId(emp.id)!.lancamentos[0]
    estornarLancamento(lanc.id)
    expect(() => estornarLancamento(lanc.id)).toThrow(/já foi estornado/i)
  })
})

rodar('carnê', () => {
  const carne = {
    ...base,
    modo: 'carne' as const,
    vencimento: null,
    valor_acordado: 600,
    num_parcelas: 3,
    primeiro_vencimento: emDias(30)
  }

  it('a soma das parcelas é exatamente o total, sem centavo sobrando', () => {
    // 100/3 é o caso clássico de sobra: 33,33 × 3 = 99,99.
    const parcelas = montarParcelas(100, 3, '2026-01-10')
    const soma = +parcelas.reduce((s, p) => s + p.valor, 0).toFixed(2)
    expect(soma).toBe(100)
    // A sobra vai na PRIMEIRA, não na última: o carnê não termina com uma
    // parcela quebrada que o cliente estranha na hora de quitar.
    expect(parcelas[0].valor).toBe(33.34)
    expect(parcelas[2].valor).toBe(33.33)
  })

  it('vencimento dia 31 cai no último dia do mês curto, sem pular de mês', () => {
    const parcelas = montarParcelas(300, 3, '2026-01-31')
    expect(parcelas.map((p) => p.vencimento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('recusa pagamento parcial — quem tem carnê paga parcela', () => {
    const emp = criarEmprestimo(carne)
    // Mesma regra das vendas: um pagamento solto de R$37 não corresponde a
    // nenhuma linha do papel que o cliente levou pra casa.
    expect(() => registrarPagamentoEmprestimo(emp.id, { valor: 37, data: HOJE })).toThrow(
      /carnê/i
    )
  })

  it('pagar parcela credita o valor e quita quando todas caem', () => {
    const emp = criarEmprestimo(carne)
    const parcelas = buscarEmprestimoPorId(emp.id)!.parcelas
    expect(parcelas).toHaveLength(3)

    for (const p of parcelas) {
      pagarParcelaEmprestimo(p.id, { valor: p.valor, data: HOJE })
      provaDosNove(emp.id)
    }
    const dep = buscarEmprestimoPorId(emp.id)!
    expect(dep.valor_pago).toBe(600)
    expect(dep.situacao).toBe('quitado')
  })

  it('estornar o pagamento reabre a parcela junto', () => {
    const emp = criarEmprestimo(carne)
    const parcela = buscarEmprestimoPorId(emp.id)!.parcelas[0]
    pagarParcelaEmprestimo(parcela.id, { valor: parcela.valor, data: HOJE })

    const lanc = buscarEmprestimoPorId(emp.id)!.lancamentos[0]
    estornarLancamento(lanc.id)
    provaDosNove(emp.id)

    // As duas coisas são o mesmo fato; separá-las deixaria uma parcela paga
    // sem dinheiro nenhum por trás.
    const dep = buscarEmprestimoPorId(emp.id)!
    expect(dep.parcelas[0].paga).toBe(0)
    expect(dep.valor_pago).toBe(0)
  })

  it('o atraso é o da parcela mais antiga em aberto, não o da última', () => {
    const emp = criarEmprestimo({ ...carne, primeiro_vencimento: emDias(-10) })
    const dep = buscarEmprestimoPorId(emp.id)!
    expect(dep.situacao).toBe('vencido')
    expect(dep.proximo_vencimento).toBe(emDias(-10))
  })

  it('acréscimo não é rediluído nas parcelas do carnê', () => {
    const emp = criarEmprestimo(carne)
    const antes = buscarEmprestimoPorId(emp.id)!.parcelas.map((p) => p.valor)

    lancarAjuste(emp.id, 'acrescimo', { valor: 30, data: HOJE, observacao: 'multa' })
    provaDosNove(emp.id)

    const dep = buscarEmprestimoPorId(emp.id)!
    // O cliente tem um papel assinado em casa. Mexer nos números dele faria as
    // duas vias deixarem de bater — a multa vive AO LADO do carnê.
    expect(dep.parcelas.map((p) => p.valor)).toEqual(antes)
    expect(dep.valor_devido).toBe(630)
  })
})

rodar('cancelamento', () => {
  it('some dos totais mas continua consultável, com o motivo', () => {
    const emp = criarEmprestimo(base)
    cancelarEmprestimo(emp.id, 'Acordo desfeito')

    const dep = buscarEmprestimoPorId(emp.id)!
    expect(dep.situacao).toBe('cancelado')
    expect(dep.cancelado_motivo).toBe('Acordo desfeito')
    // Não some da consulta — é dinheiro entre duas pessoas, o rastro é o produto.
    expect(listarEmprestimos('todos')).toHaveLength(1)
    // Mas sai do total a receber: o dono não está mais cobrando isso.
    expect(resumoEmprestimos().total_a_receber).toBe(0)
  })

  it('recusa lançar dinheiro em empréstimo cancelado', () => {
    const emp = criarEmprestimo(base)
    cancelarEmprestimo(emp.id, 'Erro de lançamento')
    expect(() => registrarPagamentoEmprestimo(emp.id, { valor: 10, data: HOJE })).toThrow(
      /cancelado/i
    )
  })

  it('exige motivo', () => {
    const emp = criarEmprestimo(base)
    expect(() => cancelarEmprestimo(emp.id, '   ')).toThrow(/motivo/i)
  })
})

rodar('resumo (os cartões do topo)', () => {
  it('separa o total a receber, o vencido e o que vence em breve', () => {
    criarEmprestimo({ ...base, valor_acordado: 600, vencimento: emDias(-3) }) // atrasado
    criarEmprestimo({ ...base, valor_acordado: 200, vencimento: emDias(3) }) // vence em breve
    criarEmprestimo({ ...base, valor_acordado: 300, vencimento: emDias(60) }) // longe

    const r = resumoEmprestimos()
    expect(r.total_a_receber).toBe(1100)
    expect(r.vencido).toBe(600)
    expect(r.vence_7d).toBe(200)
    expect(r.principal_em_aberto).toBe(1500) // 3 × 500 de capital emprestado
  })

  it('conta o recebido do mês pela data do lançamento', () => {
    const emp = criarEmprestimo(base)
    registrarPagamentoEmprestimo(emp.id, { valor: 150, data: HOJE })
    expect(resumoEmprestimos().recebido_mes).toBe(150)
  })
})

rodar('o interruptor do módulo', () => {
  it('nasce desligado — loja que não contratou não vê a aba', () => {
    expect(moduloEmprestimosAtivo()).toBe(false)
  })

  it('liga e desliga sem apagar nada', () => {
    definirModuloEmprestimos(true)
    expect(moduloEmprestimosAtivo()).toBe(true)
    const emp = criarEmprestimo(base)

    definirModuloEmprestimos(false)
    expect(moduloEmprestimosAtivo()).toBe(false)
    // Desligar esconde a aba; o histórico continua inteiro.
    expect(buscarEmprestimoPorId(emp.id)!.valor_devido).toBe(600)
  })
})

rodar('a data de hoje é a de quem usa, não a de Greenwich', () => {
  it('às 23h do dia do vencimento ainda está EM DIA, não em atraso', () => {
    // O bug que isto prende: `toISOString()` devolve a data em UTC. No Brasil
    // (UTC-3), das 21h em diante ele responde "amanhã" — e um empréstimo que
    // vence HOJE apareceria em atraso, com alerta vermelho no sino, num dia em
    // que ainda está em dia. É o que o resto do app faz; o módulo novo não.
    const agora = new Date()
    agora.setHours(23, 30, 0, 0)

    const dataLocal = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(agora.getDate()).padStart(2, '0')}`
    const dataUtc = agora.toISOString().slice(0, 10)

    // Em fuso onde as duas datas coincidem (UTC ou a leste), não há o que provar.
    if (dataLocal === dataUtc) return

    vi.useFakeTimers()
    vi.setSystemTime(agora)
    try {
      const emp = criarEmprestimo({ ...base, vencimento: dataLocal })
      expect(buscarEmprestimoPorId(emp.id)!.situacao).toBe('aberto')
    } finally {
      vi.useRealTimers()
    }
  })
})
