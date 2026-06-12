import { FC, useEffect, useRef, useState } from 'react'
import { CalendarDays, RotateCcw } from 'lucide-react'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

const mesAnoAnteriorDe = (yyyymm: string): string => {
  const [y, m] = yyyymm.split('-')
  return `${Number(y) - 1}-${m}`
}

const rotuloMesAno = (yyyymm: string): string => {
  const [y, m] = yyyymm.split('-')
  return `${MESES[Number(m) - 1]} de ${y}`
}

type Props = {
  mes: string                 // 'YYYY-MM' — mês de referência aplicado
  comparar: boolean           // comparação com outro mês ativa
  mesComparativo: string      // 'YYYY-MM' — mês de comparação aplicado
  ativo: boolean              // modo 'mes' está ativo (destaca o botão)
  maxMes: string              // 'YYYY-MM' — bloqueia meses futuros
  onApply: (mes: string, comparar: boolean, mesComparativo: string) => void
}

const FiltroMesPopover: FC<Props> = ({ mes, comparar, mesComparativo, ativo, maxMes, onApply }) => {
  const [aberto, setAberto] = useState(false)
  // Rascunho: só vira estado aplicado quando o usuário clica em "Aplicar".
  const [draftMes, setDraftMes] = useState(mes)
  const [draftComparar, setDraftComparar] = useState(comparar)
  const [draftComp, setDraftComp] = useState(mesComparativo)
  const ref = useRef<HTMLDivElement>(null)

  // Ao abrir, sincroniza o rascunho com o estado aplicado.
  useEffect(() => {
    if (aberto) {
      setDraftMes(mes)
      setDraftComparar(comparar)
      setDraftComp(mesComparativo)
    }
  }, [aberto, mes, comparar, mesComparativo])

  // Fecha (descarta o rascunho) ao clicar fora.
  useEffect(() => {
    if (!aberto) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aberto])

  const [anoMax, mesMax] = maxMes.split('-').map(Number)
  // Últimos 6 anos + garante que os anos já selecionados estejam na lista.
  const anos = (() => {
    const base = Array.from({ length: 6 }, (_, i) => anoMax - i)
    const selecionados = [Number(draftMes.split('-')[0]), Number(draftComp.split('-')[0])]
    return [...new Set([...base, ...selecionados])].sort((a, b) => b - a)
  })()

  const aplicar = () => {
    onApply(draftMes, draftComparar, draftComp)
    setAberto(false)
  }

  const alternarComparar = () => {
    // Ao ligar, sugere o mesmo mês do ano anterior como comparação padrão.
    if (!draftComparar) setDraftComp(mesAnoAnteriorDe(draftMes))
    setDraftComparar((c) => !c)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
          ativo ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Resultados de um mês específico"
      >
        <CalendarDays className="w-3.5 h-3.5" />
        Mês
      </button>

      {aberto && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-popover border rounded-lg shadow-lg p-4">
          <SeletorMesAno
            label="Mês de referência"
            mes={draftMes}
            onChange={setDraftMes}
            anos={anos}
            anoMax={anoMax}
            mesMax={mesMax}
          />

          <div className="flex items-center justify-between py-3 mt-3 border-t border-b">
            <span className="text-sm">Comparar com outro mês</span>
            <button
              type="button"
              onClick={alternarComparar}
              role="switch"
              aria-checked={draftComparar}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                draftComparar ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  draftComparar ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {draftComparar ? (
            <div className="flex items-end gap-1.5 mt-3">
              <div className="flex-1">
                <SeletorMesAno
                  label="Comparar com"
                  mes={draftComp}
                  onChange={setDraftComp}
                  anos={anos}
                  anoMax={anoMax}
                  mesMax={mesMax}
                />
              </div>
              <button
                type="button"
                onClick={() => setDraftComp(mesAnoAnteriorDe(draftMes))}
                className="p-1.5 mb-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors shrink-0"
                title="Mesmo mês do ano anterior"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              Mostra os números só de {rotuloMesAno(draftMes)}, sem comparação com período anterior.
            </p>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={aplicar}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

type SeletorProps = {
  label: string
  mes: string                 // 'YYYY-MM'
  onChange: (v: string) => void
  anos: number[]
  anoMax: number
  mesMax: number
}

const SELECT_CLS =
  'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const SeletorMesAno: FC<SeletorProps> = ({ label, mes, onChange, anos, anoMax, mesMax }) => {
  const [ano, mesNum] = mes.split('-').map(Number)

  const trocarMes = (m: number) => onChange(`${ano}-${String(m).padStart(2, '0')}`)
  const trocarAno = (a: number) => {
    // Se o mês selecionado virar futuro no ano máximo, recua pro mês máximo.
    const m = a === anoMax && mesNum > mesMax ? mesMax : mesNum
    onChange(`${a}-${String(m).padStart(2, '0')}`)
  }

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
      <div className="flex gap-2">
        <select
          className={`${SELECT_CLS} flex-1`}
          value={mesNum}
          onChange={(e) => trocarMes(Number(e.target.value))}
        >
          {MESES.map((nome, i) => (
            <option key={nome} value={i + 1} disabled={ano === anoMax && i + 1 > mesMax}>
              {nome}
            </option>
          ))}
        </select>
        <select
          className={`${SELECT_CLS} w-24`}
          value={ano}
          onChange={(e) => trocarAno(Number(e.target.value))}
        >
          {anos.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default FiltroMesPopover
