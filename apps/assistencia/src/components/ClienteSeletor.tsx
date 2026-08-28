import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, User, Building2, ChevronDown } from 'lucide-react'

export type ClienteSeletorHandle = {
  abrir: () => void
  // Lido no momento da tecla (não é estado do React): quem hospeda o seletor
  // precisa saber se a busca está aberta pra não tratar o Esc como se fosse
  // dele. Ver o Esc do PDV em Vendas.tsx.
  estaAberto: () => boolean
}

export type ClienteSelecionavel = {
  id: number
  nome: string
  telefone: string
  cpf?: string | null
  cnpj?: string | null
  razao_social?: string | null
  tipo_pessoa?: 'fisica' | 'juridica' | null
}

type Props = {
  clientes: ClienteSelecionavel[]
  clienteIdSelecionado: string // '' = nenhum cliente escolhido
  onChange: (id: string) => void
  placeholder?: string
  /**
   * Como chamar a opção "nenhum cliente". O padrão fala a língua do PDV, que é
   * onde este seletor nasceu — mas ele já é usado fora de venda (empréstimo,
   * devolução), e "— Venda avulsa —" no meio de um empréstimo é vocabulário de
   * outra tela vazando. Quem usa fora do balcão passa o seu.
   */
  rotuloSemCliente?: string
}

const MAX_RESULTADOS = 50

const ClienteSeletor = forwardRef<ClienteSeletorHandle, Props>(({
  clientes,
  clienteIdSelecionado,
  onChange,
  placeholder = 'Buscar cliente por nome, telefone, CPF/CNPJ...',
  rotuloSemCliente = '— Venda avulsa —'
}, ref) => {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [indiceFoco, setIndiceFoco] = useState(0)
  // Espelho do `aberto` pra consulta síncrona via ref (o estado do React já pode
  // ter sido atualizado quando quem hospeda o seletor vai olhar).
  const abertoRef = useRef(false)
  abertoRef.current = aberto
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLUListElement>(null)

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => String(c.id) === clienteIdSelecionado) ?? null,
    [clientes, clienteIdSelecionado]
  )

  // Fecha quando clica fora
  useEffect(() => {
    if (!aberto) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setAberto(false)
        setBusca('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aberto])

  const listaFiltrada = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return clientes.slice(0, MAX_RESULTADOS)
    const tNum = t.replace(/\D/g, '')
    return clientes
      .filter((c) => {
        if (c.nome.toLowerCase().includes(t)) return true
        if (c.razao_social?.toLowerCase().includes(t)) return true
        if (tNum.length > 0) {
          if (c.telefone.replace(/\D/g, '').includes(tNum)) return true
          if (c.cpf && c.cpf.replace(/\D/g, '').includes(tNum)) return true
          if (c.cnpj && c.cnpj.replace(/\D/g, '').includes(tNum)) return true
        }
        return false
      })
      .slice(0, MAX_RESULTADOS)
  }, [clientes, busca])

  useEffect(() => {
    setIndiceFoco(0)
  }, [busca, aberto])

  const abrir = () => {
    setAberto(true)
    setBusca('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  useImperativeHandle(ref, () => ({ abrir, estaAberto: () => abertoRef.current }), [])

  const selecionar = (id: string) => {
    onChange(id)
    setAberto(false)
    setBusca('')
  }

  const limpar = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setBusca('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setAberto(false)
      setBusca('')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndiceFoco((i) => Math.min(i + 1, listaFiltrada.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndiceFoco((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const escolhido = listaFiltrada[indiceFoco]
      if (escolhido) selecionar(String(escolhido.id))
    }
  }

  /**
   * Onde desenhar a lista. Ela vai num PORTAL (fora da árvore do diálogo), e
   * não mais como `absolute` filha deste componente.
   *
   * Motivo: o DialogContent do core limita a altura e rola (`max-h-[90vh]
   * overflow-y-auto`). Um elemento posicionado dentro de um container que rola
   * é RECORTADO na borda dele — e, por ser `absolute`, a lista não entra no
   * `scrollHeight`, então nem rolando ela apareceria. No portal ela fica presa
   * à janela e nunca é cortada, esteja o seletor dentro de um diálogo ou não.
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
    // O diálogo pode rolar por baixo da lista aberta; remedir mantém as duas
    // juntas. `true` no capture pega a rolagem de qualquer ancestral.
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [aberto])

  // Scroll do item focado pra dentro da viewport do dropdown
  useEffect(() => {
    if (!aberto || !listaRef.current) return
    const item = listaRef.current.children[indiceFoco] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [indiceFoco, aberto])

  return (
    <div ref={containerRef} className="relative w-full">
      {aberto ? (
        <div className="flex items-center h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-within:ring-2 focus-within:ring-ring">
          <Search className="w-4 h-4 text-muted-foreground shrink-0 mr-2" />
          <input
            ref={inputRef}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          className="flex items-center h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left"
        >
          {clienteSelecionado ? (
            <>
              {clienteSelecionado.tipo_pessoa === 'juridica'
                ? <Building2 className="w-4 h-4 text-muted-foreground shrink-0 mr-2" />
                : <User className="w-4 h-4 text-muted-foreground shrink-0 mr-2" />}
              <span className="flex-1 truncate">{clienteSelecionado.nome}</span>
              <button
                type="button"
                onClick={limpar}
                className="text-muted-foreground hover:text-foreground p-0.5 mr-1"
                title="Limpar seleção"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </>
          ) : (
            <>
              <Search className="w-4 h-4 text-muted-foreground shrink-0 mr-2" />
              <span className="flex-1 text-muted-foreground">{rotuloSemCliente}</span>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      )}

      {aberto &&
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
            {/* A opção "nenhum cliente" fica sempre disponível no topo */}
            <li
              onMouseDown={(e) => { e.preventDefault(); selecionar('') }}
              className="px-3 py-2 text-sm text-muted-foreground italic cursor-pointer hover:bg-muted"
            >
              {rotuloSemCliente}
            </li>
            {listaFiltrada.length === 0 ? (
              <li className="px-3 py-3 text-sm text-center text-muted-foreground">
                Nenhum cliente encontrado.
              </li>
            ) : (
              listaFiltrada.map((c, i) => (
                <li
                  key={c.id}
                  onMouseDown={(e) => { e.preventDefault(); selecionar(String(c.id)) }}
                  onMouseEnter={() => setIndiceFoco(i)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                    i === indiceFoco ? 'bg-muted' : 'hover:bg-muted/50'
                  }`}
                >
                  {c.tipo_pessoa === 'juridica'
                    ? <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <User className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{c.nome}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.telefone || '—'}</div>
                  </div>
                </li>
              ))
            )}
          </ul>
          {clientes.length > MAX_RESULTADOS && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/30 border-t">
              Mostrando até {MAX_RESULTADOS} resultados — refine a busca se necessário.
            </div>
          )}
          </div>,
          document.body
        )}
    </div>
  )
})

ClienteSeletor.displayName = 'ClienteSeletor'

export default ClienteSeletor
