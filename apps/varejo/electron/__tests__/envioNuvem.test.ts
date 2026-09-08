/**
 * O backup do aplicativo instalado subindo para a nuvem.
 *
 * ── ★ O que estes testes seguram, e por que ─────────────────────────────────
 * Este é um recurso que roda sozinho, no fundo, na máquina do cliente. Quando
 * ele erra, ninguém vê: o backup simplesmente não está lá no dia em que for
 * preciso. Por isso o que se testa aqui não é o caminho feliz — é o
 * comportamento nos dias ruins.
 *
 *   • LOJA SEM O RECURSO NÃO É CASTIGADA. Toda loja instalada hoje está nesse
 *     estado. Se o 403 do servidor não encerrasse o ciclo, seriam catorze idas
 *     de rede a cada meia hora, para sempre, para receber a mesma recusa.
 *   • O QUE FALHOU CONTINUA NA FILA. A fila é derivada do que já subiu, e não
 *     uma lista de tarefas — um envio interrompido volta sozinho.
 *   • O MAIS ANTIGO SOBE PRIMEIRO. É contraintuitivo, e é o que impede o
 *     arquivo atrasado de ser eternamente ultrapassado pelo backup de hoje.
 *   • NADA DISSO LANÇA. Quem chama é um temporizador do Electron, e exceção
 *     não capturada ali derruba o processo — fecharia o sistema da loja por
 *     causa de um backup.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  nomeAceitavel,
  pendentes,
  registrarEnviado,
  MAXIMO_LEMBRADOS,
  type ArquivoLocal
} from '@fhvptech/core/electron/backup/envioNuvemLogica'

const arq = (nome: string, quandoMs: number, tamanhoBytes = 1000): ArquivoLocal => ({
  nome,
  caminho: `/x/${nome}`,
  tamanhoBytes,
  quandoMs
})

describe('a fila de envio', () => {
  it('★ o mais ANTIGO sobe primeiro', () => {
    /*
     * O instinto manda subir o mais recente, que é o mais valioso. Mas quem
     * está atrás na fila é justamente quem teve um envio interrompido — e
     * inverter a ordem faria esse arquivo ser ultrapassado toda vez que um
     * backup novo aparecesse, sem nunca subir.
     */
    const fila = pendentes(
      [arq('c.zip', 300), arq('a.zip', 100), arq('b.zip', 200)],
      [],
      10
    )
    expect(fila.map((f) => f.nome)).toEqual(['a.zip', 'b.zip', 'c.zip'])
  })

  it('★ o que já subiu não sobe de novo', () => {
    const fila = pendentes([arq('a.zip', 100), arq('b.zip', 200)], ['a.zip'], 10)
    expect(fila.map((f) => f.nome)).toEqual(['b.zip'])
  })

  it('★ a primeira vez não manda tudo de uma vez', () => {
    /*
     * A loja que liga o recurso hoje tem catorze zips guardados. Subir todos de
     * uma vez ocuparia a internet dela numa tarde de movimento — e ela chega no
     * mesmo lugar em alguns ciclos, sem ninguém perceber a subida.
     */
    const locais = Array.from({ length: 14 }, (_, i) => arq(`b${i}.zip`, i))
    expect(pendentes(locais, []).length).toBe(3)
  })

  it('nome estranho não entra na fila', () => {
    // A mesma regra do servidor. Conferir aqui evita gastar uma ida de rede
    // para receber um 400 sem contexto.
    expect(nomeAceitavel('backup-2026-09-08.zip')).toBe(true)
    expect(nomeAceitavel('../outro/backup.zip')).toBe(false)
    expect(nomeAceitavel('backup.exe')).toBe(false)
    expect(pendentes([arq('../x.zip', 1)], []).length).toBe(0)
  })

  it('a memória do que subiu tem teto, e corta pelos mais antigos', () => {
    /*
     * Esquecer um nome ANTIGO custa um reenvio, uma vez. Esquecer um recente
     * custaria o mesmo reenvio toda semana, para sempre.
     */
    let lista: string[] = []
    for (let i = 0; i < MAXIMO_LEMBRADOS + 10; i++) lista = registrarEnviado(lista, `b${i}.zip`)
    expect(lista.length).toBe(MAXIMO_LEMBRADOS)
    expect(lista).not.toContain('b0.zip')
    expect(lista).toContain(`b${MAXIMO_LEMBRADOS + 9}.zip`)
  })

  it('registrar duas vezes não duplica', () => {
    const lista = registrarEnviado(registrarEnviado([], 'a.zip'), 'a.zip')
    expect(lista).toEqual(['a.zip'])
  })
})

