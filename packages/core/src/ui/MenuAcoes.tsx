import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import { posicaoDropdown, type PosicaoDropdown } from '@fhvptech/core/lib/posicaoDropdown'

/**
 * Menu de três pontinhos: as ações de uma linha, atrás de um toque só.
 *
 * ── Por que ele existe ───────────────────────────────────────────────────────
 * Numa lista de celular, três botões de 44×44 lado a lado ocupam uma linha
 * inteira do item — em Clientes isso levava a linha de 58px para ~106px, e a
 * lista mostrava metade dos clientes por tela. Um único gatilho de 44×44 devolve
 * essa linha, e nenhuma ação se perde: elas mudam de lugar, não de existência.
 *
 * O roteiro previa as duas saídas ("Ações numa terceira linha ou num menu").
 * Esta é a segunda.
 *
 * ── ⚠️ As três regras do portal, e elas só funcionam JUNTAS ──────────────────
 * O menu é desenhado num PORTAL preso a `document.body`, porque dentro de uma
 * lista com rolagem (ou de um `DialogContent`) ele seria recortado. Isso obriga
 * a três coisas que parecem enfeite e não são — as mesmas do `select.tsx`, e
 * cada uma delas já mordeu em produção:
 *
 *   1. `pointerEvents: 'auto'` — o diálogo modal do Radix põe
 *      `pointer-events: none` no <body> e devolve `auto` só ao painel dele. Sem
 *      isto o menu APARECE e o mouse ATRAVESSA.
 *   2. `stopPropagation` no pointerdown — a mesma camada escuta `pointerdown` no
 *      document e fecha o diálogo ao ver clique "fora", que é como este portal
 *      parece para ela. Sem barrar, escolher uma ação fecharia o modal inteiro.
 *   3. `stopPropagation` no wheel — o `react-remove-scroll` escuta `wheel` no
 *      document com `passive:false` e chama preventDefault em tudo que julga
 *      estar fora do modal. Sem barrar, um menu longo simplesmente não rola.
 *
 * Guardado por `dropdownDentroDeModal.test.ts`, que varre o core inteiro.
 *
 * ── O teclado continua inteiro ───────────────────────────────────────────────
 * Setas, Home/End, Enter e Esc. Quem opera o caixa sem tirar a mão do teclado
 * não pode perder o acesso a uma ação porque ela virou um menu.
 */

export type AcaoMenu = {
  rotulo: string
  icone?: ReactNode
  onSelecionar: () => void
  /** Pinta de vermelho. Para excluir e afins. */
  destrutiva?: boolean
  desabilitada?: boolean
}

/** Largura do painel. Fixa: as ações são curtas e a coluna é estreita. */
const LARGURA = 196

type Props = {
  acoes: AcaoMenu[]
  /** Vai para o `aria-label` do gatilho: "Ações de MARIA", por exemplo. */
  rotulo?: string
  /** Classes extras do gatilho. */
  className?: string
}

export function MenuAcoes({ acoes, rotulo = 'Ações', className = '' }: Props): JSX.Element | null {
  const [aberto, setAberto] = useState(false)
  const [foco, setFoco] = useState(0)
  const [posicao, setPosicao] = useState<PosicaoDropdown | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)

  const habilitadas = acoes.filter((a) => !a.desabilitada)

  const fechar = useCallback(() => {
    setAberto(false)
    botaoRef.current?.focus()
  }, [])

  // Fecha ao clicar fora. O portal barra o próprio mousedown antes de chegar
  // aqui, então clique DENTRO do menu não conta como fora.
  useEffect(() => {
    if (!aberto) return
    const aoClicar = (e: MouseEvent): void => {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicar)
    return () => document.removeEventListener('mousedown', aoClicar)
  }, [aberto])

  /*
   * Onde desenhar. A decisão de abrir para baixo ou para cima é do
   * `posicaoDropdown`, que já resolveu o defeito de uma lista que rola por
   * dentro mas tem o fim da caixa FORA da tela.
   *
   * O menu é alinhado à DIREITA do gatilho, que é onde ele mora numa lista, e
   * preso à janela para nunca sair pela borda esquerda.
   */
  useEffect(() => {
    if (!aberto) {
      setPosicao(null)
      return
    }
    const medir = (): void => {
      const el = botaoRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const left = Math.max(8, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - 8))
      setPosicao(posicaoDropdown({ left, top: r.top, bottom: r.bottom, width: LARGURA }, window))
    }
    medir()
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [aberto])

  // Ao abrir, o foco cai na primeira ação escolhível.
  useEffect(() => {
    if (!aberto) return
    setFoco(acoes.findIndex((a) => !a.desabilitada))
  }, [aberto, acoes])

  const escolher = (a: AcaoMenu): void => {
    if (a.desabilitada) return
    setAberto(false)
    a.onSelecionar()
  }

  /** Próximo índice escolhível a partir de `de`, pulando as desabilitadas. */
  const proximo = (de: number, passo: number): number => {
    let i = de
    for (let n = 0; n < acoes.length; n++) {
      i += passo
      if (i < 0) i = acoes.length - 1
      if (i > acoes.length - 1) i = 0
      if (!acoes[i]?.desabilitada) return i
    }
    return de
  }

  const aoTeclar = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      fechar()
      return
    }
    if (!aberto) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setAberto(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFoco((i) => proximo(i, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFoco((i) => proximo(i, -1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setFoco(acoes.findIndex((a) => !a.desabilitada))
    } else if (e.key === 'End') {
      e.preventDefault()
      setFoco(proximo(0, -1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const a = acoes[foco]
      if (a) escolher(a)
    }
  }

  // Menu sem nenhuma ação não é um menu: é um botão que não faz nada.
  if (habilitadas.length === 0) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={botaoRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={rotulo}
        title={rotulo}
        onClick={() => setAberto((a) => !a)}
        onKeyDown={aoTeclar}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {aberto &&
        posicao &&
        createPortal(
          /*
            ⚠️ pointerEvents, stopPropagation e onWheel NÃO são enfeite — sem
            eles o menu fica visível e inclicável dentro de um diálogo, ou fecha
            o diálogo junto. O porquê inteiro está no cabeçalho deste arquivo.
          */
          <div
            className="fixed z-[60] overflow-hidden rounded-lg border bg-popover shadow-lg"
            style={{
              left: posicao.left,
              top: posicao.top,
              bottom: posicao.bottom,
              width: posicao.width,
              pointerEvents: 'auto'
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <ul
              ref={listaRef}
              role="menu"
              aria-label={rotulo}
              className="overflow-y-auto py-1"
              style={{ maxHeight: posicao.maxHeight }}
            >
              {acoes.map((a, i) => (
                <li key={a.rotulo} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={a.desabilitada}
                    onKeyDown={aoTeclar}
                    onMouseEnter={() => !a.desabilitada && setFoco(i)}
                    onClick={() => escolher(a)}
                    className={`flex min-h-[44px] w-full items-center gap-3 px-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      a.destrutiva ? 'text-destructive' : 'text-foreground'
                    } ${i === foco && !a.desabilitada ? 'bg-muted' : ''}`}
                  >
                    {a.icone && <span className="shrink-0">{a.icone}</span>}
                    <span className="truncate">{a.rotulo}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </div>
  )
}

export default MenuAcoes
