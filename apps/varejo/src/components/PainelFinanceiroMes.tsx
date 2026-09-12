import { FC, useEffect, useMemo, useState } from 'react'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Landmark,
  FileDown,
  Printer,
  Tag,
  Info
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Skeleton } from '@fhvptech/core/ui/skeleton'
import MesPicker from '@/components/MesPicker'
import { useImprimir } from '@/components/ImpressaoProvider'
import { gerarHtmlResumoMensal, rotuloMesFinanceiro } from '@/utils/relatorioFinanceiro'

/**
 * O mês do dinheiro na tela, antes de virar papel.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Relatórios financeiros como histórico, em vez de obrigar o usuário a
 * exportar para ter acesso aos dados. Ele escolhe o mês e o ano e vê na tela
 * tudo o que entraria no relatório exportado: receitas, despesas, saldo final,
 * receitas por período e despesas por categoria."
 *
 * ── ⚠️ Por que existe a linha "dinheiro que mudou de lugar" ─────────────────
 * Porque sem ela a conta não fecha, e um painel de dinheiro que não fecha é
 * pior que painel nenhum: o lojista soma os três números na calculadora, acha
 * outro, e passa a desconfiar de tudo o que a tela diz.
 *
 * Sangria e suprimento não são receita nem despesa — é a mesma nota saindo da
 * gaveta e indo para o cofre. Mas elas mexem no saldo, então precisam aparecer
 * em algum lugar entre o saldo de abertura e o de fechamento.
 *
 * ── O gráfico é desenhado à mão, e isso é escolha ───────────────────────────
 * Trinta e uma colunas num celular de 360px não cabem numa biblioteca de
 * gráficos com eixo, legenda e tooltip. São divs: receita para cima, despesa
 * para baixo, a partir da mesma linha do meio. Cada coluna tem `title`, então o
 * valor do dia aparece ao parar o mouse em cima no computador.
 */

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Com sinal explícito, para "menos" nunca virar um traço perdido na tela. */
const fmtSinal = (v: number): string => `${v < 0 ? '−' : ''}${fmt(Math.abs(v))}`

const diaDoMes = (iso: string): number => Number(iso.slice(8, 10))

const mesAtualLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type Acao = 'pdf' | 'imprimir'

const Tile: FC<{
  icone: React.ReactNode
  rotulo: string
  valor: string
  detalhe?: string
  cor?: 'bom' | 'ruim' | 'neutro'
  carregando: boolean
}> = ({ icone, rotulo, valor, detalhe, cor = 'neutro', carregando }) => (
  <div className="rounded-lg border bg-background p-3">
    <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
      <span className="shrink-0">{icone}</span>
      <span className="text-[11.5px] uppercase tracking-wide">{rotulo}</span>
    </div>
    {carregando ? (
      <Skeleton className="h-6 w-24" />
    ) : (
      <p
        className={`num text-[19px] font-bold leading-tight break-words ${
          cor === 'bom' ? 'text-emerald-600 dark:text-emerald-400' : cor === 'ruim' ? 'text-critical' : ''
        }`}
      >
        {valor}
      </p>
    )}
    {detalhe && !carregando && (
      <p className="mt-0.5 text-[11.5px] leading-tight text-muted-foreground">{detalhe}</p>
    )}
  </div>
)

