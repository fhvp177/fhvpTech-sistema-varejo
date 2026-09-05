import { FC, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, Tag, Search } from 'lucide-react'
import { PRESETS, PRESET_PADRAO, LayoutEtiqueta } from '../utils/presetsLayoutA4'
import { Select } from '@fhvptech/core/ui/select'
import FolhaA4Preview, { SlotDado } from '../components/FolhaA4Preview'
import { nomeImpressao } from '../utils/nomeImpressao'
import { useImprimirJanela } from '@/components/ImpressaoProvider'
import { useEhCelular } from '@/hooks/useEhCelular'
import DicaRolante from '@/components/DicaRolante'

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
  referencia: string | null
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
  referencia: string | null
  preco: number
}

// Quanto a folha A4 encolhe na prévia.
//
// ⚠️ No celular ela precisa ser MENOR. A4 tem 210mm, que a 96dpi dão 793,7px;
// a 0,40 sobram 317, e a coluna útil de uma tela de 360 tem 304 depois das
// margens. Passava por 13px — e 13px de estouro são rolagem lateral na página
// inteira (§11). A 0,34 a folha fica com 270 e sobra respiro.
const SCALE = 0.40
const SCALE_CELULAR = 0.34

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
  const imprimirJanela = useImprimirJanela()
  const ehCelular = useEhCelular()

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
          out.push({ chave: `v${v.id}`, nome: `${p.nome} (${v.tamanho})`, codigo_barras: v.codigo_barras, referencia: p.referencia, preco: p.preco })
        }
      } else if (p.codigo_barras) {
        out.push({ chave: `p${p.id}`, nome: p.nome, codigo_barras: p.codigo_barras, referencia: p.referencia, preco: p.preco })
      }
    }
    return out
  }, [produtos])

  const etiquetaveisFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return etiquetaveis
    return etiquetaveis
      .filter(
        (e) =>
          e.nome.toLowerCase().includes(q) ||
          e.codigo_barras.includes(q) ||
          (e.referencia ?? '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const exato = (e: Etiquetavel) => ((e.referencia ?? '').toLowerCase() === q ? 1 : 0)
        return exato(b) - exato(a)
      })
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
  const escala = ehCelular ? SCALE_CELULAR : SCALE

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
    /*
      ⭐ No celular as duas colunas viram uma. Não cabem: o painel da esquerda
      tem 288px fixos e o da direita nunca cabe no que sobra de uma tela de 360,
      então a página rolava de lado e metade da tela ficava fora — é o que as
      fotos dele mostram.

      ⚠️ E a altura deixa de ser `h-full`: no monitor os dois painéis rolam
      dentro de si; no celular quem rola é a página. Caixa rolante dentro de
      página rolante é a receita do dedo que raspa e nada anda — a mesma lição
      do carrinho do PDV.
    */
    <div className="flex flex-col lg:h-full lg:flex-row">
      {/* ── Painel esquerdo: seleção de produtos ── */}
      <div className="etiq-produtos flex flex-col border-t lg:w-72 lg:shrink-0 lg:border-l-0 lg:border-t-0 lg:border-r no-print">
        <div className="p-3 border-b">
          <h2 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
            <Tag className="w-4 h-4" />
            Selecionar Produtos
          </h2>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={ehCelular ? '' : 'Buscar por nome ou código...'}
              aria-label="Buscar por nome ou código"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 lg:py-1.5 h-11 lg:h-auto text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {/* A dica só existe com o campo vazio; ao digitar, some ela e o movimento. */}
            {ehCelular && filtro === '' && <DicaRolante texto="Buscar por nome ou código" />}
          </div>
          {selecoes.size > 0 && (
            <button
              onClick={() => setSelecoes(new Map())}
              className="text-xs text-destructive mt-1.5 underline-offset-2 hover:underline min-h-[44px] lg:min-h-0"
            >
              Limpar seleção ({selecoes.size})
            </button>
          )}
        </div>

        <div className="p-2 space-y-0.5 lg:flex-1 lg:overflow-y-auto">
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
                {/*
                  ⚠️ No celular quem vira alvo é a LINHA INTEIRA, e não a caixinha
                  de 14px — que o §7 reprovaria sozinho. O `<label>` faz isso sem
                  JavaScript nenhum e sem tirar a caixinha de quem usa teclado.
                */}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selecionado}
                    onChange={() => toggleProduto(e.chave)}
                    className="accent-blue-600 w-5 h-5 lg:w-3.5 lg:h-3.5 cursor-pointer mt-0.5 shrink-0"
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
                </label>
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

      {/*
        ── Painel direito: controles + prévia ──

        ⚠️ No celular esta caixa deixa de gerar quadro (`display: contents` no
        CSS): controles e prévia viram filhos diretos da página e cada um recebe
        seu próprio `order`. Sem isso os dois andariam colados, e a lista de
        produtos — que é a mais longa — não teria como ficar por último.
      */}
      <div className="etiq-direita flex-1 flex flex-col min-w-0">
        {/* Barra de controles */}
        <div className="etiq-controles border-b p-3 flex flex-wrap gap-x-6 gap-y-3 items-end bg-background no-print">
          <div className="w-full lg:w-auto">
            <label className="text-xs text-muted-foreground block mb-1">Layout</label>
            <Select
              value={layout.id}
              onChange={handleLayoutChange}
              className="h-11 lg:h-9 w-full lg:w-64"
              classNameContainer="w-full lg:w-64"
              opcoes={PRESETS.map((p) => ({ valor: p.id, rotulo: p.nome }))}
            />
          </div>

          <div className="w-full lg:w-auto">
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
              className="num w-20 h-11 lg:h-auto text-sm border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/*
            ⚠️ No celular cada opção vira uma pastilha de 44px. Como caixinha
            solta de 13px ao lado de um rótulo minúsculo, errar o alvo era o
            normal — e desmarcar "Preço" sem querer só se descobre com a folha
            impressa na mão.
          */}
          <div className="flex w-full flex-wrap items-end gap-2 lg:w-auto lg:gap-4">
            {opcoesExibicao.map(({ label, value, set }) => (
              <label
                key={label}
                className="flex min-h-[44px] cursor-pointer select-none items-center gap-2 rounded-lg border px-3 text-xs lg:min-h-0 lg:rounded-none lg:border-0 lg:px-0 lg:gap-1.5"
              >
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => set(e.target.checked)}
                  className="accent-blue-600 h-4 w-4 lg:h-auto lg:w-auto"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex w-full items-center gap-3 lg:ml-auto lg:w-auto">
            {totalEtiquetas > 0 && (
              <span className="num text-xs text-muted-foreground whitespace-nowrap">
                {totalEtiquetas} etiq. · {folhas.length} folha
                {folhas.length !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={async () => {
                // Nomeia o job de impressão (herda document.title) e imprime a
                // folha calibrada na impressora escolhida no diálogo do sistema.
                const anterior = document.title
                document.title = nomeImpressao.etiquetas()
                try {
                  await imprimirJanela(nomeImpressao.etiquetas(), 'documento')
                } finally {
                  document.title = anterior
                }
              }}
              disabled={totalEtiquetas === 0}
              className="ml-auto flex h-11 lg:h-auto items-center justify-center gap-1.5 px-4 lg:py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </button>
          </div>
        </div>

        {/*
          Área de prévia.

          ⚠️ No celular ela SOME enquanto não há folha. Vazia, ela gastaria uma
          tela inteira entre os ajustes e a lista — e a frase dela dizia
          "selecione produtos na lista AO LADO", que numa coluna só nem verdade
          era. Quem abre a tela cai direto na lista, que é o que veio fazer.
        */}
        <div className="etiq-previa bg-slate-100 p-3 lg:flex-1 lg:overflow-y-auto lg:p-6 no-print">
          {folhas.length === 0 ? (
            ehCelular ? null : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Tag className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">
                  Selecione produtos na lista ao lado para gerar etiquetas.
                </p>
              </div>
            </div>
            )
          ) : (
            <div className="flex flex-col gap-4 lg:gap-6 items-center">
              {folhas.map((slots, i) => (
                <div key={i}>
                  <p className="text-xs text-muted-foreground text-center mb-1.5 font-medium">
                    Folha {i + 1} de {folhas.length}
                  </p>
                  <div
                    style={{
                      width: `calc(210mm * ${escala})`,
                      height: `calc(297mm * ${escala})`,
                      overflow: 'hidden',
                      position: 'relative',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
                      borderRadius: '1px',
                    }}
                  >
                    <div
                      style={{
                        transform: `scale(${escala})`,
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
