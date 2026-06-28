import { FC, ReactNode } from 'react'
import { Skeleton } from '@fhvptech/core/ui/skeleton'

/**
 * Silhueta da Dashboard exibida enquanto a tela e seus números carregam.
 * Espelha o grid real para a página não "pular" quando o conteúdo chega.
 *
 * De propósito não importa recharts nem a Dashboard: é leve para também servir
 * de fallback do carregamento sob demanda (lazy) lá no App, sem arrastar o
 * gráfico para o bundle principal.
 */

// Caixa no mesmo formato dos cards reais (border rounded-xl bg-card).
const CardBox: FC<{ className?: string; children: ReactNode }> = ({ className, children }) => (
  <div className={`border rounded-xl p-4 bg-card ${className ?? ''}`}>{children}</div>
)

// Cabeçalho de card: "ícone" + título.
const CabecalhoCard: FC = () => (
  <div className="flex items-center gap-2 mb-4">
    <Skeleton className="w-5 h-5 rounded-md" />
    <Skeleton className="h-4 w-32" />
  </div>
)

const DashboardSkeleton: FC = () => (
  <div className="p-8">
    {/* Cabeçalho: título + filtro de período */}
    <div className="flex items-center justify-between mb-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-9 w-72 rounded-lg" />
    </div>

    {/* Alertas (inadimplentes / vencem hoje) */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border bg-card shadow-sm p-5">
          <Skeleton className="h-4 w-32 mb-5" />
          <div className="space-y-3">
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex justify-between items-center">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    {/* 4 KPIs */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {[0, 1, 2, 3].map((i) => (
        <CardBox key={i}>
          <Skeleton className="w-10 h-10 rounded-lg mb-3" />
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-7 w-24" />
        </CardBox>
      ))}
    </div>

    {/* Lucro & margem + Meta do mês */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {[0, 1].map((i) => (
        <CardBox key={i}>
          <CabecalhoCard />
          <Skeleton className="h-7 w-40 mb-3" />
          <Skeleton className="h-3 w-full mb-2" />
          <Skeleton className="h-3 w-5/6" />
        </CardBox>
      ))}
    </div>

    {/* Gráfico de vendas (2 colunas) + Top 5 produtos */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <CardBox className="lg:col-span-2">
        <CabecalhoCard />
        <Skeleton className="h-64 w-full" />
      </CardBox>
      <CardBox>
        <CabecalhoCard />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-6 h-6 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </CardBox>
    </div>

    {/* Forma de pagamento + Top categorias */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      {[0, 1].map((i) => (
        <CardBox key={i}>
          <CabecalhoCard />
          <Skeleton className="h-44 w-full" />
        </CardBox>
      ))}
    </div>

    {/* Ranking de vendedores + Vendas por dia da semana */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      {[0, 1].map((i) => (
        <CardBox key={i}>
          <CabecalhoCard />
          <Skeleton className="h-44 w-full" />
        </CardBox>
      ))}
    </div>

    {/* Recebível futuro + Produtos parados + Estoque baixo */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
      {[0, 1, 2].map((i) => (
        <CardBox key={i}>
          <CabecalhoCard />
          <div className="space-y-2.5">
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} className="h-4 w-full" />
            ))}
          </div>
        </CardBox>
      ))}
    </div>
  </div>
)

export default DashboardSkeleton
