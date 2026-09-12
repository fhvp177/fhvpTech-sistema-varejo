import { FC, useMemo, useState } from 'react'
import { Boxes, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import {
  calcularInventario,
  type Inventario,
  type ProdutoInventario
} from '@/utils/inventarioEstoque'

/**
 * O inventário no alto da tela de Produtos.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Na aba de produtos, exibir mais informações: inventário de estoque, valor
 * total em estoque, número de itens em estoque" e "um canto que mostre o valor
 * em dinheiro que tem em cada categoria".
 *
 * ── ⚠️ Só o dono vê, e isso é escolha ───────────────────────────────────────
 * A tabela de produtos mostra preço e estoque para todo mundo, mas nunca mostrou
 * CUSTO. Este painel fala de custo, de lucro previsto e de quanto dinheiro a
 * loja tem parado em cada categoria: é a margem da loja em quatro números, na
 * tela que o vendedor abre o dia inteiro.
 *
 * É a mesma régua de Comissões e de Contas, que já são do dono. Ficou aqui
 * escrito para o próximo leitor não achar que foi esquecimento e "consertar".
 *
 * ── O cálculo não mora aqui ─────────────────────────────────────────────────
 * Ele está em `utils/inventarioEstoque`, sem React, com teste. Esta tela só
 * desenha — e, por isso, os números do painel são os mesmos da lista embaixo:
 * a fonte é a MESMA lista de produtos que a tela já carregou, não uma consulta
 * paralela que poderia responder outra coisa.
 */

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const inteiro = (v: number): string => v.toLocaleString('pt-BR')

const pct = (v: number): string => `${(v * 100).toFixed(1).replace('.', ',')}%`

const Bloco: FC<{
  rotulo: string
  valor: string
  detalhe: string
  destaque?: boolean
}> = ({ rotulo, valor, detalhe, destaque }) => (
  <div className={`rounded-lg px-3 py-2.5 ${destaque ? 'bg-primary/10' : 'bg-muted/50'}`}>
    <p className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
    {/*
      `break-words` e não `truncate`: um total de seis dígitos mais centavos é
      largo, e cortar o número deixaria "R$ 128.4…" na tela — pior que a linha
      quebrar. A coluna do celular tem 160px.
    */}
    <p className="num mt-0.5 text-[17px] font-bold leading-tight break-words">{valor}</p>
    <p className="mt-0.5 text-[11.5px] leading-tight text-muted-foreground">{detalhe}</p>
  </div>
)

const InventarioEstoque: FC<{ produtos: ProdutoInventario[] }> = ({ produtos }) => {
  const [categoriasAbertas, setCategoriasAbertas] = useState(false)

  // A lista de produtos muda pouco (só ao salvar ou excluir); recalcular a cada
  // tecla digitada na busca seria varrer a loja inteira por nada.
  const inv: Inventario = useMemo(() => calcularInventario(produtos), [produtos])

  if (produtos.length === 0) return null

  return (
    <section
      className="mb-3 rounded-xl border bg-card p-3 lg:mb-4 lg:p-4"
      aria-label="Inventário de estoque"
    >
      <header className="mb-3 flex items-center gap-2">
        <Boxes className="h-5 w-5 shrink-0 text-muted-foreground" />
        <h3 className="font-semibold">Inventário de estoque</h3>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {inteiro(inv.produtos)} produto(s) cadastrado(s)
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        <Bloco
          rotulo="Itens em estoque"
          valor={inteiro(inv.unidades)}
          detalhe={
            inv.produtos_sem_estoque > 0
              ? `${inteiro(inv.produtos_sem_estoque)} produto(s) zerado(s)`
              : 'nenhum produto zerado'
          }
        />
        {/*
          O custo vem antes do preço de venda de propósito: é o dinheiro que já
          saiu do bolso. O valor a venda é expectativa, e sozinho no topo faria a
          loja parecer duas vezes mais rica do que é.
        */}
        <Bloco
          rotulo="Valor a custo"
          valor={fmt(inv.custo_total)}
          detalhe="dinheiro parado na prateleira"
          destaque
        />
        <Bloco
          rotulo="Valor a preço de venda"
          valor={fmt(inv.venda_total)}
          detalhe="se vender tudo pela tabela"
        />
        <Bloco
          rotulo="Lucro previsto"
          valor={fmt(inv.lucro_previsto)}
          detalhe={`margem de ${pct(inv.margem)}`}
        />
      </div>

      {/*
        O aviso existe porque o número ficaria errado em silêncio: produto sem
        custo cadastrado entra valendo zero e encolhe o total, com cara de exato.
      */}
      {inv.sem_custo > 0 && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] text-warn">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {inteiro(inv.sem_custo)} produto(s) em estoque estão sem custo cadastrado. Eles entram
            valendo zero, então o valor a custo e o lucro previsto estão menores que a realidade.
          </span>
        </p>
      )}

      <button
        type="button"
        onClick={() => setCategoriasAbertas((a) => !a)}
        aria-expanded={categoriasAbertas}
        className="mt-3 flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-sm font-medium text-primary hover:underline"
      >
        {categoriasAbertas ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        Dinheiro parado em cada categoria
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {inteiro(inv.por_categoria.length)} categoria(s)
        </span>
      </button>

      {categoriasAbertas && (
        <ul className="mt-1 space-y-2.5 px-1 pb-1">
          {inv.por_categoria.map((c) => (
            <li key={c.categoria}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium" title={c.categoria}>
                  {c.categoria}
                </span>
                <span className="num shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {fmt(c.custo_total)} · {inteiro(c.unidades)} un
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(c.participacao * 1000) / 10}%` }}
                />
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {pct(c.participacao)} do estoque · {fmt(c.venda_total)} a preço de venda
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default InventarioEstoque
