/**
 * Prova dos nove: a mesma chamada pelos dois caminhos.
 *
 * Este é o teste que sustenta a promessa central do multi-caixa — **passar pela
 * rede não muda o resultado**. Todo o desenho depende disso: a interface do
 * segundo caixa é a mesma do PC e chama os mesmos canais, então qualquer
 * diferença entre o caminho local e o caminho HTTP viraria uma tela que se
 * comporta diferente dependendo de onde a pessoa está — a pior classe de bug
 * para diagnosticar à distância.
 *
 * Cada caso dispara a MESMA chamada duas vezes, uma direto no roteador e outra
 * atravessando um servidor HTTP de verdade, e exige resultados idênticos.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  despachar,
  limparCanais,
  ORIGEM_LOCAL,
  origemAtual,
  registrarCanal
} from '@fhvptech/core/electron/roteador'
import {
  criarServidorMulticaixa,
  type ServidorMulticaixa
} from '@fhvptech/core/electron/multicaixa/servidor'

const TOKEN = 'f'.repeat(64)
const TERMINAL = 'terminal-caixa-2'

let servidor: ServidorMulticaixa | null = null

afterEach(async () => {
  await servidor?.parar()
  servidor = null
  limparCanais()
})

async function subirServidor(): Promise<string> {
  servidor = await criarServidorMulticaixa({
    porta: 0,
    versao: '1.31.1',
    autenticar: (t) => (t === TOKEN ? TERMINAL : null),
    canalPermitido: () => true,
    // Exatamente a mesma ligação usada em produção (multicaixa/servico.ts).
    despachar: (canal, args, origem) => despachar(canal, args, { origem })
  })
  return `http://127.0.0.1:${servidor.porta}`
}

/** Dispara pela rede e devolve o que o cliente do terminal enxergaria. */
async function pelaRede(url: string, canal: string, args: unknown[] = []): Promise<unknown> {
  const r = await fetch(`${url}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ canal, args })
  })
  const corpo = (await r.json()) as { ok: boolean; valor?: unknown; erro?: string }
  // O cliente do terminal torna a lançar o que o handler lançou — é o que faz
  // o erro chegar na tela igual ao que chegaria em casa.
  if (!corpo.ok) throw new Error(corpo.erro)
  return corpo.valor
}

/** Dispara localmente, como a janela desta máquina faria. */
async function local(canal: string, args: unknown[] = []): Promise<unknown> {
  return await despachar(canal, args, { origem: ORIGEM_LOCAL })
}

describe('mesma resposta pelos dois caminhos', () => {
  it('leitura simples', async () => {
    registrarCanal('produtos:listar', () => ({
      success: true,
      data: [{ id: 1, nome: 'Item', estoque: 3 }]
    }))
    const url = await subirServidor()

    expect(await pelaRede(url, 'produtos:listar')).toEqual(await local('produtos:listar'))
  })

  it('argumentos chegam iguais, na ordem e com os tipos', async () => {
    const recebidos: unknown[][] = []
    registrarCanal('vendas:criar', (...args: never[]) => {
      recebidos.push(args)
      return { success: true, data: { id: 1 } }
    })
    const url = await subirServidor()

    const args = [{ itens: [{ produto_id: 7, quantidade: 2, preco_unitario: 19.9 }], desconto: 0 }]
    await local('vendas:criar', args)
    await pelaRede(url, 'vendas:criar', args)

    expect(recebidos[0]).toEqual(recebidos[1])
  })

  it('recusa de regra de negócio chega igual', async () => {
    // { success: false } é valor, não exceção. Se a rede transformasse isso em
    // erro, o terminal mostraria "falha de comunicação" em vez de "estoque
    // insuficiente" — e o operador procuraria problema no lugar errado.
    registrarCanal('vendas:criar', () => ({
      success: false,
      error: 'Estoque insuficiente para "Item": solicitado 2, disponível 1.'
    }))
    const url = await subirServidor()

    expect(await pelaRede(url, 'vendas:criar')).toEqual(await local('vendas:criar'))
  })

  it('exceção do handler vira exceção dos dois lados', async () => {
    registrarCanal('vendedores:deletar', () => {
      throw new Error('Esta ação requer permissão do gerente da loja.')
    })
    const url = await subirServidor()

    await expect(pelaRede(url, 'vendedores:deletar')).rejects.toThrow(
      'Esta ação requer permissão do gerente da loja.'
    )
    expect(() => despachar('vendedores:deletar')).toThrow(
      'Esta ação requer permissão do gerente da loja.'
    )
  })

  it('handler assíncrono devolve o mesmo valor', async () => {
    registrarCanal('fiscal:emitirNfce', async () => {
      await new Promise((r) => setTimeout(r, 5))
      return { success: true, data: { numero: 1042, chave: '3526'.repeat(11) } }
    })
    const url = await subirServidor()

    expect(await pelaRede(url, 'fiscal:emitirNfce')).toEqual(await local('fiscal:emitirNfce'))
  })

  it('atravessa acentuação sem estragar', async () => {
    // Nome de produto, razão social e justificativa de cancelamento vêm cheios
    // de acento; encoding errado só apareceria no cupom impresso.
    registrarCanal('clientes:listar', () => ({
      success: true,
      data: [{ nome: 'Ação & Cia — Comércio de Peças Ltda', obs: 'não conferido' }]
    }))
    const url = await subirServidor()

    expect(await pelaRede(url, 'clientes:listar')).toEqual(await local('clientes:listar'))
  })

  it('preserva valores em centavos sem arredondar', async () => {
    registrarCanal('vendas:buscarPorId', () => ({
      success: true,
      data: { total: 1234.56, desconto: 0.07, valor_pago: 1234.49 }
    }))
    const url = await subirServidor()

    expect(await pelaRede(url, 'vendas:buscarPorId')).toEqual(await local('vendas:buscarPorId'))
  })

  it('null e ausência continuam distinguíveis', async () => {
    registrarCanal('vendas:buscarPorId', () => ({
      success: true,
      data: { cliente_id: null, data_vencimento: null, itens: [] }
    }))
    const url = await subirServidor()

    expect(await pelaRede(url, 'vendas:buscarPorId')).toEqual(await local('vendas:buscarPorId'))
  })
})

describe('o que MUDA de propósito entre os caminhos', () => {
  it('a origem — é a única diferença esperada', async () => {
    registrarCanal('auth:sessaoAtual', () => ({ success: true, data: origemAtual() }))
    const url = await subirServidor()

    // Tudo o mais é idêntico; quem chamou não pode ser, senão a sessão e a
    // atribuição da venda desmoronam.
    expect(await local('auth:sessaoAtual')).toEqual({ success: true, data: ORIGEM_LOCAL })
    expect(await pelaRede(url, 'auth:sessaoAtual')).toEqual({ success: true, data: TERMINAL })
  })
})
