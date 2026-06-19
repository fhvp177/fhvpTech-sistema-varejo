import { FC, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, Tag, Search } from 'lucide-react'
import { PRESETS, PRESET_PADRAO, LayoutEtiqueta } from '../utils/presetsLayoutA4'
import FolhaA4Preview, { SlotDado } from '../components/FolhaA4Preview'
import { nomeImpressao } from '../utils/nomeImpressao'

type Variacao = {
  id: number
  produto_id: number
  tamanho: string
  codigo_barras: string
  estoque: number
}

type Produto = {
  id: number
  codigo_barras: string | null
  nome: string
  preco: number
  estoque: number
  variacoes: Variacao[]
}

// Cada coisa que rende uma etiqueta: produto simples OU um tamanho de uma grade.
// `chave` identifica unicamente a seleção (`p<id>` ou `v<variacaoId>`).
type Etiquetavel = {
  chave: string
  nome: string
  codigo_barras: string
  preco: number
}

const SCALE = 0.40

const EtiquetasA4: FC = () => {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [filtro, setFiltro] = useState('')
  const [selecoes, setSelecoes] = useState<Map<string, number>>(new Map())
  const [layout, setLayout] = useState<LayoutEtiqueta>(PRESET_PADRAO)
  const [posicaoInicial, setPosicaoInicial] = useState(0)
  const [mostrarNome, setMostrarNome] = useState(true)
  const [mostrarCodigo, setMostrarCodigo] = useState(true)
  const [mostrarPreco, setMostrarPreco] = useState(true)
  const [mostrarLinhasGuia, setMostrarLinhasGuia] = useState(false)

  useEffect(() => {
    window.api.produtos.listar().then((r) => {
      if (r.success) setProdutos(r.data as Produto[])
    })
  }, [])

  // Achata os produtos em etiquetáveis: simples vira um item; grade vira um item
  // por tamanho (cada um com seu código). Produto simples sem código é ignorado.
  const etiquetaveis = useMemo<Etiquetavel[]>(() => {
    const out: Etiquetavel[] = []
    for (const p of produtos) {
      if (p.variacoes.length > 0) {
        for (const v of p.variacoes) {
          out.push({ chave: `v${v.id}`, nome: `${p.nome} (${v.tamanho})`, codigo_barras: v.codigo_barras, preco: p.preco })
        }
      } else if (p.codigo_barras) {
        out.push({ chave: `p${p.id}`, nome: p.nome, codigo_barras: p.codigo_barras, preco: p.preco })
      }
    }
    return out
  }, [produtos])

  const etiquetaveisFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return etiquetaveis
    return etiquetaveis.filter(
      (e) => e.nome.toLowerCase().includes(q) || e.codigo_barras.includes(q)
    )
  }, [etiquetaveis, filtro])

  const todosSlots = useMemo(() => {
    const porChave = new Map(etiquetaveis.map((e) => [e.chave, e]))
    const slots: Array<{ codigo_barras: string; nome: string; preco: number }> = []
    selecoes.forEach((qty, chave) => {
      const e = porChave.get(chave)
      if (!e || qty <= 0) return
      for (let i = 0; i < qty; i++) {
        slots.push({ codigo_barras: e.codigo_barras, nome: e.nome, preco: e.preco })
      }
    })
    return slots
  }, [selecoes, etiquetaveis])

  const capacidade = layout.colunas * layout.linhas
  const maxPosicao = capacidade - 1

  const folhas = useMemo((): SlotDado[][] => {
    if (todosSlots.length === 0) return []
    const total = posicaoInicial + todosSlots.length
    const n = Math.ceil(total / capacidade)
    return Array.from({ length: n }, (_, i) =>
      Array.from({ length: capacidade }, (_, j) => {
        const g = i * capacidade + j
        if (g < posicaoInicial) return null
        return todosSlots[g - posicaoInicial] ?? null
      })
    )
  }, [todosSlots, capacidade, posicaoInicial])

  const toggleProduto = (chave: string) => {
    setSelecoes((prev) => {
      const next = new Map(prev)
      if (next.has(chave)) next.delete(chave)
      else next.set(chave, 1)
      return next
    })
  }

  const setQty = (chave: string, qty: number) => {
    if (qty <= 0) {
      setSelecoes((prev) => {
        const n = new Map(prev)
        n.delete(chave)
        return n
      })
    } else {
      setSelecoes((prev) => new Map(prev).set(chave, qty))
    }
  }

  const handleLayoutChange = (id: string) => {
    const found = PRESETS.find((p) => p.id === id)
    if (found) {
      setLayout(found)
      setPosicaoInicial(0)
    }
  }

  const totalEtiquetas = todosSlots.length

  const opcoesExibicao: Array<{
    label: string
    value: boolean
    set: (v: boolean) => void
  }> = [
    { label: 'Nome', value: mostrarNome, set: setMostrarNome },
    { label: 'Código', value: mostrarCodigo, set: setMostrarCodigo },
    { label: 'Preço', value: mostrarPreco, set: setMostrarPreco },
    { label: 'Linhas-guia', value: mostrarLinhasGuia, set: setMostrarLinhasGuia },
  ]

  return (
    <div className="flex h-full">
      {/* ── Painel esquerdo: seleção de produtos ── */}
      <div className="w-72 border-r flex flex-col shrink-0 no-print">
        <div className="p-3 border-b">
          <h2 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
            <Tag className="w-4 h-4" />
            Selecionar Produtos
          </h2>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome ou código..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {selecoes.size > 0 && (
            <button
              onClick={() => setSelecoes(new Map())}
              className="text-xs text-red-500 hover:text-red-700 mt-1.5 underline-offset-2 hover:underline"
            >
              Limpar seleção ({selecoes.size})
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {etiquetaveisFiltrados.length === 0 && (
            <p className="text-xs text-muted-foreground p-2 text-center">
              Nenhum produto encontrado.
            </p>
          )}
          {etiquetaveisFiltrados.map((e) => {
            const selecionado = selecoes.has(e.chave)
            const qty = selecoes.get(e.chave) ?? 1
            return (
              <div
                key={e.chave}
                className={`rounded-lg border px-2.5 py-2 text-sm transition-colors ${
                  selecionado
                    ? 'bg-blue-50 border-blue-200'
                    : 'border-transparent hover:border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selecionado}
                    onChange={() => toggleProduto(e.chave)}
                    className="accent-blue-600 w-3.5 h-3.5 cursor-pointer mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate leading-tight">{e.nome}</p>
                    <p className="text-xs text-muted-foreground font-mono">{e.codigo_barras}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.preco.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </p>
                  </div>
                </div>
                {selecionado && (
                  <div className="flex items-center gap-1.5 mt-1.5 ml-5">
                    <span className="text-xs text-muted-foreground">Qtd:</span>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={qty}
                      onChange={(e2) =>
                        setQty(e.chave, parseInt(e2.target.value) || 0)
                      }
                      className="w-16 text-center text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-muted-foreground">etiq.</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Painel direito: controles + prévia ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra de controles */}
        <div className="border-b p-3 flex flex-wrap gap-x-6 gap-y-3 items-end bg-background no-print">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Layout</label>
            <select
              value={layout.id}
              onChange={(e) => handleLayoutChange(e.target.value)}
              className="text-sm border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-background"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Pular posições iniciais
            </label>
            <input
              type="number"
              min={0}
              max={maxPosicao}
              value={posicaoInicial}
              onChange={(e) =>
                setPosicaoInicial(
                  Math.min(maxPosicao, Math.max(0, parseInt(e.target.value) || 0))
                )
              }
              className="w-20 text-sm border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-4 items-end flex-wrap">
            {opcoesExibicao.map(({ label, value, set }) => (
              <label
                key={label}
                className="text-xs flex items-center gap-1.5 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                  className="accent-blue-600"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {totalEtiquetas > 0 && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {totalEtiquetas} etiq. · {folhas.length} folha
                {folhas.length !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={() => {
                // Nomeia o PDF/job de impressão (o nome herda document.title).
                const anterior = document.title
                window.addEventListener('afterprint', () => { document.title = anterior }, {
                  once: true
                })
                document.title = nomeImpressao.etiquetas()
                window.print()
              }}
              disabled={totalEtiquetas === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
          </div>
        </div>

        {/* Área de prévia */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-6 no-print">
          {folhas.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Tag className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">
                  Selecione produtos na lista ao lado para gerar etiquetas.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6 items-center">
              {folhas.map((slots, i) => (
                <div key={i}>
                  <p className="text-xs text-muted-foreground text-center mb-1.5 font-medium">
                    Folha {i + 1} de {folhas.length}
                  </p>
                  <div
                    style={{
                      width: `calc(210mm * ${SCALE})`,
                      height: `calc(297mm * ${SCALE})`,
                      overflow: 'hidden',
                      position: 'relative',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                      borderRadius: '1px',
                    }}
                  >
                    <div
                      style={{
                        transform: `scale(${SCALE})`,
                        transformOrigin: 'top left',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                      }}
                    >
                      <FolhaA4Preview
                        layout={layout}
                        slots={slots}
                        mostrarNome={mostrarNome}
                        mostrarCodigo={mostrarCodigo}
                        mostrarPreco={mostrarPreco}
                        mostrarLinhasGuia={mostrarLinhasGuia}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Portal de impressão: renderiza direto em document.body, fora de qualquer flex */}
      {createPortal(
        <div className="print-only" style={{ display: 'none' }}>
          {folhas.map((slots, i) => (
            <div key={i} className="folha-a4">
              <FolhaA4Preview
                layout={layout}
                slots={slots}
                mostrarNome={mostrarNome}
                mostrarCodigo={mostrarCodigo}
                mostrarPreco={mostrarPreco}
                mostrarLinhasGuia={mostrarLinhasGuia}
              />
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

export default EtiquetasA4
