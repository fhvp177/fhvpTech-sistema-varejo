/**
 * Bloqueio de suspensão do PC que serve o segundo caixa.
 *
 * O que se testa aqui é a higiene do liga-desliga, e não o Windows: bloqueio
 * pendurado significa PC de lojista que nunca mais dorme, e bloqueio solto
 * significa segundo caixa caindo sozinho no meio do expediente.
 */
import { describe, expect, it } from 'vitest'
import { Despertador, type BloqueadorDeSono } from '@fhvptech/core/electron/multicaixa/despertador'

/** Dublê do powerSaveBlocker do Electron, com a mesma semântica de ids. */
function bloqueadorFalso(): BloqueadorDeSono & { ativos: () => number[]; tipos: string[] } {
  const ligados = new Map<number, boolean>()
  const tipos: string[] = []
  let proximo = 1
  return {
    start(tipo) {
      tipos.push(tipo)
      const id = proximo++
      ligados.set(id, true)
      return id
    },
    stop(id) {
      ligados.set(id, false)
    },
    isStarted: (id) => ligados.get(id) === true,
    ativos: () => [...ligados.entries()].filter(([, v]) => v).map(([k]) => k),
    tipos
  }
}

describe('despertador', () => {
  it('nasce desligado', () => {
    const bloqueador = bloqueadorFalso()

    expect(new Despertador(bloqueador).ativo()).toBe(false)
    expect(bloqueador.ativos()).toEqual([])
  })

  it('deixa a tela apagar, só impede o sono do sistema', () => {
    const bloqueador = bloqueadorFalso()

    new Despertador(bloqueador).ligar()

    // 'prevent-display-sleep' manteria o monitor aceso a noite toda à toa.
    expect(bloqueador.tipos).toEqual(['prevent-app-suspension'])
  })

  it('não acumula bloqueio ao ligar duas vezes', () => {
    const bloqueador = bloqueadorFalso()
    const despertador = new Despertador(bloqueador)

    despertador.ligar()
    despertador.ligar()
    despertador.ligar()

    // Bloqueio pendurado nunca é liberado: o PC não dormiria nem depois de
    // desligar o multi-caixa.
    expect(bloqueador.ativos()).toHaveLength(1)
  })

  it('libera o sistema ao desligar', () => {
    const bloqueador = bloqueadorFalso()
    const despertador = new Despertador(bloqueador)

    despertador.ligar()
    despertador.desligar()

    expect(despertador.ativo()).toBe(false)
    expect(bloqueador.ativos()).toEqual([])
  })

  it('aguenta desligar sem ter ligado', () => {
    const despertador = new Despertador(bloqueadorFalso())

    expect(() => despertador.desligar()).not.toThrow()
  })

  it('volta a bloquear depois de um ciclo completo', () => {
    const bloqueador = bloqueadorFalso()
    const despertador = new Despertador(bloqueador)

    despertador.ligar()
    despertador.desligar()
    despertador.ligar()

    expect(despertador.ativo()).toBe(true)
    expect(bloqueador.ativos()).toHaveLength(1)
  })
})