const PainelFinanceiroMes: FC = () => {
  const imprimirDoc = useImprimir()
  const [mes, setMes] = useState(mesAtualLocal())
  const [dados, setDados] = useState<ResumoFinanceiroMes | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState(false)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setErro('')
    window.api.financeiro
      .resumoMensal(mes)
      .then((r) => {
        if (!ativo) return
        if (r.success) setDados(r.data)
        else {
          setDados(null)
          setErro(r.error)
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [mes])

  const maiorBarra = useMemo(() => {
    if (!dados) return 1
    return Math.max(
      1,
      ...dados.por_dia.map((d) => Math.max(d.receitas, d.despesas))
    )
  }, [dados])

  const maiorCategoria = useMemo(() => {
    if (!dados) return 1
    return Math.max(1, ...dados.despesas_por_categoria.map((c) => c.total))
  }, [dados])

  const gerar = async (acao: Acao) => {
    if (!dados) return
    setGerando(true)
    setErro('')
    try {
      const html = gerarHtmlResumoMensal(dados)
      const nome = `Resumo financeiro ${rotuloMesFinanceiro(dados.mes)}`
      if (acao === 'imprimir') {
        await imprimirDoc(html, nome, 'documento')
        return
      }
      const r = await window.api.impressao.salvarPdf(html, nome)
      if (!r.success) setErro(r.error)
    } finally {
      setGerando(false)
    }
  }

  const vazio = !!dados && dados.lancamentos === 0

  return (
    <section className="mb-8 rounded-xl border bg-card p-4 lg:p-5">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <Wallet className="h-5 w-5 shrink-0 text-primary" />
        <h3 className="font-semibold">Resumo financeiro do mês</h3>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <MesPicker value={mes} onChange={setMes} maxMes={mesAtualLocal()} align="right" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => gerar('pdf')}
            disabled={!dados || gerando}
            title="Salvar este mesmo resumo em PDF"
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => gerar('imprimir')}
            disabled={!dados || gerando}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir
          </Button>
        </div>
      </header>

      <p className="-mt-2 mb-4 text-sm text-muted-foreground">
        Tudo o que sairia no relatório de {rotuloMesFinanceiro(mes).toLowerCase()}, aqui na tela.
        Baixar é opcional.
      </p>

      {erro && <p className="mb-3 text-sm text-destructive">{erro}</p>}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        <Tile
          icone={<TrendingUp className="h-4 w-4" />}
          rotulo="Receitas"
          valor={fmt(dados?.receitas ?? 0)}
          detalhe="tudo o que entrou"
          cor="bom"
          carregando={carregando}
        />
        <Tile
          icone={<TrendingDown className="h-4 w-4" />}
          rotulo="Despesas"
          valor={fmt(dados?.despesas ?? 0)}
          detalhe="tudo o que saiu"
          cor="ruim"
          carregando={carregando}
        />
        <Tile
          icone={<Wallet className="h-4 w-4" />}
          rotulo="Resultado"
          valor={fmtSinal(dados?.resultado ?? 0)}
          detalhe="receitas menos despesas"
          cor={(dados?.resultado ?? 0) < 0 ? 'ruim' : 'bom'}
          carregando={carregando}
        />
        <Tile
          icone={<Landmark className="h-4 w-4" />}
          rotulo="Saldo no fim do mês"
          valor={fmtSinal(dados?.saldo_final ?? 0)}
          detalhe="somando todas as contas"
          carregando={carregando}
        />
      </div>

      {/*
        A conta que fecha. Ela existe para o lojista poder conferir na mão e
        chegar no mesmo número — é o que faz o painel merecer confiança.
      */}
      {dados && (
        <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5 text-[12.5px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">Saldo no começo do mês</span>
            <span className="num font-medium">{fmtSinal(dados.saldo_inicial)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">Receitas menos despesas</span>
            <span className="num font-medium">{fmtSinal(dados.resultado)}</span>
          </div>
          {dados.movimentacoes_internas !== 0 && (
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1 text-muted-foreground">
                Dinheiro que mudou de lugar
                <span
                  title="Sangria e suprimento: dinheiro saindo da gaveta para o cofre, ou voltando. Não é venda nem gasto, mas mexe no saldo."
                  className="inline-flex"
                >
                  <Info className="h-3 w-3" />
                </span>
              </span>
              <span className="num font-medium">{fmtSinal(dados.movimentacoes_internas)}</span>
            </div>
          )}
          <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t pt-1.5">
            <span className="font-medium">Saldo no fim do mês</span>
            <span className="num font-bold">{fmtSinal(dados.saldo_final)}</span>
          </div>
        </div>
      )}

      {vazio && (
        <p className="mt-4 rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Nenhum lançamento no livro-caixa em {rotuloMesFinanceiro(mes).toLowerCase()}. O saldo
          acima é o dinheiro que já estava parado nas contas.
        </p>
      )}

      {dados && !vazio && (
        <>
          {/* ── Receitas e despesas dia a dia ─────────────────────────────── */}
          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">Receitas por período</h4>
              <div className="flex items-center gap-3 text-[11.5px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-primary" /> entrou
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-critical-fill" /> saiu
                </span>
              </div>
            </div>

            <div className="flex items-stretch gap-px overflow-hidden rounded-md border bg-background px-1 py-2">
              {dados.por_dia.map((d) => {
                const alturaRec = Math.round((d.receitas / maiorBarra) * 100)
                const alturaDesp = Math.round((d.despesas / maiorBarra) * 100)
                const dia = diaDoMes(d.dia)
                return (
                  <div
                    key={d.dia}
                    className="group flex min-w-0 flex-1 flex-col"
                    title={`Dia ${dia}: entrou ${fmt(d.receitas)}, saiu ${fmt(d.despesas)}`}
                  >
                    <div className="flex h-12 items-end">
                      <div
                        className="w-full rounded-t-[2px] bg-primary transition-[height]"
                        style={{ height: `${alturaRec}%` }}
                      />
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex h-12 items-start">
                      <div
                        className="w-full rounded-b-[2px] bg-critical-fill transition-[height]"
                        style={{ height: `${alturaDesp}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            {/*
              Um rótulo a cada cinco dias. Trinta e um números embaixo de trinta
              e uma colunas de 9px viram uma mancha cinza ilegível no celular.
            */}
            <div className="mt-1 flex gap-px px-1 text-[10px] text-muted-foreground">
              {dados.por_dia.map((d) => {
                const dia = diaDoMes(d.dia)
                return (
                  <div key={d.dia} className="min-w-0 flex-1 text-center">
                    {dia === 1 || dia % 5 === 0 ? dia : ''}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Despesas por categoria ────────────────────────────────────── */}
          <div className="mt-5">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Tag className="h-4 w-4 text-muted-foreground" />
              Despesas por categoria
            </h4>
            {dados.despesas_por_categoria.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
                Nenhuma despesa lançada neste mês.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {dados.despesas_por_categoria.map((c) => (
                  <li key={c.categoria}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium" title={c.categoria}>
                        {c.categoria}
                      </span>
                      <span className="num shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                        {fmt(c.total)} · {c.lancamentos} lançamento(s)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-critical-fill"
                        style={{ width: `${Math.round((c.total / maiorCategoria) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              A categoria é a que você escreve ao cadastrar a conta na aba{' '}
              <strong>Contas a Pagar</strong>. “Outras saídas” é o dinheiro que saiu sem passar
              por uma conta cadastrada.
            </p>
          </div>

          {/* ── Onde está o dinheiro ──────────────────────────────────────── */}
          <div className="mt-5">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Landmark className="h-4 w-4 text-muted-foreground" />
              Onde está o dinheiro
            </h4>
            {/*
              ⚠️ `overflow-x-auto` no contêiner, nunca `overflow-hidden`: com a
              tabela amputada some justamente a última coluna, que é o saldo.
            */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Conta</th>
                    <th className="px-3 py-2 text-right font-medium">Entrou</th>
                    <th className="px-3 py-2 text-right font-medium">Saiu</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo no fim</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.por_conta.map((c) => (
                    <tr key={c.conta_id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <span className="block truncate" title={c.nome}>
                          {c.nome}
                        </span>
                      </td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap">
                        {c.entradas === 0 ? '—' : fmt(c.entradas)}
                      </td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap">
                        {c.saidas === 0 ? '—' : fmt(c.saidas)}
                      </td>
                      <td className="num px-3 py-2 text-right font-medium whitespace-nowrap">
                        {fmtSinal(c.saldo_final)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

export default PainelFinanceiroMes
