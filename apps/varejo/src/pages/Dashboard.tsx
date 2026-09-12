import { CSSProperties, FC, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Clock, TrendingUp, TrendingDown, Users, Package, LayoutDashboard,
  ShoppingBag, Receipt, BarChart3, Award, CreditCard, Tag, Wallet, AlertCircle,
  ArrowLeftRight, Target, Trophy, CalendarDays, PiggyBank, Gift, Pencil, Check, X,
  CheckCircle2
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
import CardsTrafegoPago from '@/components/CardsTrafegoPago'
import { useEhCelular } from '@/hooks/useEhCelular'
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

/**
 * Rótulo do eixo de valores do gráfico, no celular: sem o "R$".
 *
 * ⚠️ Com o símbolo, "R$ 12,0k" não cabia na faixa do eixo e o "R" saía
 * pela borda esquerda do cartão — e o maior deles ainda quebrava em duas
 * linhas. Alargar a faixa resolveria roubando largura do gráfico, que é o
 * que se quer olhar. A moeda já está dita no rodapé e no título do cartão:
 * repeti-la cinco vezes na vertical não informa ninguém.
 *
 * No monitor nada muda: lá sobra largura e o `fmtCompacto` continua.
 */
const fmtEixoSemMoeda = (valor: number) => {
  if (Math.abs(valor) >= 1000) return `${(valor / 1000).toFixed(1).replace('.', ',')}k`
  return String(Math.round(valor))
}

const fmtData = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('pt-BR')

/**
 * Cinza da série do período anterior, no gráfico de vendas no tempo.
 *
 * ⚠️ É a única cor literal que sobrou nesta tela, e ela sobrou por um
 * motivo: o Recharts pinta SVG por propriedade, não por classe, e a barra e
 * o quadradinho da legenda precisam ler o MESMO valor — legenda de uma cor e
 * barra de outra é pior do que não ter legenda. Quando virar token de tema,
 * troca-se aqui e os dois acompanham.
 */
const COR_PERIODO_ANTERIOR = '#94a3b8'

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

  /*
   * Custo e lucro do período.
   *
   * ⚠️ `semCusto` decide se os dois cartões mostram número ou convite. Sem
   * preço de compra cadastrado o custo é zero, e um lucro igual ao faturamento
   * apareceria como notícia excelente — é o número errado mais convincente que
   * este Painel poderia exibir.
   */
  const custoAtual = metricas?.custo_vendas_atual ?? 0
  const semCustoCadastrado = !metricas || custoAtual <= 0
  const lucroBruto = metricas ? metricas.faturamento_atual - custoAtual : 0
  const lucroBrutoAnterior = metricas
    ? metricas.faturamento_anterior - metricas.custo_vendas_anterior
    : 0
  const margemBruta =
    metricas && metricas.faturamento_atual > 0
      ? (lucroBruto / metricas.faturamento_atual) * 100
      : 0
  const deltaCusto = metricas
    ? calcularDelta(custoAtual, metricas.custo_vendas_anterior)
    : { pct: 0, valido: false }
  const deltaLucro = metricas
    ? calcularDelta(lucroBruto, lucroBrutoAnterior)
    : { pct: 0, valido: false }

  /*
   * Quanto o gráfico soma no período.
   *
   * Não é número novo: é o mesmo faturamento que já está no cartão de cima,
   * repetido no pé do gráfico porque no celular o cartão de cima já rolou
   * para fora da tela quando o olho chega nas barras.
   */
  const totalSerie = useMemo(
    () => (metricas?.serie_temporal ?? []).reduce((soma, p) => soma + p.total, 0),
    [metricas]
  )

  /*
   * De quantos em quantos rótulos aparece um no eixo do tempo, no celular.
   *
   * Trinta datas em 360px viram uma tarja cinza ilegível. Seis é o que o
   * modelo mostra e o que cabe. Até oito pontos (a janela de 7 dias) todos
   * cabem, e aí esconder rótulo seria esconder informação à toa.
   */
  const pontosDaSerie = metricas?.serie_temporal.length ?? 0
  const intervaloRotulos = pontosDaSerie > 8 ? Math.ceil(pontosDaSerie / 6) - 1 : 0

  const ehCelular = useEhCelular()

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
    /* `entrada-escalonada`: os blocos sobem e aparecem um após o outro, uma
       vez só, na abertura. Ver §10 no index.css. */
    <div className="entrada-escalonada ordem-painel p-4 lg:p-8">
      {/*
        ⭐ No celular este cabeçalho inteiro não existe: o título já sai (a pílula
        acesa na ilha diz onde você está) e o filtro de período foi morar dentro
        do cartão de "Vendas no tempo", que é o que ele filtra.

        ⚠️ A escolha é por `ehCelular`, e não por classe: com `hidden lg:flex` o
        filtro existiria DUAS vezes no DOM, e o "Mês" é um painelzinho com estado
        próprio — duas cópias, dois estados, e um deles sempre errado.
      */}
      {!ehCelular && (
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div className="hidden lg:block">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-primary" />
              Dashboard
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Os números do período escolhido. O card de produtos parados é o único que ignora o
              filtro — ele olha sempre os últimos 30 dias.
            </p>
          </div>
          <FiltroPeriodo
            modo={modo}
            periodoDias={periodoDias}
            mesAtual={mesAtual}
            compararMes={compararMes}
            mesComparativo={mesComparativo}
            mesMaximo={mesMaximo}
            onJanela={(dias) => { setModo('janela'); setPeriodoDias(dias) }}
            onMes={aplicarMes}
          />
        </div>
      )}

      {/* ── Vencimentos ── */}
      <CartaoVencimentos
        inadimplentes={inadimplentes}
        vencendoHoje={vencendoHoje}
        onAbrirCliente={(id, nome) => setClienteDividas({ id, nome })}
      />

      {/*
        No monitor seguem os DOIS cartões, lado a lado, como sempre foram.
        Sobra largura ali: não há o que resolver, e mexer seria mexer por mexer.
      */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4 lg:mb-6">
        {/*
          A faixa de 4px vira 2px e sai do vermelho literal para o token
          `critical-fill` — que é a cor CHEIA, própria de faixa, onde não há
          texto por cima. O texto usa `critical`, a versão escurecida. Um token
          só obrigaria a escolher entre faixa suja e texto ilegível.
        */}
        <div className="rounded-xl border border-t-2 border-t-critical-fill bg-card shadow-sm p-5">
          <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground mb-5">
            <AlertTriangle className="w-[18px] h-[18px] text-critical shrink-0" />
            Inadimplentes
            {inadimplentes.length > 0 && (
              <span className="bg-critical-fill text-on-fill text-xs font-bold rounded-xl px-2.5 py-0.5">
                {inadimplentes.length}
              </span>
            )}
          </h3>
          {inadimplentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente inadimplente.</p>
          ) : (
            <div className="max-h-[220px] overflow-y-auto pr-3 scrollbar-suave">
              {inadimplentes.map((c) => (
                <LinhaVencimento
                  key={c.id}
                  nome={c.nome}
                  telefone={c.telefone}
                  valor={c.total_devido}
                  detalhe={`desde ${fmtData(c.vencimento_mais_antigo)}`}
                  atrasado
                  onAbrir={() => setClienteDividas({ id: c.id, nome: c.nome })}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-t-2 border-t-warn bg-card shadow-sm p-5">
          <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground mb-5">
            <Clock className="w-[18px] h-[18px] text-warn shrink-0" />
            Vencem Hoje
            {vencendoHoje.length > 0 && (
              <span className="bg-warn text-on-fill text-xs font-bold rounded-xl px-2.5 py-0.5">
                {vencendoHoje.length}
              </span>
            )}
          </h3>
          {vencendoHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum vencimento para hoje.</p>
          ) : (
            <div className="max-h-[220px] overflow-y-auto pr-3 scrollbar-suave">
              {vencendoHoje.map((c) => (
                <LinhaVencimento
                  key={c.id}
                  nome={c.nome}
                  telefone={c.telefone}
                  valor={c.total}
                  detalhe="vence hoje"
                  atrasado={false}
                  onAbrir={() => setClienteDividas({ id: c.id, nome: c.nome })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/*
        ── KPIs do período ──

        `lg:grid-cols-3` e não 4: com os cartões de custo e lucro são seis, e em
        quatro colunas os dois últimos ficariam sozinhos numa segunda fileira
        meio vazia. Três por linha fecha duas fileiras cheias. No celular
        continuam duas colunas.
      */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3 lg:gap-4 lg:mb-6">
        <CardKPI
          icone={<TrendingUp className="w-5 h-5 text-primary" />}
          corIcone="bg-primary-soft"
          titulo="Faturamento"
          valor={metricas ? fmt(metricas.faturamento_atual) : '...'}
          delta={deltaFaturamento}
          valorAnterior={metricas ? fmt(metricas.faturamento_anterior) : '—'}
          rotuloComparativo={rotuloComparativo}
          mostrarComparativo={mostrarComparativo}
          subtexto={
            metricas && metricas.devolucoes_atual > 0 ? (
              <p className="text-xs text-warn mt-1">
                − {fmt(metricas.devolucoes_atual)} em devoluções · líquido{' '}
                <span className="font-medium">
                  {fmt(metricas.faturamento_atual - metricas.devolucoes_atual)}
                </span>
              </p>
            ) : null
          }
        />
        <CardKPI
          icone={<Receipt className="w-5 h-5 text-primary" />}
          corIcone="bg-primary-soft"
          titulo="Vendas"
          valor={metricas ? String(metricas.num_vendas_atual) : '...'}
          delta={deltaVendas}
          valorAnterior={metricas ? String(metricas.num_vendas_anterior) : '—'}
          rotuloComparativo={rotuloComparativo}
          mostrarComparativo={mostrarComparativo}
        />
        <CardKPI
          icone={<ShoppingBag className="w-5 h-5 text-primary" />}
          corIcone="bg-primary-soft"
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
        <CardKPI
          icone={<Package className="w-5 h-5 text-primary" />}
          corIcone="bg-primary-soft"
          titulo="Custo dos produtos"
          valor={!metricas ? '...' : semCustoCadastrado ? '—' : fmt(custoAtual)}
          delta={deltaCusto}
          deltaNeutro
          valorAnterior={metricas ? fmt(metricas.custo_vendas_anterior) : '—'}
          rotuloComparativo={rotuloComparativo}
          mostrarComparativo={mostrarComparativo && !semCustoCadastrado}
          subtexto={
            metricas && semCustoCadastrado ? (
              <p className="text-xs text-muted-foreground mt-1">
                Cadastre o preço de compra em Produtos.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                O que as peças vendidas custaram.
              </p>
            )
          }
        />
        <CardKPI
          icone={<PiggyBank className="w-5 h-5 text-primary" />}
          corIcone="bg-primary-soft"
          titulo="Lucro bruto"
          valor={!metricas ? '...' : semCustoCadastrado ? '—' : fmt(lucroBruto)}
          delta={deltaLucro}
          valorAnterior={metricas ? fmt(lucroBrutoAnterior) : '—'}
          rotuloComparativo={rotuloComparativo}
          mostrarComparativo={mostrarComparativo && !semCustoCadastrado}
          subtexto={
            metricas && semCustoCadastrado ? (
              <p className="text-xs text-muted-foreground mt-1">
                Depende do preço de compra.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Faturamento menos custo · margem{' '}
                <span className="font-medium">
                  {margemBruta.toFixed(1).replace('.', ',')}%
                </span>
              </p>
            )
          }
        />
      </div>

      {/* ── Lucro & margem + Meta do mês ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3 lg:gap-4 lg:mb-6">
        <CardLucro
          metricas={metricas}
          mostrarComparativo={mostrarComparativo}
          rotuloComparativo={rotuloComparativo}
        />
        <CardMeta metricas={metricas} onSalvar={salvarMeta} />
      </div>

      {/* ── Gráfico de vendas + Top produtos ── */}
      {/*
        ⭐ `par-grafico`: no celular esta caixa deixa de existir como caixa
        (`display: contents`), e os dois cartões viram filhos diretos do Painel.
        É o que permite o gráfico subir para perto do topo sem arrastar o Top 5
        junto — eles só estavam na mesma caixa por causa da grade do monitor.
      */}
      <div className="par-grafico grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
        {/* Gráfico de vendas no tempo */}
        <div className="ordem-grafico lg:col-span-2 border rounded-xl p-3 mb-3 lg:mb-0 lg:p-4 bg-card">
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
              {/*
                No monitor o período cabe na mesma linha do título. Em 360px
                essa linha aperta o título contra o botão, então ele desce —
                que é onde o modelo põe a data, logo abaixo do nome do cartão.
              */}
              <span className="hidden lg:inline text-xs text-muted-foreground">{rotuloPeriodo}</span>
            </div>
          </div>
          {/*
            ⭐ O seletor de período mora aqui no celular: ele filtra este gráfico,
            e no alto da página ele era a primeira coisa que aparecia — uma barra
            cinza antes de qualquer número.
          */}
          {ehCelular && (
            <FiltroPeriodo
              compacto
              modo={modo}
              periodoDias={periodoDias}
              mesAtual={mesAtual}
              compararMes={compararMes}
              mesComparativo={mesComparativo}
              mesMaximo={mesMaximo}
              onJanela={(dias) => { setModo('janela'); setPeriodoDias(dias) }}
              onMes={aplicarMes}
            />
          )}
          {/*
            O rótulo do período só aparece no modo "Mês", e só no celular: nos
            outros modos a pílula acesa já diz "30 dias" com as mesmas palavras,
            e repetir logo abaixo dela seria dizer duas vezes a mesma coisa.
            No modo Mês, não: a pílula diz "Mês", e só esta linha diz QUAL.
          */}
          {modo === 'mes' && (
            <p className="lg:hidden mt-2 text-[12px] text-muted-foreground">{rotuloPeriodo}</p>
          )}
          {carregandoMetricas ? (
            <Skeleton className="h-56 lg:h-64 w-full" />
          ) : metricas && metricas.serie_temporal.length > 0 ? (
            <>
            {/*
              ⭐ O desenho do celular segue o modelo que o dono mandou: barra
              fina de topo arredondado, respiro entre elas, linha de grade
              tracejada e rótulo espaçado.

              ⚠️ Aqui não dá para usar `lg:`. O Recharts desenha SVG a partir de
              PROPRIEDADE em JavaScript — largura de barra e passo do eixo não
              são CSS e nenhuma classe os alcança. Por isso o `ehCelular`, e por
              isso cada linha abaixo repete o valor de hoje no ramo do monitor,
              mesmo quando ele é só o padrão da biblioteca: assim dá para
              provar, lendo, que o desktop continua onde estava.
            */}
            {/*
              ⚠️ A margem negativa é só do monitor. No celular ela empurrava o
              eixo de valores para cima da borda do cartão e comia o começo de
              cada rótulo.
            */}
            <div className="h-56 lg:h-64 lg:-ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={metricas.serie_temporal}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                  barGap={ehCelular ? 1 : 2}
                  barCategoryGap={ehCelular ? '26%' : '10%'}
                  /*
                    ⚠️ O teto de largura existe por causa do período CURTO.

                    Sem ele, o Recharts divide a largura toda entre as barras
                    que houver: três dias de movimento viram três blocos de
                    150px, e o gráfico deixa de parecer gráfico. Nas palavras
                    do dono, ficam "muito quadradões".

                    O teto não atrapalha o mês cheio: com 30 barras a largura
                    de cada uma já é bem menor que isto, e o valor é ignorado.
                  */
                  maxBarSize={ehCelular ? 10 : 44}
                >
                  <CartesianGrid
                    strokeDasharray={ehCelular ? '4 4' : '3 3'}
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="rotulo"
                    fontSize={ehCelular ? 10 : 11}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    interval={ehCelular ? intervaloRotulos : 'preserveEnd'}
                    minTickGap={ehCelular ? 8 : 5}
                  />
                  <YAxis
                    fontSize={ehCelular ? 10 : 11}
                    width={ehCelular ? 40 : 60}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={ehCelular ? fmtEixoSemMoeda : fmtCompacto}
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
                  {/* No celular quem diz quem é quem é o rodapé, logo abaixo. */}
                  {compararSerie && !ehCelular && (
                    <Legend
                      formatter={(v) => (v === 'total_anterior' ? 'Período anterior' : 'Período atual')}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                  )}
                  {/* Anterior (cinza) à esquerda, atual (cor) à direita de cada par */}
                  {compararSerie && (
                    <Bar dataKey="total_anterior" fill={COR_PERIODO_ANTERIOR} radius={[4, 4, 0, 0]} />
                  )}
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/*
              ⭐ O rodapé do modelo: fio, legenda à esquerda, total à direita.

              É ele que faz o cartão valer sem interpretação — quem só quer o
              número do período lê e vai embora, sem medir barra no olho.

              `lg:hidden` porque no monitor a legenda do Recharts já está ali e
              o faturamento continua à vista no cartão de cima, sem rolagem.
            */}
            <div className="lg:hidden mt-2 pt-2 border-t flex items-center gap-3">
              <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-[3px] bg-primary shrink-0" aria-hidden="true" />
                <span className="truncate">{compararSerie ? 'Período atual' : 'Faturamento'}</span>
              </span>
              {compararSerie && (
                <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <span
                    className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                    style={{ backgroundColor: COR_PERIODO_ANTERIOR }}
                    aria-hidden="true"
                  />
                  <span className="truncate">Anterior</span>
                </span>
              )}
              {/*
                ⚠️ `shrink-0` no número e `min-w-0`+`truncate` nas legendas: se um
                dia o total não couber, quem cede espaço é a palavra, nunca o
                dinheiro — e a página não rola para o lado (roteiro §11).
              */}
              <span className="num ml-auto shrink-0 text-[13px] font-bold text-foreground">{fmt(totalSerie)}</span>
            </div>
            </>
          ) : (
            <div className="h-56 lg:h-64 flex items-center justify-center text-muted-foreground text-sm">
              Sem vendas no período.
            </div>
          )}
        </div>

        {/* Top 5 produtos */}
        <div className="border rounded-xl p-3 lg:p-4 bg-card">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold">Top 5 produtos</h3>
          </div>
          {carregandoMetricas ? (
            <SkeletonLista linhas={5} comRank />
          ) : metricas && metricas.top_produtos.length > 0 ? (
            <ul className="space-y-1.5 lg:space-y-2.5">
              {metricas.top_produtos.map((p, i) => (
                <li key={p.produto_id} className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? 'bg-warn-soft text-warn'
                    : i === 1 ? 'bg-muted text-muted-foreground'
                    : i === 2 ? 'bg-muted text-muted-foreground'
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 lg:gap-4 lg:mt-4">
        <CardFormaPagamento metricas={metricas} carregando={carregandoMetricas} />
        <CardTopCategorias metricas={metricas} carregando={carregandoMetricas} />
      </div>

      {/*
        ── Tráfego pago + ROAS ──

        Entram aqui, logo depois de "de onde veio o dinheiro", porque respondem
        a pergunta seguinte: quanto custou fazer esse dinheiro entrar. Os dois
        cartões buscam os próprios dados e usam o MESMO período do filtro lá em
        cima.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 lg:gap-4 lg:mt-4">
        <CardsTrafegoPago
          inicio={intervalo.inicio_atual}
          fim={intervalo.fim_atual}
          rotuloPeriodo={rotuloPeriodo}
        />
      </div>

      {/* ── Ranking de vendedores + Vendas por dia da semana ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 lg:gap-4 lg:mt-4">
        <CardRankingVendedores metricas={metricas} carregando={carregandoMetricas} />
        <CardDiaSemana metricas={metricas} carregando={carregandoMetricas} />
      </div>

      {/* ── A receber + A pagar (as duas pontas do caixa) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 lg:gap-4 lg:mt-4">
        <CardRecebivel metricas={metricas} rotuloPeriodo={rotuloPeriodo} />
        <CardAPagar metricas={metricas} rotuloPeriodo={rotuloPeriodo} />
      </div>

      {/* ── Produtos parados + Estoque baixo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 lg:gap-4 lg:mt-4">
        <CardProdutosParados metricas={metricas} carregando={carregandoMetricas} />
        <CardEstoqueBaixo metricas={metricas} />
      </div>

      {/* ── Aniversariantes do mês ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3 lg:gap-4 lg:mt-4">
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

/**
 * O seletor de período, nas duas roupas.
 *
 * ── Onde ele mora ────────────────────────────────────────────────────────────
 * No monitor, no cabeçalho do Painel, ao lado do título — como sempre esteve.
 * No celular, DENTRO do cartão de "Vendas no tempo", que é o que ele filtra: no
 * alto da página ele era a primeira coisa a aparecer, uma barra cinza antes de
 * qualquer número.
 *
 * ⚠️ Renderizado UMA vez, escolhido em JavaScript. Com `hidden lg:flex` as duas
 * roupas existiriam no DOM ao mesmo tempo, e o "Mês" é um painelzinho com
 * estado próprio: duas cópias, dois estados, e um deles sempre errado.
 *
 * ── A pílula que escorrega ───────────────────────────────────────────────────
 * Na roupa do celular são cinco colunas iguais, e a pílula anda entre elas — a
 * mesma gramática das abas de Vencimentos e da ilha de navegação. Colunas
 * IGUAIS não é capricho: é o que deixa a conta da pílula ser uma só para as
 * cinco posições.
 *
 * ── Por que ele não fica mais fino que isto ──────────────────────────────────
 * ⚠️ 44px é piso, não escolha: o bloco de `any-pointer: coarse` no `index.css`
 * levanta todo botão da web a essa altura, porque errar o alvo trinta vezes por
 * dia cansa mais do que parece. O que encolheu foi o resto — o recheio do
 * trilho, o corpo da letra e o ícone do "Mês", que sai para a coluna caber.
 */
const FiltroPeriodo: FC<{
  compacto?: boolean
  modo: Modo
  periodoDias: number
  mesAtual: string
  compararMes: boolean
  mesComparativo: string
  mesMaximo: string
  onJanela: (dias: number) => void
  onMes: (mes: string, comparar: boolean, mesComparativo: string) => void
}> = ({
  compacto, modo, periodoDias, mesAtual, compararMes, mesComparativo, mesMaximo, onJanela, onMes
}) => {
  /*
   * O painelzinho do "Mês" está aberto?
   *
   * ⚠️ A pílula precisa saber. Sem isto, tocar em "Mês" abria o painel e a
   * pílula continuava acesa no botão anterior até alguém aplicar um mês — o
   * toque não tinha resposta nenhuma, e parecia defeito.
   */
  const [mesAberto, setMesAberto] = useState(false)

  if (compacto) {
    // A quinta posição é a do "Mês"; as quatro primeiras são as janelas móveis.
    const indice = modo === 'mes' || mesAberto
      ? PERIODOS.length
      : Math.max(0, PERIODOS.findIndex((p) => p.dias === periodoDias))
    return (
      <div className="filtro-periodo mt-2" role="group" aria-label="Período">
        {/* ⚠️ IRMÃ e ANTES dos botões: elemento posicionado pinta na ordem do
            DOM, então ela fica por baixo sem z-index em cada rótulo. */}
        <span
          className="filtro-periodo-pilula"
          aria-hidden="true"
          style={{ '--i': indice } as CSSProperties}
        />
        {PERIODOS.map((p) => {
          const ativo = modo === 'janela' && periodoDias === p.dias && !mesAberto
          return (
            <button
              key={p.dias}
              type="button"
              aria-pressed={ativo}
              onClick={() => onJanela(p.dias)}
              className={`filtro-periodo-item ${ativo ? 'text-foreground' : 'text-muted-foreground'}`}
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
          onApply={onMes}
          className="filtro-periodo-item w-full"
          semIcone
          onAberto={setMesAberto}
        />
      </div>
    )
  }

  /*
   * A roupa do monitor, igual à de sempre.
   *
   * `flex-1` nos botões e `shrink-0` no "Mês" continuam aqui porque esta roupa
   * também serve o aplicativo instalado numa janela estreita — sem eles o "Mês"
   * escapava da caixa cinza (defeito nº 11).
   */
  return (
    <div className="flex w-full lg:w-auto gap-1 p-1 bg-muted rounded-lg">
      {PERIODOS.map((p) => {
        const ativo = modo === 'janela' && periodoDias === p.dias
        return (
          <button
            key={p.dias}
            onClick={() => onJanela(p.dias)}
            className={`flex-1 lg:flex-none px-2 lg:px-3 py-1.5 text-xs lg:text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
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
        onApply={onMes}
      />
    </div>
  )
}

/**
 * Uma linha de vencimento: cliente, telefone, valor e quando.
 *
 * A mesma linha serve o celular e o monitor porque, das duas listas, o que
 * muda é só a cor do valor e a frase embaixo dele. Deixar duas cópias quase
 * iguais só garantiria que uma delas ficaria para trás no próximo ajuste.
 */
const LinhaVencimento: FC<{
  nome: string
  telefone: string
  valor: number
  detalhe: string
  atrasado: boolean
  onAbrir: () => void
}> = ({ nome, telefone, valor, detalhe, atrasado, onAbrir }) => (
  <button
    type="button"
    onClick={onAbrir}
    className={`w-full min-h-[56px] text-left flex justify-between items-start gap-3 py-2 lg:py-3 border-b last:border-b-0 transition-colors cursor-pointer ${
      atrasado
        ? 'hover:bg-critical-soft active:bg-critical-soft'
        : 'hover:bg-warn-soft active:bg-warn-soft'
    }`}
    title="Ver dívidas e parcelas do cliente"
  >
    {/*
      `min-w-0` é obrigatório: sem ele um nome longo se recusa a encolher
      abaixo do próprio conteúdo e empurra o valor para fora da tela. É uma das
      três causas de rolagem horizontal que o roteiro nomeia (§11).
    */}
    <div className="min-w-0">
      <p className="font-semibold text-[14px] lg:text-[15px] text-foreground truncate" title={nome}>{nome}</p>
      <p className="text-[11.5px] lg:text-[12.5px] text-muted-foreground mt-0.5">{telefone}</p>
    </div>
    <div className="text-right shrink-0">
      {/*
        `num` põe a monoespaçada com `tabular-nums`: é o que faz R$ 295,00 e
        R$ 70,00 alinharem a vírgula sem tabela. Sem isso os algarismos têm
        larguras diferentes e a coluna dança a cada linha.
      */}
      <p className={`num text-[14px] lg:text-[15px] ${atrasado ? 'text-critical' : 'text-warn'}`}>
        {fmt(valor)}
      </p>
      <p className="text-[11.5px] lg:text-[12.5px] text-muted-foreground mt-0.5">{detalhe}</p>
    </div>
  </button>
)

/**
 * Vencimentos no celular: os dois cartões viram um, com duas abas.
 *
 * ── Por que NÃO uma lista só ─────────────────────────────────────────────────
 * ⚠️ Juntar as duas listas numa fila única já foi tentado e RECUSADO pelo dono,
 * com a palavra certa: misturar o vermelho do atraso com o âmbar do que vence
 * hoje "dá um ar de caos". Aqui elas seguem separadas, e a cor de cada uma só
 * aparece na vez dela — a faixa do topo, o ícone e o total do cabeçalho
 * acompanham a aba aberta. Não refazer isso sem perguntar.
 *
 * ── Por que abas, e não dois cartões empilhados ──────────────────────────────
 * Empilhados, os dois comiam a primeira tela inteira antes de aparecer um
 * número. Com abas, só uma lista ocupa espaço por vez — e a contagem da outra
 * continua à vista na própria aba, que é o que impede a troca de esconder
 * informação: dá para saber que há três atrasados sem abrir nada.
 *
 * ── A pílula que escorrega ───────────────────────────────────────────────────
 * É a MESMA gramática da ilha de navegação lá embaixo: pílula irmã dos botões,
 * antes deles no DOM, deslizando por baixo. Repetir um idioma que a pessoa já
 * aprendeu na barra é o que faz a tela parecer uma coisa só.
 */
const CartaoVencimentos: FC<{
  inadimplentes: ClienteInadimplente[]
  vencendoHoje: ClienteVencendoHoje[]
  onAbrirCliente: (id: number, nome: string) => void
}> = ({ inadimplentes, vencendoHoje, onAbrirCliente }) => {
  const [aba, setAba] = useState(0)
  /** +1 entrou pela direita, -1 pela esquerda. Diz de onde a lista veio. */
  const [sentido, setSentido] = useState(1)
  const [escolheu, setEscolheu] = useState(false)

  /*
   * Abre na aba que tem má notícia. Sem atraso nenhum, começa em "Vencem hoje".
   *
   * ⚠️ Só até a pessoa tocar numa aba. Depois disso a escolha dela manda, senão
   * a tela trocaria de aba sozinha embaixo do dedo a cada atualização dos
   * números.
   */
  useEffect(() => {
    if (escolheu) return
    if (inadimplentes.length === 0 && vencendoHoje.length > 0) setAba(1)
  }, [escolheu, inadimplentes.length, vencendoHoje.length])

  const trocar = (i: number) => {
    setSentido(i > aba ? 1 : -1)
    setAba(i)
    setEscolheu(true)
  }

  const abas = [
    {
      rotulo: 'Em atraso',
      quantos: inadimplentes.length,
      total: inadimplentes.reduce((s, c) => s + c.total_devido, 0),
      etiqueta: 'bg-critical-fill text-on-fill',
      texto: 'text-critical',
      faixa: 'border-t-critical-fill',
      vazio: 'Nenhum cliente inadimplente.'
    },
    {
      rotulo: 'Vencem hoje',
      quantos: vencendoHoje.length,
      total: vencendoHoje.reduce((s, c) => s + c.total, 0),
      etiqueta: 'bg-warn text-on-fill',
      texto: 'text-warn',
      faixa: 'border-t-warn',
      vazio: 'Nenhum vencimento para hoje.'
    }
  ]
  const atual = abas[aba]

  return (
    <div className={`ordem-vencimentos lg:hidden rounded-xl border border-t-2 bg-card shadow-sm p-3 mb-3 ${atual.faixa}`}>
      <div className="flex items-center gap-2 mb-2">
        {aba === 0
          ? <AlertTriangle className="w-[18px] h-[18px] text-critical shrink-0" />
          : <Clock className="w-[18px] h-[18px] text-warn shrink-0" />}
        <h3 className="text-[13.5px] font-semibold text-foreground">Vencimentos</h3>
        {/* O total da aba aberta, à direita: a resposta que 90% das aberturas
            procurava, sem ler linha nenhuma. */}
        <span className={`num ml-auto shrink-0 text-[13px] font-bold ${atual.texto}`}>
          {fmt(atual.total)}
        </span>
      </div>

      {/* ⚠️ A pílula é IRMÃ dos botões e vem ANTES deles: elemento posicionado
          pinta na ordem do DOM, então ela fica por baixo sem z-index nenhum. */}
      <div className="abas-vencimento" role="tablist" aria-label="Vencimentos">
        <span
          className="aba-vencimento-pilula"
          aria-hidden="true"
          style={{ '--i': aba } as CSSProperties}
        />
        {abas.map((a, i) => (
          <button
            key={a.rotulo}
            type="button"
            role="tab"
            aria-selected={aba === i}
            onClick={() => trocar(i)}
            className={`aba-vencimento ${aba === i ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {a.rotulo}
            {a.quantos > 0 && (
              <span
                className={`text-[11px] font-bold rounded-lg px-1.5 py-0.5 ${
                  aba === i ? a.etiqueta : 'bg-foreground/10 text-muted-foreground'
                }`}
              >
                {a.quantos}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* `key={aba}` é o que faz a animação TOCAR DE NOVO a cada troca: sem ela o
          React reaproveita o mesmo nó e o navegador não vê animação nova. */}
      <div
        key={aba}
        className="painel-vencimento mt-2"
        style={{ '--de': sentido } as CSSProperties}
      >
        {atual.quantos === 0 ? (
          <div className="flex min-h-[92px] flex-col items-center justify-center gap-1.5 text-center">
            <CheckCircle2 className="h-5 w-5 text-positive" aria-hidden="true" />
            <p className="text-[12.5px] text-muted-foreground">{atual.vazio}</p>
          </div>
        ) : (
          <div className="max-h-[200px] overflow-y-auto pr-2 scrollbar-suave">
            {aba === 0
              ? inadimplentes.map((c) => (
                  <LinhaVencimento
                    key={c.id}
                    nome={c.nome}
                    telefone={c.telefone}
                    valor={c.total_devido}
                    detalhe={`desde ${fmtData(c.vencimento_mais_antigo)}`}
                    atrasado
                    onAbrir={() => onAbrirCliente(c.id, c.nome)}
                  />
                ))
              : vencendoHoje.map((c) => (
                  <LinhaVencimento
                    key={c.id}
                    nome={c.nome}
                    telefone={c.telefone}
                    valor={c.total}
                    detalhe="vence hoje"
                    atrasado={false}
                    onAbrir={() => onAbrirCliente(c.id, c.nome)}
                  />
                ))}
          </div>
        )}
      </div>
    </div>
  )
}

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
  /*
   * Pinta a variação de cinza em vez de verde/vermelho.
   *
   * ⚠️ Existe para o custo. Custo que sobe não é notícia ruim: quase sempre
   * subiu porque se vendeu mais. Pintar de vermelho faria o lojista procurar um
   * problema que não existe, e pintar de verde seria pior ainda. Quando a
   * direção não tem significado, a cor honesta é nenhuma.
   */
  deltaNeutro?: boolean
}

/**
 * Tamanho do número principal de um KPI, no celular.
 *
 * ⚠️ São dois cartões por linha em 360px: sobram ~140px de texto útil, e
 * "R$ 30.299,75" a 24px pede 165. O valor vazava para fora do cartão.
 *
 * Uma classe menor fixa resolveria o número de hoje e estouraria de novo no
 * dia em que a loja vendesse mais — que é o dia em que ele MAIS vai olhar
 * esse cartão. Por isso o tamanho segue o COMPRIMENTO do valor: dinheiro
 * não se corta com reticências nem se quebra em duas linhas.
 *
 * No monitor nada disso vale: lá o `lg:text-2xl` manda, como sempre.
 */
const tamanhoDoValor = (valor: string): string =>
  valor.length > 14 ? 'text-[15px]'
  : valor.length > 12 ? 'text-[17px]'
  : valor.length > 9 ? 'text-[19px]'
  : 'text-[22px]'

const CardKPI: FC<CardKPIProps> = ({
  icone, corIcone, titulo, valor, delta, valorAnterior, rotuloComparativo, mostrarComparativo,
  subtexto, deltaNeutro = false
}) => {
  const corDelta =
    !delta.valido || deltaNeutro ? 'text-muted-foreground'
    : delta.pct > 0 ? 'text-positive'
    : delta.pct < 0 ? 'text-critical'
    : 'text-muted-foreground'
  const sinal = delta.pct > 0 ? '+' : ''
  return (
    <div className="anim-gatilho border rounded-xl p-3 lg:p-4 bg-card">
      <div className={`anim-alvo-salta w-10 h-10 rounded-lg ${corIcone} flex items-center justify-center mb-3`}>
        {icone}
      </div>
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className={`${tamanhoDoValor(valor)} lg:text-2xl font-bold mt-0.5 whitespace-nowrap`}>{valor}</p>
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
    : deltaNovos.pct > 0 ? 'text-positive'
    : deltaNovos.pct < 0 ? 'text-critical'
    : 'text-muted-foreground'
  const sinal = deltaNovos.pct > 0 ? '+' : ''
  return (
    <div className="anim-gatilho border rounded-xl p-3 lg:p-4 bg-card">
      <div className="anim-alvo-salta w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center mb-3">
        <Users className="w-5 h-5 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">Clientes</p>
      <p className="text-2xl font-bold mt-0.5">{totalClientes != null ? totalClientes : '...'}</p>
      <p className="text-xs mt-1">
        <span className="font-medium text-primary">{novosAtual != null ? `+${novosAtual}` : '—'}</span>{' '}
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
    : delta.pct > 0 ? 'text-positive'
    : delta.pct < 0 ? 'text-critical'
    : 'text-muted-foreground'
  const sinal = delta.pct > 0 ? '+' : ''

  return (
    <div className="border rounded-xl p-3 lg:p-4 bg-card">
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
            <p className="text-2xl font-bold mt-0.5 text-positive">{fmt(lucro)}</p>
            <span className="text-sm font-semibold bg-positive-soft text-positive rounded-full px-2 py-0.5 whitespace-nowrap">
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
              <span className="text-critical">− {fmt(metricas.custo_vendas_atual)}</span>
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
    <div className="border rounded-xl p-3 lg:p-4 bg-card">
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
              className={`h-full rounded-full transition-[width] ${pct >= 100 ? 'bg-positive' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs">
            <span className={`font-semibold ${pct >= 100 ? 'text-positive' : 'text-primary'}`}>{pct}% da meta</span>
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
  const ehCelular = useEhCelular()
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
    <div className="border rounded-xl p-3 lg:p-4 bg-card">
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
          {/* Menor no celular: com 176px de rosca sobravam ~130 para a
              legenda, e "Inadimplente" não cabia em 130. */}
          <div className="h-32 w-32 lg:h-44 lg:w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {/*
                  ⚠️ Raio em PORCENTAGEM no celular, não em pixel.
                  A caixa encolheu de 176 para 128px para dar largura à legenda,
                  e um `outerRadius` de 70 num quadrado de 128 (centro em 64)
                  pedia mais do que cabia: o desenho parava na borda e a rosca
                  saía com os quatro lados chanfrados, com cara de octógono.
                  Porcentagem é do menor lado, então ela acompanha a caixa —
                  inclusive na próxima vez que a caixa mudar de tamanho.
                */}
                <Pie
                  data={dados}
                  dataKey="num"
                  innerRadius={ehCelular ? '52%' : 42}
                  outerRadius={ehCelular ? '88%' : 70}
                  paddingAngle={2}
                >
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
                {/*
                  ⚠️ `min-w-0` + `truncate` no nome e `shrink-0` na porcentagem.
                  Sem os dois, um rótulo comprido ("Inadimplente") se recusa a
                  encolher e empurra a porcentagem para fora do cartão — a
                  mesma causa de rolagem lateral que a §11 nomeia.
                */}
                <span className="min-w-0 flex-1 truncate" title={d.nome}>{d.nome}</span>
                <span className="num shrink-0 text-muted-foreground text-xs">
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
    <div className="border rounded-xl p-3 lg:p-4 bg-card">
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
    <div className="anim-gatilho border rounded-xl p-3 lg:p-4 bg-card">
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
              <> · <span className="font-medium text-critical">{fmt(periodo.vencido)} em atraso</span></>
            )}
          </p>
        )}
      </div>
      {/*
        Vendas a prazo combinadas SEM data. Elas não entram em nenhuma das
        contas acima, que são todas ancoradas em vencimento — sem esta linha o
        dinheiro simplesmente não apareceria no Painel.

        Só desenha quando existe: numa loja que sempre combina data, seria uma
        linha de zero para sempre.
      */}
      {!!metricas?.a_receber_sem_prazo && (
        <div className="rounded-lg border border-dashed px-3 py-2 mb-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">Sem prazo combinado</span>
            <span className="font-semibold shrink-0">{fmt(metricas.a_receber_sem_prazo)}</span>
          </div>
        </div>
      )}
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

const CardAPagar: FC<{ metricas: MetricasDashboard | null; rotuloPeriodo: string }> = ({
  metricas, rotuloPeriodo
}) => {
  const futuro = metricas?.a_pagar_futuro
  const periodo = metricas?.a_pagar_periodo
  const totalPeriodo = periodo ? periodo.a_vencer + periodo.vencido : 0

  return (
    <div className="anim-gatilho border rounded-xl p-3 lg:p-4 bg-card">
      <div className="flex items-center gap-2 mb-3">
        <Receipt className="anim-alvo-acena w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">A pagar</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2 mb-3">
        Contas da loja, pelo vencimento
      </p>
      {/* Vencimentos dentro do período filtrado — o espelho do "A receber". */}
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
              <> · <span className="font-medium text-critical">{fmt(periodo.vencido)} vencido</span></>
            )}
          </p>
        )}
      </div>
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Próximos 30 dias</span>
          <span className="font-bold">{futuro ? fmt(futuro.proximos_30d) : '...'}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Próximos 60 dias</span>
          <span className="font-semibold">{futuro ? fmt(futuro.proximos_60d) : '...'}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Próximos 90 dias</span>
          <span className="font-semibold">{futuro ? fmt(futuro.proximos_90d) : '...'}</span>
        </div>
      </div>
    </div>
  )
}

const CardProdutosParados: FC<WidgetProps> = ({ metricas, carregando }) => {
  const produtos = metricas?.produtos_parados ?? []
  return (
    <div className="border rounded-xl p-3 lg:p-4 bg-card">
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
    <div className="border rounded-xl p-3 lg:p-4 bg-card">
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
                  ? 'bg-critical-soft text-critical'
                  : 'bg-warn-soft text-warn'
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
    <div className="border rounded-xl p-3 lg:p-4 bg-card">
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
                  i === 0 ? 'bg-warn-soft text-warn'
                  : i === 1 ? 'bg-muted text-muted-foreground'
                  : i === 2 ? 'bg-muted text-muted-foreground'
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
    <div className="border rounded-xl p-3 lg:p-4 bg-card">
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
              <BarChart
                data={dados}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                maxBarSize={44}
              >
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
    <div className="border rounded-xl p-3 lg:p-4 bg-card">
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
                <div className="w-9 h-9 rounded-full bg-primary-soft text-primary flex items-center justify-center shrink-0">
                  <Gift className="anim-alvo-acena w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={a.nome}>{a.nome}</p>
                  <p className="text-xs text-muted-foreground">{a.telefone}</p>
                </div>
                <span className="text-sm font-semibold text-primary">{a.dia}</span>
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
