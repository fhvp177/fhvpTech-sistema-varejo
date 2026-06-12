import { FC } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'

type PaginacaoProps = {
  paginaAtual: number
  totalItens: number
  itensPorPagina?: number
  onMudarPagina: (pagina: number) => void
  rotuloItem?: string
}

// Calcula a sequência de páginas a exibir, com reticências quando há saltos.
function construirPaginas(atual: number, total: number): Array<number | '...'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set<number>([1, total, atual, atual - 1, atual + 1])
  const pages = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const result: Array<number | '...'> = []
  for (let i = 0; i < pages.length; i++) {
    result.push(pages[i])
    if (i < pages.length - 1 && pages[i + 1] - pages[i] > 1) result.push('...')
  }
  return result
}

const Paginacao: FC<PaginacaoProps> = ({
  paginaAtual,
  totalItens,
  itensPorPagina = 20,
  onMudarPagina,
  rotuloItem = 'item(s)'
}) => {
  // Abaixo do limite: nenhuma paginação, só o contador simples.
  if (totalItens <= itensPorPagina) {
    return (
      <p className="text-xs text-muted-foreground mt-2">
        {totalItens} {rotuloItem}
      </p>
    )
  }

  const totalPaginas = Math.ceil(totalItens / itensPorPagina)
  const paginaSegura = Math.min(Math.max(1, paginaAtual), totalPaginas)
  const inicio = (paginaSegura - 1) * itensPorPagina + 1
  const fim = Math.min(paginaSegura * itensPorPagina, totalItens)
  const paginas = construirPaginas(paginaSegura, totalPaginas)

  return (
    <div className="flex items-center justify-between gap-4 mt-3 flex-wrap">
      <p className="text-xs text-muted-foreground">
        Mostrando <strong>{inicio}–{fim}</strong> de <strong>{totalItens}</strong> {rotuloItem}
        {' · '}
        Página {paginaSegura} de {totalPaginas}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMudarPagina(paginaSegura - 1)}
          disabled={paginaSegura === 1}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Anterior
        </Button>
        {paginas.map((p, i) =>
          p === '...' ? (
            <span key={`gap-${i}`} className="px-2 text-muted-foreground text-sm select-none">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === paginaSegura ? 'default' : 'outline'}
              size="sm"
              onClick={() => onMudarPagina(p)}
              className="min-w-[36px]"
            >
              {p}
            </Button>
          )
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMudarPagina(paginaSegura + 1)}
          disabled={paginaSegura === totalPaginas}
        >
          Próxima
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}

export default Paginacao
