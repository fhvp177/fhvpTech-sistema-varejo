import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  pedirRespostaFiscal, exigirEmissaoFiscal, TEMPO_RESPOSTA_FISCAL_MS
} from '@fhvptech/core/electron/fiscal/respostaFiscal'

const url = new URL('https://fiscal.invalid/fiscal/nfce')
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
function responder(corpo: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(corpo), { status })))
}

describe('a resposta fiscal nunca confunde recusa com processamento', () => {
  it.each([200, 429])('cota recusada em HTTP %i mostra o motivo e é recusa definitiva', async status => {
    responder({ erro: 'Cota de 100 notas atingida.', cota: { podeEmitir: false } }, status)
    await expect(pedirRespostaFiscal(url, {})).rejects.toMatchObject({ message: 'Cota de 100 notas atingida.', recusada: true })
  })
  it('HTTP 429 do limite do provedor também chega como erro', async () => {
    responder({ erro: 'Limite de consultas atingido.', codigo: 'limite' }, 429)
    await expect(pedirRespostaFiscal(url, {})).rejects.toMatchObject({ message: 'Limite de consultas atingido.' })
  })
  it('o aviso de falha na consulta não some atrás do estado pendente', async () => {
    responder({ ok: true, emissao: { status: 'pendente' }, avisoConsulta: { erro: 'Créditos insuficientes.' } })
    await expect(pedirRespostaFiscal(url, {})).rejects.toThrow('Créditos insuficientes.')
  })
  it.each([{}, { ok: true }, { emissao: null }, { emissao: {} }])('não inventa pendente para resposta incompleta: %j', corpo => {
    expect(() => exigirEmissaoFiscal(corpo)).toThrow('não confirmou')
  })
  it('preserva a autorização e seus metadados', async () => {
    const emissao = { status: 'autorizado', numero: 123, acbr_id: 'id-ficticio', chave: 'chave-ficticia' }
    responder({ ok: true, emissao })
    expect(exigirEmissaoFiscal(await pedirRespostaFiscal(url, {}))).toEqual(emissao)
  })
  it('erro interno do servidor não autoriza tentar outra emissão', async () => {
    responder({ erro: 'Falha interna.' }, 500)
    await expect(pedirRespostaFiscal(url, {})).rejects.toMatchObject({ recusada: false })
  })
  it('limita a espera inclusive quando o corpo da resposta fica travado', async () => {
    vi.useFakeTimers()
    let sinal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url, opcoes: RequestInit) => {
      sinal = opcoes.signal!
      return Promise.resolve({
        ok: true, status: 200,
        text: () => new Promise((_, reject) => {
          sinal!.addEventListener('abort', () => reject(new Error('abortado')), { once: true })
        })
      })
    }))
    const resultado = expect(pedirRespostaFiscal(url, { method: 'POST' })).rejects.toMatchObject({
      message: expect.stringContaining('demorou'), recusada: false
    })
    await vi.advanceTimersByTimeAsync(TEMPO_RESPOSTA_FISCAL_MS)
    await resultado
    expect(sinal?.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('rede indisponível não é prova de emissão recusada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('falha de conexão')))
    await expect(pedirRespostaFiscal(url, {})).rejects.toMatchObject({ recusada: false })
  })
})
