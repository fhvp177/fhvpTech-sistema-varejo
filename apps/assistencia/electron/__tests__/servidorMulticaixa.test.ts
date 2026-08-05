/**
 * Servidor embutido do caixa principal + credenciais dos terminais.
 *
 * Sobe um servidor de verdade numa porta sorteada e conversa com ele por HTTP
 * real. Nada de dublê de rede: metade do que se quer provar é comportamento de
 * protocolo — código de status, cabeçalho ausente, corpo inválido.
 *
 * O foco é o que acontece com quem NÃO deveria entrar, porque essa porta fica
 * aberta na rede da loja.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  criarServidorMulticaixa,
  type OpcoesServidor,
  type ServidorMulticaixa
} from '@fhvptech/core/electron/multicaixa/servidor'
import {
  gerarToken,
  hashDeToken,
  origemDoToken,
  tokenConfere
} from '@fhvptech/core/electron/multicaixa/tokens'

const TOKEN_BOM = 'a'.repeat(64)
const TERMINAL = 'terminal-1'

let emPe: ServidorMulticaixa | null = null

afterEach(async () => {
  await emPe?.parar()
  emPe = null
})

interface Espiao {
  chamadas: { canal: string; args: unknown[]; origem: string }[]
  acessos: string[]
}

async function subir(
  opcoes: {
    despachar?: (canal: string, args: unknown[], origem: string) => unknown
    canalPermitido?: (canal: string) => boolean
    parear?: OpcoesServidor['parear']
  } = {}
): Promise<{ url: string; espiao: Espiao }> {
  const espiao: Espiao = { chamadas: [], acessos: [] }
  emPe = await criarServidorMulticaixa({
    porta: 0, // 0 = o sistema escolhe uma porta livre
    versao: '1.31.1',
    autenticar: (token) => (token === TOKEN_BOM ? TERMINAL : null),
    canalPermitido: opcoes.canalPermitido ?? (() => true),
    despachar: (canal, args, origem) => {
      espiao.chamadas.push({ canal, args, origem })
      return opcoes.despachar?.(canal, args, origem) ?? { success: true, data: null }
    },
    aoAtender: (origem) => void espiao.acessos.push(origem),
    parear: opcoes.parear
  })
  return { url: `http://127.0.0.1:${emPe.porta}`, espiao }
}

function parear(
  url: string,
  corpo: unknown
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  return fetch(`${url}/parear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  }).then(async (r) => ({ status: r.status, corpo: (await r.json()) as Record<string, unknown> }))
}

function rpc(
  url: string,
  corpo: unknown,
  token: string | null = TOKEN_BOM
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  return fetch(`${url}/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(corpo)
  }).then(async (r) => ({ status: r.status, corpo: (await r.json()) as Record<string, unknown> }))
}

describe('quem pode entrar', () => {
  it('recusa quem não manda token', async () => {
    const { url } = await subir()

    const r = await rpc(url, { canal: 'produtos:listar' }, null)

    expect(r.status).toBe(401)
  })

  it('recusa token errado', async () => {
    const { url } = await subir()

    const r = await rpc(url, { canal: 'produtos:listar' }, 'b'.repeat(64))

    expect(r.status).toBe(401)
  })

  it('recusa cabeçalho fora do formato Bearer', async () => {
    const { url } = await subir()

    const r = await fetch(`${url}/rpc`, {
      method: 'POST',
      headers: { Authorization: TOKEN_BOM },
      body: '{}'
    })

    expect(r.status).toBe(401)
  })

  it('não conta nem a versão para quem não se identificou', async () => {
    const { url } = await subir()

    // Responder "sou um FHVP Tech 1.31.1" a qualquer um já entrega o suficiente
    // para alguém sondar a rede da loja atrás de alvo.
    const r = await fetch(`${url}/handshake`)

    expect(r.status).toBe(401)
    expect(await r.text()).not.toContain('1.31.1')
  })

  it('nem chega no roteador quando o token é inválido', async () => {
    const { url, espiao } = await subir()

    await rpc(url, { canal: 'vendas:criar' }, 'errado')

    expect(espiao.chamadas).toEqual([])
  })
})

describe('terminal autorizado', () => {
  it('responde o handshake com a versão', async () => {
    const { url } = await subir()

    const r = await fetch(`${url}/handshake`, { headers: { Authorization: `Bearer ${TOKEN_BOM}` } })

    expect(await r.json()).toEqual({ ok: true, versao: '1.31.1' })
  })

  it('despacha o canal com os argumentos na ordem', async () => {
    const { url, espiao } = await subir()

    await rpc(url, { canal: 'produtos:atualizar', args: [7, { nome: 'Item' }] })

    expect(espiao.chamadas).toEqual([
      { canal: 'produtos:atualizar', args: [7, { nome: 'Item' }], origem: TERMINAL }
    ])
  })

  it('devolve o resultado do handler', async () => {
    const { url } = await subir({ despachar: () => ({ success: true, data: [1, 2, 3] }) })

    const r = await rpc(url, { canal: 'produtos:listar' })

    expect(r.corpo).toEqual({ ok: true, valor: { success: true, data: [1, 2, 3] } })
  })

  it('carrega o resultado de handler assíncrono', async () => {
    const { url } = await subir({
      despachar: async () => ({ success: true, data: { numero: 42 } })
    })

    const r = await rpc(url, { canal: 'fiscal:emitirNfce' })

    expect(r.corpo).toEqual({ ok: true, valor: { success: true, data: { numero: 42 } } })
  })

  // { success: false } é valor normal, não exceção: a tela do terminal precisa
  // recebê-lo igualzinho ao que receberia rodando no PC.
  it('repassa a recusa do handler como resultado, não como erro', async () => {
    const { url } = await subir({
      despachar: () => ({ success: false, error: 'Estoque insuficiente para "Item".' })
    })

    const r = await rpc(url, { canal: 'vendas:criar' })

    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({
      ok: true,
      valor: { success: false, error: 'Estoque insuficiente para "Item".' }
    })
  })

  it('marca como erro o handler que lançou', async () => {
    const { url } = await subir({
      despachar: () => {
        throw new Error('Esta ação requer permissão do gerente da loja.')
      }
    })

    const r = await rpc(url, { canal: 'vendedores:deletar' })

    // ok:false faz o cliente do terminal tornar a lançar — sem isso, um erro de
    // permissão viraria "sucesso com dados estranhos" na tela.
    expect(r.corpo).toEqual({ ok: false, erro: 'Esta ação requer permissão do gerente da loja.' })
  })

  it('anota o acesso para o PC mostrar o último uso', async () => {
    const { url, espiao } = await subir()

    await rpc(url, { canal: 'produtos:listar' })

    expect(espiao.acessos).toEqual([TERMINAL])
  })
})

describe('canal barrado pela allowlist', () => {
  it('recusa mesmo com token válido', async () => {
    const { url, espiao } = await subir({ canalPermitido: (c) => !c.startsWith('backup:') })

    const r = await rpc(url, { canal: 'backup:restaurar' })

    expect(r.status).toBe(403)
    // O ponto da allowlist: token vazado não restaura backup. A recusa acontece
    // ANTES do roteador — o handler nem é alcançado.
    expect(espiao.chamadas).toEqual([])
  })
})

describe('pedido malformado', () => {
  it('recusa corpo que não é JSON', async () => {
    const { url } = await subir()

    const r = await fetch(`${url}/rpc`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN_BOM}` },
      body: 'nada disso'
    })

    expect(r.status).toBe(400)
  })

  it('recusa pedido sem canal', async () => {
    const { url } = await subir()

    expect((await rpc(url, { args: [1] })).status).toBe(400)
  })

  it('trata args ausente como lista vazia', async () => {
    const { url, espiao } = await subir()

    await rpc(url, { canal: 'produtos:listar' })

    expect(espiao.chamadas[0].args).toEqual([])
  })

  it('recusa rota que não existe', async () => {
    const { url } = await subir()

    const r = await fetch(`${url}/admin`, { headers: { Authorization: `Bearer ${TOKEN_BOM}` } })

    expect(r.status).toBe(404)
  })

  it('recusa GET no /rpc', async () => {
    const { url } = await subir()

    const r = await fetch(`${url}/rpc`, { headers: { Authorization: `Bearer ${TOKEN_BOM}` } })

    expect(r.status).toBe(405)
  })
})

describe('a porta do pareamento', () => {
  it('atende sem token — é a única que pode', () => {
    // O terminal novo ainda não tem credencial nenhuma. Se esta rota exigisse
    // token, ninguém nunca conseguiria o primeiro.
    return subir({ parear: () => ({ ok: true, id: 'terminal-abc', token: 'x'.repeat(64) }) })
      .then(({ url }) => parear(url, { codigo: '123456', nome: 'Notebook' }))
      .then((r) => {
        expect(r.status).toBe(200)
        expect(r.corpo).toEqual({
          ok: true,
          id: 'terminal-abc',
          token: 'x'.repeat(64),
          versao: '1.31.1'
        })
      })
  })

  it('recusa quando não há pareamento aberto', async () => {
    const { url } = await subir({ parear: () => ({ ok: false, motivo: 'sem-codigo' }) })

    const r = await parear(url, { codigo: '123456' })

    expect(r.status).toBe(401)
    expect(r.corpo.erro).toMatch(/Gere um código no caixa principal/)
  })

  it('distingue código errado de código queimado', async () => {
    const errado = await subir({ parear: () => ({ ok: false, motivo: 'codigo-errado' }) })
    expect((await parear(errado.url, { codigo: '000000' })).corpo.erro).toBe('Código incorreto.')
    await emPe?.parar()

    const queimado = await subir({ parear: () => ({ ok: false, motivo: 'codigo-expirado' }) })
    // Erro de digitação e código queimado levam a ações diferentes: tentar de
    // novo, ou voltar ao PC e gerar outro.
    expect((await parear(queimado.url, { codigo: '000000' })).corpo.erro).toMatch(/Gere outro/)
  })

  it('some quando o servidor não oferece pareamento', async () => {
    const { url } = await subir()

    expect((await parear(url, { codigo: '123456' })).status).toBe(404)
  })

  it('corta nome gigante em vez de guardar o que vier', async () => {
    let nomeRecebido = ''
    const { url } = await subir({
      parear: (_codigo, nome) => {
        nomeRecebido = nome
        return { ok: true, id: 'terminal-abc', token: 'x'.repeat(64) }
      }
    })

    await parear(url, { codigo: '123456', nome: 'N'.repeat(500) })

    expect(nomeRecebido).toHaveLength(60)
  })

  it('recusa GET', async () => {
    const { url } = await subir({ parear: () => ({ ok: false, motivo: 'sem-codigo' }) })

    expect((await fetch(`${url}/parear`)).status).toBe(405)
  })
})

describe('credenciais dos terminais', () => {
  it('gera token grande e diferente a cada vez', () => {
    const a = gerarToken()
    const b = gerarToken()

    expect(a).toHaveLength(64) // 32 bytes em hexadecimal
    expect(a).not.toBe(b)
  })

  it('confere o token contra o resumo guardado', () => {
    const token = gerarToken()

    expect(tokenConfere(token, hashDeToken(token))).toBe(true)
    expect(tokenConfere(gerarToken(), hashDeToken(token))).toBe(false)
  })

  it('não quebra com resumo torto', () => {
    expect(tokenConfere(gerarToken(), 'nao-e-hexadecimal')).toBe(false)
    expect(tokenConfere(gerarToken(), '')).toBe(false)
  })

  it('descobre de qual terminal é o token', () => {
    const doCaixa2 = gerarToken()
    const terminais = [
      { id: 'terminal-1', tokenHash: hashDeToken(gerarToken()) },
      { id: 'terminal-2', tokenHash: hashDeToken(doCaixa2) }
    ]

    expect(origemDoToken(doCaixa2, terminais)).toBe('terminal-2')
    expect(origemDoToken(gerarToken(), terminais)).toBeNull()
  })

  it('não reconhece token de terminal revogado', () => {
    const token = gerarToken()
    const terminais = [{ id: 'terminal-1', tokenHash: hashDeToken(token) }]

    expect(origemDoToken(token, terminais)).toBe('terminal-1')
    expect(origemDoToken(token, [])).toBeNull()
  })
})
