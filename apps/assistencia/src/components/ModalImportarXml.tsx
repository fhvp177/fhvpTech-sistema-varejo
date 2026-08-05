import { FC, Fragment, useRef, useState } from 'react'
import {
  FileUp,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Split,
  PackagePlus,
  PackageCheck
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { gerarEAN13 } from '@/components/BarcodeGenerator'
import {
  analisarXmlNfe,
  sugerirGrades,
  calcularPrecoVenda,
  formatarCnpj,
  type ItemNota,
  type NotaEntradaLida
} from '@/utils/nfe'

// Importação de NF-e em 3 passos: arquivo (dropzone) → conferência (a tela
// importante: o lojista revê nome/categoria/margem e confirma o que é produto
// novo × reposição) → resumo. Nada é gravado antes do "Importar" final.

type Variacao = { id: number; tamanho: string; codigo_barras: string; estoque: number }
type ProdutoExistente = {
  id: number
  nome: string
  preco: number
  custo: number
  estoque: number
  variacoes: Variacao[]
}
type Categoria = { id: number; nome: string; usa_tamanhos: number }

// Espelho do retorno de notasEntrada:analisar (main process)
type MatchReposicao = {
  nItem: number
  origem: 'ean' | 'vinculo'
  produto_id: number
  produto_nome: string
  preco: number
  custo: number
  tem_grade: boolean
  variacao_id: number | null
  variacao_tamanho: string | null
  estoque_atual: number
}
type AnaliseNota = {
  notaJaImportada: { numero: string | null; importada_em: string } | null
  fornecedorExistente: { id: number; nome: string } | null
  matches: MatchReposicao[]
  margemPadrao: { valor: number; tipo: 'pct' | 'reais' } | null
  lojaCnpj: string | null
}

type GradeLinha = { tamanho: string; codigo: string; item: ItemNota }

type LinhaConf = {
  id: string
  incluir: boolean
  acao: 'novo' | 'reposicao'
  itens: ItemNota[] // 1 (simples) ou N (grade agrupada)
  // produto novo
  nome: string
  categoria: string
  codigo: string
  grade: GradeLinha[] | null
  // preço/margem (novo e reposição-com-atualização)
  custo: number
  margem: string
  margemTipo: 'pct' | 'reais'
  preco: string
  // reposição
  produtoId: number | null
  variacaoId: number | null
  produtoNome: string | null
  variacaoTamanho: string | null
  precoAtual: number | null
  estoqueAtual: number | null
  origem: 'ean' | 'vinculo' | 'manual' | null
  atualizarPreco: boolean
}

type Resumo = {
  produtosNovos: number
  reposicoes: number
  fornecedorNome: string
  fornecedorNovo: boolean
}

type Props = {
  aberto: boolean
  onFechar: () => void
  onImportado: () => void
  categorias: Categoria[]
  produtos: ProdutoExistente[]
}

const dinheiro = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const parseValor = (s: string): number => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

const ModalImportarXml: FC<Props> = ({ aberto, onFechar, onImportado, categorias, produtos }) => {
  const [etapa, setEtapa] = useState<'arquivo' | 'conferencia' | 'sucesso'>('arquivo')
  const [arrastando, setArrastando] = useState(false)
  const [erro, setErro] = useState('')
  const [lendo, setLendo] = useState(false)
  const [nota, setNota] = useState<NotaEntradaLida | null>(null)
  const [xmlBruto, setXmlBruto] = useState('')
  const [analise, setAnalise] = useState<AnaliseNota | null>(null)
  const [linhas, setLinhas] = useState<LinhaConf[]>([])
  const [margemGeral, setMargemGeral] = useState('')
  const [margemGeralTipo, setMargemGeralTipo] = useState<'pct' | 'reais'>('pct')
  const [importando, setImportando] = useState(false)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const categoriaVestuario = categorias.find((c) => !!c.usa_tamanhos)?.nome ?? ''

  const fechar = () => {
    // Importou algo? A lista de produtos lá atrás precisa recarregar.
    if (etapa === 'sucesso') onImportado()
    setEtapa('arquivo')
    setErro('')
    setNota(null)
    setAnalise(null)
    setLinhas([])
    setResumo(null)
    onFechar()
  }

  // ── Passo 1: ler o arquivo e perguntar ao banco o que ele já conhece ────────

  const processarArquivo = async (arquivo: File) => {
    setErro('')
    setLendo(true)
    try {
      const texto = await arquivo.text()
      const notaLida = analisarXmlNfe(texto)

      const resp = await window.api.notasEntrada.analisar(
        notaLida.chave,
        notaLida.fornecedor.cnpj,
        notaLida.itens.map((i) => ({ nItem: i.nItem, cprod: i.cprod, ean: i.ean }))
      )
      if (!resp.success) {
        setErro(resp.error)
        return
      }
      const a = resp.data as AnaliseNota

      if (a.notaJaImportada) {
        const quando = new Date(a.notaJaImportada.importada_em + 'Z')
        setErro(
          `Esta nota (nº ${a.notaJaImportada.numero ?? notaLida.numero}) já foi importada em ` +
            `${Number.isNaN(quando.getTime()) ? a.notaJaImportada.importada_em : quando.toLocaleDateString('pt-BR')}. ` +
            'Importar de novo duplicaria o estoque, então o sistema não deixa.'
        )
        return
      }

      const margem = a.margemPadrao
      setMargemGeral(margem ? String(margem.valor) : '')
      setMargemGeralTipo(margem?.tipo ?? 'pct')
      setNota(notaLida)
      setXmlBruto(texto)
      setAnalise(a)
      setLinhas(montarLinhas(notaLida, a))
      setEtapa('conferencia')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLendo(false)
    }
  }

  const montarLinhas = (n: NotaEntradaLida, a: AnaliseNota): LinhaConf[] => {
    const matchPorItem = new Map(a.matches.map((m) => [m.nItem, m]))
    const margem = a.margemPadrao

    const precoSugerido = (custo: number): string =>
      margem ? String(calcularPrecoVenda(custo, margem.valor, margem.tipo)) : ''

    const resultado: LinhaConf[] = []
    const semMatch: ItemNota[] = []

    for (const item of n.itens) {
      const m = matchPorItem.get(item.nItem)
      if (m) {
        resultado.push({
          id: `rep-${item.nItem}`,
          incluir: true,
          acao: 'reposicao',
          itens: [item],
          nome: item.descricao,
          categoria: '',
          codigo: '',
          grade: null,
          custo: item.custoUnitario,
          margem: margem ? String(margem.valor) : '',
          margemTipo: margem?.tipo ?? 'pct',
          preco: precoSugerido(item.custoUnitario),
          produtoId: m.produto_id,
          variacaoId: m.variacao_id,
          produtoNome: m.produto_nome,
          variacaoTamanho: m.variacao_tamanho,
          precoAtual: m.preco,
          estoqueAtual: m.estoque_atual,
          origem: m.origem,
          atualizarPreco: false
        })
      } else {
        semMatch.push(item)
      }
    }

    // Vestuário sem cadastro: agrupa tamanhos numa sugestão de grade.
    const grades = sugerirGrades(semMatch)
    const agrupados = new Set(grades.flat().map((i) => i.nItem))

    for (const grupo of grades) {
      // Grade tem UM custo por produto — se os tamanhos vieram com custos
      // diferentes na nota, fica o maior (nunca superestima a margem).
      const custo = Math.max(...grupo.map((i) => i.custoUnitario))
      resultado.push({
        id: `grade-${grupo[0].nItem}`,
        incluir: true,
        acao: 'novo',
        itens: grupo,
        nome: grupo[0].descricaoBase,
        categoria: categoriaVestuario,
        codigo: '',
        grade: grupo.map((i) => ({
          tamanho: i.tamanho!,
          codigo: i.ean ?? gerarEAN13(),
          item: i
        })),
        custo,
        margem: margem ? String(margem.valor) : '',
        margemTipo: margem?.tipo ?? 'pct',
        preco: precoSugerido(custo),
        produtoId: null,
        variacaoId: null,
        produtoNome: null,
        variacaoTamanho: null,
        precoAtual: null,
        estoqueAtual: null,
        origem: null,
        atualizarPreco: false
      })
    }

    for (const item of semMatch) {
      if (agrupados.has(item.nItem)) continue
      resultado.push({
        id: `novo-${item.nItem}`,
        incluir: true,
        acao: 'novo',
        itens: [item],
        nome: item.descricao,
        categoria: item.vestuario ? categoriaVestuario : '',
        codigo: item.ean ?? gerarEAN13(),
        grade: null,
        custo: item.custoUnitario,
        margem: margem ? String(margem.valor) : '',
        margemTipo: margem?.tipo ?? 'pct',
        preco: precoSugerido(item.custoUnitario),
        produtoId: null,
        variacaoId: null,
        produtoNome: null,
        variacaoTamanho: null,
        precoAtual: null,
        estoqueAtual: null,
        origem: null,
        atualizarPreco: false
      })
    }

    // Ordem da nota (o lojista confere com o papel na mão)
    return resultado.sort((x, y) => x.itens[0].nItem - y.itens[0].nItem)
  }

  // ── Passo 2: edição das linhas ──────────────────────────────────────────────

  const setLinha = (id: string, mudanca: Partial<LinhaConf>) =>
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...mudanca } : l)))

  const setMargemLinha = (l: LinhaConf, valor: string, tipo?: 'pct' | 'reais') => {
    const t = tipo ?? l.margemTipo
    const n = parseValor(valor)
    setLinha(l.id, {
      margem: valor,
      margemTipo: t,
      preco: Number.isFinite(n) ? String(calcularPrecoVenda(l.custo, n, t)) : l.preco
    })
  }

  const setPrecoLinha = (l: LinhaConf, valor: string) => {
    // Preço digitado na mão manda; a margem vira leitura do que resultou.
    const p = parseValor(valor)
    const margem =
      Number.isFinite(p) && l.custo > 0
        ? l.margemTipo === 'pct'
          ? String(+(((p - l.custo) / l.custo) * 100).toFixed(1))
          : String(+(p - l.custo).toFixed(2))
        : l.margem
    setLinha(l.id, { preco: valor, margem })
  }

  const aplicarMargemGeral = () => {
    const n = parseValor(margemGeral)
    if (!Number.isFinite(n) || n < 0) return
    setLinhas((ls) =>
      ls.map((l) => ({
        ...l,
        margem: margemGeral,
        margemTipo: margemGeralTipo,
        preco: String(calcularPrecoVenda(l.custo, n, margemGeralTipo))
      }))
    )
  }

  const desagrupar = (l: LinhaConf) => {
    if (!l.grade) return
    const novas: LinhaConf[] = l.grade.map((g) => ({
      ...l,
      id: `novo-${g.item.nItem}`,
      itens: [g.item],
      nome: g.item.descricao,
      codigo: g.codigo,
      grade: null,
      custo: g.item.custoUnitario
    }))
    setLinhas((ls) => ls.flatMap((x) => (x.id === l.id ? novas : [x])))
  }

  // "Vincular a um produto existente": a linha vira reposição daquele produto
  // (ou volta a ser produto novo se o lojista escolher a opção vazia).
  const vincular = (l: LinhaConf, valor: string) => {
    if (!valor) {
      setLinha(l.id, {
        acao: 'novo',
        produtoId: null,
        variacaoId: null,
        produtoNome: null,
        variacaoTamanho: null,
        precoAtual: null,
        estoqueAtual: null,
        origem: null,
        codigo: l.codigo || l.itens[0].ean || gerarEAN13()
      })
      return
    }
    const p = produtos.find((x) => x.id === Number(valor))
    if (!p) return
    const temGrade = p.variacoes.length > 0
    // Produto de grade: tenta casar o tamanho lido da nota; senão, o primeiro.
    const v = temGrade
      ? (p.variacoes.find((x) => x.tamanho === l.itens[0].tamanho) ?? p.variacoes[0])
      : null
    setLinha(l.id, {
      acao: 'reposicao',
      produtoId: p.id,
      variacaoId: v?.id ?? null,
      produtoNome: p.nome,
      variacaoTamanho: v?.tamanho ?? null,
      precoAtual: p.preco,
      estoqueAtual: v ? v.estoque : p.estoque,
      origem: 'manual',
      atualizarPreco: false
    })
  }

  const mudarVariacao = (l: LinhaConf, variacaoId: string) => {
    const p = produtos.find((x) => x.id === l.produtoId)
    const v = p?.variacoes.find((x) => x.id === Number(variacaoId))
    if (!v) return
    setLinha(l.id, { variacaoId: v.id, variacaoTamanho: v.tamanho, estoqueAtual: v.estoque })
  }

  // ── Passo 3: validar e gravar ───────────────────────────────────────────────

  const importar = async () => {
    if (!nota || !analise) return
    const incluidas = linhas.filter((l) => l.incluir)
    if (incluidas.length === 0) {
      setErro('Nenhum item selecionado — marque ao menos um pra importar.')
      return
    }

    const codigosNoLote = new Set<string>()
    for (const l of incluidas) {
      if (l.acao === 'novo') {
        if (!l.nome.trim()) {
          setErro(`Um dos itens novos está sem nome (item ${l.itens[0].nItem} da nota).`)
          return
        }
        const preco = parseValor(l.preco)
        if (!Number.isFinite(preco) || preco <= 0) {
          setErro(`Defina o preço de venda de "${l.nome}" (informe a margem ou o preço).`)
          return
        }
        const codigos = l.grade ? l.grade.map((g) => g.codigo.trim()) : [l.codigo.trim()]
        for (const c of codigos) {
          if (!c) {
            setErro(`"${l.nome}" está com código de barras vazio.`)
            return
          }
          if (codigosNoLote.has(c)) {
            setErro(`O código de barras ${c} aparece repetido em mais de um item da importação.`)
            return
          }
          codigosNoLote.add(c)
        }
      } else if (l.atualizarPreco) {
        const preco = parseValor(l.preco)
        if (!Number.isFinite(preco) || preco <= 0) {
          setErro(`Preço novo inválido na reposição de "${l.produtoNome}".`)
          return
        }
      }
    }

    setErro('')
    setImportando(true)
    try {
      const itemRef = (i: ItemNota) => ({
        cprod: i.cprod,
        descricao: i.descricao,
        ncm: i.ncm,
        cfop: i.cfop,
        unidade: i.unidade,
        quantidade: i.quantidade,
        custoUnitario: i.custoUnitario
      })

      const payload = {
        nota: {
          chave: nota.chave,
          numero: nota.numero,
          serie: nota.serie,
          modelo: nota.modelo,
          dataEmissao: nota.dataEmissao,
          valorTotal: nota.valorTotal,
          xml: xmlBruto
        },
        fornecedor: {
          id: analise.fornecedorExistente?.id ?? null,
          nome: nota.fornecedor.nome,
          cnpj: nota.fornecedor.cnpj,
          telefone: nota.fornecedor.telefone,
          endereco: nota.fornecedor.endereco
        },
        linhas: incluidas.map((l) =>
          l.acao === 'novo'
            ? {
                tipo: 'novo',
                nome: l.nome.trim(),
                categoria: l.categoria || null,
                preco: parseValor(l.preco),
                custo: l.custo,
                codigo_barras: l.grade ? null : l.codigo.trim(),
                item: l.grade ? undefined : itemRef(l.itens[0]),
                variacoes: l.grade
                  ? l.grade.map((g) => ({
                      tamanho: g.tamanho,
                      codigo_barras: g.codigo.trim(),
                      item: itemRef(g.item)
                    }))
                  : undefined
              }
            : {
                tipo: 'reposicao',
                produto_id: l.produtoId,
                variacao_id: l.variacaoId,
                novo_custo: l.custo,
                novo_preco: l.atualizarPreco ? parseValor(l.preco) : null,
                item: itemRef(l.itens[0])
              }
        ),
        margemUsada: Number.isFinite(parseValor(margemGeral))
          ? { valor: parseValor(margemGeral), tipo: margemGeralTipo }
          : undefined
      }

      const resp = await window.api.notasEntrada.importar(payload)
      if (!resp.success) {
        setErro(resp.error)
        return
      }
      const r = resp.data as Resumo & { fornecedorNovo: boolean }
      setResumo({
        produtosNovos: r.produtosNovos,
        reposicoes: r.reposicoes,
        fornecedorNome: nota.fornecedor.nome,
        fornecedorNovo: r.fornecedorNovo
      })
      setEtapa('sucesso')
    } finally {
      setImportando(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const avisos: string[] = []
  if (nota && analise) {
    if (nota.modelo === '65') {
      avisos.push('Este XML é de cupom fiscal (NFC-e), não de nota de compra — confira se é o arquivo certo.')
    }
    if (analise.lojaCnpj && nota.destinatarioCnpj && analise.lojaCnpj !== nota.destinatarioCnpj) {
      avisos.push(
        `A nota foi emitida para o CNPJ ${formatarCnpj(nota.destinatarioCnpj)}, que não é o da loja — confira se a compra é mesmo da loja.`
      )
    }
  }

  const incluidos = linhas.filter((l) => l.incluir)
  const totalNovos = incluidos.filter((l) => l.acao === 'novo').length
  const totalRepos = incluidos.filter((l) => l.acao === 'reposicao').length

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && fechar()}>
      <DialogContent
        className={etapa === 'conferencia' ? 'max-w-[1080px]' : 'max-w-lg'}
      >
        <DialogHeader>
          <DialogTitle>
            {etapa === 'arquivo' && 'Importar nota fiscal (XML)'}
            {etapa === 'conferencia' &&
              `Conferir nota nº ${nota?.numero} — ${nota?.fornecedor.fantasia || nota?.fornecedor.nome}`}
            {etapa === 'sucesso' && 'Importação concluída'}
          </DialogTitle>
        </DialogHeader>

        {etapa === 'arquivo' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Solte aqui o arquivo <strong>.xml</strong> da nota fiscal de compra (o fornecedor
              envia por email ou você baixa no portal). O sistema lê os produtos, o fornecedor e
              os custos — você só confere e define o lucro.
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setArrastando(true)
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault()
                setArrastando(false)
                if (e.dataTransfer.files.length > 0) processarArquivo(e.dataTransfer.files[0])
              }}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-12 cursor-pointer transition-colors ${
                arrastando
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input text-muted-foreground hover:border-primary/50'
              }`}
            >
              <FileUp className="w-8 h-8" />
              <span className="text-sm font-medium">
                {lendo ? 'Lendo o arquivo…' : 'Arraste o XML pra cá ou clique pra escolher'}
              </span>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xml,text/xml"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  processarArquivo(e.target.files[0])
                }
                e.target.value = ''
              }}
            />
            {erro && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erro}</p>
            )}
          </div>
        )}

        {etapa === 'conferencia' && nota && analise && (
          <div className="space-y-3">
            {/* Fornecedor */}
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
              <span className="font-medium">{nota.fornecedor.nome}</span>
              {nota.fornecedor.cnpj && (
                <span className="text-muted-foreground">{formatarCnpj(nota.fornecedor.cnpj)}</span>
              )}
              {analise.fornecedorExistente ? (
                <span className="text-xs rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">
                  fornecedor já cadastrado
                </span>
              ) : (
                <span className="text-xs rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2 py-0.5">
                  fornecedor novo — será cadastrado automaticamente
                </span>
              )}
              <span className="ml-auto text-muted-foreground">
                {nota.itens.length} item(ns) · total {dinheiro(nota.valorTotal)}
              </span>
            </div>

            {avisos.map((a) => (
              <p
                key={a}
                className="flex items-start gap-2 text-sm bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded px-3 py-2"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {a}
              </p>
            ))}

            {/* Margem geral */}
            <div className="flex items-end gap-2 rounded-md border px-3 py-2">
              <div className="grid gap-1">
                <Label htmlFor="margem-geral" className="text-xs">
                  Lucro desejado (aplica em todos os itens)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="margem-geral"
                    type="number"
                    min="0"
                    step="0.1"
                    value={margemGeral}
                    onChange={(e) => setMargemGeral(e.target.value)}
                    className="w-28"
                    placeholder="30"
                  />
                  <select
                    value={margemGeralTipo}
                    onChange={(e) => setMargemGeralTipo(e.target.value as 'pct' | 'reais')}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                    title="Em % o lucro é em cima do custo: 30% sobre R$ 100 = vende a R$ 130"
                  >
                    <option value="pct">% sobre o custo</option>
                    <option value="reais">R$ por unidade</option>
                  </select>
                  <Button type="button" variant="outline" onClick={aplicarMargemGeral}>
                    Aplicar em todos
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pb-2 ml-2">
                Ex.: 30% sobre um custo de R$ 100,00 → vende a R$ 130,00. Depois dá pra ajustar
                item por item.
              </p>
            </div>

            {/* Itens */}
            <div className="max-h-[46vh] overflow-y-auto rounded-md border divide-y">
              {linhas.map((l) => {
                const qtdTotal = l.itens.reduce((s, i) => s + i.quantidade, 0)
                return (
                  <div key={l.id} className={`px-3 py-2.5 ${l.incluir ? '' : 'opacity-45'}`}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={l.incluir}
                        onChange={(e) => setLinha(l.id, { incluir: e.target.checked })}
                        className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                        title="Incluir este item na importação"
                      />
                      {l.acao === 'novo' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-400 px-2 py-0.5 shrink-0">
                          <PackagePlus className="w-3 h-3" />
                          NOVO{l.grade ? ' · GRADE' : ''}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 shrink-0"
                          title={
                            l.origem === 'ean'
                              ? 'Reconhecido pelo código de barras'
                              : l.origem === 'vinculo'
                                ? 'Reconhecido por importação anterior deste fornecedor'
                                : 'Vinculado manualmente'
                          }
                        >
                          <PackageCheck className="w-3 h-3" />
                          REPOSIÇÃO
                        </span>
                      )}

                      {l.acao === 'novo' ? (
                        <Input
                          value={l.nome}
                          onChange={(e) => setLinha(l.id, { nome: e.target.value })}
                          className="h-8 flex-1 min-w-[180px]"
                          title={`Na nota: ${l.itens[0].descricao}`}
                        />
                      ) : (
                        <span className="flex-1 min-w-[180px] text-sm font-medium truncate">
                          {l.produtoNome}
                          {l.variacaoTamanho && (
                            <span className="text-muted-foreground"> — tam. {l.variacaoTamanho}</span>
                          )}
                        </span>
                      )}

                      <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
                        {qtdTotal % 1 === 0 ? qtdTotal : qtdTotal.toFixed(2)} un ×{' '}
                        {dinheiro(l.custo)}
                      </span>

                      {/* Vincular / desvincular (linha de item único) */}
                      {!l.grade && (
                        <select
                          value={l.origem === 'ean' || l.origem === 'vinculo' ? String(l.produtoId) : l.acao === 'reposicao' ? String(l.produtoId) : ''}
                          onChange={(e) => vincular(l, e.target.value)}
                          disabled={l.origem === 'ean' || l.origem === 'vinculo'}
                          className="h-8 w-44 shrink-0 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
                          title={
                            l.origem === 'ean' || l.origem === 'vinculo'
                              ? 'Reconhecido automaticamente'
                              : 'É um produto que você já tem? Vincule aqui em vez de cadastrar de novo.'
                          }
                        >
                          <option value="">— cadastrar como novo —</option>
                          {produtos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      )}
                      {l.grade && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 text-xs"
                          onClick={() => desagrupar(l)}
                          title="Separar os tamanhos em produtos independentes"
                        >
                          <Split className="w-3.5 h-3.5 mr-1" />
                          desagrupar
                        </Button>
                      )}
                    </div>

                    {/* Detalhe da linha */}
                    {l.incluir && l.acao === 'novo' && (
                      <div className="mt-2 ml-6 flex flex-wrap items-center gap-2">
                        <select
                          value={l.categoria}
                          onChange={(e) => setLinha(l.id, { categoria: e.target.value })}
                          className="h-8 w-36 rounded-md border border-input bg-background px-2 text-xs"
                          title="Categoria"
                        >
                          <option value="">— sem categoria —</option>
                          {categorias.map((c) => (
                            <option key={c.id} value={c.nome}>
                              {c.nome}
                            </option>
                          ))}
                        </select>

                        {!l.grade && (
                          <div className="flex items-center gap-1">
                            <Input
                              value={l.codigo}
                              onChange={(e) => setLinha(l.id, { codigo: e.target.value })}
                              className="h-8 w-40 font-mono text-xs"
                              title={
                                l.itens[0].ean
                                  ? 'Código de barras da nota'
                                  : 'A nota veio sem código de barras — este foi gerado pra você (pode trocar)'
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setLinha(l.id, { codigo: gerarEAN13() })}
                              title="Gerar outro código EAN-13"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}

                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-xs text-muted-foreground">lucro</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={l.margem}
                            onChange={(e) => setMargemLinha(l, e.target.value)}
                            className="h-8 w-20 text-right"
                          />
                          <select
                            value={l.margemTipo}
                            onChange={(e) =>
                              setMargemLinha(l, l.margem, e.target.value as 'pct' | 'reais')
                            }
                            className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                          >
                            <option value="pct">%</option>
                            <option value="reais">R$</option>
                          </select>
                          <span className="text-xs text-muted-foreground ml-2">vende a</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.preco}
                            onChange={(e) => setPrecoLinha(l, e.target.value)}
                            className="h-8 w-24 text-right font-medium"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    )}

                    {l.incluir && l.acao === 'novo' && l.grade && (
                      <div className="mt-2 ml-6 rounded-md border divide-y bg-muted/20">
                        {l.grade.map((g, gi) => (
                          <div key={g.item.nItem} className="flex items-center gap-2 px-2 py-1.5">
                            <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="w-8 text-center text-xs font-semibold">
                              {g.tamanho}
                            </span>
                            <Input
                              value={g.codigo}
                              onChange={(e) =>
                                setLinha(l.id, {
                                  grade: l.grade!.map((x, xi) =>
                                    xi === gi ? { ...x, codigo: e.target.value } : x
                                  )
                                })
                              }
                              className="h-7 w-40 font-mono text-xs"
                              title={g.item.ean ? 'Código da nota' : 'Código gerado (pode trocar)'}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                setLinha(l.id, {
                                  grade: l.grade!.map((x, xi) =>
                                    xi === gi ? { ...x, codigo: gerarEAN13() } : x
                                  )
                                })
                              }
                              title="Gerar outro código"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </Button>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {Math.round(g.item.quantidade)} un ·{' '}
                              {dinheiro(g.item.custoUnitario)} cada
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {l.incluir && l.acao === 'reposicao' && (
                      <div className="mt-2 ml-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {/* Tamanho, quando o produto vinculado tem grade */}
                        {l.origem === 'manual' &&
                          (() => {
                            const p = produtos.find((x) => x.id === l.produtoId)
                            if (!p || p.variacoes.length === 0) return null
                            return (
                              <label className="flex items-center gap-1">
                                tamanho:
                                <select
                                  value={l.variacaoId ?? ''}
                                  onChange={(e) => mudarVariacao(l, e.target.value)}
                                  className="h-7 rounded-md border border-input bg-background px-1"
                                >
                                  {p.variacoes.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.tamanho}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )
                          })()}
                        <span>
                          estoque: {l.estoqueAtual} →{' '}
                          <strong className="text-foreground">
                            {(l.estoqueAtual ?? 0) + Math.round(qtdTotal)}
                          </strong>
                        </span>
                        <span>
                          custo: {dinheiro(l.custo)}
                          {l.precoAtual != null && l.precoAtual > 0 && (
                            <span className="ml-1">
                              (margem atual vira{' '}
                              {(((l.precoAtual - l.custo) / l.custo) * 100).toFixed(0)}%)
                            </span>
                          )}
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="radio"
                            checked={!l.atualizarPreco}
                            onChange={() => setLinha(l.id, { atualizarPreco: false })}
                            className="accent-primary"
                          />
                          manter preço ({dinheiro(l.precoAtual ?? 0)})
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="radio"
                            checked={l.atualizarPreco}
                            onChange={() => setLinha(l.id, { atualizarPreco: true })}
                            className="accent-primary"
                          />
                          atualizar preço:
                        </label>
                        {l.atualizarPreco && (
                          <span className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={l.margem}
                              onChange={(e) => setMargemLinha(l, e.target.value)}
                              className="h-7 w-16 text-right"
                            />
                            <select
                              value={l.margemTipo}
                              onChange={(e) =>
                                setMargemLinha(l, l.margem, e.target.value as 'pct' | 'reais')
                              }
                              className="h-7 rounded-md border border-input bg-background px-1"
                            >
                              <option value="pct">%</option>
                              <option value="reais">R$</option>
                            </select>
                            →
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.preco}
                              onChange={(e) => setPrecoLinha(l, e.target.value)}
                              className="h-7 w-20 text-right font-medium"
                            />
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {erro && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erro}</p>
            )}
          </div>
        )}

        {etapa === 'sucesso' && resumo && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <div className="text-sm space-y-1">
              {resumo.produtosNovos > 0 && (
                <p>
                  <strong>{resumo.produtosNovos}</strong> produto(s) novo(s) cadastrado(s)
                </p>
              )}
              {resumo.reposicoes > 0 && (
                <p>
                  <strong>{resumo.reposicoes}</strong> reposição(ões) de estoque
                </p>
              )}
              <p className="text-muted-foreground">
                Fornecedor: {resumo.fornecedorNome}
                {resumo.fornecedorNovo ? ' (cadastrado agora)' : ''}
              </p>
              <p className="text-muted-foreground text-xs pt-1">
                A nota ficou guardada em <strong>Notas de entrada</strong> — de lá sai o relatório
                mensal e os XMLs pro contador.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {etapa === 'conferencia' && (
            <>
              <span className="mr-auto text-sm text-muted-foreground self-center">
                {incluidos.length} de {linhas.length} item(ns) selecionado(s)
                {totalNovos > 0 && ` · ${totalNovos} novo(s)`}
                {totalRepos > 0 && ` · ${totalRepos} reposição(ões)`}
              </span>
              <Button variant="outline" onClick={() => { setEtapa('arquivo'); setErro('') }}>
                Voltar
              </Button>
              <Button onClick={importar} disabled={importando || incluidos.length === 0}>
                {importando ? 'Importando…' : 'Importar'}
              </Button>
            </>
          )}
          {etapa !== 'conferencia' && (
            <Button variant={etapa === 'sucesso' ? 'default' : 'outline'} onClick={fechar}>
              {etapa === 'sucesso' ? 'Concluir' : 'Cancelar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ModalImportarXml
