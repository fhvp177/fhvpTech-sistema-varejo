/**
 * Testes do roteador central de canais (`@fhvptech/core/electron/roteador`).
 *
 * O roteador é a peça que o multi-caixa inteiro apoia em cima: ele é o único
 * lugar por onde toda chamada passa, venha da janela local ou, mais tarde, do
 * segundo caixa pela rede. Duas propriedades dele são graves e por isso têm
 * teste dedicado:
 *
 * 1. **Handler síncrono continua síncrono.** É o que mantém venda concorrente
 *    segura — `criarVenda` confere o estoque e grava sem ceder a vez no meio.
 *    Se o roteador envolvesse tudo em promessa, abriria a brecha para duas
 *    máquinas venderem a mesma unidade.
 * 2. **A origem não vaza entre chamadas concorrentes.** É o que impede a venda
 *    do segundo caixa sair no nome do vendedor logado no PC.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  despachar,
  limparCanais,
  listarCanais,
  montarPonteIpc,
  ORIGEM_LOCAL,
  origemAtual,
  registrarCanal,
  temCanal,
  type PonteIpc
} from '@fhvptech/core/electron/roteador'

afterEach(() => {
  limparCanais()
})

/** Cede a vez ao event loop — simula o `await` de um handler assíncrono real. */
const respira = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('registro de canais', () => {
  it('registra e despacha devolvendo o retorno do handler', () => {
    registrarCanal('produtos:listar', () => ({ success: true, data: [1, 2, 3] }))

    expect(despachar('produtos:listar')).toEqual({ success: true, data: [1, 2, 3] })
  })

  it('entrega os argumentos na mesma ordem em que vieram', () => {
    const recebidos: unknown[] = []
    registrarCanal('produtos:atualizar', (...args: never[]) => {
      recebidos.push(...args)
      return null
    })

    despachar('produtos:atualizar', [7, { nome: 'Item' }, undefined])

    expect(recebidos).toEqual([7, { nome: 'Item' }, undefined])
  })

  it('recusa o mesmo canal registrado duas vezes', () => {
    registrarCanal('vendas:criar', () => null)

    expect(() => registrarCanal('vendas:criar', () => null)).toThrow(/duas vezes/)
  })

  it('recusa canal sem nome', () => {
    expect(() => registrarCanal('', () => null)).toThrow(/sem nome/)
  })

  it('lança ao despachar canal que não existe', () => {
    expect(() => despachar('vendas:inventado')).toThrow(/não existe/)
  })

  it('lista os canais em ordem', () => {
    registrarCanal('vendas:criar', () => null)
    registrarCanal('auth:login', () => null)
    registrarCanal('produtos:listar', () => null)

    expect(listarCanais()).toEqual(['auth:login', 'produtos:listar', 'vendas:criar'])
    expect(temCanal('auth:login')).toBe(true)
    expect(temCanal('auth:sair')).toBe(false)
  })
})

describe('forma do retorno', () => {
  // Se este teste falhar, a atomicidade da venda foi embora junto: um handler
  // que era síncrono passou a ceder a vez entre conferir o estoque e gravar.
  it('mantém síncrono o que é síncrono', () => {
    registrarCanal('vendas:criar', () => ({ success: true, data: { id: 1 } }))

    const resultado = despachar('vendas:criar')

    expect(resultado).not.toBeInstanceOf(Promise)
    expect(resultado).toEqual({ success: true, data: { id: 1 } })
  })

  it('devolve a promessa de quem é assíncrono', async () => {
    registrarCanal('fiscal:emitirNfce', async () => {
      await respira()
      return { success: true, data: { numero: 42 } }
    })

    const resultado = despachar('fiscal:emitirNfce')

    expect(resultado).toBeInstanceOf(Promise)
    await expect(resultado).resolves.toEqual({ success: true, data: { numero: 42 } })
  })

  // Hoje cada handler devolve { success: false, error } por conta própria e o
  // que escapa disso vira promessa rejeitada no renderer. O roteador não pode
  // mudar isso, senão altera o comportamento de 134 canais de uma vez.
  it('deixa a exceção passar em vez de virar resposta', () => {
    registrarCanal('vendas:cancelar', () => {
      throw new Error('Sessão não autenticada.')
    })

    expect(() => despachar('vendas:cancelar')).toThrow('Sessão não autenticada.')
  })

  it('deixa a rejeição passar em handler assíncrono', async () => {
    registrarCanal('fiscal:danfe', async () => {
      await respira()
      throw new Error('A nota ainda não foi autorizada pela SEFAZ.')
    })

    await expect(despachar('fiscal:danfe') as Promise<unknown>).rejects.toThrow(/SEFAZ/)
  })
})

