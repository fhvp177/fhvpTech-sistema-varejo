import { FC, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Clock, TrendingUp, TrendingDown, Users, Package,
  ShoppingBag, Receipt, BarChart3, Award, CreditCard, Tag, Wallet, AlertCircle,
  ArrowLeftRight, Target, Trophy, CalendarDays, PiggyBank, Gift, Pencil, Check, X
} from 'lucide-react'
import FiltroMesPopover from '@/components/FiltroMesPopover'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import DividasClienteDialog, {
  calcularDividasPorCliente,
  type VendaDivida
} from '@/components/DividasClienteDialog'
import DashboardSkeleton from '@/components/DashboardSkeleton'
import ReceberPagamentoDialog from '@/components/ReceberPagamentoDialog'
import { Skeleton } from '@fhvptech/core/ui/skeleton'

type ClienteInadimplente = {
  id: number
  nome: string
  telefone: string
  total_devido: number
  vencimento_mais_antigo: string
}

type ClienteVencendoHoje = {
  id: number
  nome: string
  telefone: string
  total: number
  data_vencimento: string
}

type ResumoBasico = {
  vendas_hoje: number
  total_hoje: number
  total_clientes: number
  total_produtos: number
}

type PeriodoOpcao = { dias: number; rotulo: string; rotuloCurto: string }

const PERIODOS: PeriodoOpcao[] = [
  { dias: 7, rotulo: 'Últimos 7 dias', rotuloCurto: '7 dias' },
  { dias: 30, rotulo: 'Últimos 30 dias', rotuloCurto: '30 dias' },
  { dias: 90, rotulo: 'Últimos 90 dias', rotuloCurto: '90 dias' },
  { dias: 365, rotulo: 'Últimos 12 meses', rotuloCurto: '12 meses' }
]

type Modo = 'janela' | 'mes'

type Intervalo = {
  inicio_atual: string
  fim_atual: string
  inicio_anterior: string
  fim_anterior: string
}

const MESES_NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

const isoLocal = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

const hojeIso = (): string => isoLocal(new Date())

const subtrairDias = (iso: string, dias: number): string => {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - dias)
  return isoLocal(d)
}

const mesAtualPadrao = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const mesAnoAnteriorDe = (yyyymm: string): string => {
  const [y, m] = yyyymm.split('-')
  return `${Number(y) - 1}-${m}`
}

const primeiroDiaMes = (yyyymm: string): string => `${yyyymm}-01`

