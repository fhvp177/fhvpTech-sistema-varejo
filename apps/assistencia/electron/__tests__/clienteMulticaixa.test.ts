/**
 * Cliente do terminal.
 *
 * O teste central deste arquivo é `não repete venda depois de falha de rede`.
 * Ele protege a regra que não se negocia: quando a rede cai, não há como saber
 * se o pedido não chegou ou se chegou, executou e a resposta é que se perdeu.
 * Repetir uma leitura é inofensivo; repetir uma venda registra a venda duas
 * vezes, e ninguém descobre no dia.
 */
import { describe, expect, it } from 'vitest'
import {
  ClienteMulticaixa,
  FalhaDeConexao
} from '@fhvptech/core/electron/multicaixa/cliente'
import { gerarChaveSigilo, selar } from '@fhvptech/core/electron/multicaixa/sigilo'
import { podeRepetir } from '../multicaixa/canais'

const URL = 'http://192.168.0.10:4877'
const TOKEN = 'f'.repeat(64)

interface Registro {
  caminho: string
  /** JSON quando o corpo é texto; os bytes crus quando vai cifrado pelo relay. */
  corpo: { canal?: string; args?: unknown[]; opId?: string } | null
  bytes: Uint8Array | null
  token: string | null
}

/** Dublê do fetch que registra o que foi enviado e responde o que se mandar. */
function fetchFalso(
  respostas: Array<Response | Error | (() => Response | Error)>
): { fn: typeof fetch; enviados: Registro[] } {
  const enviados: Registro[] = []
  let i = 0
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    const cabecalhos = (init?.headers ?? {}) as Record<string, string>
    const corpoBruto = init?.body
    const ehBinario = corpoBruto instanceof Uint8Array || Buffer.isBuffer(corpoBruto)
    enviados.push({
      caminho: String(url).replace(URL, '').replace('https://backend', ''),
      corpo: corpoBruto && !ehBinario ? JSON.parse(String(corpoBruto)) : null,
      bytes: ehBinario ? new Uint8Array(corpoBruto as Uint8Array) : null,
      token: (cabecalhos.Authorization ?? '').replace('Bearer ', '') || null
    })
    const bruto = respostas[Math.min(i++, respostas.length - 1)]
    const resposta = typeof bruto === 'function' ? bruto() : bruto
    if (resposta instanceof Error) throw resposta
    // Clona sempre: o corpo de um Response só pode ser lido uma vez, e a última
    // resposta da lista é reaproveitada quando há mais chamadas que respostas.
    return resposta.clone()
  }) as unknown as typeof fetch
  return { fn, enviados }
}

