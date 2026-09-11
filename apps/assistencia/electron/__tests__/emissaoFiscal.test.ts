import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type Database from 'better-sqlite3'
import { aplicar031FiscalNfce } from '../backup/migrations/031_fiscal_nfce'
import { aplicar035NotaModelo } from '../backup/migrations/035_nota_modelo'
import { aplicarAt001NfseServico } from '../backup/migrations/os/at_001_nfse_servico'
import { despachar, limparCanais } from '@fhvptech/core/electron/roteador'
import { TEMPO_RESPOSTA_FISCAL_MS } from '@fhvptech/core/electron/fiscal/respostaFiscal'

let banco: DatabaseSync
vi.mock('@fhvptech/core/electron/db/conexao', () => ({ obterBancoDeDados: () => banco }))
vi.mock('electron', () => ({ dialog: {} }))
vi.mock('../sessao', () => ({ requerDono: vi.fn(), requerSessao: vi.fn() }))
vi.mock('@fhvptech/core/electron/licenca', () => ({ extrairClienteIdLocal: () => 'LOJA-FICTICIA' }))
vi.mock('../backendUrl', () => ({ urlBackend: () => 'https://fiscal.invalid' }))
vi.mock('@fhvptech/core/electron/backup/configBackup', () => ({
  lerConfig: (chave: string) => ({
    fiscal_configurada: '1', fiscal_regime_tributario: '1', loja_uf: 'CE',
    fiscal_codigo_municipio: '2304400', fiscal_serie_nfce: '2'
  })[chave as 'fiscal_configurada'] || '',
  gravarConfig: vi.fn()
}))
vi.mock('../db/queries/fiscal', async importar => {
  const real = await importar<typeof import('../db/queries/fiscal')>()
  return {
    ...real,
    vendaParaNota: () => ({ id: 1, total: 40, desconto: 0, cancelada: 0, forma_pagamento: 'dinheiro',
      itens: [{ nome: 'Produto de teste', quantidade: 1, valor_unitario: 40, ncm: '12345678' }] }),
    vendaParaNotaServico: () => ({ id: 1, total: 40, desconto: 0, cancelada: 0, tomador: null,
      servicos: [{ nome: 'Serviço de teste', quantidade: 1, valor_unitario: 40, item_lista_servico: '14.01', aliquota_iss: 5 }] })
  }
})
const { registrarHandlersFiscal } = await import('../ipc/fiscal')
const fiscal = await import('../db/queries/fiscal')

type Resultado = { success: boolean; error?: string; data?: { nota?: { status: string }; jaEmitida?: boolean } }
const chamar = (canal: string) => despachar(canal, [{ vendaId: 1 }]) as Promise<Resultado>
function resposta(dados: unknown, status = 200) {
  return new Response(JSON.stringify(dados), { status })
}

beforeEach(() => {
  banco = new DatabaseSync(':memory:')
  // As tabelas fiscais e seus índices vêm das migrations REAIS. Apenas as
  // tabelas externas ao escopo usam um mínimo para satisfazer suas referências.
  banco.exec(`CREATE TABLE produtos (id INTEGER PRIMARY KEY);
    CREATE TABLE vendas (id INTEGER PRIMARY KEY, total REAL, valor_pago REAL);
    INSERT INTO vendas VALUES (1, 40, 40);
    CREATE TABLE _migrations (nome TEXT PRIMARY KEY);`)
  const adapter = {
    exec: (sql: string) => banco.exec(sql), prepare: (sql: string) => banco.prepare(sql),
    transaction: (fn: () => void) => () => {
      banco.exec('BEGIN'); try { fn(); banco.exec('COMMIT') } catch (e) { banco.exec('ROLLBACK'); throw e }
    }
  } as unknown as Database.Database
  aplicar031FiscalNfce(adapter)
  aplicar035NotaModelo(adapter)
  aplicarAt001NfseServico(adapter)
  limparCanais()
  registrarHandlersFiscal()
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); limparCanais(); banco.close() })

