import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'

// Combobox de cidade com busca, alimentado pela lista oficial do IBGE embutida
// (municipiosBR.json). O JSON (~85 KB) é carregado sob demanda — só quando este
// componente monta, ou seja, quando a tela de Configurações abre —, então não
// pesa na inicialização do app.
//
// Comportamento: o usuário digita e escolhe na lista. Escolher uma cidade
// preenche a UF junto (útil quando ela ainda está vazia). As sugestões ficam
// restritas à UF quando há uma selecionada; sem UF, busca no Brasil inteiro e
// mostra a sigla ao lado pra desambiguar. O texto digitado é sempre salvo, então
// funciona como campo livre caso o lugar não esteja na lista.

type Municipios = Record<string, string[]>

type Props = {
  cidade: string
  uf: string
  onSelecionar: (cidade: string, uf: string) => void
  onDigitar: (cidade: string) => void
}

const MAX_RESULTADOS = 50

export default function CidadeSeletor({ cidade, uf, onSelecionar, onDigitar }: Props): JSX.Element {
  const [municipios, setMunicipios] = useState<Municipios | null>(null)
  const [aberto, setAberto] = useState(false)
  const [indiceFoco, setIndiceFoco] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * Onde desenhar a lista. Ela vai num PORTAL, e não como `absolute` filha
   * daqui: um elemento posicionado dentro de um container que rola é recortado
   * na borda dele, e o DialogContent do core agora rola (`max-h-[90vh]`). Como
   * a lista é posicionada, ela não entra no `scrollHeight` — nem rolando
   * apareceria. Presa à janela, nunca é cortada.
   *
   * Hoje este seletor só vive em página, onde nada o recortaria. Está assim
   * mesmo assim pra que ele possa entrar num diálogo amanhã sem trazer o bug de
   * volta — foi essa reincidência que motivou a mudança.
   */
  const [posicaoLista, setPosicaoLista] = useState<{
    left: number
    top: number
    width: number
  } | null>(null)

  useEffect(() => {
    if (!aberto) {
      setPosicaoLista(null)
      return
    }
    const medir = () => {
      const el = containerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPosicaoLista({ left: r.left, top: r.bottom, width: r.width })
    }
    medir()
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [aberto])
  const listaRef = useRef<HTMLUListElement>(null)

  // Carrega a lista de cidades sob demanda (lazy) ao montar.
  useEffect(() => {
    let vivo = true
    import('@/data/municipiosBR.json').then((m) => {
      if (vivo) setMunicipios((m.default as { municipios: Municipios }).municipios)
    })
    return () => {
      vivo = false
    }
  }, [])

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    if (!aberto) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aberto])

  // Índice plano {cidade, uf} usado quando nenhuma UF foi escolhida.
  const todasCidades = useMemo(() => {
    if (!municipios) return [] as { cidade: string; uf: string }[]
    const arr: { cidade: string; uf: string }[] = []
    for (const sigla of Object.keys(municipios)) {
      for (const nome of municipios[sigla]) arr.push({ cidade: nome, uf: sigla })
    }
    return arr
  }, [municipios])

  const sugestoes = useMemo(() => {
    const termo = cidade.trim().toLowerCase()
    const base =
      uf && municipios?.[uf]
        ? municipios[uf].map((nome) => ({ cidade: nome, uf }))
        : todasCidades
    if (!termo) return base.slice(0, MAX_RESULTADOS)
    return base.filter((m) => m.cidade.toLowerCase().includes(termo)).slice(0, MAX_RESULTADOS)
  }, [cidade, uf, municipios, todasCidades])

  useEffect(() => setIndiceFoco(0), [cidade, uf, aberto])

  // Mantém o item focado visível ao navegar pelo teclado.
  useEffect(() => {
    if (!aberto || !listaRef.current) return
    const item = listaRef.current.children[indiceFoco] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [indiceFoco, aberto])

  const escolher = (m: { cidade: string; uf: string }) => {
    onSelecionar(m.cidade, m.uf)
    setAberto(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setAberto(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAberto(true)
      setIndiceFoco((i) => Math.min(i + 1, sugestoes.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndiceFoco((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && aberto && sugestoes[indiceFoco]) {
      e.preventDefault()
      escolher(sugestoes[indiceFoco])
    }
  }

  const semUf = !uf

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-within:ring-2 focus-within:ring-ring">
        <Search className="w-4 h-4 text-muted-foreground shrink-0 mr-2" />
        <input
          value={cidade}
          onChange={(e) => {
            onDigitar(e.target.value)
            setAberto(true)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={handleKeyDown}
          placeholder={municipios ? 'Digite para buscar a cidade...' : 'Carregando cidades...'}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {aberto &&
        municipios &&
        posicaoLista &&
        createPortal(
          /*
            ⚠️ pointerEvents e stopPropagation NÃO são enfeite — sem eles a lista
            fica visível e INCLICÁVEL dentro de um diálogo.

            O diálogo modal do Radix põe `pointer-events: none` no <body> e devolve
            `auto` só para o painel dele (react-dismissable-layer/dist/index.js:111 e
            142). Como esta lista mora num portal em document.body, ela herda o
            `none`: o mouse atravessa, e só o teclado (setas + Enter) seleciona. É um
            defeito que passa despercebido porque a lista APARECE e o hover do
            teclado até destaca a linha.

            E o `stopPropagation` no pointerdown é o par obrigatório do primeiro: a
            mesma camada do Radix escuta `pointerdown` no document (linha 204) e
            fecha o diálogo ao ver um clique "fora" — que é como este portal parece
            para ela. Sem barrar aqui, arrumar o clique fecharia o modal inteiro.

            Vale para QUALQUER dropdown portado a document.body. Guardado por
            `dropdownDentroDeModal.test.ts`.
          */
          <div
            className="fixed z-[60] mt-1 bg-popover border rounded-md shadow-lg overflow-hidden"
            style={{
              left: posicaoLista.left,
              top: posicaoLista.top,
              width: posicaoLista.width,
              pointerEvents: 'auto'
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
          <ul ref={listaRef} className="max-h-72 overflow-y-auto py-1">
            {sugestoes.length === 0 ? (
              <li className="px-3 py-3 text-sm text-center text-muted-foreground">
                Nenhuma cidade encontrada.
              </li>
            ) : (
              sugestoes.map((m, i) => (
                <li
                  key={`${m.uf}-${m.cidade}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    escolher(m)
                  }}
                  onMouseEnter={() => setIndiceFoco(i)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ${
                    i === indiceFoco ? 'bg-muted' : 'hover:bg-muted/50'
                  }`}
                >
                  <span className="truncate">{m.cidade}</span>
                  {semUf && <span className="text-xs text-muted-foreground shrink-0">{m.uf}</span>}
                </li>
              ))
            )}
          </ul>
          </div>,
          document.body
        )}
    </div>
  )
}