const json = (corpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

/** Como o `fetch` sinaliza rede fora do ar. */
const quedaDeRede = (): Error => Object.assign(new TypeError('fetch failed'), { name: 'TypeError' })

function cliente(
  respostas: Array<Response | Error | (() => Response | Error)>,
  extras: Partial<ConstructorParameters<typeof ClienteMulticaixa>[0]> = {}
): { c: ClienteMulticaixa; enviados: Registro[]; conexoes: boolean[] } {
  const { fn, enviados } = fetchFalso(respostas)
  const conexoes: boolean[] = []
  const c = new ClienteMulticaixa({
    url: URL,
    token: TOKEN,
    podeRepetir,
    buscar: fn,
    aoMudarConexao: (v) => void conexoes.push(v),
    ...extras
  })
  return { c, enviados, conexoes }
}

describe('encaminhamento', () => {
  it('manda canal, argumentos e token', async () => {
    const { c, enviados } = cliente([json({ ok: true, valor: { success: true, data: [] } })])

    await c.chamar('produtos:listar', [])

    expect(enviados[0].caminho).toBe('/rpc')
    expect(enviados[0].token).toBe(TOKEN)
    expect(enviados[0].corpo?.canal).toBe('produtos:listar')
  })

  it('devolve o valor do handler cru', async () => {
    const valor = { success: true, data: [{ id: 1, nome: 'Item' }] }
    const { c } = cliente([json({ ok: true, valor })])

    expect(await c.chamar('produtos:listar')).toEqual(valor)
  })

  it('repassa a recusa de regra de negócio como valor, não como erro', async () => {
    // { success: false } é resposta normal. Virar exceção faria a tela do
    // terminal dizer "falha de comunicação" no lugar de "estoque insuficiente".
    const valor = { success: false, error: 'Estoque insuficiente.' }
    const { c } = cliente([json({ ok: true, valor })])

    expect(await c.chamar('vendas:criar')).toEqual(valor)
  })

  it('torna a lançar o que o handler lançou', async () => {
    const { c } = cliente([json({ ok: false, erro: 'Esta ação requer permissão do gerente.' })])

    await expect(c.chamar('vendedores:deletar')).rejects.toThrow(/permissão do gerente/)
  })

  it('acompanha cada chamada com um identificador único', async () => {
    const { c, enviados } = cliente([json({ ok: true, valor: null })])

    await c.chamar('produtos:listar')
    await c.chamar('produtos:listar')

    expect(enviados[0].corpo?.opId).toBeTruthy()
    expect(enviados[0].corpo?.opId).not.toBe(enviados[1].corpo?.opId)
  })
})

describe('queda de rede', () => {
  it('não repete venda depois de falha de rede', async () => {
    // O teste mais importante do arquivo. Pode ser que a venda TENHA sido
    // gravada e só a resposta se perdeu — repetir gravaria a segunda.
    const { c, enviados } = cliente([quedaDeRede()])

    await expect(c.chamar('vendas:criar', [{ itens: [] }])).rejects.toThrow(FalhaDeConexao)
    expect(enviados).toHaveLength(1)
  })

  it('não repete recebimento, estorno nem cancelamento', async () => {
    for (const canal of [
      'vendas:pagarParcela',
      'vendas:estornarRecebimento',
      'vendas:cancelar',
      'devolucoes:registrar',
      'contasPagar:registrarPagamento'
    ]) {
      const { c, enviados } = cliente([quedaDeRede()])
      await expect(c.chamar(canal)).rejects.toThrow(FalhaDeConexao)
      expect(enviados, `${canal} não pode ser reenviado`).toHaveLength(1)
    }
  })

  it('tenta a leitura mais uma vez', async () => {
    const { c, enviados } = cliente([quedaDeRede(), json({ ok: true, valor: { success: true } })])

    expect(await c.chamar('produtos:listar')).toEqual({ success: true })
    expect(enviados).toHaveLength(2)
  })

  it('desiste da leitura depois da segunda queda', async () => {
    const { c, enviados } = cliente([quedaDeRede(), quedaDeRede()])

    await expect(c.chamar('produtos:listar')).rejects.toThrow(FalhaDeConexao)
    // Duas e para: insistir só faria a tela ficar pendurada mais tempo.
    expect(enviados).toHaveLength(2)
  })

  it('desiste quando o caixa principal não responde a tempo', async () => {
    const { c } = cliente([() => Object.assign(new Error('abortado'), { name: 'AbortError' })], {
      timeoutMs: 20
    })

    await expect(c.chamar('vendas:criar')).rejects.toThrow(FalhaDeConexao)
  })

  it('avisa quando cai e quando volta', async () => {
    const { c, conexoes } = cliente([
      quedaDeRede(),
      quedaDeRede(),
      json({ ok: true, valor: null })
    ])

    await expect(c.chamar('vendas:criar')).rejects.toThrow()
    expect(c.conectado()).toBe(false)

    await c.chamar('produtos:listar')
    expect(c.conectado()).toBe(true)
    // O aviso alimenta a faixa na tela; sem ele o operador não sabe que voltou.
    expect(conexoes).toEqual([false, true])
  })
})

describe('recusa do caixa principal não é queda de rede', () => {
  it('acesso revogado não vira "sem conexão" nem repete', async () => {
    const { c, enviados, conexoes } = cliente([json({ ok: false, erro: 'x' }, 401)])

    await expect(c.chamar('produtos:listar')).rejects.toThrow(/perdeu o acesso/)
    // Respondeu 401: a rede está boa. Dizer "sem conexão" mandaria o operador
    // conferir o Wi-Fi quando o problema é outro.
    expect(c.conectado()).toBe(true)
    expect(conexoes).toEqual([])
    expect(enviados).toHaveLength(1)
  })

  it('canal barrado explica que a ação é do caixa principal', async () => {
    const { c, enviados } = cliente([json({ ok: false, erro: 'x' }, 403)])

    await expect(c.chamar('backup:restaurar')).rejects.toThrow(/só pode ser feita no caixa principal/)
    expect(enviados).toHaveLength(1)
  })

  it('erro interno do caixa principal não repete leitura', async () => {
    const { c, enviados } = cliente([json({ ok: false, erro: 'x' }, 500)])

    await expect(c.chamar('produtos:listar')).rejects.toThrow(/encontrou um erro/)
    expect(enviados).toHaveLength(1)
  })
})

describe('fora da loja, pelo servidor de encontro', () => {
  const CHAVE = gerarChaveSigilo()
  const RELAY = {
    url: 'https://backend',
    loja: 'LOJA001',
    terminal: 'terminal-1',
    chaveSigilo: CHAVE
  }

  /** Responde como o computador principal responderia, do outro lado do relay. */
  function respostaSelada(corpo: unknown, status = 200): Response {
    const bytes = selar(CHAVE, { status, corpo }, RELAY.terminal)
    return new Response(new Uint8Array(bytes), { status: 200 })
  }

  it('cai no relay quando a rede da loja não responde', async () => {
    const { c, enviados } = cliente(
      [quedaDeRede(), respostaSelada({ ok: true, valor: { success: true, data: [1] } })],
      { relay: RELAY }
    )

    expect(await c.chamar('produtos:listar')).toEqual({ success: true, data: [1] })
    expect(enviados[0].caminho).toBe('/rpc') // tentou a rede local primeiro
    expect(enviados[1].caminho).toBe('/relay/chamar')
  })

  it('não tenta a rede local de novo depois de descobrir o caminho', async () => {
    const { c, enviados } = cliente(
      [quedaDeRede(), respostaSelada({ ok: true, valor: null })],
      { relay: RELAY }
    )

    await c.chamar('produtos:listar')
    await c.chamar('clientes:listar')
    await c.chamar('vendas:listar')

    // Insistir na rede local a cada chamada somaria o tempo de espera dela a
    // TODAS as chamadas de um caixa que está fora da loja.
    expect(enviados.filter((e) => e.caminho === '/rpc')).toHaveLength(1)
  })

  it('o que trafega pelo relay não tem nada legível', async () => {
    const { c, enviados } = cliente([quedaDeRede(), respostaSelada({ ok: true, valor: null })], {
      relay: RELAY
    })

    await c.chamar('vendas:criar', [{ total: 39.8 }])

    // O corpo enviado ao relay é o pacote cifrado. Se o canal ou o valor
    // aparecessem nesses bytes, a promessa de ponta a ponta estaria quebrada.
    const bruto = Buffer.from(enviados[1].bytes!).toString('utf8')
    expect(bruto).not.toContain('vendas:criar')
    expect(bruto).not.toContain('39.8')
  })

  it('avisa sem conexão quando o computador da loja não está disponível', async () => {
    // Canal de escrita de propósito: leitura tentaria de novo e embaralharia o
    // que se quer observar aqui, que é a tradução do 503 do servidor de
    // encontro em "sem conexão" para o operador.
    const { c } = cliente([quedaDeRede(), json({ erro: 'indisponível' }, 503)], { relay: RELAY })

    await expect(c.chamar('vendas:criar')).rejects.toThrow(FalhaDeConexao)
    expect(c.conectado()).toBe(false)
  })

  it('avisa quando o caixa perdeu o acesso no computador principal', async () => {
    // Resposta vazia = o principal não conseguiu abrir nosso pacote, o que na
    // prática significa que este caixa foi removido de lá.
    const { c } = cliente([quedaDeRede(), new Response(new Uint8Array(0), { status: 200 })], {
      relay: RELAY
    })

    await expect(c.chamar('produtos:listar')).rejects.toThrow(/perdeu o acesso/)
  })

  it('sem relay configurado, falha de rede é falha de conexão', async () => {
    const { c, enviados } = cliente([quedaDeRede()])

    await expect(c.chamar('vendas:criar')).rejects.toThrow(FalhaDeConexao)
    expect(enviados).toHaveLength(1)
  })
})

describe('handshake', () => {
  it('lê a versão do caixa principal', async () => {
    const { c, enviados } = cliente([json({ ok: true, versao: '1.31.1' })])

    expect(await c.handshake()).toEqual({ versao: '1.31.1' })
    expect(enviados[0].caminho).toBe('/handshake')
  })
})
