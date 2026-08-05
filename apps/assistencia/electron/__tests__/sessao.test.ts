/**
 * Sessão por máquina (`electron/sessao.ts`).
 *
 * Este arquivo existe por causa de um bug que ainda não aconteceu: quando o
 * segundo caixa entrar em cena, as duas máquinas vão falar com o MESMO processo
 * — o do PC da loja. Com uma sessão só, o login do notebook substituiria o de
 * quem está no caixa, e como `vendas:criar` atribui a venda ao vendedor da
 * sessão, a venda sairia no nome errado.
 *
 * Os testes abaixo são a prova de que isso não acontece. O caso central é
 * "duas origens, dois vendedores".
 *
 * O módulo de vendedores é substituído por um dublê porque o de verdade carrega
 * o better-sqlite3, que é addon nativo compilado pro Electron e não sobe no
 * runtime dos testes — mesma limitação anotada em backup/__tests__/migrations.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { despachar, limparCanais, ORIGEM_LOCAL, registrarCanal } from '@fhvptech/core/electron/roteador'

const vendedores = new Map<number, { id: number; nome: string; papel: string; ativo: number }>()

vi.mock('../db/queries/vendedores', () => ({
  obterVendedor: (id: number) => vendedores.get(id) ?? undefined
}))

const {
  definirSessao,
  ehDono,
  limparSessao,
  limparSessaoDaOrigem,
  obterSessao,
  obterSessaoId,
  requerDono,
  requerSessao
} = await import('../sessao')

const TERMINAL = 'terminal-caixa-2'

/** Roda uma função como se fosse um despacho vindo daquela origem. */
function como<T>(origem: string, acao: () => T): T {
  limparCanais()
  registrarCanal('teste:acao', acao as never)
  return despachar('teste:acao', [], { origem }) as T
}

beforeEach(() => {
  vendedores.clear()
  vendedores.set(1, { id: 1, nome: 'Gerente', papel: 'dono', ativo: 1 })
  vendedores.set(2, { id: 2, nome: 'Vendedor A', papel: 'vendedor', ativo: 1 })
  vendedores.set(3, { id: 3, nome: 'Vendedor B', papel: 'vendedor', ativo: 1 })
  // Zera as sessões das três origens usadas nos testes.
  limparSessaoDaOrigem(ORIGEM_LOCAL)
  limparSessaoDaOrigem(TERMINAL)
  limparCanais()
})

describe('sessão em uma máquina só', () => {
  it('guarda e devolve o vendedor logado', () => {
    definirSessao(2)

    expect(obterSessaoId()).toBe(2)
    expect(obterSessao()?.nome).toBe('Vendedor A')
  })

  it('não tem sessão antes do login', () => {
    expect(obterSessaoId()).toBeNull()
    expect(obterSessao()).toBeNull()
  })

  it('esquece o vendedor no logout', () => {
    definirSessao(2)
    limparSessao()

    expect(obterSessao()).toBeNull()
  })

  it('invalida a sessão de quem foi desativado', () => {
    definirSessao(2)
    vendedores.set(2, { id: 2, nome: 'Vendedor A', papel: 'vendedor', ativo: 0 })

    expect(obterSessao()).toBeNull()
    expect(obterSessaoId()).toBeNull()
  })

  it('trata como local o que roda fora de qualquer despacho', () => {
    // Backup automático e timers chamam fora de despacho. Precisam enxergar a
    // sessão da própria máquina, como sempre enxergaram.
    definirSessao(1)

    expect(como(ORIGEM_LOCAL, () => obterSessaoId())).toBe(1)
  })
})

describe('duas máquinas ao mesmo tempo', () => {
  // O teste que justifica o arquivo inteiro.
  it('não deixa o login do terminal derrubar o do PC', () => {
    como(ORIGEM_LOCAL, () => definirSessao(2))
    como(TERMINAL, () => definirSessao(3))

    expect(como(ORIGEM_LOCAL, () => obterSessao()?.nome)).toBe('Vendedor A')
    expect(como(TERMINAL, () => obterSessao()?.nome)).toBe('Vendedor B')
  })

  it('atribui a venda ao vendedor da máquina que vendeu', () => {
    como(ORIGEM_LOCAL, () => definirSessao(2))
    como(TERMINAL, () => definirSessao(3))

    // Espelha o que `vendas:criar` faz: vendedor_id vem de requerSessao().
    expect(como(ORIGEM_LOCAL, () => requerSessao().id)).toBe(2)
    expect(como(TERMINAL, () => requerSessao().id)).toBe(3)
  })

  it('desloga só quem pediu logout', () => {
    como(ORIGEM_LOCAL, () => definirSessao(2))
    como(TERMINAL, () => definirSessao(3))

    como(TERMINAL, () => limparSessao())

    expect(como(TERMINAL, () => obterSessao())).toBeNull()
    expect(como(ORIGEM_LOCAL, () => obterSessao()?.nome)).toBe('Vendedor A')
  })

  it('derruba o terminal revogado sem tocar no PC', () => {
    como(ORIGEM_LOCAL, () => definirSessao(2))
    como(TERMINAL, () => definirSessao(3))

    limparSessaoDaOrigem(TERMINAL)

    expect(como(TERMINAL, () => obterSessao())).toBeNull()
    expect(como(ORIGEM_LOCAL, () => obterSessao()?.nome)).toBe('Vendedor A')
  })

  it('invalida só a sessão da origem quando o vendedor é desativado', () => {
    como(ORIGEM_LOCAL, () => definirSessao(2))
    como(TERMINAL, () => definirSessao(3))
    vendedores.set(3, { id: 3, nome: 'Vendedor B', papel: 'vendedor', ativo: 0 })

    expect(como(TERMINAL, () => obterSessao())).toBeNull()
    expect(como(ORIGEM_LOCAL, () => obterSessao()?.nome)).toBe('Vendedor A')
  })
})

describe('permissão por origem', () => {
  it('deixa o gerente passar e barra o vendedor, cada um na sua máquina', () => {
    como(ORIGEM_LOCAL, () => definirSessao(1))
    como(TERMINAL, () => definirSessao(3))

    expect(como(ORIGEM_LOCAL, () => ehDono())).toBe(true)
    expect(como(TERMINAL, () => ehDono())).toBe(false)

    expect(() => como(ORIGEM_LOCAL, () => requerDono())).not.toThrow()
    expect(() => como(TERMINAL, () => requerDono())).toThrow(/permissão do gerente/)
  })

  it('exige login em máquina que nunca logou', () => {
    como(ORIGEM_LOCAL, () => definirSessao(1))

    // O gerente logado no PC não dá acesso a um terminal que ninguém abriu.
    expect(() => como(TERMINAL, () => requerSessao())).toThrow(/Sessão não autenticada/)
    expect(() => como(TERMINAL, () => requerDono())).toThrow(/Sessão não autenticada/)
  })
})
