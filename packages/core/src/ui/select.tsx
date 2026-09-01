import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { posicaoDropdown, type PosicaoDropdown } from '@fhvptech/core/lib/posicaoDropdown'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * Seletor de opção única, com a aparência do sistema.
 *
 * ── Por que não continuar usando `<select>` ──────────────────────────────────
 * O `<select>` nativo aceita CSS no campo FECHADO — e é por isso que ele parecia
 * resolvido: a caixinha tinha a nossa borda, a nossa altura e o nosso anel de
 * foco. Mas a LISTA ABERTA é desenhada pelo sistema operacional, fora do
 * documento, e nenhuma regra de CSS a alcança. No Windows ela aparece com a
 * barra azul e a fonte do sistema, no meio de uma tela que não se parece com
 * isso em mais lugar nenhum.
 *
 * Este componente desenha a lista, então ela é nossa nos dois estados.
 *
 * ── O que ele mantém do nativo, de propósito ─────────────────────────────────
 * Teclado inteiro (setas, Enter, Esc, Home/End e busca por digitação), o mesmo
 * `value`/`onChange` de string, e o foco visível. Trocar a aparência não pode
 * custar a navegação de quem opera o caixa sem tirar a mão do teclado.
 *
 * ── As duas regras que fazem ele funcionar dentro de um modal ────────────────
 * A lista vai num PORTAL preso a `document.body`, porque dentro de um
 * `DialogContent` (que rola e é transformado) ela seria recortada. Isso obriga a
 * duas coisas que parecem enfeite e não são:
 *
 *   1. `pointerEvents: 'auto'` — o diálogo modal do Radix põe
 *      `pointer-events: none` no <body> e devolve `auto` só ao painel dele
 *      (react-dismissable-layer/dist/index.js:111 e 142). Sem isto, a lista
 *      APARECE e o mouse ATRAVESSA: só o teclado seleciona.
 *   2. `stopPropagation` no pointerdown — a mesma camada escuta `pointerdown` no
 *      document (linha 204) e fecha o diálogo ao ver clique "fora", que é como
 *      este portal parece pra ela. Sem barrar, escolher uma opção fecharia o
 *      modal inteiro.
 *
 * As duas já morderam em 3 telas (ver ClienteSeletor/CidadeSeletor) e estão
 * guardadas por `dropdownDentroDeModal.test.ts` nos dois apps.
 */

export type OpcaoSelect = {
  valor: string
  rotulo: string
  /** Aparece na lista, cinza, e não pode ser escolhida. */
  desabilitada?: boolean
  /** Linha secundária, menor — telefone do cliente, detalhe do layout etc. */
  detalhe?: string
}

type Props = {
  id?: string
  value: string
  onChange: (valor: string) => void
  opcoes: OpcaoSelect[]
  /** Texto do campo quando `value` não corresponde a nenhuma opção. */
  placeholder?: string
  disabled?: boolean
  /**
   * Classes do CAMPO — o botão em si. Altura, texto, largura fixa.
   * (Ex.: 'h-8 text-xs' numa linha de tabela.)
   */
  className?: string
  /**
   * Classes do CONTAINER, que é quem ocupa o lugar do antigo `<select>` no
   * layout de fora. Separado do campo de propósito: numa linha flex era o
   * `<select>` que carregava `flex-1` ou `w-24`, e jogar isso no botão deixaria
   * o container esticado e a lista com largura errada.
   */
  classNameContainer?: string
  onBlur?: () => void
  title?: string
  'aria-label'?: string
  /** Ícone à esquerda do texto, no campo fechado. */
  icone?: ReactNode
}

const CLASSE_CAMPO =
  'flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-left'

