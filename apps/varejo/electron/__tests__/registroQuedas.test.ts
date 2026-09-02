/**
 * Diário de quedas de conexão.
 *
 * Duas propriedades importam mais que o caminho feliz:
 * 1. **Nunca lança.** É diagnóstico; se atrapalhar a venda, é pior que não
 *    existir.
 * 2. **Não duplica.** Uma rede instável dispara vários avisos de queda seguidos;
 *    se cada um virasse registro, o diário mostraria 40 quedas onde houve uma.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  anotarQueda,
  anotarVolta,
  MAXIMO_REGISTROS,
  resumirQuedas
} from '@fhvptech/core/electron/multicaixa/registroQuedas'

let pasta: string
let arquivo: string

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'quedas-'))
  arquivo = join(pasta, 'quedas.json')
})

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true })
})

const T = (minuto: number): string => `2026-07-28T10:${String(minuto).padStart(2, '0')}:00.000Z`

describe('registro', () => {
  it('começa vazio', () => {
    expect(resumirQuedas(arquivo)).toEqual({
      total: 0,
      ultimaQueda: null,
      tempoForaMs: 0,
      foraDoArAgora: false
    })
  })

  it('anota queda e volta, com o tempo fora', () => {
    anotarQueda(arquivo, T(10))
    anotarVolta(arquivo, T(13))

    const resumo = resumirQuedas(arquivo)
    expect(resumo.total).toBe(1)
    expect(resumo.ultimaQueda).toBe(T(10))
    expect(resumo.tempoForaMs).toBe(3 * 60 * 1000)
    expect(resumo.foraDoArAgora).toBe(false)
  })

  it('soma várias quedas', () => {
    anotarQueda(arquivo, T(10))
    anotarVolta(arquivo, T(11))
    anotarQueda(arquivo, T(20))
    anotarVolta(arquivo, T(22))

    const resumo = resumirQuedas(arquivo)
    expect(resumo.total).toBe(2)
    expect(resumo.tempoForaMs).toBe(3 * 60 * 1000)
  })

  it('sabe quando ainda está fora do ar', () => {
    anotarQueda(arquivo, T(10))

    expect(resumirQuedas(arquivo).foraDoArAgora).toBe(true)
    // Queda aberta não entra na conta do tempo fora — ela ainda não acabou.
    expect(resumirQuedas(arquivo).tempoForaMs).toBe(0)
  })
})

describe('rede instável não polui o diário', () => {
  it('não duplica queda enquanto não voltou', () => {
    anotarQueda(arquivo, T(10))
    anotarQueda(arquivo, T(11))
    anotarQueda(arquivo, T(12))

    // Uma queda só, e a hora certa é a da PRIMEIRA — que é quando o caixa parou.
    expect(resumirQuedas(arquivo).total).toBe(1)
    expect(resumirQuedas(arquivo).ultimaQueda).toBe(T(10))
  })

  it('ignora volta sem queda anterior', () => {
    anotarVolta(arquivo, T(10))

    expect(resumirQuedas(arquivo).total).toBe(0)
  })

  it('ignora volta repetida', () => {
    anotarQueda(arquivo, T(10))
    anotarVolta(arquivo, T(11))
    anotarVolta(arquivo, T(15))

    expect(resumirQuedas(arquivo).tempoForaMs).toBe(60 * 1000)
  })

  // O tempo generoso não é folga: este é o único teste do arquivo que encosta
  // no disco 500 vezes, e cada anotação lê o diário inteiro, reescreve e faz o
  // rename atômico — mais de mil operações de sistema de arquivos sobre um JSON
  // de 200 entradas. Com a suíte inteira rodando em paralelo no Windows, e o
  // antivírus inspecionando cada arquivo temporário, isso passa dos cinco
  // segundos padrão sem que nada esteja errado.
  //
  // Encurtar o laço enfraqueceria o teste: é justamente ultrapassar o limite
  // que prova que o diário para de crescer.
  it('não cresce sem limite', () => {
    for (let i = 0; i < MAXIMO_REGISTROS + 50; i++) {
      anotarQueda(arquivo, T(0))
      anotarVolta(arquivo, T(1))
    }

    expect(resumirQuedas(arquivo).total).toBe(MAXIMO_REGISTROS)
  }, 60_000)
})

describe('arquivo estragado não atrapalha', () => {
  it('sobrevive a JSON quebrado', () => {
    writeFileSync(arquivo, '{ isto não é json', 'utf8')

    expect(() => resumirQuedas(arquivo)).not.toThrow()
    expect(resumirQuedas(arquivo).total).toBe(0)
  })

  it('recomeça o diário em cima do arquivo estragado', () => {
    writeFileSync(arquivo, 'lixo', 'utf8')

    anotarQueda(arquivo, T(10))

    expect(resumirQuedas(arquivo).total).toBe(1)
  })

  it('descarta entradas malformadas e mantém as boas', () => {
    writeFileSync(
      arquivo,
      JSON.stringify([{ caiuEm: T(10), voltouEm: T(11) }, { lixo: true }, null, 'texto']),
      'utf8'
    )

    expect(resumirQuedas(arquivo).total).toBe(1)
  })

  it('não lança ao gravar em caminho impossível', () => {
    const impossivel = join(pasta, 'nao', 'existe', 'quedas.json')

    // Diagnóstico falhando não pode derrubar a venda que está acontecendo.
    expect(() => anotarQueda(impossivel, T(10))).not.toThrow()
    expect(() => anotarVolta(impossivel, T(11))).not.toThrow()
  })

  it('não deixa temporário para trás', () => {
    anotarQueda(arquivo, T(10))

    expect(() => readFileSync(`${arquivo}.tmp`)).toThrow()
  })
})
