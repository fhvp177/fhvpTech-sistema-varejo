/**
 * O que uma mudança no LICENCIADOR pode fazer com o varejo.
 *
 * ── A pergunta que este arquivo responde ─────────────────────────────────────
 * O backend é outro projeto, com outro ciclo de deploy. Quando ele muda, como
 * saber se a loja continua abrindo? Aqui o código REAL do app conversa com um
 * servidor de mentira que responde cada coisa que o backend pode responder:
 * concedido, recusado, rota inexistente, erro interno, silêncio.
 *
 * Não é teste do backend. É teste do CONTRATO visto do lado de cá, que é o lado
 * que fica instalado em loja e não dá para consertar remotamente.
 *
 * ── A propriedade que segura tudo ────────────────────────────────────────────
 * ★ Só um "não" EXPLÍCITO fecha o sistema. Servidor fora do ar, rota que ainda
 * não existe, erro 500, resposta ilegível: nada disso pode impedir a loja de
 * abrir. Se um dia alguém inverter isso, um incidente no backend vira uma
 * paralisação em TODAS as lojas ao mesmo tempo, e a correção só chega pela
 * próxima release.
 *
 * ── Por que este arquivo pôde existir só agora ──────────────────────────────
 * O módulo de licença lê `__CHAVE_HMAC__` e companhia no topo, valores que o
 * electron-vite injeta no build. Sem eles, o arquivo nem era importável num
 * teste. O `define` no vitest.config.ts resolveu isso; antes disso, o caminho
 * que decide se a loja abre não tinha teste nenhum do lado do app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configurarPlataforma, limparPlataforma } from '@fhvptech/core/electron/plataforma'
import { ativarLicenca, validarLicenca } from '@fhvptech/core/electron/licenca'

// O mesmo valor de mentira que o vitest.config.ts injeta.
const SEGREDO = 'hmac-de-teste-nao-e-o-de-producao'

function chaveDe(clienteId: string, diasAFrente = 30): string {
  const d = new Date(Date.now() + diasAFrente * 86_400_000)
  const exp = d.toISOString().slice(0, 10)
  const hmac = createHmac('sha256', SEGREDO)
    .update(`${clienteId}:${exp}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase()
  return `${clienteId}:${exp}:${hmac}`
}

/** O que o servidor de mentira vai responder no próximo pedido de vaga. */
type Roteiro =
  | { tipo: 'concede' }
  | { tipo: 'recusa'; mensagem: string }
  | { tipo: 'status'; codigo: number; corpo?: string }
  | { tipo: 'demora' }

let servidor: Server
let roteiro: Roteiro
let pedidos: Array<Record<string, unknown>>
let pasta: string

beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'licenca-contrato-'))
  configurarPlataforma({
    pastaDados: () => pasta,
    pastaTemp: () => pasta,
    versao: () => '1.40.0'
  })

  roteiro = { tipo: 'concede' }
  pedidos = []

  servidor = createServer((req, res) => {
    if (req.url !== '/licenca/dispositivo') {
      res.writeHead(404).end('não encontrado')
      return
    }
    let corpo = ''
    req.on('data', (p) => (corpo += p))
    req.on('end', () => {
      try {
        pedidos.push(JSON.parse(corpo))
      } catch {
        pedidos.push({ ilegivel: corpo })
      }
      if (roteiro.tipo === 'demora') return // nunca responde: é o timeout
      if (roteiro.tipo === 'status') {
        res.writeHead(roteiro.codigo, { 'content-type': 'application/json' })
        res.end(roteiro.corpo ?? '{}')
        return
      }
      if (roteiro.tipo === 'recusa') {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ concedida: false, motivo: 'limite', mensagem: roteiro.mensagem }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          concedida: true,
          motivo: 'nova',
          emUso: 1,
          reconferirEm: new Date(Date.now() + 12 * 3_600_000).toISOString()
        })
      )
    })
  })

  // Porta 0 = o sistema escolhe uma livre. Nunca fixar porta em teste: nesta
  // máquina uma porta fixa já sequestrou o site de outro projeto, duas vezes.
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto))
  const endereco = servidor.address()
  const porta = typeof endereco === 'object' && endereco ? endereco.port : 0
  process.env.FHVP_BACKEND_URL = `http://127.0.0.1:${porta}`
})

afterEach(async () => {
  delete process.env.FHVP_BACKEND_URL
  await new Promise<void>((pronto) => servidor.close(() => pronto()))
  limparPlataforma()
  rmSync(pasta, { recursive: true, force: true })
})