const Select: FC<Props> = ({
  id,
  value,
  onChange,
  opcoes,
  placeholder = '— Selecione —',
  disabled,
  className,
  classNameContainer,
  onBlur,
  icone,
  ...resto
}) => {
  const [aberto, setAberto] = useState(false)
  const [indiceFoco, setIndiceFoco] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)
  // Busca por digitação: "ali" leva a "ALEXANDRE". Zera sozinha depois de uma
  // pausa, como o `<select>` nativo faz.
  const digitado = useRef({ texto: '', em: 0 })

  const selecionada = useMemo(() => opcoes.find((o) => o.valor === value), [opcoes, value])
  const indiceSelecionado = useMemo(
    () => opcoes.findIndex((o) => o.valor === value),
    [opcoes, value]
  )

  const abrir = useCallback(() => {
    if (disabled) return
    // Abre já com o foco na opção atual — quem só quer conferir o que está
    // escolhido vê a linha destacada sem procurar.
    setIndiceFoco(indiceSelecionado >= 0 ? indiceSelecionado : 0)
    setAberto(true)
  }, [disabled, indiceSelecionado])

  const fechar = useCallback(() => {
    setAberto(false)
    botaoRef.current?.focus()
  }, [])

  const escolher = useCallback(
    (opcao: OpcaoSelect) => {
      if (opcao.desabilitada) return
      onChange(opcao.valor)
      setAberto(false)
      botaoRef.current?.focus()
    },
    [onChange]
  )

  // Fecha ao clicar fora. O portal fica FORA do containerRef, mas ele barra o
  // próprio mousedown antes de chegar aqui — então clique na lista não conta.
  useEffect(() => {
    if (!aberto) return
    const aoClicar = (e: MouseEvent): void => {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicar)
    return () => document.removeEventListener('mousedown', aoClicar)
  }, [aberto])

  // Onde desenhar a lista. Mesma medição do ClienteSeletor: presa à janela,
  // remedida quando algo rola, para nunca ser recortada por um diálogo.
  const [posicao, setPosicao] = useState<PosicaoDropdown | null>(null)
  useEffect(() => {
    if (!aberto) {
      setPosicao(null)
      return
    }
    const medir = (): void => {
      // Mede o BOTÃO, não o container: é ele que a pessoa vê, e a lista tem que
      // nascer com a largura do campo, não a da caixa em volta.
      const el = botaoRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPosicao(posicaoDropdown(r, window))
    }
    medir()
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [aberto])

  // Mantém a opção focada visível ao navegar com as setas.
  useEffect(() => {
    if (!aberto || !listaRef.current) return
    const item = listaRef.current.children[indiceFoco] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [indiceFoco, aberto])

  /** Próximo índice escolhível a partir de `de`, pulando as desabilitadas. */
  const proximoAtivo = useCallback(
    (de: number, passo: number): number => {
      let i = de
      for (let n = 0; n < opcoes.length; n++) {
        i += passo
        if (i < 0) i = 0
        if (i > opcoes.length - 1) i = opcoes.length - 1
        if (!opcoes[i]?.desabilitada) return i
        if ((passo < 0 && i === 0) || (passo > 0 && i === opcoes.length - 1)) break
      }
      return de
    },
    [opcoes]
  )

  const aoTeclar = (e: KeyboardEvent): void => {
    if (disabled) return

    if (!aberto) {
      // Fechado: as mesmas teclas que abrem um `<select>` nativo.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        abrir()
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      fechar()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndiceFoco((i) => proximoAtivo(i, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndiceFoco((i) => proximoAtivo(i, -1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setIndiceFoco(proximoAtivo(-1, 1))
    } else if (e.key === 'End') {
      e.preventDefault()
      setIndiceFoco(proximoAtivo(opcoes.length, -1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opcao = opcoes[indiceFoco]
      if (opcao) escolher(opcao)
    } else if (e.key === 'Tab') {
      // Tab sai do campo: fecha sem escolher, como o nativo.
      setAberto(false)
    } else if (e.key.length === 1) {
      const agora = Date.now()
      const texto = (agora - digitado.current.em < 700 ? digitado.current.texto : '') + e.key
      digitado.current = { texto, em: agora }
      const alvo = opcoes.findIndex(
        (o) => !o.desabilitada && o.rotulo.toLowerCase().startsWith(texto.toLowerCase())
      )
      if (alvo >= 0) setIndiceFoco(alvo)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', classNameContainer)}>
      <button
        id={id}
        ref={botaoRef}
        type="button"
        role="combobox"
        aria-expanded={aberto}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={aoTeclar}
        onBlur={onBlur}
        className={cn(CLASSE_CAMPO, className)}
        {...resto}
      >
        {icone}
        <span className={cn('flex-1 truncate', !selecionada && 'text-muted-foreground')}>
          {selecionada ? selecionada.rotulo : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {aberto &&
        posicao &&
        createPortal(
          /*
            ⚠️ pointerEvents e stopPropagation NÃO são enfeite — sem eles a lista
            fica visível e INCLICÁVEL dentro de um diálogo. O porquê inteiro está
            no cabeçalho deste arquivo. Guardado por `dropdownDentroDeModal.test.ts`.
          */
          <div
            className={`fixed z-[60] ${posicao.bottom != null ? 'mb-1' : 'mt-1'}  overflow-hidden rounded-md border bg-popover shadow-lg`}
            style={{
              left: posicao.left,
              // Abre pra baixo ou pra cima conforme o espaço da janela — quando
              // vira, ancora pelo `bottom` e cresce pra cima sozinha.
              top: posicao.top,
              bottom: posicao.bottom,
              width: posicao.width,
              pointerEvents: 'auto'
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            // A roda do mouse é a TERCEIRA do conjunto, e some do radar porque
            // a lista tem `overflow-y-auto` e parece que deveria rolar sozinha.
            // Só que o Radix trava a rolagem da página com `react-remove-scroll`,
            // que escuta `wheel` no document (SideEffect.js:139, passive:false) e
            // chama preventDefault em tudo que julga estar FORA do modal — e este
            // portal, morando em document.body, é exatamente isso pra ele.
            // Resultado: lista rolável que não rola. Barrar aqui faz o evento não
            // chegar ao document, e o navegador rola normalmente.
            onWheel={(e) => e.stopPropagation()}
          >
            <ul ref={listaRef} role="listbox" className="overflow-y-auto py-1"
            style={{ maxHeight: posicao.maxHeight }}>
              {opcoes.length === 0 && (
                <li className="px-3 py-3 text-center text-sm text-muted-foreground">
                  Nenhuma opção disponível.
                </li>
              )}
              {opcoes.map((o, i) => {
                const escolhida = o.valor === value
                return (
                  <li
                    key={o.valor}
                    role="option"
                    aria-selected={escolhida}
                    // mousedown com preventDefault (e não click): mantém o foco
                    // no botão e evita que o navegador mexa na seleção de texto
                    // antes de a escolha acontecer.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      escolher(o)
                    }}
                    onMouseEnter={() => !o.desabilitada && setIndiceFoco(i)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm',
                      o.desabilitada
                        ? 'cursor-not-allowed text-muted-foreground/60'
                        : 'cursor-pointer',
                      !o.desabilitada && i === indiceFoco && 'bg-muted'
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{o.rotulo}</div>
                      {o.detalhe && (
                        <div className="truncate text-xs text-muted-foreground">{o.detalhe}</div>
                      )}
                    </div>
                    {escolhida && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </li>
                )
              })}
            </ul>
          </div>,
          document.body
        )}
    </div>
  )
}

Select.displayName = 'Select'

export { Select }