describe('origem da chamada', () => {
  it('assume local quando ninguém informa', () => {
    registrarCanal('auth:sessaoAtual', () => origemAtual())

    expect(despachar('auth:sessaoAtual')).toBe(ORIGEM_LOCAL)
  })

  it('devolve local fora de qualquer despacho', () => {
    // Backup automático, timer e código de boot rodam fora de despacho. Tratar
    // como local é o padrão seguro.
    expect(origemAtual()).toBe(ORIGEM_LOCAL)
  })

  it('enxerga a origem informada pelo chamador', () => {
    registrarCanal('auth:sessaoAtual', () => origemAtual())

    expect(despachar('auth:sessaoAtual', [], { origem: 'terminal-caixa-2' })).toBe(
      'terminal-caixa-2'
    )
  })

  it('mantém a origem depois do await', async () => {
    registrarCanal('vendas:cancelar', async () => {
      await respira(5)
      return origemAtual()
    })

    await expect(
      despachar('vendas:cancelar', [], { origem: 'terminal-caixa-2' }) as Promise<string>
    ).resolves.toBe('terminal-caixa-2')
  })

  // O teste mais importante do arquivo. Sem esta garantia, o login do segundo
  // caixa derruba a sessão de quem está no PC e a venda sai no nome errado.
  it('não mistura origens em chamadas concorrentes', async () => {
    registrarCanal('vendas:criar', async (espera: never) => {
      const antes = origemAtual()
      await respira(espera as unknown as number)
      return { antes, depois: origemAtual() }
    })

    // O PC demora mais que o terminal de propósito: as duas execuções ficam
    // entrelaçadas, e o terminal termina no meio da espera do PC.
    const doPc = despachar('vendas:criar', [20], { origem: ORIGEM_LOCAL }) as Promise<{
      antes: string
      depois: string
    }>
    const doTerminal = despachar('vendas:criar', [1], {
      origem: 'terminal-caixa-2'
    }) as Promise<{ antes: string; depois: string }>

    const [pc, terminal] = await Promise.all([doPc, doTerminal])

    expect(pc).toEqual({ antes: ORIGEM_LOCAL, depois: ORIGEM_LOCAL })
    expect(terminal).toEqual({ antes: 'terminal-caixa-2', depois: 'terminal-caixa-2' })
  })
})

describe('ponte com o ipcMain', () => {
  function ponteFalsa(): { ipc: PonteIpc; registrados: Map<string, (e: unknown, ...a: never[]) => unknown> } {
    const registrados = new Map<string, (e: unknown, ...a: never[]) => unknown>()
    return { ipc: { handle: (canal, ouvinte) => void registrados.set(canal, ouvinte) }, registrados }
  }

  it('cria um handle para cada canal registrado', () => {
    registrarCanal('produtos:listar', () => null)
    registrarCanal('vendas:criar', () => null)
    const { ipc, registrados } = ponteFalsa()

    montarPonteIpc(ipc)

    expect([...registrados.keys()].sort()).toEqual(['produtos:listar', 'vendas:criar'])
  })

  it('descarta o evento do Electron e repassa só os argumentos', () => {
    registrarCanal('produtos:atualizar', (...args: never[]) => args)
    const { ipc, registrados } = ponteFalsa()
    montarPonteIpc(ipc)

    const eventoFalso = { sender: 'janela' }
    const resposta = registrados.get('produtos:atualizar')!(eventoFalso, 7 as never, 'x' as never)

    expect(resposta).toEqual([7, 'x'])
  })

  // Os 3 canais do atualizador só se registram depois que a janela principal
  // existe, ou seja, depois da ponte montada. Se o retardatário não fosse
  // ligado, o botão de atualizar quebraria com "não é uma função" — e só na
  // loja, porque em dev ninguém clica nele.
  it('liga ao ipcMain o canal registrado depois da ponte', () => {
    registrarCanal('produtos:listar', () => null)
    const { ipc, registrados } = ponteFalsa()
    montarPonteIpc(ipc)

    registrarCanal('atualizacao:verificar', () => 'ok')

    expect(registrados.has('atualizacao:verificar')).toBe(true)
    expect(registrados.get('atualizacao:verificar')!({})).toBe('ok')
  })

  it('recusa montar a ponte duas vezes', () => {
    registrarCanal('produtos:listar', () => null)
    montarPonteIpc(ponteFalsa().ipc)

    expect(() => montarPonteIpc(ponteFalsa().ipc)).toThrow(/duas vezes/)
  })
})
