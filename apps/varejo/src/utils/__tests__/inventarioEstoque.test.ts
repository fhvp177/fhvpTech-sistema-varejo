import { describe, it, expect } from 'vitest'
import { calcularInventario, SEM_CATEGORIA, type ProdutoInventario } from '../inventarioEstoque'

/*
 * O inventário é um número que o lojista vai olhar e acreditar. Os testes aqui
 * prendem exatamente as decisões que fazem esse número ser o certo, e não um
 * total parecido: custo separado de venda, estoque negativo neutralizado,
 * produto sem custo contado à parte, e a ordem da lista de categorias.
 */

const prod = (
  categoria: string | null,
  preco: number,
  custo: number,
  estoque: number
): ProdutoInventario => ({ categoria, preco, custo, estoque })

describe('calcularInventario — os dois valores da prateleira', () => {
  it('custo e venda são somas diferentes, cada uma pelo seu preço', () => {
    const inv = calcularInventario([
      prod('Calçados', 100, 40, 3), // 300 a venda, 120 a custo
      prod('Calçados', 50, 20, 2) //  100 a venda,  40 a custo
    ])
    expect(inv.custo_total).toBe(160)
    expect(inv.venda_total).toBe(400)
    expect(inv.lucro_previsto).toBe(240)
    expect(inv.unidades).toBe(5)
  })

  it('margem é sobre a venda, não sobre o custo', () => {
    // 100 de venda com 60 de custo é 40% de margem, não 66%.
    const inv = calcularInventario([prod('A', 100, 60, 1)])
    expect(inv.margem).toBeCloseTo(0.4, 10)
  })

  it('loja sem nada em estoque não divide por zero', () => {
    const inv = calcularInventario([prod('A', 100, 60, 0)])
    expect(inv.margem).toBe(0)
    expect(inv.venda_total).toBe(0)
    expect(inv.por_categoria[0].participacao).toBe(0)
  })

  it('lista vazia devolve tudo zerado, sem categoria nenhuma', () => {
    const inv = calcularInventario([])
    expect(inv.produtos).toBe(0)
    expect(inv.custo_total).toBe(0)
    expect(inv.por_categoria).toEqual([])
  })
})

describe('calcularInventario — o que não pode encolher o total', () => {
  it('estoque negativo entra como zero e não desconta da loja', () => {
    /*
     * Um único produto com estoque negativo não pode fazer o inventário mostrar
     * menos dinheiro do que há na prateleira. Sem a trava, este caso daria
     * 200 − 500 = −300 em "Roupas" e derrubaria o total da loja junto.
     */
    const inv = calcularInventario([
      prod('Roupas', 100, 50, 4), // 200 a custo
      prod('Roupas', 100, 50, -10) // seria −500 a custo
    ])
    expect(inv.custo_total).toBe(200)
    expect(inv.unidades).toBe(4)
    expect(inv.por_categoria[0].custo_total).toBe(200)
  })

  it('produto com estoque e sem custo é contado para a tela poder avisar', () => {
    const inv = calcularInventario([
      prod('A', 100, 0, 5), // sem custo cadastrado
      prod('A', 100, 30, 5)
    ])
    expect(inv.sem_custo).toBe(1)
    // O total continua honesto com o que se sabe: só os 150 do que tem custo.
    expect(inv.custo_total).toBe(150)
  })

  it('produto sem estoque não conta como "sem custo"', () => {
    // Produto descontinuado e sem custo não deixa o inventário incompleto:
    // ele não está na prateleira. Avisar sobre ele seria alarme falso eterno.
    const inv = calcularInventario([prod('A', 100, 0, 0)])
    expect(inv.sem_custo).toBe(0)
    expect(inv.produtos_sem_estoque).toBe(1)
    expect(inv.produtos_com_estoque).toBe(0)
  })
})

describe('calcularInventario — o dinheiro em cada categoria', () => {
  it('soma por categoria e ordena pelo dinheiro parado', () => {
    const inv = calcularInventario([
      prod('Bijuteria', 20, 5, 10), //  50
      prod('Eletrônicos', 500, 300, 4), // 1200
      prod('Papelaria', 10, 4, 25) // 100
    ])
    expect(inv.por_categoria.map((c) => c.categoria)).toEqual([
      'Eletrônicos',
      'Papelaria',
      'Bijuteria'
    ])
    expect(inv.por_categoria[0].custo_total).toBe(1200)
    expect(inv.por_categoria[0].participacao).toBeCloseTo(1200 / 1350, 10)
  })

  it('categoria vazia e nula caem no mesmo balde, e ele vai para o fim', () => {
    /*
     * "Sem categoria" no topo pareceria a linha mais importante do estoque, e
     * ela não é uma categoria: é a falta de uma. Aqui ela pesa MAIS que todas e
     * mesmo assim fica por último.
     */
    const inv = calcularInventario([
      prod(null, 100, 90, 10), // 900, o maior de todos
      prod('   ', 100, 10, 1), // mesma linha do nulo
      prod('Roupas', 100, 50, 2) // 100
    ])
    const nomes = inv.por_categoria.map((c) => c.categoria)
    expect(nomes).toEqual(['Roupas', SEM_CATEGORIA])

    const semCategoria = inv.por_categoria[1]
    expect(semCategoria.produtos).toBe(2)
    expect(semCategoria.custo_total).toBe(910)
  })

  it('a soma das categorias bate com o total da loja', () => {
    // É o que o lojista confere de olho: se as linhas não somam o total, ele
    // para de confiar no painel inteiro.
    const produtos = [
      prod('A', 33.33, 11.11, 3),
      prod('B', 19.9, 7.45, 7),
      prod(null, 5.55, 2.22, 9),
      prod('A', 100, 66.67, 1)
    ]
    const inv = calcularInventario(produtos)
    const somaCusto = inv.por_categoria.reduce((s, c) => s + c.custo_total, 0)
    const somaVenda = inv.por_categoria.reduce((s, c) => s + c.venda_total, 0)
    expect(+somaCusto.toFixed(2)).toBe(inv.custo_total)
    expect(+somaVenda.toFixed(2)).toBe(inv.venda_total)
    expect(inv.por_categoria.reduce((s, c) => s + c.unidades, 0)).toBe(inv.unidades)
  })

  it('as participações somam 1 quando há dinheiro em estoque', () => {
    const inv = calcularInventario([
      prod('A', 10, 5, 10),
      prod('B', 10, 3, 10),
      prod('C', 10, 2, 10)
    ])
    const soma = inv.por_categoria.reduce((s, c) => s + c.participacao, 0)
    expect(soma).toBeCloseTo(1, 10)
  })
})
