/**
 * Recibos avulsos: a numeração e o que ela promete.
 *
 * ── O que está em jogo ───────────────────────────────────────────────────────
 * O número é a identidade do recibo. Duas coisas o tornam frágil e as duas são
 * invisíveis na tela:
 *
 *   1. **Número repetido.** Ler o maior número e inserir depois abre um vão —
 *      dois recibos podem sair com o mesmo número, e aí nenhum dos dois prova
 *      nada. A defesa é ler e gravar DENTRO da mesma transação, mais o UNIQUE
 *      da coluna como segunda tranca (mesmo raciocínio do estoque em
 *      vendaConcorrente.test.ts).
 *   2. **Número reaproveitado.** Cancelar um recibo e devolver o número para a
 *      fila faria existirem dois papéis diferentes com a mesma identificação —
 *      e o primeiro já pode estar na mão do cliente.
 *
 * Para ver falhar: mova o `SELECT MAX(numero)` de `criarRecibo` para fora da
 * transação, ou faça o próximo número contar só os recibos não cancelados.
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

const { criarRecibo, listarRecibos, obterRecibo, proximoNumeroRecibo, cancelarRecibo, mesesComRecibos } =
  await import('../recibos')

// Schema no formato final da migration at_002. `clientes` entra só por causa da
// chave estrangeira de `pagador_cliente_id`.
const SCHEMA = `
  CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL);
  CREATE TABLE recibos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL UNIQUE,
    valor REAL NOT NULL CHECK(valor > 0),
    recebedor_nome TEXT NOT NULL,
    recebedor_documento TEXT,
    recebedor_rg TEXT,
    pagador_nome TEXT NOT NULL,
    pagador_documento TEXT,
    pagador_rg TEXT,
    pagador_cliente_id INTEGER,
    referente TEXT NOT NULL,
    cidade TEXT,
    uf TEXT,
    data_recibo TEXT NOT NULL,
    observacao TEXT,
    cancelado INTEGER NOT NULL DEFAULT 0,
    cancelado_em DATETIME,
    cancelado_motivo TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    criado_por TEXT,
    FOREIGN KEY (pagador_cliente_id) REFERENCES clientes(id)
  );
`

let db: InstanceType<NonNullable<typeof sqlite>['DatabaseSync']> | null = null

beforeEach(() => {
  if (!sqlite) return
  db = new sqlite.DatabaseSync(':memory:')
  db.exec(SCHEMA)
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
})

const dados = (extra: Record<string, unknown> = {}) => ({
  valor: 150,
  recebedor_nome: 'INFORMATICA AVP LTDA',
  recebedor_documento: '12.345.678/0001-99',
  pagador_nome: 'Maria Francisca',
  pagador_documento: '222.222.222-22',
  referente: 'adiantamento do conserto do notebook',
  cidade: 'Fortaleza',
  uf: 'CE',
  data_recibo: '2026-08-16',
  ...extra
})

const d = sqlite ? describe : describe.skip

d('numeração', () => {
  it('o primeiro recibo é o número 1', () => {
    expect(proximoNumeroRecibo()).toBe(1)
    expect(criarRecibo(dados()).numero).toBe(1)
  })

  it('cada recibo novo pega o próximo', () => {
    expect(criarRecibo(dados()).numero).toBe(1)
    expect(criarRecibo(dados()).numero).toBe(2)
    expect(criarRecibo(dados()).numero).toBe(3)
    expect(proximoNumeroRecibo()).toBe(4)
  })

  it('★ número de recibo cancelado NÃO volta para a fila', () => {
    // A asserção que protege quem já está com o papel na mão. Se o 2 fosse
    // reaproveitado, existiriam dois recibos nº 2 dizendo coisas diferentes.
    criarRecibo(dados())
    criarRecibo(dados())
    cancelarRecibo(2, 'valor digitado errado')

    expect(proximoNumeroRecibo(), 'o número do cancelado foi reaproveitado').toBe(3)
    expect(criarRecibo(dados()).numero).toBe(3)
  })

  it('a sequência sobrevive a uma emissão recusada', () => {
    criarRecibo(dados())
    expect(() => criarRecibo(dados({ valor: 0 }))).toThrow()
    // A transação voltou atrás: nada gravado, nada consumido.
    expect(proximoNumeroRecibo()).toBe(2)
    expect(listarRecibos()).toHaveLength(1)
  })
})

d('o que o recibo exige para existir', () => {
  it.each([
    ['valor zero', { valor: 0 }, /maior que zero/i],
    ['valor negativo', { valor: -10 }, /maior que zero/i],
    ['sem quem recebe', { recebedor_nome: '   ' }, /quem está recebendo/i],
    ['sem quem paga', { pagador_nome: '' }, /quem está pagando/i],
    ['sem motivo', { referente: '  ' }, /a que se refere/i],
    ['data sem sentido', { data_recibo: '16/08/2026' }, /data do recibo inválida/i]
  ])('recusa %s', (_nome, extra, mensagem) => {
    expect(() => criarRecibo(dados(extra))).toThrow(mensagem)
  })

  it('o motivo é obrigatório porque é o que o papel declara', () => {
    // Sem ele o recibo diz ter recebido dinheiro sem dizer por quê — e aí ele
    // não quita coisa nenhuma.
    expect(() => criarRecibo(dados({ referente: '' }))).toThrow()
  })
})

d('o que é guardado', () => {
  it('campos vazios viram null, não string vazia', () => {
    // O documento decide "mostra ou não mostra" por ausência. Uma string vazia
    // imprimiria "Portador(a) do RG nº" sem número nenhum.
    const r = criarRecibo(dados({ recebedor_rg: '   ', observacao: '' }))
    expect(r.recebedor_rg).toBeNull()
    expect(r.observacao).toBeNull()
  })

  it('espaços em volta somem', () => {
    const r = criarRecibo(dados({ pagador_nome: '  Maria  ' }))
    expect(r.pagador_nome).toBe('Maria')
  })

  it('a sigla do estado é guardada em maiúscula', () => {
    // O resto do sistema guarda UF assim; deixar 'ce' aqui faria a busca do
    // nome por extenso falhar na hora de imprimir.
    const r = criarRecibo(dados({ uf: ' ce ' }))
    expect(r.uf).toBe('CE')
  })

  it('sem estado, o campo fica nulo em vez de string vazia', () => {
    expect(criarRecibo(dados({ uf: '' })).uf).toBeNull()
  })

  it('o valor é guardado em centavos redondos', () => {
    const r = criarRecibo(dados({ valor: 10.005 }))
    expect(r.valor).toBe(10.01)
  })
})

d('cancelamento', () => {
  it('marca o recibo e guarda o motivo', () => {
    criarRecibo(dados())
    cancelarRecibo(1, 'cliente desistiu')
    const r = obterRecibo(1)!
    expect(r.cancelado).toBe(1)
    expect(r.cancelado_motivo).toBe('cliente desistiu')
    expect(r.cancelado_em).toBeTruthy()
  })

  it('continua na lista, para explicar o buraco na sequência', () => {
    criarRecibo(dados())
    cancelarRecibo(1, 'engano')
    expect(listarRecibos()).toHaveLength(1)
  })

  it('exige motivo', () => {
    criarRecibo(dados())
    expect(() => cancelarRecibo(1, '   ')).toThrow(/por que/i)
  })

  it('não cancela duas vezes nem o que não existe', () => {
    criarRecibo(dados())
    cancelarRecibo(1, 'engano')
    expect(() => cancelarRecibo(1, 'de novo')).toThrow(/já está cancelado/i)
    expect(() => cancelarRecibo(99, 'qualquer')).toThrow(/não encontrado/i)
  })
})

d('lista e meses', () => {
  it('mais recente primeiro', () => {
    criarRecibo(dados())
    criarRecibo(dados())
    expect(listarRecibos().map((r) => r.numero)).toEqual([2, 1])
  })

  it('filtra pelo mês declarado, não pelo de emissão', () => {
    // Um recibo lavrado hoje sobre um pagamento do mês passado pertence ao mês
    // do pagamento — é isso que o contador procura.
    criarRecibo(dados({ data_recibo: '2026-07-31' }))
    criarRecibo(dados({ data_recibo: '2026-08-01' }))
    expect(listarRecibos('2026-07').map((r) => r.numero)).toEqual([1])
    expect(listarRecibos('2026-08').map((r) => r.numero)).toEqual([2])
  })

  it('os meses vêm do mais recente para o mais antigo', () => {
    criarRecibo(dados({ data_recibo: '2026-06-10' }))
    criarRecibo(dados({ data_recibo: '2026-08-10' }))
    expect(mesesComRecibos()).toEqual(['2026-08', '2026-06'])
  })
})
