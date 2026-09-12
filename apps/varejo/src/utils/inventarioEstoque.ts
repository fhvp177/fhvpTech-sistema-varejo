/**
 * O inventário: quanto dinheiro está parado na prateleira, e onde.
 *
 * ── A pergunta que isto responde ────────────────────────────────────────────
 * A tela de Produtos sempre soube dizer o que a loja vende. Não sabia dizer
 * quanto isso vale junto. O lojista tem dinheiro comprado parado em estoque e
 * até agora só descobria o total mandando imprimir o balanço.
 *
 * ── ⚠️ São DOIS valores, e confundir os dois é caro ─────────────────────────
 * O valor A CUSTO é o dinheiro que já saiu do bolso e está preso na prateleira.
 * É o número de "quanto tenho investido em mercadoria".
 *
 * O valor A VENDA é quanto essa mesma prateleira vira se tudo for vendido pelo
 * preço de tabela. É expectativa, não é caixa, e some inteiro numa promoção.
 *
 * Mostrar só o segundo faria a loja parecer duas ou três vezes mais rica do que
 * é. Por isso o painel mostra os dois lado a lado, com o custo em primeiro.
 *
 * ── Produto de grade ────────────────────────────────────────────────────────
 * Não precisa de tratamento aqui: `listarProdutos` já devolve o produto de
 * grade com `estoque` igual à soma dos tamanhos. Preço e custo são sempre do
 * produto, nunca do tamanho.
 *
 * ── ⚠️ Custo zero é omissão, não é produto de graça ─────────────────────────
 * Quem cadastrou produto sem informar o custo tem esses itens entrando no
 * inventário valendo zero, e o total fica menor do que a realidade. O cálculo
 * conta quantos são justamente para a tela poder avisar. Silenciar isso daria
 * um número errado com cara de exato.
 */

/** O mínimo que o cálculo precisa saber de um produto. */
export type ProdutoInventario = {
  categoria: string | null
  preco: number
  custo: number
  /** Simples: o do próprio produto. Grade: a soma dos tamanhos. */
  estoque: number
}

export type LinhaCategoriaInventario = {
  categoria: string
  produtos: number
  unidades: number
  custo_total: number
  venda_total: number
  /** Fatia do custo total da loja, de 0 a 1. É o tamanho da barra na tela. */
  participacao: number
}

export type Inventario = {
  produtos: number
  produtos_com_estoque: number
  produtos_sem_estoque: number
  unidades: number
  custo_total: number
  venda_total: number
  /** venda_total − custo_total: o que a prateleira rende se vender tudo. */
  lucro_previsto: number
  /** Margem sobre a venda, de 0 a 1. Zero quando não há o que vender. */
  margem: number
  /** Produtos COM estoque e SEM custo cadastrado — o total está subestimado. */
  sem_custo: number
  por_categoria: LinhaCategoriaInventario[]
}

const arred = (v: number): number => +v.toFixed(2)

/** Nome da categoria como aparece na tela. Vazia e nula caem no mesmo balde. */
export const SEM_CATEGORIA = 'Sem categoria'

function nomeCategoria(c: string | null): string {
  const limpo = (c ?? '').trim()
  return limpo === '' ? SEM_CATEGORIA : limpo
}

export function calcularInventario(produtos: ProdutoInventario[]): Inventario {
  const porCategoria = new Map<string, LinhaCategoriaInventario>()

  let unidades = 0
  let custoTotal = 0
  let vendaTotal = 0
  let comEstoque = 0
  let semCusto = 0

  for (const p of produtos) {
    /*
     * ⚠️ Estoque negativo entra como zero. Ele não deveria existir, mas quando
     * aparece (venda lançada de item que já tinha saído) o valor negativo
     * DESCONTARIA do total da loja, e o inventário passaria a mostrar menos
     * dinheiro do que há na prateleira por causa de um produto só.
     */
    const estoque = Math.max(0, Number(p.estoque) || 0)
    const custo = Math.max(0, Number(p.custo) || 0)
    const preco = Math.max(0, Number(p.preco) || 0)

    if (estoque > 0) {
      comEstoque += 1
      if (custo === 0) semCusto += 1
    }

    const custoLinha = estoque * custo
    const vendaLinha = estoque * preco

    unidades += estoque
    custoTotal += custoLinha
    vendaTotal += vendaLinha

    const nome = nomeCategoria(p.categoria)
    let linha = porCategoria.get(nome)
    if (!linha) {
      linha = {
        categoria: nome,
        produtos: 0,
        unidades: 0,
        custo_total: 0,
        venda_total: 0,
        participacao: 0
      }
      porCategoria.set(nome, linha)
    }
    linha.produtos += 1
    linha.unidades += estoque
    linha.custo_total += custoLinha
    linha.venda_total += vendaLinha
  }

  custoTotal = arred(custoTotal)
  vendaTotal = arred(vendaTotal)

  const linhas = [...porCategoria.values()]
  for (const l of linhas) {
    l.custo_total = arred(l.custo_total)
    l.venda_total = arred(l.venda_total)
    l.participacao = custoTotal > 0 ? l.custo_total / custoTotal : 0
  }

  /*
   * Ordena pelo dinheiro parado, do maior para o menor: a pergunta é "onde está
   * meu dinheiro", e a resposta tem que estar na primeira linha. Empate cai no
   * nome, para a lista não dançar entre duas aberturas da tela.
   *
   * "Sem categoria" vai para o fim mesmo pesando muito. Não é uma categoria da
   * loja, é a ausência de uma, e no topo pareceria a linha mais importante do
   * estoque.
   */
  linhas.sort((a, b) => {
    if (a.categoria === SEM_CATEGORIA) return 1
    if (b.categoria === SEM_CATEGORIA) return -1
    if (b.custo_total !== a.custo_total) return b.custo_total - a.custo_total
    return a.categoria.localeCompare(b.categoria, 'pt-BR')
  })

  return {
    produtos: produtos.length,
    produtos_com_estoque: comEstoque,
    produtos_sem_estoque: produtos.length - comEstoque,
    unidades,
    custo_total: custoTotal,
    venda_total: vendaTotal,
    lucro_previsto: arred(vendaTotal - custoTotal),
    margem: vendaTotal > 0 ? (vendaTotal - custoTotal) / vendaTotal : 0,
    sem_custo: semCusto,
    por_categoria: linhas
  }
}
