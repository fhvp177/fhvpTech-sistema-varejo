import { useEffect, useMemo, useRef, useState } from 'react'
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

      {aberto && municipios && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg overflow-hidden">
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
        </div>
      )}
    </div>
  )
}
