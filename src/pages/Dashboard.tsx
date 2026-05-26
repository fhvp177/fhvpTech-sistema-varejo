import { FC, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Clock, TrendingUp, TrendingDown, Users, Package,
  ShoppingBag, Receipt, BarChart3, Award, CreditCard, Tag, Wallet, AlertCircle,
  RotateCcw, CalendarDays
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell
} from 'recharts'
import DividasClienteDialog, {
  calcularDividasPorCliente,
  type VendaDivida
} from '@/components/DividasClienteDialog'

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
  const [modo, setModo] = useState<Modo>('janela')
  const [periodoDias, setPeriodoDias] = useState(30)
  const [mesAtual, setMesAtual] = useState<string>(mesAtualPadrao)
  const [mesComparativo, setMesComparativo] = useState<string>(() => mesAnoAnteriorDe(mesAtualPadrao()))
  const [metricas, setMetricas] = useState<MetricasDashboard | null>(null)
  const [resumo, setResumo] = useState<ResumoBasico | null>(null)
  const [inadimplentes, setInadimplentes] = useState<ClienteInadimplente[]>([])
  const [vencendoHoje, setVencendoHoje] = useState<ClienteVencendoHoje[]>([])
  const [vendas, setVendas] = useState<VendaDivida[]>([])
  const [clienteDividas, setClienteDividas] = useState<{ id: number; nome: string } | null>(null)
  const [carregandoMetricas, setCarregandoMetricas] = useState(false)

  // Mês máximo permitido no <input type="month"> (não faz sentido escolher futuro).
  const mesMaximo = mesAtualPadrao()

  const intervalo = useMemo<Intervalo>(
    () => (modo === 'janela' ? intervaloJanela(periodoDias) : intervaloMes(mesAtual, mesComparativo)),
    [modo, periodoDias, mesAtual, mesComparativo]
  )

  // Dados que não dependem do período (cadastros, alertas).
  useEffect(() => {
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

  // Métricas do período (recarrega quando o intervalo muda).
  useEffect(() => {
    setCarregandoMetricas(true)
    window.api.dashboard.metricas(intervalo).then((resp) => {
      if (resp.success) setMetricas(resp.data)
      setCarregandoMetricas(false)
    })
  }, [intervalo])

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

  const rotuloPeriodo = modo === 'janela'
    ? (PERIODOS.find((p) => p.dias === periodoDias)?.rotulo ?? '')
    : rotuloMesAno(mesAtual)
  const rotuloPeriodoCurto = modo === 'janela'
    ? (PERIODOS.find((p) => p.dias === periodoDias)?.rotuloCurto ?? '')
    : rotuloMesAnoCurto(mesAtual)
  const rotuloComparativo = modo === 'janela'
    ? 'período anterior'
    : rotuloMesAnoCurto(mesComparativo)

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
          <button
            onClick={() => setModo('mes')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              modo === 'mes'
                ? 'bg-background shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Comparar dois meses específicos"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Mês
          </button>
        </div>
      </div>

      {modo === 'mes' && (
        <div className="mb-6 border rounded-lg p-3 bg-muted/30 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Mês de análise</label>
            <input
              type="month"
              value={mesAtual}
              max={mesMaximo}
              onChange={(e) => e.target.value && setMesAtual(e.target.value)}
              className="px-2 py-1.5 text-sm border rounded-md bg-background"
            />
          </div>
          <span className="pb-2 text-sm text-muted-foreground font-medium">vs</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Comparar com</label>
            <div className="flex items-center gap-1">
              <input
                type="month"
                value={mesComparativo}
                max={mesMaximo}
                onChange={(e) => e.target.value && setMesComparativo(e.target.value)}
                className="px-2 py-1.5 text-sm border rounded-md bg-background"
              />
              <button
                type="button"
                onClick={() => setMesComparativo(mesAnoAnteriorDe(mesAtual))}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title="Resetar para o mesmo mês do ano anterior"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Alertas de inadimplência (destaque no topo) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="border border-red-200 bg-red-50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="font-semibold text-red-700">
              Inadimplentes{' '}
              {inadimplentes.length > 0 && (
                <span className="bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5 ml-1">
                  {inadimplentes.length}
                </span>
              )}
            </h3>
          </div>
          {inadimplentes.length === 0 ? (
            <p className="text-sm text-red-400">Nenhum cliente inadimplente.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {inadimplentes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClienteDividas({ id: c.id, nome: c.nome })}
                  className="w-full text-left bg-white rounded-lg px-3 py-2 border border-red-100 text-sm hover:bg-red-100/50 hover:border-red-200 transition-colors cursor-pointer"
                  title="Ver dívidas e parcelas em atraso"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-red-800">{c.nome}</p>
                      <p className="text-xs text-red-500">{c.telefone}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-700">{fmt(c.total_devido)}</p>
                      <p className="text-xs text-red-400">desde {fmtData(c.vencimento_mais_antigo)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-700">
              Vencem Hoje{' '}
              {vencendoHoje.length > 0 && (
                <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 ml-1">
                  {vencendoHoje.length}
                </span>
              )}
            </h3>
          </div>
          {vencendoHoje.length === 0 ? (
            <p className="text-sm text-amber-400">Nenhum vencimento para hoje.</p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {vencendoHoje.map((c) => (
                <div
                  key={c.id}
                  className="bg-white rounded-lg px-3 py-2 border border-amber-100 text-sm"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-amber-800">{c.nome}</p>
                      <p className="text-xs text-amber-500">{c.telefone}</p>
                    </div>
                    <p className="font-bold text-amber-700">{fmt(c.total)}</p>
                  </div>
                </div>
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
        />
        <CardKPI
          icone={<Receipt className="w-5 h-5 text-indigo-600" />}
          corIcone="bg-indigo-100"
          titulo="Vendas"
          valor={metricas ? String(metricas.num_vendas_atual) : '...'}
          delta={deltaVendas}
          valorAnterior={metricas ? String(metricas.num_vendas_anterior) : '—'}
          rotuloComparativo={rotuloComparativo}
        />
        <CardKPI
          icone={<ShoppingBag className="w-5 h-5 text-orange-600" />}
          corIcone="bg-orange-100"
          titulo="Ticket médio"
          valor={metricas ? fmt(metricas.ticket_medio_atual) : '...'}
          delta={deltaTicket}
          valorAnterior={metricas ? fmt(metricas.ticket_medio_anterior) : '—'}
          rotuloComparativo={rotuloComparativo}
        />
        <CardEstatico
          icone={<Users className="w-5 h-5 text-purple-600" />}
          corIcone="bg-purple-100"
          titulo="Cadastros"
          valorPrincipal={resumo ? `${resumo.total_clientes} clientes` : '...'}
          valorSecundario={resumo ? `${resumo.total_produtos} produtos` : ''}
        />
      </div>

      {/* ── Gráfico de vendas + Top produtos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico de vendas no tempo */}
        <div className="lg:col-span-2 border rounded-xl p-4 bg-card">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold">Vendas no tempo</h3>
            <span className="text-xs text-muted-foreground ml-auto">
              {rotuloPeriodo}
            </span>
          </div>
          {carregandoMetricas ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Carregando...
            </div>
          ) : metricas && metricas.serie_temporal.length > 0 ? (
            <div className="h-64 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metricas.serie_temporal} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
                    formatter={(valor: number) => [fmt(valor), 'Faturamento']}
                    labelFormatter={(rotulo) => rotulo}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12
                    }}
                  />
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
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
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
              <Package className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground opacity-40" />
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

      {/* ── Recebível futuro + Produtos parados + Estoque baixo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <CardRecebivel metricas={metricas} />
        <CardProdutosParados
          metricas={metricas}
          carregando={carregandoMetricas}
          periodoRotulo={rotuloPeriodoCurto}
        />
        <CardEstoqueBaixo metricas={metricas} />
      </div>

      <DividasClienteDialog
        clienteNome={clienteDividas?.nome ?? null}
        vendas={clienteDividas ? dividasPorCliente.get(clienteDividas.id)?.vendas ?? [] : []}
        totalEmAberto={clienteDividas ? dividasPorCliente.get(clienteDividas.id)?.total ?? 0 : 0}
        onFechar={() => setClienteDividas(null)}
      />
    </div>
  )
}

type Delta = { pct: number; valido: boolean }

type CardKPIProps = {
  icone: React.ReactNode
  corIcone: string
  titulo: string
  valor: string
  delta: Delta
  valorAnterior: string
  rotuloComparativo: string
}

const CardKPI: FC<CardKPIProps> = ({
  icone, corIcone, titulo, valor, delta, valorAnterior, rotuloComparativo
}) => {
  const corDelta =
    !delta.valido ? 'text-muted-foreground'
    : delta.pct > 0 ? 'text-green-600'
    : delta.pct < 0 ? 'text-red-600'
    : 'text-muted-foreground'
  const sinal = delta.pct > 0 ? '+' : ''
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className={`w-10 h-10 rounded-lg ${corIcone} flex items-center justify-center mb-3`}>
        {icone}
      </div>
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-bold mt-0.5">{valor}</p>
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
    </div>
  )
}

type CardEstaticoProps = {
  icone: React.ReactNode
  corIcone: string
  titulo: string
  valorPrincipal: string
  valorSecundario: string
}

const CardEstatico: FC<CardEstaticoProps> = ({ icone, corIcone, titulo, valorPrincipal, valorSecundario }) => (
  <div className="border rounded-xl p-4 bg-card">
    <div className={`w-10 h-10 rounded-lg ${corIcone} flex items-center justify-center mb-3`}>
      {icone}
    </div>
    <p className="text-sm text-muted-foreground">{titulo}</p>
    <p className="text-2xl font-bold mt-0.5">{valorPrincipal}</p>
    <p className="text-xs text-muted-foreground mt-1">{valorSecundario}</p>
  </div>
)

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
        <p className="text-sm text-muted-foreground text-center py-12">Carregando...</p>
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
                  formatter={(valor: number, _name, props) => {
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
        <p className="text-sm text-muted-foreground text-center py-12">Carregando...</p>
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

const CardRecebivel: FC<{ metricas: MetricasDashboard | null }> = ({ metricas }) => {
  const recebivel = metricas?.recebivel_futuro

  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Wallet className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Recebível futuro</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2 mb-3">
        Parcelas e vendas a prazo a vencer
      </p>
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

const CardProdutosParados: FC<WidgetProps & { periodoRotulo: string }> = ({
  metricas, carregando, periodoRotulo
}) => {
  const produtos = metricas?.produtos_parados ?? []
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Package className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Produtos parados</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2 mb-3">
        Em estoque, sem vendas em {periodoRotulo}
      </p>
      {carregando ? (
        <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
      ) : produtos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhum produto parado — boa rotatividade!
        </p>
      ) : (
        <ul className="space-y-2">
          {produtos.map((p) => (
            <li key={p.produto_id} className="flex items-start gap-2 text-sm">
              <span className="text-xs font-bold bg-muted rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                {p.estoque}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium" title={p.nome}>{p.nome}</p>
                {p.categoria && (
                  <p className="text-xs text-muted-foreground truncate">{p.categoria}</p>
                )}
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
          {produtos.map((p) => (
            <li key={p.produto_id} className="flex items-center gap-2 text-sm">
              <span className={`text-xs font-bold rounded px-1.5 py-0.5 shrink-0 ${
                p.estoque <= 2
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {p.estoque} un
              </span>
              <span className="truncate" title={p.nome}>{p.nome}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default Dashboard