const licencaNoDisco = () => existsSync(join(pasta, 'licenca.lic'))

describe('o servidor concede a vaga', () => {
  it('ativa a licença e guarda o passe', async () => {
    const status = await ativarLicenca(chaveDe('LOJA01'))
    expect(status.valida).toBe(true)
    expect(licencaNoDisco()).toBe(true)
    expect(existsSync(join(pasta, 'licenca.dispositivo'))).toBe(true)
    expect(validarLicenca().valida).toBe(true)
  })

  it('a máquina se apresenta com o que o painel precisa mostrar', async () => {
    await ativarLicenca(chaveDe('LOJA01'))
    expect(pedidos).toHaveLength(1)
    const p = pedidos[0]
    expect(p.chave).toMatch(/^LOJA01:/)
    expect(typeof p.deviceId).toBe('string')
    expect(String(p.deviceId).length).toBeGreaterThanOrEqual(8)
    expect(p.origem).toBe('principal')
    expect(p.versao).toBe('1.40.0')
    expect(typeof p.nome).toBe('string')
  })
})

describe('o servidor RECUSA a vaga', () => {
  it('não ativa, e diz o motivo que veio de lá', async () => {
    roteiro = { tipo: 'recusa', mensagem: 'Este plano permite 2 máquinas. Em uso: CAIXA-01, ESCRITORIO.' }
    const status = await ativarLicenca(chaveDe('LOJA01'))
    expect(status.valida).toBe(false)
    expect(status.motivo).toBe('dispositivo')
    expect(status.mensagem).toContain('CAIXA-01')
  })

  it('★ e NÃO deixa a chave gravada no disco', async () => {
    // O estado mais confuso possível para quem está instalando seria licença
    // válida no disco e sistema fechado.
    roteiro = { tipo: 'recusa', mensagem: 'sem vaga' }
    await ativarLicenca(chaveDe('LOJA01'))
    expect(licencaNoDisco()).toBe(false)
  })

  it('★ liberar a vaga no painel não fecha a loja NA HORA', async () => {
    // De propósito. A máquina só reconfere de tempos em tempos, porque pôr o
    // servidor no caminho de abrir o caixa seria trocar um problema comercial
    // por um operacional. Quem libera uma vaga precisa saber disso.
    await ativarLicenca(chaveDe('LOJA01'))
    roteiro = { tipo: 'recusa', mensagem: 'vaga liberada no painel' }

    const { validarLicencaComRelogio } = await import('@fhvptech/core/electron/licenca')
    const agora = await validarLicencaComRelogio()
    expect(agora.valida).toBe(true)
  })

  it('★ passada a janela, ela reconfere em SEGUNDO PLANO e fecha na abertura seguinte', async () => {
    // Duas coisas ficam provadas aqui, e as duas importam para quem vende:
    //  1. a reconferência NÃO segura a abertura esperando o servidor;
    //  2. por isso, liberar uma vaga no painel só fecha aquela máquina depois
    //     da janela de 12h e de mais uma abertura. Não é imediato, e quem
    //     libera precisa saber disso.
    await ativarLicenca(chaveDe('LOJA01'))
    const pedidosAposAtivar = pedidos.length
    roteiro = { tipo: 'recusa', mensagem: 'vaga liberada no painel' }

    // Só o relógio é falsificado: os temporizadores de rede precisam continuar
    // reais, senão o próprio pedido HTTP nunca completa.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 13 * 3_600_000)
      const { validarLicencaComRelogio } = await import('@fhvptech/core/electron/licenca')

      // Esta abertura ainda passa: a resposta do servidor não é esperada.
      const nestaAbertura = await validarLicencaComRelogio()
      expect(nestaAbertura.valida).toBe(true)

      // A conferência foi disparada e responde logo depois.
      for (let i = 0; i < 100 && pedidos.length === pedidosAposAtivar; i++) {
        await new Promise((r) => setTimeout(r, 20))
      }
      expect(pedidos.length).toBeGreaterThan(pedidosAposAtivar)

      // A abertura seguinte lê o passe já com a recusa gravada.
      const proximaAbertura = validarLicenca()
      expect(proximaAbertura.valida).toBe(false)
      expect(proximaAbertura.motivo).toBe('dispositivo')
      expect(proximaAbertura.mensagem).toContain('vaga liberada no painel')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── ★ A propriedade que não pode cair ───────────────────────────────────────

describe('silêncio do servidor NUNCA é um "não"', () => {
  it('servidor fora do ar: a loja ativa mesmo assim', async () => {
    await new Promise<void>((pronto) => servidor.close(() => pronto()))
    const status = await ativarLicenca(chaveDe('LOJA01'))
    expect(status.valida).toBe(true)
    expect(licencaNoDisco()).toBe(true)
  })

  it('endereço que nem existe: a loja ativa mesmo assim', async () => {
    process.env.FHVP_BACKEND_URL = 'http://127.0.0.1:1'
    const status = await ativarLicenca(chaveDe('LOJA01'))
    expect(status.valida).toBe(true)
  })

  it('★ backend ANTIGO, sem a rota ainda: a loja ativa mesmo assim', async () => {
    // É o caso real de publicar o app antes do backend. A ordem dos dois
    // deploys não pode importar.
    roteiro = { tipo: 'status', codigo: 404, corpo: '{"erro":"não encontrado"}' }
    const status = await ativarLicenca(chaveDe('LOJA01'))
    expect(status.valida).toBe(true)
    expect(licencaNoDisco()).toBe(true)
  })

  it('erro interno do backend (500): a loja ativa mesmo assim', async () => {
    roteiro = { tipo: 'status', codigo: 500, corpo: 'boom' }
    const status = await ativarLicenca(chaveDe('LOJA01'))
    expect(status.valida).toBe(true)
  })

  it('resposta ilegível: a loja ativa mesmo assim', async () => {
    roteiro = { tipo: 'status', codigo: 200, corpo: 'isto não é json' }
    const status = await ativarLicenca(chaveDe('LOJA01'))
    expect(status.valida).toBe(true)
  })

  it('servidor que trava sem responder: a loja ativa depois do tempo limite', async () => {
    roteiro = { tipo: 'demora' }
    const comecou = Date.now()
    const status = await ativarLicenca(chaveDe('LOJA01'))
    expect(status.valida).toBe(true)
    // Se um dia alguém tirar o timeout, a instalação fica pendurada para sempre.
    expect(Date.now() - comecou).toBeLessThan(10_000)
  })

  it('nenhuma dessas situações grava passe de recusa', async () => {
    for (const r of [
      { tipo: 'status', codigo: 404 },
      { tipo: 'status', codigo: 500 },
      { tipo: 'status', codigo: 200, corpo: 'nao é json' }
    ] as Roteiro[]) {
      roteiro = r
      await ativarLicenca(chaveDe('LOJA01'))
      expect(validarLicenca().valida).toBe(true)
    }
  })
})

// ── O que NÃO mudou para o varejo ───────────────────────────────────────────

describe('o resto da validação de licença segue como antes', () => {
  it('chave adulterada continua sendo recusada, sem falar com o servidor', async () => {
    const chave = chaveDe('LOJA01')
    const adulterada = chave.slice(0, -1) + (chave.endsWith('A') ? 'B' : 'A')
    const status = await ativarLicenca(adulterada)
    expect(status.valida).toBe(false)
    expect(status.motivo).toBeUndefined()
    expect(pedidos).toHaveLength(0)
  })

  it('chave vencida continua falando de VALIDADE, não de máquina', async () => {
    const status = await ativarLicenca(chaveDe('LOJA01', -1))
    expect(status.valida).toBe(false)
    expect(status.motivo).toBeUndefined()
    expect(status.mensagem).toMatch(/expirada/i)
  })

  it('sem licença nenhuma, a mensagem continua sendo a de sempre', () => {
    const status = validarLicenca()
    expect(status.valida).toBe(false)
    expect(status.mensagem).toMatch(/Nenhuma licença encontrada/)
  })

  it('em produção o endereço continua sendo o do Fly', async () => {
    // A variável de ambiente é conveniência de desenvolvimento. Se ela virasse
    // o caminho normal, um esquecimento apontaria loja de cliente para outro
    // servidor.
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync(
      join(__dirname, '../../../../packages/core/src/electron/licenca.ts'),
      'utf8'
    )
    // O nome do app no Fly NAO se escreve aqui: ele carrega o nome de um cliente
    // antigo, e ha guarda que prende a lista de arquivos onde ele ainda resta.
    expect(fonte).toMatch(/const URL_BACKEND = 'https:\/\/[a-z0-9-]+\.fly\.dev'/)
    expect(fonte).toMatch(/process\.env\.FHVP_BACKEND_URL/)
    expect(fonte).toMatch(/\|\| URL_BACKEND/)
  })
})
