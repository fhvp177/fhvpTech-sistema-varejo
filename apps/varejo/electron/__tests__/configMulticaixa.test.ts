/**
 * Configuração do multi-caixa (`@fhvptech/core/electron/multicaixa/configLogica`).
 *
 * Este arquivo é lido no boot, antes de qualquer outra coisa subir — é ele que
 * decide se o app abre o banco de dados. Daí o foco dos testes não ser o
 * caminho feliz, e sim os defeituosos: **nada aqui pode impedir o caixa de
 * abrir**. Um caixa que não abre é muito pior que um caixa sem multi-caixa.
 *
 * Roda contra arquivos REAIS em pasta temporária, e não contra dublês de disco,
 * porque metade do que se quer provar é comportamento de sistema de arquivos:
 * arquivo pela metade, gravação interrompida, arquivo preservado ao lado.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CONFIG_PADRAO,
  gravarConfigEm,
  lerConfigDe,
  normalizarConfig,
  PORTA_PADRAO,
  type ConfigMulticaixa
} from '@fhvptech/core/electron/multicaixa/configLogica'

let pasta: string
let arquivo: string

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'multicaixa-'))
  arquivo = join(pasta, 'multicaixa.json')
})

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true })
})

const TERMINAL = {
  id: 'terminal-1',
  nome: 'Notebook do balcão',
  tokenHash: 'a'.repeat(64),
  chaveSigilo: 'b'.repeat(64),
  criadoEm: '2026-07-28T12:00:00.000Z',
  ultimoAcessoEm: null
}

describe('o que acontece quando não existe config', () => {
  it('devolve o padrão: modo normal, sem terminal', () => {
    expect(lerConfigDe(arquivo)).toEqual(CONFIG_PADRAO)
    expect(CONFIG_PADRAO.modo).toBe('normal')
  })

  it('não cria arquivo só por ter sido lido', () => {
    lerConfigDe(arquivo)

    // Instalação que nunca ligou multi-caixa não deve ganhar arquivo nenhum.
    expect(existsSync(arquivo)).toBe(false)
  })
})

describe('ida e volta', () => {
  it('grava e lê de volta igual', () => {
    const config: ConfigMulticaixa = {
      modo: 'servidor',
      porta: 4877,
      terminais: [TERMINAL],
      servidor: null
    }

    gravarConfigEm(arquivo, config)

    expect(lerConfigDe(arquivo)).toEqual(config)
  })

  it('grava o modo terminal com o endereço do PC', () => {
    const config: ConfigMulticaixa = {
      modo: 'terminal',
      porta: PORTA_PADRAO,
      terminais: [],
      servidor: { url: 'http://192.168.0.10:4877', token: 'token-cru' }
    }

    gravarConfigEm(arquivo, config)

    expect(lerConfigDe(arquivo)).toEqual(config)
  })

  it('deixa o arquivo legível por humano', () => {
    // Suporte por telefone às vezes precisa pedir pro lojista abrir isso.
    gravarConfigEm(arquivo, { ...CONFIG_PADRAO, modo: 'servidor' })

    expect(readFileSync(arquivo, 'utf8')).toContain('\n  "modo": "servidor"')
  })
})

describe('arquivo defeituoso não pode derrubar o boot', () => {
  it('sobrevive a JSON pela metade', () => {
    writeFileSync(arquivo, '{ "modo": "servi', 'utf8')

    expect(lerConfigDe(arquivo)).toEqual(CONFIG_PADRAO)
  })

  it('sobrevive a arquivo vazio', () => {
    writeFileSync(arquivo, '', 'utf8')

    expect(lerConfigDe(arquivo)).toEqual(CONFIG_PADRAO)
  })

  it('sobrevive a conteúdo que não é objeto', () => {
    writeFileSync(arquivo, '"apenas um texto"', 'utf8')

    expect(lerConfigDe(arquivo)).toEqual(CONFIG_PADRAO)
  })

  it('preserva o arquivo corrompido ao lado em vez de perder', () => {
    writeFileSync(arquivo, '{ quebrado', 'utf8')

    lerConfigDe(arquivo)

    // Sem isso, a próxima gravação apagaria a lista de terminais pareados e
    // ninguém saberia dizer o que havia lá.
    expect(existsSync(`${arquivo}.invalido`)).toBe(true)
    expect(readFileSync(`${arquivo}.invalido`, 'utf8')).toBe('{ quebrado')
  })

  it('não acumula sobras de corrompido', () => {
    writeFileSync(`${arquivo}.invalido`, 'sobra antiga', 'utf8')
    writeFileSync(arquivo, '{ quebrado de novo', 'utf8')

    lerConfigDe(arquivo)

    expect(readFileSync(`${arquivo}.invalido`, 'utf8')).toBe('{ quebrado de novo')
  })
})

describe('campos estragados viram padrão', () => {
  it('modo desconhecido vira normal', () => {
    expect(normalizarConfig({ modo: 'servidorzinho' }).modo).toBe('normal')
  })

  it('porta fora da faixa volta ao padrão', () => {
    // Abaixo de 1024 o Windows exige privilégio; acima de 65535 não existe.
    expect(normalizarConfig({ porta: 80 }).porta).toBe(PORTA_PADRAO)
    expect(normalizarConfig({ porta: 99999 }).porta).toBe(PORTA_PADRAO)
    expect(normalizarConfig({ porta: 'muitas' }).porta).toBe(PORTA_PADRAO)
    expect(normalizarConfig({ porta: 4877 }).porta).toBe(4877)
  })

  it('descarta terminal sem id ou sem hash', () => {
    const config = normalizarConfig({
      modo: 'servidor',
      terminais: [TERMINAL, { nome: 'sem id' }, { id: 'sem-hash' }, 'lixo', null]
    })

    expect(config.terminais).toEqual([TERMINAL])
  })

  it('usa o id como nome quando o nome está em branco', () => {
    const config = normalizarConfig({
      modo: 'servidor',
      terminais: [{ ...TERMINAL, nome: '   ' }]
    })

    expect(config.terminais[0].nome).toBe('terminal-1')
  })

  it('terminais que não são lista viram lista vazia', () => {
    expect(normalizarConfig({ terminais: 'nenhum' }).terminais).toEqual([])
  })

  it('modo terminal sem endereço cai para normal', () => {
    // Sem para onde falar ele não opera. Cair para normal deixa o app abrir e o
    // lojista refazer o pareamento, em vez de travar numa tela de erro.
    expect(normalizarConfig({ modo: 'terminal', servidor: null }).modo).toBe('normal')
    expect(normalizarConfig({ modo: 'terminal', servidor: { url: '' , token: 'x' } }).modo).toBe(
      'normal'
    )
    expect(
      normalizarConfig({ modo: 'terminal', servidor: { url: 'http://x', token: '' } }).modo
    ).toBe('normal')
  })
})

describe('gravação não deixa arquivo pela metade', () => {
  it('não deixa temporário para trás', () => {
    gravarConfigEm(arquivo, { ...CONFIG_PADRAO, modo: 'servidor' })

    expect(existsSync(`${arquivo}.tmp`)).toBe(false)
  })

  it('mantém a config anterior íntegra ao regravar', () => {
    gravarConfigEm(arquivo, { ...CONFIG_PADRAO, modo: 'servidor', terminais: [TERMINAL] })
    gravarConfigEm(arquivo, { ...CONFIG_PADRAO, modo: 'normal' })

    const lida = lerConfigDe(arquivo)
    expect(lida.modo).toBe('normal')
    expect(lida.terminais).toEqual([])
  })

  it('não grava sujeira que chegou de fora', () => {
    gravarConfigEm(arquivo, {
      modo: 'servidor',
      porta: 70000,
      terminais: [
        TERMINAL,
        { id: '', nome: 'x', tokenHash: '', chaveSigilo: '', criadoEm: '', ultimoAcessoEm: null }
      ],
      servidor: null
    })

    const lida = lerConfigDe(arquivo)
    expect(lida.porta).toBe(PORTA_PADRAO)
    expect(lida.terminais).toEqual([TERMINAL])
  })
})

describe('o token do terminal', () => {
  it('guarda hash no PC, nunca o token cru', () => {
    gravarConfigEm(arquivo, { ...CONFIG_PADRAO, modo: 'servidor', terminais: [TERMINAL] })

    const cru = readFileSync(arquivo, 'utf8')
    expect(cru).toContain('tokenHash')
    // Quem vazar o arquivo do PC não consegue se passar por um terminal.
    expect(cru).not.toContain('"token"')
  })
})
