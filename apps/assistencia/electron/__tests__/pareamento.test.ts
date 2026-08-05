/**
 * Pareamento de terminal novo.
 *
 * É a única etapa do multi-caixa protegida por um segredo curto — 6 dígitos,
 * porque quem digita é gente. Um milhão de combinações é muito para uma pessoa
 * e pouquíssimo para um computador na mesma rede. Então o que se testa aqui não
 * é o caminho feliz: é o cerco que torna a força bruta inviável.
 *
 * O teste que mais importa é `queima o código depois de 5 erros`. Sem ele, um
 * atacante na rede da loja tem um milhão de chances; com ele, tem cinco.
 */
import { describe, expect, it } from 'vitest'
import {
  JanelaPareamento,
  MAXIMO_TENTATIVAS,
  VALIDADE_CODIGO_MS,
  type ResultadoPareamento
} from '@fhvptech/core/electron/multicaixa/pareamento'
import { hashDeToken, tokenConfere } from '@fhvptech/core/electron/multicaixa/tokens'

/** Motivo da recusa, ou `null` se o pareamento deu certo. */
function motivo(resultado: ResultadoPareamento): string | null {
  return resultado.ok ? null : resultado.motivo
}

/** Relógio controlado — testar expiração esperando 5 minutos seria absurdo. */
function comRelogio(): { janela: JanelaPareamento; avancar: (ms: number) => void } {
  let agora = 1_000_000
  const janela = new JanelaPareamento(() => agora)
  return { janela, avancar: (ms) => void (agora += ms) }
}

describe('a porta fica fechada por padrão', () => {
  it('não tem código antes de o lojista pedir', () => {
    const { janela } = comRelogio()

    expect(janela.ativo()).toBeNull()
    expect(janela.tentar('123456')).toEqual({ ok: false, motivo: 'sem-codigo' })
  })

  it('fecha quando o lojista cancela', () => {
    const { janela } = comRelogio()
    const { codigo } = janela.abrir()

    janela.fechar()

    // Nem o código certo entra depois de fechada.
    expect(janela.tentar(codigo)).toEqual({ ok: false, motivo: 'sem-codigo' })
  })
})

describe('o código', () => {
  it('tem 6 dígitos', () => {
    const { janela } = comRelogio()

    expect(janela.abrir().codigo).toMatch(/^\d{6}$/)
  })

  it('preserva zeros à esquerda', () => {
    // Tratar o código como número comeria o zero e o lojista digitaria 5
    // dígitos achando que errou.
    const { janela } = comRelogio()
    const codigos = Array.from({ length: 200 }, () => janela.abrir().codigo)

    expect(codigos.every((c) => c.length === 6)).toBe(true)
  })

  it('muda a cada abertura', () => {
    const { janela } = comRelogio()
    const codigos = new Set(Array.from({ length: 50 }, () => janela.abrir().codigo))

    // Sorteio criptográfico; repetir 50 vezes seguidas seria bug gritante.
    expect(codigos.size).toBeGreaterThan(40)
  })

  it('invalida o anterior quando um novo é gerado', () => {
    const { janela } = comRelogio()
    const antigo = janela.abrir().codigo

    janela.abrir()

    // Dois códigos válidos ao mesmo tempo dobrariam a superfície à toa.
    expect(janela.tentar(antigo).ok).toBe(false)
  })
})

describe('o cerco em volta do código curto', () => {
  it('queima o código depois de 5 erros', () => {
    const { janela } = comRelogio()
    const { codigo } = janela.abrir()

    for (let i = 1; i < MAXIMO_TENTATIVAS; i++) {
      expect(motivo(janela.tentar('000000'))).toBe('codigo-errado')
    }
    expect(motivo(janela.tentar('000000'))).toBe('codigo-expirado')

    // Mesmo acertando agora, não entra: o código deixou de existir. É isso que
    // transforma "um milhão de chances" em "cinco chances".
    expect(janela.tentar(codigo)).toEqual({ ok: false, motivo: 'sem-codigo' })
    expect(janela.ativo()).toBeNull()
  })

  it('expira em 5 minutos', () => {
    const { janela, avancar } = comRelogio()
    const { codigo } = janela.abrir()

    avancar(VALIDADE_CODIGO_MS - 1)
    expect(janela.ativo()).not.toBeNull()

    avancar(2)
    expect(janela.ativo()).toBeNull()
    expect(janela.tentar(codigo)).toEqual({ ok: false, motivo: 'sem-codigo' })
  })

  it('serve uma vez só', () => {
    const { janela } = comRelogio()
    const { codigo } = janela.abrir()

    expect(janela.tentar(codigo).ok).toBe(true)
    // Um segundo aparelho com o mesmo código não entra.
    expect(janela.tentar(codigo)).toEqual({ ok: false, motivo: 'sem-codigo' })
  })

  it('não aceita código de tamanho errado nem lixo', () => {
    const { janela } = comRelogio()
    janela.abrir()

    for (const tentativa of ['', '12345', '1234567', 'abcdef', '  ']) {
      expect(janela.tentar(tentativa).ok).toBe(false)
    }
  })
})

describe('a credencial entregue', () => {
  it('nasce com token grande e resumo que confere', () => {
    const { janela } = comRelogio()
    const { codigo } = janela.abrir()

    const resultado = janela.tentar(codigo)

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    const { credencial } = resultado
    expect(credencial.token).toHaveLength(64)
    expect(credencial.tokenHash).toBe(hashDeToken(credencial.token))
    expect(tokenConfere(credencial.token, credencial.tokenHash)).toBe(true)
    expect(credencial.id).toMatch(/^terminal-/)
  })

  it('dá token diferente para cada terminal', () => {
    const { janela } = comRelogio()

    const primeiro = janela.tentar(janela.abrir().codigo)
    const segundo = janela.tentar(janela.abrir().codigo)

    expect(primeiro.ok && segundo.ok).toBe(true)
    if (!primeiro.ok || !segundo.ok) return
    expect(primeiro.credencial.token).not.toBe(segundo.credencial.token)
    expect(primeiro.credencial.id).not.toBe(segundo.credencial.id)
  })
})
