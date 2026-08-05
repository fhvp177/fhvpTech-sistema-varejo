/**
 * Clonagem do banco pela rede.
 *
 * Dois assuntos, e os dois com jeito de dar problema silencioso:
 *
 * 1. **Compatibilidade de versão.** Migração de banco anda só para frente. Se
 *    um app antigo receber um banco novo, ele fica com um arquivo que não sabe
 *    ler — situação pior que não ter clonado, porque o lojista acha que deu
 *    certo.
 * 2. **Quem pode baixar.** O zip é a loja inteira num arquivo. Um token de
 *    caixa adicional não pode virar chave desse arquivo: são pesos diferentes.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  compararVersoes,
  destinoConsegueLer,
  normalizarEndereco,
  RECUSA_CLONAGEM
} from '@fhvptech/core/electron/multicaixa/clonagem'
import { CodigoDeUsoUnico } from '@fhvptech/core/electron/multicaixa/codigoTemporario'
import {
  criarServidorMulticaixa,
  type OpcoesServidor,
  type ServidorMulticaixa
} from '@fhvptech/core/electron/multicaixa/servidor'

const TOKEN_DE_CAIXA = 'a'.repeat(64)
const ZIP = Buffer.from('PK conteudo do backup')

let emPe: ServidorMulticaixa | null = null

afterEach(async () => {
  await emPe?.parar()
  emPe = null
})

describe('comparação de versões', () => {
  it('ordena corretamente', () => {
    expect(compararVersoes('1.31.1', '1.31.1')).toBe(0)
    expect(compararVersoes('1.31.0', '1.31.1')).toBe(-1)
    expect(compararVersoes('1.31.1', '1.31.0')).toBe(1)
    expect(compararVersoes('1.9.0', '1.31.0')).toBe(-1) // não é ordem alfabética
    expect(compararVersoes('2.0.0', '1.99.99')).toBe(1)
  })

  it('aguenta versão malformada sem explodir', () => {
    expect(compararVersoes('1.31', '1.31.0')).toBe(0)
    expect(compararVersoes('', '1.0.0')).toBe(-1)
    expect(compararVersoes('abc', '0.0.0')).toBe(0)
  })
})

describe('quem consegue ler o banco clonado', () => {
  it('mesma versão passa', () => {
    expect(destinoConsegueLer('1.31.1', '1.31.1')).toBe(true)
  })

  it('destino mais novo passa', () => {
    // As migrações do destino levam o banco para frente.
    expect(destinoConsegueLer('1.31.0', '1.32.0')).toBe(true)
  })

  it('destino mais antigo é recusado', () => {
    // Migração não anda para trás. Deixar passar entregaria ao lojista um banco
    // que o app dele não entende, e ele só descobriria ao abrir uma tela.
    expect(destinoConsegueLer('1.32.0', '1.31.0')).toBe(false)
    expect(destinoConsegueLer('1.31.1', '1.31.0')).toBe(false)
  })
})

describe('endereço digitado pelo lojista', () => {
  it('completa a porta quando vem só o número da máquina', () => {
    expect(normalizarEndereco('192.168.0.10', 4877)).toBe('http://192.168.0.10:4877')
  })

  it('respeita a porta quando ela veio junto', () => {
    expect(normalizarEndereco('192.168.0.10:5000', 4877)).toBe('http://192.168.0.10:5000')
  })

  it('aceita endereço completo', () => {
    expect(normalizarEndereco('http://192.168.0.10:4877', 4877)).toBe('http://192.168.0.10:4877')
  })

  it('aceita nome de máquina, não só número', () => {
    expect(normalizarEndereco('PC-LOJA', 4877)).toBe('http://pc-loja:4877')
  })

  it('perdoa espaço sobrando', () => {
    // Colar de outra tela costuma trazer espaço junto; recusar por isso viraria
    // tentativa e erro.
    expect(normalizarEndereco('  192.168.0.10  ', 4877)).toBe('http://192.168.0.10:4877')
  })

  it('reclama de campo vazio com instrução, não com erro técnico', () => {
    expect(() => normalizarEndereco('', 4877)).toThrow(/Informe o endereço/)
    expect(() => normalizarEndereco('   ', 4877)).toThrow(/Informe o endereço/)
  })

  it('reclama de endereço impossível sem quebrar', () => {
    expect(() => normalizarEndereco('http://', 4877)).toThrow(/Endereço inválido/)
  })
})

describe('a porta da clonagem', () => {
  async function subir(
    clonar?: OpcoesServidor['clonar']
  ): Promise<string> {
    emPe = await criarServidorMulticaixa({
      porta: 0,
      versao: '1.31.1',
      autenticar: (t) => (t === TOKEN_DE_CAIXA ? 'terminal-1' : null),
      canalPermitido: () => true,
      despachar: () => ({ success: true, data: null }),
      clonar
    })
    return `http://127.0.0.1:${emPe.porta}`
  }

  function pedirCopia(
    url: string,
    corpo: unknown,
    cabecalhos: Record<string, string> = {}
  ): Promise<Response> {
    return fetch(`${url}/clonar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cabecalhos },
      body: JSON.stringify(corpo)
    })
  }

  it('entrega o zip quando o código está certo', async () => {
    const url = await subir(async () => ({ ok: true, zip: ZIP, nomeArquivo: 'backup.zip' }))

    const r = await pedirCopia(url, { codigo: '123456', versao: '1.31.1' })

    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('application/zip')
    expect(Buffer.from(await r.arrayBuffer())).toEqual(ZIP)
  })

  it('não aceita token de caixa adicional no lugar do código', async () => {
    // O ponto de segurança do arquivo: quem pode operar um caixa não pode, por
    // isso, baixar a loja inteira num arquivo.
    let codigoRecebido: string | null = null
    const url = await subir(async (codigo) => {
      codigoRecebido = codigo
      return { ok: false, motivo: 'codigo-errado' }
    })

    const r = await pedirCopia(
      url,
      { versao: '1.31.1' },
      { Authorization: `Bearer ${TOKEN_DE_CAIXA}` }
    )

    expect(r.status).toBe(401)
    // O token nem é consultado nesta rota; o que vale é o código, que veio vazio.
    expect(codigoRecebido).toBe('')
  })

  it('recusa destino com versão mais antiga, com status próprio', async () => {
    const url = await subir(async () => ({ ok: false, motivo: 'versao-antiga' }))

    const r = await pedirCopia(url, { codigo: '123456', versao: '1.30.0' })

    // 409 e não 401: o problema não é autorização, e o destino mostra outra
    // mensagem — "atualize este computador" em vez de "código incorreto".
    expect(r.status).toBe(409)
    expect((await r.json()).erro).toBe(RECUSA_CLONAGEM['versao-antiga'])
  })

  it('avisa quando não há cópia autorizada', async () => {
    const url = await subir(async () => ({ ok: false, motivo: 'sem-codigo' }))

    const r = await pedirCopia(url, { codigo: '123456', versao: '1.31.1' })

    expect(r.status).toBe(401)
    expect((await r.json()).erro).toMatch(/Gere um código no computador de origem/)
  })

  it('some quando a origem não oferece clonagem', async () => {
    const url = await subir(undefined)

    expect((await pedirCopia(url, { codigo: '123456' })).status).toBe(404)
  })

  it('recusa GET', async () => {
    const url = await subir(async () => ({ ok: true, zip: ZIP, nomeArquivo: 'b.zip' }))

    expect((await fetch(`${url}/clonar`)).status).toBe(405)
  })
})

describe('o código da clonagem tem o mesmo cerco do pareamento', () => {
  it('serve uma vez e queima em 5 erros', () => {
    const codigo = new CodigoDeUsoUnico()
    const { codigo: valor } = codigo.abrir()

    for (let i = 0; i < 4; i++) expect(codigo.conferir('000000')).toBe('codigo-errado')
    expect(codigo.conferir('000000')).toBe('codigo-expirado')
    // Baixar o banco inteiro é a operação mais sensível do sistema; 5 chances em
    // um milhão é o que impede alguém na rede de tentar até acertar.
    expect(codigo.conferir(valor)).toBe('sem-codigo')
  })

  it('acerto encerra a janela', () => {
    const codigo = new CodigoDeUsoUnico()
    const { codigo: valor } = codigo.abrir()

    expect(codigo.conferir(valor)).toBe('ok')
    expect(codigo.conferir(valor)).toBe('sem-codigo')
  })
})