const ultimoDiaMes = (yyyymm: string): string => {
  const [y, m] = yyyymm.split('-').map(Number)
  // day 0 of (m, no offset because Date month is 0-indexed and m is 1-indexed) → último dia de m
  const d = new Date(y, m, 0)
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const rotuloMesAno = (yyyymm: string): string => {
  const [y, m] = yyyymm.split('-')
  return `${MESES_NOMES[Number(m) - 1]}/${y}`
}

const rotuloMesAnoCurto = (yyyymm: string): string => {
  const [y, m] = yyyymm.split('-')
  return `${MESES_NOMES[Number(m) - 1].slice(0, 3)}/${y.slice(-2)}`
}

const intervaloJanela = (periodoDias: number): Intervalo => {
  const fimAtual = hojeIso()
  const inicioAtual = subtrairDias(fimAtual, periodoDias - 1)
  const fimAnterior = subtrairDias(inicioAtual, 1)
  const inicioAnterior = subtrairDias(fimAnterior, periodoDias - 1)
  return {
    inicio_atual: inicioAtual,
    fim_atual: fimAtual,
    inicio_anterior: inicioAnterior,
    fim_anterior: fimAnterior
  }
}

const intervaloMes = (mesAtual: string, mesComparativo: string): Intervalo => ({
  inicio_atual: primeiroDiaMes(mesAtual),
  fim_atual: ultimoDiaMes(mesAtual),
  inicio_anterior: primeiroDiaMes(mesComparativo),
  fim_anterior: ultimoDiaMes(mesComparativo)
})

const fmt = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtCompacto = (valor: number) => {
  if (valor >= 1000) return `R$ ${(valor / 1000).toFixed(1).replace('.', ',')}k`
  return fmt(valor)
}

const fmtData = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('pt-BR')

const calcularDelta = (atual: number, anterior: number): { pct: number; valido: boolean } => {
  if (anterior === 0) return { pct: 0, valido: false }
  return { pct: ((atual - anterior) / anterior) * 100, valido: true }
}

const Dashboard: FC = () => {
  // Abre no mês corrente (modo mês), não na janela móvel — o lojista pensa
  // "como está o mês?" ao abrir o sistema. Os botões de janela continuam aí.
  const [modo, setModo] = useState<Modo>('mes')
  const [periodoDias, setPeriodoDias] = useState(30)
  const [mesAtual, setMesAtual] = useState<string>(mesAtualPadrao)
  const [mesComparativo, setMesComparativo] = useState<string>(() => mesAnoAnteriorDe(mesAtualPadrao()))
  const [compararMes, setCompararMes] = useState(false)
  const [compararSerie, setCompararSerie] = useState(false) // botão "Comparar" do gráfico de vendas no tempo
  const [metaVersao, setMetaVersao] = useState(0) // bump força recarregar métricas após editar a meta
  const [metricas, setMetricas] = useState<MetricasDashboard | null>(null)
  const [resumo, setResumo] = useState<ResumoBasico | null>(null)
  const [inadimplentes, setInadimplentes] = useState<ClienteInadimplente[]>([])
  const [vencendoHoje, setVencendoHoje] = useState<ClienteVencendoHoje[]>([])
  const [vendas, setVendas] = useState<VendaDivida[]>([])
  const [clienteDividas, setClienteDividas] = useState<{ id: number; nome: string } | null>(null)
  const [receberVenda, setReceberVenda] = useState<{ id: number; nome: string } | null>(null)
  const [carregandoMetricas, setCarregandoMetricas] = useState(false)
  // Vira true assim que a 1ª busca de métricas responde (sucesso ou falha).
  // Enquanto false, mostramos a silhueta da tela inteira; depois disso as
  // trocas de período usam só os skeletons por card.
  const [carregouMetricas, setCarregouMetricas] = useState(false)

  // Mês máximo permitido no <input type="month"> (não faz sentido escolher futuro).
  const mesMaximo = mesAtualPadrao()

  const intervalo = useMemo<Intervalo>(
    () => (modo === 'janela' ? intervaloJanela(periodoDias) : intervaloMes(mesAtual, mesComparativo)),
    [modo, periodoDias, mesAtual, mesComparativo]
  )

  // Dados que não dependem do período (cadastros, alertas). Extraído para
  // recarregar também após um recebimento feito no diálogo de dívidas.
  const carregarBasico = useCallback(() => {
    Promise.all([
      window.api.vendas.resumoDashboard(),
      window.api.clientes.listarInadimplentes(),
      window.api.clientes.listarVencendoHoje(),
      window.api.vendas.listar()
    ]).then(([rResumo, rInadimp, rVencendo, rVendas]) => {
      if (rResumo.success) setResumo(rResumo.data as ResumoBasico)
      if (rInadimp.success) setInadimplentes(rInadimp.data as ClienteInadimplente[])
      if (rVencendo.success) setVencendoHoje(rVencendo.data as ClienteVencendoHoje[])
      if (rVendas.success) setVendas(rVendas.data as VendaDivida[])
    })
  }, [])

  useEffect(() => { carregarBasico() }, [carregarBasico])

  // Métricas do período (recarrega quando o intervalo muda).
  useEffect(() => {
    setCarregandoMetricas(true)
    window.api.dashboard.metricas(intervalo).then((resp) => {
      if (resp.success) setMetricas(resp.data)
      setCarregandoMetricas(false)
      setCarregouMetricas(true)
    })
  }, [intervalo, metaVersao])

  const dividasPorCliente = useMemo(() => calcularDividasPorCliente(vendas), [vendas])

  const deltaFaturamento = metricas
    ? calcularDelta(metricas.faturamento_atual, metricas.faturamento_anterior)
    : { pct: 0, valido: false }
  const deltaVendas = metricas
    ? calcularDelta(metricas.num_vendas_atual, metricas.num_vendas_anterior)
    : { pct: 0, valido: false }
  const deltaTicket = metricas
    ? calcularDelta(metricas.ticket_medio_atual, metricas.ticket_medio_anterior)
    : { pct: 0, valido: false }
  const deltaClientesNovos = metricas
    ? calcularDelta(metricas.clientes_novos_atual, metricas.clientes_novos_anterior)
    : { pct: 0, valido: false }

  const rotuloPeriodo = modo === 'janela'
    ? (PERIODOS.find((p) => p.dias === periodoDias)?.rotulo ?? '')
    : rotuloMesAno(mesAtual)
  const rotuloComparativo = modo === 'janela'
    ? 'período anterior'
    : rotuloMesAnoCurto(mesComparativo)

  // No modo mês, a comparação só aparece se o usuário ligar o toggle.
  // A janela móvel sempre compara com o período anterior.
  const mostrarComparativo = modo === 'janela' || compararMes

  const aplicarMes = (mes: string, comparar: boolean, mesComp: string) => {
    setModo('mes')
    setMesAtual(mes)
    setCompararMes(comparar)
    setMesComparativo(mesComp)
  }

  const salvarMeta = async (valor: number): Promise<boolean> => {
    const resp = await window.api.dashboard.salvarMeta(valor)
    if (resp.success) setMetaVersao((v) => v + 1)
    return resp.success
  }

  // Primeira abertura: enquanto os números não chegam, a tela inteira é uma
  // silhueta (mesma do fallback lazy lá no App, então não há "pisca" duplo).
  if (!carregouMetricas) return <DashboardSkeleton />

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        {/* Filtro de período: janela móvel ou mês específico */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {PERIODOS.map((p) => {
            const ativo = modo === 'janela' && periodoDias === p.dias
            return (
              <button
                key={p.dias}
                onClick={() => { setModo('janela'); setPeriodoDias(p.dias) }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  ativo
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.rotuloCurto}
              </button>
            )
          })}
          <FiltroMesPopover
            mes={mesAtual}
            comparar={compararMes}
            mesComparativo={mesComparativo}
            ativo={modo === 'mes'}
            maxMes={mesMaximo}
            onApply={aplicarMes}
          />
        </div>
      </div>

      {/* ── Alertas de inadimplência (destaque no topo) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-t-4 border-t-red-500 bg-card shadow-sm p-5">
          <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground mb-5">
            <AlertTriangle className="w-[18px] h-[18px] text-red-500 shrink-0" />
            Inadimplentes
            {inadimplentes.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-xl px-2.5 py-0.5">
                {inadimplentes.length}
              </span>
            )}
          </h3>
          {inadimplentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente inadimplente.</p>
          ) : (
            <div className="max-h-[220px] overflow-y-auto pr-3 scrollbar-suave">
              {inadimplentes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClienteDividas({ id: c.id, nome: c.nome })}
                  className="w-full text-left flex justify-between items-start gap-3 py-3 border-b border-slate-100 last:border-b-0 hover:bg-red-50/60 transition-colors cursor-pointer"
                  title="Ver dívidas e parcelas em atraso"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[15px] text-foreground truncate" title={c.nome}>{c.nome}</p>
                    <p className="text-[14px] text-muted-foreground mt-0.5">{c.telefone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-[15px] text-red-600">{fmt(c.total_devido)}</p>
                    <p className="text-[14px] text-red-400 mt-0.5">desde {fmtData(c.vencimento_mais_antigo)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-t-4 border-t-amber-500 bg-card shadow-sm p-5">
          <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground mb-5">
            <Clock className="w-[18px] h-[18px] text-amber-500 shrink-0" />
            Vencem Hoje
            {vencendoHoje.length > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold rounded-xl px-2.5 py-0.5">
                {vencendoHoje.length}
              </span>
            )}
          </h3>
          {vencendoHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum vencimento para hoje.</p>
          ) : (
            <div className="max-h-[220px] overflow-y-auto pr-3 scrollbar-suave">
              {vencendoHoje.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClienteDividas({ id: c.id, nome: c.nome })}
                  className="w-full text-left flex justify-between items-start gap-3 py-3 border-b border-slate-100 last:border-b-0 hover:bg-amber-50/60 transition-colors cursor-pointer"
                  title="Ver dívidas e parcelas do cliente"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[15px] text-foreground truncate" title={c.nome}>{c.nome}</p>
                    <p className="text-[14px] text-muted-foreground mt-0.5">{c.telefone}</p>
                  </div>
                  <p className="font-bold text-[15px] text-amber-600 shrink-0">{fmt(c.total)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── KPIs do período ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <CardKPI
          icone={<TrendingUp className="w-5 h-5 text-blue-600" />}
          corIcone="bg-blue-100"
          titulo="Faturamento"
          valor={metricas ? fmt(metricas.faturamento_atual) : '...'}
          delta={deltaFaturamento}
          valorAnterior={metricas ? fmt(metricas.faturamento_anterior) : '—'}
          rotuloComparativo={rotuloComparativo}
          mostrarComparativo={mostrarComparativo}
          subtexto={
            metricas && metricas.devolucoes_atual > 0 ? (
              <p className="text-xs text-amber-600 mt-1">
                − {fmt(metricas.devolucoes_atual)} em devoluções · líquido{' '}
                <span className="font-medium">
                  {fmt(metricas.faturamento_atual - metricas.devolucoes_atual)}
                </span>
              </p>
            ) : null
          }
        />
        <CardKPI
          icone={<Receipt className="w-5 h-5 text-indigo-600" />}
          corIcone="bg-indigo-100"
          titulo="Vendas"
          valor={metricas ? String(metricas.num_vendas_atual) : '...'}
          delta={deltaVendas}
          valorAnterior={metricas ? String(metricas.num_vendas_anterior) : '—'}
          rotuloComparativo={rotuloComparativo}
          mostrarComparativo={mostrarComparativo}
        />
        <CardKPI
          icone={<ShoppingBag className="w-5 h-5 text-orange-600" />}
          corIcone="bg-orange-100"
          titulo="Ticket médio"
          valor={metricas ? fmt(metricas.ticket_medio_atual) : '...'}
          delta={deltaTicket}
          valorAnterior={metricas ? fmt(metricas.ticket_medio_anterior) : '—'}
          rotuloComparativo={rotuloComparativo}
          mostrarComparativo={mostrarComparativo}
        />
        <CardClientes
          totalClientes={resumo ? resumo.total_clientes : null}
          novosAtual={metricas ? metricas.clientes_novos_atual : null}
          deltaNovos={deltaClientesNovos}
          mostrarComparativo={mostrarComparativo}
          rotuloComparativo={rotuloComparativo}
        />
      </div>

      {/* ── Lucro & margem + Meta do mês ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <CardLucro
          metricas={metricas}
          mostrarComparativo={mostrarComparativo}
          rotuloComparativo={rotuloComparativo}
        />
        <CardMeta metricas={metricas} onSalvar={salvarMeta} />
      </div>

      {/* ── Gráfico de vendas + Top produtos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico de vendas no tempo */}
        <div className="lg:col-span-2 border rounded-xl p-4 bg-card">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold">Vendas no tempo</h3>
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCompararSerie((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1 transition-colors ${
                  compararSerie
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title="Mostrar o período anterior lado a lado"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Comparar
              </button>
              <span className="text-xs text-muted-foreground">{rotuloPeriodo}</span>
            </div>
          </div>
          {carregandoMetricas ? (
            <Skeleton className="h-64 w-full" />
          ) : metricas && metricas.serie_temporal.length > 0 ? (
            <div className="h-64 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metricas.serie_temporal} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="rotulo"
                    fontSize={11}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    fontSize={11}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmtCompacto}
                  />
                  <Tooltip
                    formatter={(valor, nome) => [
                      fmt(Number(valor)),
                      nome === 'total_anterior'
                        ? 'Período anterior'
                        : compararSerie ? 'Período atual' : 'Faturamento'
                    ]}
                    labelFormatter={(rotulo) => rotulo}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12
                    }}
                  />
                  {compararSerie && (
                    <Legend
                      formatter={(v) => (v === 'total_anterior' ? 'Período anterior' : 'Período atual')}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                  )}
                  {/* Anterior (cinza) à esquerda, atual (cor) à direita de cada par */}
                  {compararSerie && (
                    <Bar dataKey="total_anterior" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  )}
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Sem vendas no período.
            </div>
          )}
        </div>

        {/* Top 5 produtos */}
        <div className="border rounded-xl p-4 bg-card">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold">Top 5 produtos</h3>
          </div>
          {carregandoMetricas ? (
            <SkeletonLista linhas={5} comRank />
          ) : metricas && metricas.top_produtos.length > 0 ? (
            <ul className="space-y-2.5">
              {metricas.top_produtos.map((p, i) => (
                <li key={p.produto_id} className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? 'bg-amber-100 text-amber-700'
                    : i === 1 ? 'bg-slate-200 text-slate-700'
                    : i === 2 ? 'bg-orange-100 text-orange-700'
                    : 'bg-muted text-muted-foreground'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={p.nome}>{p.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.quantidade} un · {fmt(p.receita)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center">
              <Package className="anim-flutua w-6 h-6 mx-auto mb-1.5 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">Sem vendas no período.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Forma de pagamento + Top categorias ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <CardFormaPagamento metricas={metricas} carregando={carregandoMetricas} />
        <CardTopCategorias metricas={metricas} carregando={carregandoMetricas} />
      </div>

      {/* ── Ranking de vendedores + Vendas por dia da semana ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <CardRankingVendedores metricas={metricas} carregando={carregandoMetricas} />
        <CardDiaSemana metricas={metricas} carregando={carregandoMetricas} />
      </div>

      {/* ── Recebível futuro + Produtos parados + Estoque baixo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <CardRecebivel metricas={metricas} rotuloPeriodo={rotuloPeriodo} />
        <CardProdutosParados metricas={metricas} carregando={carregandoMetricas} />
        <CardEstoqueBaixo metricas={metricas} />
      </div>

      {/* ── Aniversariantes do mês ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <CardAniversariantes metricas={metricas} />
      </div>

      <DividasClienteDialog
        clienteNome={clienteDividas?.nome ?? null}
        vendas={clienteDividas ? dividasPorCliente.get(clienteDividas.id)?.vendas ?? [] : []}
        totalEmAberto={clienteDividas ? dividasPorCliente.get(clienteDividas.id)?.total ?? 0 : 0}
        onFechar={() => setClienteDividas(null)}
        onReceber={(v) => setReceberVenda({ id: v.id, nome: clienteDividas?.nome ?? '' })}
      />

      <ReceberPagamentoDialog
        vendaId={receberVenda?.id ?? null}
        clienteNome={receberVenda?.nome ?? ''}
        onFechar={() => setReceberVenda(null)}
        onMudou={carregarBasico}
      />
    </div>
  )
}

// Skeleton de lista usado nos cards durante a troca de período (a 1ª abertura
// usa a silhueta da tela inteira, o DashboardSkeleton).
const SkeletonLista: FC<{ linhas?: number; comRank?: boolean }> = ({ linhas = 5, comRank = false }) => (
  <ul className="space-y-3">
    {Array.from({ length: linhas }).map((_, i) => (
      <li key={i} className="flex items-center gap-3">
        {comRank && <Skeleton className="w-6 h-6 rounded-md shrink-0" />}
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </li>
    ))}
  </ul>
)

type Delta = { pct: number; valido: boolean }

type CardKPIProps = {
  icone: React.ReactNode
  corIcone: string
  titulo: string
  valor: string
  delta: Delta
  valorAnterior: string
  rotuloComparativo: string
  mostrarComparativo: boolean
  subtexto?: React.ReactNode
}

const CardKPI: FC<CardKPIProps> = ({
  icone, corIcone, titulo, valor, delta, valorAnterior, rotuloComparativo, mostrarComparativo, subtexto
}) => {
  const corDelta =
    !delta.valido ? 'text-muted-foreground'
    : delta.pct > 0 ? 'text-green-600'
    : delta.pct < 0 ? 'text-red-600'
    : 'text-muted-foreground'
  const sinal = delta.pct > 0 ? '+' : ''
  return (
    <div className="anim-gatilho border rounded-xl p-4 bg-card">
      <div className={`anim-alvo-salta w-10 h-10 rounded-lg ${corIcone} flex items-center justify-center mb-3`}>
        {icone}
      </div>
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-bold mt-0.5">{valor}</p>
      {mostrarComparativo && (
        <>
          <div className={`flex items-center gap-1 mt-1 text-xs ${corDelta}`}>
            {delta.valido && delta.pct !== 0 && (
              delta.pct > 0
                ? <TrendingUp className="w-3 h-3" />
                : <TrendingDown className="w-3 h-3" />
            )}
            <span>
              {delta.valido ? `${sinal}${delta.pct.toFixed(1)}%` : '—'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            vs <span className="font-medium">{valorAnterior}</span>{' '}
            <span className="opacity-70">({rotuloComparativo})</span>
          </p>
        </>
      )}
      {subtexto}
    </div>
  )
}

// Card de clientes (substitui o antigo "Cadastros"): total + novos no período.
type CardClientesProps = {
  totalClientes: number | null
  novosAtual: number | null
  deltaNovos: Delta
  mostrarComparativo: boolean
  rotuloComparativo: string
}

const CardClientes: FC<CardClientesProps> = ({
  totalClientes, novosAtual, deltaNovos, mostrarComparativo, rotuloComparativo
}) => {
  const corDelta =
    !deltaNovos.valido ? 'text-muted-foreground'
    : deltaNovos.pct > 0 ? 'text-green-600'
    : deltaNovos.pct < 0 ? 'text-red-600'
    : 'text-muted-foreground'
  const sinal = deltaNovos.pct > 0 ? '+' : ''
  return (
    <div className="anim-gatilho border rounded-xl p-4 bg-card">
      <div className="anim-alvo-salta w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center mb-3">
        <Users className="w-5 h-5 text-purple-600" />
      </div>
      <p className="text-sm text-muted-foreground">Clientes</p>
      <p className="text-2xl font-bold mt-0.5">{totalClientes != null ? totalClientes : '...'}</p>
      <p className="text-xs mt-1">
        <span className="font-medium text-purple-600">{novosAtual != null ? `+${novosAtual}` : '—'}</span>{' '}
        <span className="text-muted-foreground">novos no período</span>
      </p>
      {mostrarComparativo && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${corDelta}`}>
          {deltaNovos.valido && deltaNovos.pct !== 0 && (
            deltaNovos.pct > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />
          )}
          <span>{deltaNovos.valido ? `${sinal}${deltaNovos.pct.toFixed(1)}%` : '—'}</span>
          <span className="opacity-70">({rotuloComparativo})</span>
        </div>
      )}
    </div>
  )
}

// Lucro & margem. Sem custo cadastrado, mostra um convite em vez de margem falsa.
type CardLucroProps = {
  metricas: MetricasDashboard | null
  mostrarComparativo: boolean
  rotuloComparativo: string
}

const CardLucro: FC<CardLucroProps> = ({ metricas, mostrarComparativo, rotuloComparativo }) => {
  const semCusto = !metricas || metricas.custo_vendas_atual <= 0
  const lucro = metricas ? metricas.faturamento_atual - metricas.custo_vendas_atual : 0
  const lucroAnterior = metricas ? metricas.faturamento_anterior - metricas.custo_vendas_anterior : 0
  const margem = metricas && metricas.faturamento_atual > 0 ? (lucro / metricas.faturamento_atual) * 100 : 0
  const delta = calcularDelta(lucro, lucroAnterior)
  const corDelta =
    !delta.valido ? 'text-muted-foreground'
    : delta.pct > 0 ? 'text-green-600'
    : delta.pct < 0 ? 'text-red-600'
    : 'text-muted-foreground'
  const sinal = delta.pct > 0 ? '+' : ''

  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <PiggyBank className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Lucro &amp; margem</h3>
      </div>
      {!metricas ? (
        <div className="py-2 space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ) : semCusto ? (
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Cadastre o <span className="font-medium text-foreground">preço de compra</span> dos produtos
            (na tela <span className="font-medium text-foreground">Produtos</span>) para acompanhar lucro e margem aqui.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Por enquanto, faturamento do período: <span className="font-medium">{fmt(metricas.faturamento_atual)}</span>.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Lucro bruto estimado</p>
          <div className="flex items-end justify-between gap-2">
            <p className="text-2xl font-bold mt-0.5 text-emerald-600">{fmt(lucro)}</p>
            <span className="text-sm font-semibold bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 whitespace-nowrap">
              margem {margem.toFixed(1).replace('.', ',')}%
            </span>
          </div>
          {mostrarComparativo && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${corDelta}`}>
              {delta.valido && delta.pct !== 0 && (
                delta.pct > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />
              )}
              <span>{delta.valido ? `${sinal}${delta.pct.toFixed(1)}%` : '—'}</span>
              <span className="opacity-70">({rotuloComparativo})</span>
            </div>
          )}
          <div className="mt-3 pt-3 border-t space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Faturamento</span>
              <span>{fmt(metricas.faturamento_atual)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Custo das vendas</span>
              <span className="text-red-500">− {fmt(metricas.custo_vendas_atual)}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Estimativa pelo preço de compra cadastrado nos produtos.
          </p>
        </>
      )}
    </div>
  )
}

// Meta do mês — editável inline. Sempre reflete o mês corrente, independe do filtro.
const CardMeta: FC<{ metricas: MetricasDashboard | null; onSalvar: (valor: number) => Promise<boolean> }> = ({
  metricas, onSalvar
}) => {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)

  const meta = metricas?.meta_mensal ?? 0
  const realizado = metricas?.faturamento_mes_corrente ?? 0
  const pct = meta > 0 ? Math.min(100, Math.round((realizado / meta) * 100)) : 0
  const falta = Math.max(0, meta - realizado)

  const abrirEdicao = () => {
    setValor(meta > 0 ? String(meta) : '')
    setEditando(true)
  }
  const confirmar = async () => {
    const n = parseFloat(valor.replace(',', '.'))
    if (isNaN(n) || n < 0) return
    setSalvando(true)
    const ok = await onSalvar(n)
    setSalvando(false)
    if (ok) setEditando(false)
  }

  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Meta do mês</h3>
        {!editando && (
          <button
            type="button"
            onClick={abrirEdicao}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            title="Definir/editar a meta de faturamento do mês"
          >
            <Pencil className="w-3.5 h-3.5" /> {meta > 0 ? 'Editar' : 'Definir'}
          </button>
        )}
      </div>

      {editando ? (
        <div className="py-2">
          <label className="text-sm text-muted-foreground">Meta de faturamento mensal (R$)</label>
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmar()
                if (e.key === 'Escape') setEditando(false)
              }}
              placeholder="0,00"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={confirmar}
              disabled={salvando}
              className="h-10 w-10 shrink-0 rounded-md bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
              title="Salvar meta"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="h-10 w-10 shrink-0 rounded-md border flex items-center justify-center text-muted-foreground hover:text-foreground"
              title="Cancelar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : meta <= 0 ? (
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Você ainda não definiu uma meta. Clique em <span className="font-medium text-foreground">Definir</span> para
            acompanhar quanto já faturou do seu objetivo do mês.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-2xl font-bold">{fmt(realizado)}</span>
            <span className="text-sm text-muted-foreground">de {fmt(meta)}</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] ${pct >= 100 ? 'bg-green-600' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs">
            <span className={`font-semibold ${pct >= 100 ? 'text-green-600' : 'text-primary'}`}>{pct}% da meta</span>
            <span className="text-muted-foreground">
              {falta > 0 ? `faltam ${fmt(falta)}` : 'meta batida! 🎉'}
            </span>
          </div>
          <p className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            Faturamento do mês atual vs. sua meta. Independe do filtro de período lá em cima.
          </p>
        </>
      )}
    </div>
  )
}

// ─── Widgets do pacote 2 ──────────────────────────────────────────────────────

const CORES_PAGAMENTO: Record<string, string> = {
  pago: '#16a34a',          // verde — à vista
  pendente: '#f59e0b',      // amber — a prazo
  parcelado: '#3b82f6',     // blue
  inadimplente: '#dc2626'   // red
}

const ROTULOS_PAGAMENTO: Record<string, string> = {
  pago: 'À vista',
  pendente: 'A prazo',
  parcelado: 'Parcelado',
  inadimplente: 'Inadimplente'
}

type WidgetProps = { metricas: MetricasDashboard | null; carregando: boolean }

const CardFormaPagamento: FC<WidgetProps> = ({ metricas, carregando }) => {
  const dados = metricas
    ? Object.entries(metricas.distribuicao_pagamento)
        .map(([chave, v]) => ({
          chave,
          nome: ROTULOS_PAGAMENTO[chave],
          num: v.num,
          valor: v.valor
        }))
        .filter((d) => d.num > 0)
    : []
  const totalVendas = dados.reduce((acc, d) => acc + d.num, 0)

  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <CreditCard className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Forma de pagamento</h3>
      </div>
      {carregando ? (
        <div className="flex items-center gap-4">
          <Skeleton className="h-44 w-44 rounded-full shrink-0" />
          <div className="flex-1 space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ) : dados.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Sem vendas no período.</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dados} dataKey="num" innerRadius={42} outerRadius={70} paddingAngle={2}>
                  {dados.map((d) => (
                    <Cell key={d.chave} fill={CORES_PAGAMENTO[d.chave]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(valor, _name, props) => {
                    const item = props.payload as { valor: number; num: number }
                    return [`${valor} venda(s) · ${fmt(item.valor)}`, '']
                  }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-2 text-sm">
            {dados.map((d) => (
              <li key={d.chave} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CORES_PAGAMENTO[d.chave] }}
                />
                <span className="flex-1">{d.nome}</span>
                <span className="text-muted-foreground text-xs">
                  {Math.round((d.num / totalVendas) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const CardTopCategorias: FC<WidgetProps> = ({ metricas, carregando }) => {
  const dados = metricas?.top_categorias ?? []
  const maxReceita = Math.max(1, ...dados.map((c) => c.receita))

  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Top 5 categorias</h3>
      </div>
      {carregando ? (
        <ul className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i}>
              <div className="flex justify-between mb-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </li>
          ))}
        </ul>
      ) : dados.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">Sem vendas no período.</p>
      ) : (
        <ul className="space-y-3">
          {dados.map((c) => (
            <li key={c.categoria}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="font-medium truncate" title={c.categoria}>{c.categoria}</span>
                <span className="text-muted-foreground text-xs ml-2 whitespace-nowrap">
                  {fmt(c.receita)} · {c.quantidade} un
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-[width]"
                  style={{ width: `${(c.receita / maxReceita) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const CardRecebivel: FC<{ metricas: MetricasDashboard | null; rotuloPeriodo: string }> = ({
  metricas, rotuloPeriodo
}) => {
  const recebivel = metricas?.recebivel_futuro
  const periodo = metricas?.a_receber_periodo
  const totalPeriodo = periodo ? periodo.a_vencer + periodo.vencido : 0

  return (
    <div className="anim-gatilho border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Wallet className="anim-alvo-acena w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">A receber</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2 mb-3">
        Parcelas e vendas a prazo, pelo vencimento
      </p>
      {/* Vencimentos dentro do período filtrado — entra também o que veio de
          vendas de meses anteriores (por isso não bate com o faturamento). */}
      <div className="rounded-lg bg-muted/60 px-3 py-2.5 mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground truncate" title={rotuloPeriodo}>
            {rotuloPeriodo}
          </span>
          <span className="font-bold shrink-0">{periodo ? fmt(totalPeriodo) : '...'}</span>
        </div>
        {periodo && totalPeriodo > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {fmt(periodo.a_vencer)} a vencer
            {periodo.vencido > 0 && (
              <> · <span className="font-medium text-red-600">{fmt(periodo.vencido)} em atraso</span></>
            )}
          </p>
        )}
      </div>
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Próximos 30 dias</span>
          <span className="font-bold">{recebivel ? fmt(recebivel.proximos_30d) : '...'}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Próximos 60 dias</span>
          <span className="font-semibold">{recebivel ? fmt(recebivel.proximos_60d) : '...'}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Próximos 90 dias</span>
          <span className="font-semibold">{recebivel ? fmt(recebivel.proximos_90d) : '...'}</span>
        </div>
      </div>
    </div>
  )
}

const CardProdutosParados: FC<WidgetProps> = ({ metricas, carregando }) => {
  const produtos = metricas?.produtos_parados ?? []
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Package className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Produtos parados</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2 mb-3">
        Em estoque, parados há mais de 30 dias
      </p>
      {carregando ? (
        <SkeletonLista linhas={3} />
      ) : produtos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum produto parado — boa rotatividade!
        </p>
      ) : (
        <ul className="space-y-2">
          {produtos.map((p) => (
            <li key={p.produto_id} className="flex items-start gap-2 text-sm">
              <span className="text-xs font-bold bg-muted rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                {p.dias_parado}d
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium" title={p.nome}>{p.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {p.estoque} em estoque{p.categoria ? ` · ${p.categoria}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const CardEstoqueBaixo: FC<{ metricas: MetricasDashboard | null }> = ({ metricas }) => {
  const produtos = metricas?.estoque_baixo ?? []
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Estoque baixo</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2 mb-3">
        Produtos com 5 unidades ou menos
      </p>
      {produtos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum produto com estoque baixo.
        </p>
      ) : (
        <ul className="space-y-2">
          {produtos.map((p) => {
            const nome = p.tamanho ? `${p.nome} (${p.tamanho})` : p.nome
            return (
            <li key={`${p.produto_id}-${p.tamanho ?? ''}`} className="flex items-center gap-2 text-sm">
              <span className={`text-xs font-bold rounded px-1.5 py-0.5 shrink-0 ${
                p.estoque <= 2
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {p.estoque} un
              </span>
              <span className="truncate" title={nome}>{nome}</span>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Ranking de vendedores por faturamento no período.
const CardRankingVendedores: FC<WidgetProps> = ({ metricas, carregando }) => {
  const dados = metricas?.ranking_vendedores ?? []
  const max = Math.max(1, ...dados.map((v) => v.receita))
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Ranking de vendedores</h3>
      </div>
      {carregando ? (
        <SkeletonLista linhas={5} comRank />
      ) : dados.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sem vendas no período.</p>
      ) : (
        <ul className="space-y-3">
          {dados.map((v, i) => (
            <li key={v.vendedor_id}>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700'
                  : i === 1 ? 'bg-slate-200 text-slate-700'
                  : i === 2 ? 'bg-orange-100 text-orange-700'
                  : 'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </div>
                <span className="text-sm font-medium flex-1 truncate" title={v.nome}>{v.nome}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {fmt(v.receita)} · {v.num_vendas} vendas
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden ml-8">
                <div className="h-full bg-primary rounded-full" style={{ width: `${(v.receita / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Vendas por dia da semana. dow: 0=Dom … 6=Sáb; exibimos Seg→Dom e destacamos o pico.
const DIAS_SEMANA_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]

const CardDiaSemana: FC<WidgetProps> = ({ metricas, carregando }) => {
  const fonte = metricas?.vendas_por_dia_semana ?? []
  const mapa = new Map(fonte.map((d) => [d.dow, d.total]))
  const dados = ORDEM_DIAS.map((dow) => ({ dia: DIAS_SEMANA_LABEL[dow], total: mapa.get(dow) ?? 0 }))
  const max = Math.max(...dados.map((d) => d.total))
  const temVendas = max > 0
  const melhor = temVendas ? dados.find((d) => d.total === max)?.dia : null
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Vendas por dia da semana</h3>
      </div>
      {carregando ? (
        <Skeleton className="h-48 w-full" />
      ) : !temVendas ? (
        <p className="text-sm text-muted-foreground text-center py-12">Sem vendas no período.</p>
      ) : (
        <>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dados} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="dia" fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis fontSize={11} tick={{ fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={fmtCompacto} />
                <Tooltip
                  formatter={(valor) => [fmt(Number(valor)), 'Faturamento']}
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {dados.map((d) => (
                    <Cell key={d.dia} fill={d.total === max ? 'hsl(var(--primary))' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-1">
            <span className="font-semibold text-foreground">{melhor}</span> é o seu melhor dia
          </p>
        </>
      )}
    </div>
  )
}

// Aniversariantes do mês corrente — gancho de marketing.
const CardAniversariantes: FC<{ metricas: MetricasDashboard | null }> = ({ metricas }) => {
  const dados = metricas?.aniversariantes_mes ?? []
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Gift className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Aniversariantes do mês</h3>
      </div>
      {dados.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum aniversariante este mês (ou sem data de nascimento cadastrada).
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {dados.map((a) => (
              <li key={a.id} className="anim-gatilho flex items-center gap-3 bg-muted/40 rounded-lg px-3 py-2">
                <div className="w-9 h-9 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center shrink-0">
                  <Gift className="anim-alvo-acena w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={a.nome}>{a.nome}</p>
                  <p className="text-xs text-muted-foreground">{a.telefone}</p>
                </div>
                <span className="text-sm font-semibold text-pink-600">{a.dia}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Oportunidade de mandar um parabéns com uma promoção 🎁</p>
        </>
      )}
    </div>
  )
}

export default Dashboard