describe('o ciclo de envio', () => {
  let pasta = ''

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'fhvp-nuvem-'))
  })
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    rmSync(pasta, { recursive: true, force: true })
  })

  /** Carrega o módulo com a licença simulada — sem isso ele não sai do lugar. */
  async function comLicenca(chave: string | null) {
    vi.resetModules()
    vi.doMock('@fhvptech/core/electron/licenca', () => ({
      chaveLicencaLocal: () => chave
    }))
    return await import('@fhvptech/core/electron/backup/EnvioNuvem')
  }

  /*
   * O zip mora numa SUBPASTA por tipo (`diarios`, `manuais`, `pre-update`),
   * que é como o BackupManager guarda — e a varredura precisa saber disso.
   */
  const zip = (nome: string, quandoS = 1_700_000_000, sub = 'diarios'): string => {
    mkdirSync(join(pasta, sub), { recursive: true })
    const caminho = join(pasta, sub, nome)
    writeFileSync(caminho, 'conteudo-de-teste')
    utimesSync(caminho, quandoS, quandoS)
    return caminho
  }

  it('sem licença, não tenta nada', async () => {
    const { executarCicloNuvem } = await comLicenca(null)
    const buscar = vi.fn()
    const r = await executarCicloNuvem({
      pastaBackups: pasta,
      urlBackend: 'http://x',
      buscar: buscar as unknown as typeof fetch
    })
    expect(r.motivo).toBe('sem-licenca')
    expect(buscar, 'foi à rede sem ter licença').not.toHaveBeenCalled()
  })

  it('★ 403 encerra o ciclo, e não pula para o próximo arquivo', async () => {
    /*
     * O estado de TODA loja que não contratou. Sem esta parada, cada zip
     * guardado viraria uma ida de rede a cada meia hora para ouvir o mesmo não.
     */
    zip('backup-1.zip', 1_700_000_100)
    zip('backup-2.zip', 1_700_000_200)
    const { executarCicloNuvem } = await comLicenca('LOJA:2027-01-01:abc')
    const buscar = vi.fn(async () => new Response('', { status: 403 }))
    const r = await executarCicloNuvem({
      pastaBackups: pasta,
      urlBackend: 'http://x',
      buscar: buscar as unknown as typeof fetch
    })
    expect(r.motivo).toBe('sem-recurso')
    expect(r.enviados).toBe(0)
    expect(buscar, 'insistiu depois da recusa').toHaveBeenCalledTimes(1)
  })

  it('★ envia, anota, e não reenvia no ciclo seguinte', async () => {
    zip('backup-1.zip')
    // Um automatico ao lado: ele NÃO pode subir. São dezenas por dia, e
    // existem para desfazer um erro de digitação agora, não para o disco que
    // queimou.
    zip('backup-2.zip', 1_700_000_000, 'automaticos')
    const { executarCicloNuvem } = await comLicenca('LOJA:2027-01-01:abc')
    const buscar = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/backup/enviar-url')
        ? new Response(JSON.stringify({ url: 'https://r2.exemplo/objeto' }), { status: 200 })
        : new Response('', { status: 200 })
    )
    const dep = {
      pastaBackups: pasta,
      urlBackend: 'http://x',
      buscar: buscar as unknown as typeof fetch
    }
    expect((await executarCicloNuvem(dep)).enviados).toBe(1)

    const segundo = await executarCicloNuvem(dep)
    expect(segundo.enviados, 'mandou o mesmo arquivo duas vezes').toBe(0)
    expect(segundo.motivo).toBe('sem-pendentes')
  })

  it('★ envio que falha CONTINUA na fila', async () => {
    /*
     * O ponto da fila derivada: nada é riscado da lista antes de subir de
     * verdade. Um envio interrompido volta sozinho no ciclo seguinte.
     */
    zip('backup-1.zip')
    const { executarCicloNuvem } = await comLicenca('LOJA:2027-01-01:abc')
    let falhar = true
    const buscar = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/backup/enviar-url')) {
        return new Response(JSON.stringify({ url: 'https://r2.exemplo/objeto' }), { status: 200 })
      }
      return new Response('', { status: falhar ? 500 : 200 })
    })
    const dep = {
      pastaBackups: pasta,
      urlBackend: 'http://x',
      buscar: buscar as unknown as typeof fetch
    }
    expect((await executarCicloNuvem(dep)).enviados).toBe(0)

    falhar = false
    expect((await executarCicloNuvem(dep)).enviados, 'o arquivo sumiu da fila').toBe(1)
  })

  it('★ rede caída não lança — devolve o motivo', async () => {
    /*
     * Quem chama é um temporizador do Electron. Exceção não capturada ali
     * derruba o processo: o sistema da loja fecharia por causa de um backup.
     */
    zip('backup-1.zip')
    const { executarCicloNuvem } = await comLicenca('LOJA:2027-01-01:abc')
    const buscar = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    })
    const r = await executarCicloNuvem({
      pastaBackups: pasta,
      urlBackend: 'http://x',
      buscar: buscar as unknown as typeof fetch
    })
    expect(r.motivo).toBe('sem-rede')
    expect(r.enviados).toBe(0)
  })
})
