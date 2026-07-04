import { FC, useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

type Props = {
  value: string                  // 'YYYY-MM' ou '' (sem seleção)
  onChange: (v: string) => void
  allowClear?: boolean           // mostra X pra limpar (volta a value='')
  maxMes?: string                // 'YYYY-MM' — bloqueia meses acima
  placeholder?: string           // texto exibido quando value === ''
  align?: 'left' | 'right'       // alinhamento do popover (default: left)
}

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_LONGO = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

const MesPicker: FC<Props> = ({
  value, onChange, allowClear = false, maxMes,
  placeholder = 'Selecionar mês', align = 'left'
}) => {
  const [aberto, setAberto] = useState(false)
  const [anoView, setAnoView] = useState<number>(() => {
    if (value) return Number(value.split('-')[0])
    return new Date().getFullYear()
  })
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aberto])

  // Ao abrir, alinha o ano da visualização com o ano selecionado.
  useEffect(() => {
    if (aberto && value) setAnoView(Number(value.split('-')[0]))
  }, [aberto, value])

  const [anoMaximo, mesMaximo] = maxMes
    ? maxMes.split('-').map(Number)
    : [9999, 12]

  const label = value
    ? `${MESES_LONGO[Number(value.split('-')[1]) - 1]} / ${value.split('-')[0]}`
    : placeholder

  const selecionarMes = (mes: number) => {
    onChange(`${anoView}-${String(mes).padStart(2, '0')}`)
    setAberto(false)
  }

  const limpar = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-md bg-background hover:bg-muted/50 transition-colors"
      >
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <span className={value ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
        {allowClear && value && (
          <span
            onClick={limpar}
            className="ml-1 p-0.5 hover:bg-muted rounded"
            role="button"
            aria-label="Limpar mês"
            title="Limpar"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {aberto && (
        <div className={`absolute mt-1 z-50 w-56 bg-popover border rounded-lg shadow-lg p-2 ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}>
          {/* Navegação de ano */}
          <div className="flex items-center justify-between px-2 py-1 mb-2 border-b">
            <button
              type="button"
              onClick={() => setAnoView((y) => y - 1)}
              className="p-1 hover:bg-muted rounded transition-colors"
              aria-label="Ano anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-sm">{anoView}</span>
            <button
              type="button"
              onClick={() => anoView < anoMaximo && setAnoView((y) => y + 1)}
              disabled={anoView >= anoMaximo}
              className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Próximo ano"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grade 3 linhas × 4 colunas de meses */}
          <div className="grid grid-cols-4 gap-1">
            {MESES_CURTO.map((nome, i) => {
              const mes = i + 1
              const desabilitado =
                anoView > anoMaximo || (anoView === anoMaximo && mes > mesMaximo)
              const selecionado =
                value === `${anoView}-${String(mes).padStart(2, '0')}`
              return (
                <button
                  key={nome}
                  type="button"
                  onClick={() => !desabilitado && selecionarMes(mes)}
                  disabled={desabilitado}
                  className={`py-1.5 text-xs rounded transition-colors ${
                    selecionado
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : desabilitado
                        ? 'text-muted-foreground/40 cursor-not-allowed'
                        : 'hover:bg-muted'
                  }`}
                >
                  {nome}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default MesPicker