for (const tipo of ['Nfce', 'Nfse'] as const) {
  const tabela = tipo === 'Nfce' ? 'nfce_emitidas' : 'nfse_emitidas'
  const pendente = tipo === 'Nfce' ? 'pendente' : 'processando'
  const autorizado = tipo === 'Nfce' ? 'autorizado' : 'autorizada'
  const obter = () => tipo === 'Nfce' ? fiscal.notaDaVenda(1) : fiscal.notaServicoDaVenda(1)
  describe(`emissão ${tipo}: cota, silêncio e recuperação`, () => {
    it('recusa de cota vira erro visível e não fica processando', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({ erro: 'Cota mensal atingida.', cota: { podeEmitir: false } }, 429)))
      const r = await chamar(`fiscal:emitir${tipo}`)
      expect(r).toMatchObject({ success: false, error: 'Cota mensal atingida.' })
      expect(obter()).toMatchObject({ status: 'erro', numero: 0, motivo: 'Cota mensal atingida.' })
      expect(banco.prepare('SELECT total, valor_pago FROM vendas WHERE id = 1').get()).toEqual({ total: 40, valor_pago: 40 })
    })
    it('depois da recusa, a tentativa autorizada grava número e mantém um único documento vigente', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(resposta({ erro: 'Cota atingida.', cota: { podeEmitir: false } }, 429))
        .mockResolvedValueOnce(resposta({ ok: true, emissao: { status: autorizado, numero: 123, serie: 2, acbr_id: 'ficticio' } })))
      await chamar(`fiscal:emitir${tipo}`)
      expect(await chamar(`fiscal:emitir${tipo}`)).toMatchObject({ success: true })
      expect(obter()).toMatchObject({ status: autorizado, numero: 123, acbr_id: 'ficticio', tentativa: 2 })
      expect(banco.prepare(`SELECT COUNT(*) n FROM ${tabela}`).get()).toMatchObject({ n: 2 })
    })
    it('clique concorrente não envia duas notas enquanto o servidor responde', async () => {
      let responder!: (r: Response) => void
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(resolve => { responder = resolve })))
      const primeira = chamar(`fiscal:emitir${tipo}`)
      expect(obter()?.status).toBe(pendente)
      expect(await chamar(`fiscal:emitir${tipo}`)).toMatchObject({ success: true, data: { jaEmitida: true } })
      expect(fetch).toHaveBeenCalledTimes(1)
      responder(resposta({ ok: true, emissao: { status: autorizado, numero: 124, acbr_id: 'ficticio' } }))
      expect(await primeira).toMatchObject({ success: true })
    })
    it('silêncio não permite nova emissão e a consulta recupera o número confirmado', async () => {
      vi.useFakeTimers()
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opcoes: RequestInit) => new Promise((_, reject) => {
        opcoes.signal!.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
      })))
      const emissao = chamar(`fiscal:emitir${tipo}`)
      await vi.advanceTimersByTimeAsync(TEMPO_RESPOSTA_FISCAL_MS)
      expect(await emissao).toMatchObject({ success: false, error: expect.stringContaining('demorou') })
      expect(obter()?.status).toBe(pendente)
      // Simula a próxima sessão: os handlers são registrados novamente, mas o
      // SQLite continua com a tentativa que foi gravada ANTES da rede.
      limparCanais(); registrarHandlersFiscal()
      expect(await chamar(`fiscal:emitir${tipo}`)).toMatchObject({ success: true, data: { jaEmitida: true } })
      expect(fetch).toHaveBeenCalledTimes(1)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({ ok: true, emissao: { status: autorizado, numero: 125, serie: 2, acbr_id: 'recuperado', chave: 'codigo-ficticio' } })))
      expect(await chamar(`fiscal:status${tipo}`)).toMatchObject({ success: true })
      expect(obter()).toMatchObject({ status: autorizado, numero: 125, acbr_id: 'recuperado' })
      expect(banco.prepare(`SELECT COUNT(*) n FROM ${tabela}`).get()).toMatchObject({ n: 1 })
    })
    it('aviso de consulta chega à tela e preserva a tentativa para não duplicar', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(resposta({ ok: true, emissao: { status: pendente, numero: 126, acbr_id: 'ficticio' } }))
        .mockResolvedValueOnce(resposta({ ok: true, emissao: { status: pendente }, avisoConsulta: { erro: 'Limite de consultas atingido.' } })))
      await chamar(`fiscal:emitir${tipo}`)
      expect(await chamar(`fiscal:status${tipo}`)).toMatchObject({ success: false, error: 'Limite de consultas atingido.' })
      expect(obter()?.status).toBe(pendente)
    })

    /*
     * O par de testes abaixo guarda a saída do beco sem saída.
     *
     * A reserva local é gravada ANTES da rede para não emitir duas vezes. O
     * preço disso é que a venda fica travada enquanto a reserva existir. A
     * ÚNICA coisa que a libera é o backend dizer 404, ou seja, "não tenho
     * registro desta referência" — e como ele é o único caminho até a SEFAZ e
     * até a prefeitura, isso prova que nada foi emitido.
     */
    it('queda de internet não condena a venda: consulta sem registro devolve o direito de emitir', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
      expect(await chamar(`fiscal:emitir${tipo}`)).toMatchObject({ success: false })
      expect(obter()?.status).toBe(pendente)
      // Enquanto a reserva existe, emitir de novo é recusado. É o que evita duplicar.
      expect(await chamar(`fiscal:emitir${tipo}`)).toMatchObject({ success: true, data: { jaEmitida: true } })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({ erro: 'emissão não encontrada' }, 404)))
      expect(await chamar(`fiscal:status${tipo}`)).toMatchObject({ success: true })
      expect(obter()).toMatchObject({ status: 'erro', motivo: expect.stringContaining('não chegou a ser emitida') })

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({ ok: true, emissao: { status: autorizado, numero: 127, serie: 2, acbr_id: 'ficticio' } })))
      expect(await chamar(`fiscal:emitir${tipo}`)).toMatchObject({ success: true })
      expect(obter()).toMatchObject({ status: autorizado, numero: 127, tentativa: 2 })
    })

    it('servidor fora do ar NÃO libera a reserva: ali a nota pode ter saído', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
      await chamar(`fiscal:emitir${tipo}`)
      expect(obter()?.status).toBe(pendente)

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({ erro: 'Servidor indisponível.' }, 503)))
      expect(await chamar(`fiscal:status${tipo}`)).toMatchObject({ success: false })
      expect(obter()?.status).toBe(pendente)
      expect(await chamar(`fiscal:emitir${tipo}`)).toMatchObject({ success: true, data: { jaEmitida: true } })
    })
  })
}
