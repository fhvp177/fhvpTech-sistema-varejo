import { FC, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { posicaoDropdown, type PosicaoDropdown } from '@fhvptech/core/lib/posicaoDropdown'
import {
  DIAS_DA_SEMANA_CURTOS,
  DIAS_DA_SEMANA_LONGOS,
  MESES_LONGOS,
  dentroDoIntervalo,
  ehDataIso,
  formatarDataBR,
  gradeDoMes,
  hojeIso,
  mesVizinho
} from '@/utils/calendario'

/**
 * Seletor de data em português, no lugar do campo de data do navegador.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "A grande maioria dos calendários da aba de relatórios estão em inglês,
 * dependendo do usuário, isso é um impeditivo muito grande." (11/09/2026, na
 * loja aberta no navegador.)
 *
 * ── ⚠️ Não dava para consertar o campo nativo ───────────────────────────────
 * O `<input type="date">` desenha o calendário no idioma do NAVEGADOR, e o
 * `lang` da página não muda isso. Num Chrome em inglês a loja inteira em
 * português abre "September / Su Mo Tu We" e escreve a data em mm/dd/aaaa. Não
 * existe atributo, CSS ou truque que resolva: o desenho é do navegador.
 *
 * É a mesma razão pela qual a casa proibiu a lista suspensa nativa do
 * navegador: componente que o navegador desenha sozinho sai fora do idioma e
 * fora do visual do sistema.
 *
 * (Escrito assim, sem soletrar a etiqueta HTML, de propósito: o guarda que
 * proíbe a lista nativa varre o texto do arquivo e não distingue usar de
 * citar. Ver o cabeçalho de `semSelectNativo.test.ts`.)
 *
 * ── ⚠️ As TRÊS regras de lista flutuante dentro de diálogo ──────────────────
 * Este calendário abre dentro do diálogo de Contas a Pagar, então ele obedece
 * as três (e o jsdom não pega nenhuma delas):
 *
 *   1. `createPortal` + `fixed`, posição medida com `getBoundingClientRect()`,
 *      remedindo em `resize` e `scroll` (com captura). Nunca `absolute`.
 *   2. `pointerEvents: auto` e `stopPropagation` no `pointerdown`.
 *   3. `wheel` barrado, senão a roda do mouse não chega.
 *
 * O modelo é o `ClienteSeletor.tsx`, e o porquê de cada uma está escrito lá por
 * extenso.
 */

type Props = {
  /** 'YYYY-MM-DD' ou '' (sem data escolhida). */
  value: string
  onChange: (v: string) => void
  /** Usado pelo `<Label htmlFor>`. */
  id?: string
  /** 'YYYY-MM-DD'. Datas fora ficam apagadas e não clicam. */
  min?: string | null
  max?: string | null
  placeholder?: string
  /** Mostra o X para limpar (volta a value=''). */
  permitirLimpar?: boolean
  disabled?: boolean
  /** Classe do botão — para o campo esticar como os vizinhos dele. */
  className?: string
  'aria-label'?: string
}

/** Largura da caixa do calendário. Sete colunas cabem confortáveis nisto. */
const LARGURA_CAIXA = 268

const DataPicker: FC<Props> = ({
  value,
  onChange,
  id,
  min,
  max,
  placeholder = 'dd/mm/aaaa',
  permitirLimpar = false,
  disabled = false,
  className = '',
  'aria-label': ariaLabel
}) => {
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState<PosicaoDropdown | null>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)

  // Mês que a grade está mostrando. Abre no mês da data escolhida, ou no de hoje.
  const inicial = ehDataIso(value) ? value : hojeIso()
  const [anoView, setAnoView] = useState(Number(inicial.slice(0, 4)))
  const [mesView, setMesView] = useState(Number(inicial.slice(5, 7)))

  // Ao reabrir, volta para o mês da data escolhida: quem abre de novo quase
  // sempre quer mexer perto do que já está lá, não onde parou de navegar.
  useEffect(() => {
    if (!aberto) return
    const base = ehDataIso(value) ? value : hojeIso()
    setAnoView(Number(base.slice(0, 4)))
    setMesView(Number(base.slice(5, 7)))
  }, [aberto, value])

  /*
   * ⚠️ Medida com `getBoundingClientRect`, e remedida em `resize` e `scroll`
   * (com captura, para pegar a rolagem de qualquer contêiner, não só a da
   * janela). Sem o `true`, rolar a página com o calendário aberto deixa a caixa
   * parada no lugar antigo.
   */
  const medir = useCallback(() => {
    const el = botaoRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPosicao(
      posicaoDropdown(
        { left: r.left, top: r.top, bottom: r.bottom, width: Math.max(r.width, LARGURA_CAIXA) },
        window,
        330
      )
    )
  }, [])

  useEffect(() => {
    if (!aberto) return
    medir()
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [aberto, medir])

  // Fecha ao clicar fora, e ao apertar Esc.
  useEffect(() => {
    if (!aberto) return
    const foraDaCaixa = (e: MouseEvent): void => {
      const alvo = e.target as Node
      if (botaoRef.current?.contains(alvo)) return
      if ((alvo as HTMLElement)?.closest?.('[data-datapicker-caixa]')) return
      setAberto(false)
    }
    const noEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setAberto(false)
        botaoRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', foraDaCaixa)
    document.addEventListener('keydown', noEsc, true)
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa)
      document.removeEventListener('keydown', noEsc, true)
    }
  }, [aberto])

  const escolher = (iso: string): void => {
    if (!dentroDoIntervalo(iso, min, max)) return
    onChange(iso)
    setAberto(false)
  }

  const navegar = (passo: 1 | -1): void => {
    const { ano, mes } = mesVizinho(anoView, mesView, passo)
    setAnoView(ano)
    setMesView(mes)
  }

  const hoje = hojeIso()
  const celulas = gradeDoMes(anoView, mesView)

  return (
    <>
      <button
        ref={botaoRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={`flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={`num truncate ${value ? '' : 'text-muted-foreground'}`}>
          {value ? formatarDataBR(value) : placeholder}
        </span>
        {permitirLimpar && value && !disabled && (
          <span
            role="button"
            aria-label="Limpar data"
            title="Limpar"
            className="ml-auto rounded p-0.5 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {aberto &&
        posicao &&
        createPortal(
          <div
            data-datapicker-caixa
            className={`fixed z-[60] rounded-lg border bg-popover p-2 shadow-lg ${
              posicao.bottom != null ? 'mb-1' : 'mt-1'
            }`}
            style={{
              left: posicao.left,
              top: posicao.top,
              bottom: posicao.bottom,
              width: LARGURA_CAIXA,
              // ⚠️ As três regras. Ver o cabeçalho e o ClienteSeletor.
              pointerEvents: 'auto'
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between border-b px-1 pb-2">
              <button
                type="button"
                onClick={() => navegar(-1)}
                className="rounded p-1 transition-colors hover:bg-muted"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold">
                {MESES_LONGOS[mesView - 1]} {anoView}
              </span>
              <button
                type="button"
                onClick={() => navegar(1)}
                className="rounded p-1 transition-colors hover:bg-muted"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {DIAS_DA_SEMANA_CURTOS.map((letra, i) => (
                <div
                  key={i}
                  className="py-1 text-center text-[11px] font-medium text-muted-foreground"
                  title={DIAS_DA_SEMANA_LONGOS[i]}
                >
                  {letra}
                </div>
              ))}

              {celulas.map((c) => {
                const permitido = dentroDoIntervalo(c.iso, min, max)
                const selecionado = c.iso === value
                const ehHoje = c.iso === hoje
                return (
                  <button
                    key={c.iso}
                    type="button"
                    disabled={!permitido}
                    onClick={() => escolher(c.iso)}
                    aria-label={formatarDataBR(c.iso)}
                    aria-current={ehHoje ? 'date' : undefined}
                    className={`num h-8 rounded text-[13px] transition-colors ${
                      selecionado
                        ? 'bg-primary font-semibold text-primary-foreground'
                        : !permitido
                          ? 'cursor-not-allowed text-muted-foreground/30'
                          : c.doMes
                            ? 'hover:bg-muted'
                            : 'text-muted-foreground/50 hover:bg-muted'
                    } ${ehHoje && !selecionado ? 'ring-1 ring-primary/50' : ''}`}
                  >
                    {c.dia}
                  </button>
                )
              })}
            </div>

            {/*
              O atalho de hoje. É a data que o lojista escolhe na maioria das
              vezes, e sem ele é preciso caçá-la na grade quando o mês da tela
              não é o corrente.
            */}
            <div className="mt-2 flex items-center justify-between border-t px-1 pt-2">
              <button
                type="button"
                onClick={() => escolher(hoje)}
                disabled={!dentroDoIntervalo(hoje, min, max)}
                className="rounded px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/40"
              >
                Hoje
              </button>
              {permitirLimpar && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('')
                    setAberto(false)
                  }}
                  className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

export default DataPicker
