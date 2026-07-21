import { FC, Fragment, Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Pencil, Trash2, Plus, Search, Barcode, RefreshCw, UserPlus, Printer, Tag, FileDown, FileUp, FileText, ChevronRight, ChevronDown, Layers, Info } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { useImprimir } from '@/components/ImpressaoProvider'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import BarcodeGenerator, { gerarEAN13 } from '@/components/BarcodeGenerator'
import { nomeImpressao } from '@/utils/nomeImpressao'
import { gerarHtmlRelatorioEstoque, gerarHtmlTabelaReferencias } from '@/utils/relatoriosProdutos'
import Paginacao from '@fhvptech/core/ui/paginacao'
import { Tooltip } from '@fhvptech/core/ui/tooltip'
import ModalCategorias from '@/components/ModalCategorias'
import ModalImportarXml from '@/components/ModalImportarXml'
import ModalNotasEntrada from '@/components/ModalNotasEntrada'
import { useSessao } from '@/App'

const ITENS_POR_PAGINA = 20

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
  categoria: string | null
  preco: number
  custo: number
  estoque: number // simples: o próprio; grade: soma dos tamanhos
  fornecedor_id: number | null
  fornecedor_nome?: string | null
  variacoes: Variacao[]
}

type Fornecedor = { id: number; nome: string }

// Tamanhos oferecidos na grade (P ao GG por enquanto).
const TAMANHOS_GRADE = ['P', 'M', 'G', 'GG'] as const

type FormVariacao = { tamanho: string; codigo_barras: string; estoque: string }

type FormProduto = {
  codigo_barras: string
  referencia: string
  nome: string
  categoria: string
  preco: string
  custo: string
  estoque: string
  fornecedor_id: string
  temGrade: boolean
  variacoes: FormVariacao[]
}

const gradeVazia = (): FormVariacao[] =>
  TAMANHOS_GRADE.map((t) => ({ tamanho: t, codigo_barras: '', estoque: '0' }))

// Monta as linhas da grade a partir das variações salvas: começa com P/M/G/GG
// vazios e sobrepõe os tamanhos já cadastrados (preserva tamanhos fora do padrão).
const construirGrade = (vs: Variacao[]): FormVariacao[] => {
  const base = gradeVazia()
  const extras: FormVariacao[] = []
  for (const v of vs) {
    const fv = { tamanho: v.tamanho, codigo_barras: v.codigo_barras, estoque: String(v.estoque) }
    const idx = base.findIndex((b) => b.tamanho === v.tamanho)
    if (idx >= 0) base[idx] = fv
    else extras.push(fv)
  }
  return [...base, ...extras]
}

// Campos fiscais do produto — só no plano Pro; a flag tira o chunk do Básico.
const FiscalProdutoCampos = __FEAT_NFE__
  ? lazy(() => import('@/components/FiscalProdutoCampos'))
  : null

// Definido aqui, não importado do componente lazy (senão o módulo volta pro
// binário do Básico).
const FISCAL_PRODUTO_VAZIO: FiscalProduto = {
  ncm: '',
  cfop: '',
  cst_csosn: '',
  origem: '0',
  unidade: 'UN'
}

const FORM_VAZIO: FormProduto = {
  codigo_barras: '',
  referencia: '',
  nome: '',
  categoria: '',
  preco: '',
  custo: '',
  estoque: '0',
  fornecedor_id: '',
  temGrade: false,
  variacoes: gradeVazia()
}

type Categoria = { id: number; nome: string; produtos_count: number; usa_tamanhos: number }

const Produtos: FC = () => {
  const { ehDono } = useSessao()
  const [lista, setLista] = useState<Produto[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [modalCategoriasAberto, setModalCategoriasAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Produto | null>(null)
  const [form, setForm] = useState<FormProduto>(FORM_VAZIO)
  // Classificação fiscal, gravada por caminho próprio (ver salvar()).
  const [fiscalProduto, setFiscalProduto] = useState<FiscalProduto>(FISCAL_PRODUTO_VAZIO)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [expandido, setExpandido] = useState<number | null>(null) // id do produto com grade aberta na lista

  // Cadastro rápido de fornecedor
  const [modalFornecedorAberto, setModalFornecedorAberto] = useState(false)
  const [nomeFornecedorRapido, setNomeFornecedorRapido] = useState('')
  const [erroFornecedor, setErroFornecedor] = useState('')
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false)
  const [relatorioAberto, setRelatorioAberto] = useState(false)
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)

  // Importação de NF-e (XML) + histórico das notas importadas
  const [importarXmlAberto, setImportarXmlAberto] = useState(false)
  const [notasEntradaAberto, setNotasEntradaAberto] = useState(false)

  // Controle do leitor USB — detecta leitura rápida (< 80ms entre teclas)
  const scanBuffer = useRef('')
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputScanRef = useRef<HTMLInputElement>(null)

  // Grade de tamanhos só faz sentido em categorias marcadas como "tem tamanhos"
  // (ex.: Roupas) — a flag é gerenciável por categoria. Mantemos o checkbox
  // visível também quando o produto JÁ é de grade, pra nunca "prender" a opção ao
  // editar um produto cuja categoria não usa tamanhos.
  const categoriaUsaTamanhos = categorias.some(
    (c) => c.nome === form.categoria && !!c.usa_tamanhos
  )
  const mostrarOpcaoGrade = categoriaUsaTamanhos || form.temGrade

  const carregar = async () => {
    const [rProdutos, rFornecedores, rCategorias] = await Promise.all([
      window.api.produtos.listar(),
      window.api.fornecedores.listar(),
      window.api.categorias.listar()
    ])
    if (rProdutos.success) setLista(rProdutos.data as Produto[])
    if (rFornecedores.success) setFornecedores(rFornecedores.data as Fornecedor[])
    if (rCategorias.success) setCategorias(rCategorias.data)
  }

  useEffect(() => {
    carregar()
  }, [])

  // Captura leitura do leitor USB: digita rápido e envia Enter
  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const codigo = scanBuffer.current.trim()
      if (codigo) {
        setBusca(codigo)
        scanBuffer.current = ''
        if (inputScanRef.current) inputScanRef.current.value = ''
      }
    }
  }

  const handleScanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    scanBuffer.current = e.target.value
    // Limpa buffer automaticamente após 300ms sem nova tecla (timeout entre leituras)
    if (scanTimer.current) clearTimeout(scanTimer.current)
    scanTimer.current = setTimeout(() => {
      scanBuffer.current = ''
      if (inputScanRef.current) inputScanRef.current.value = ''
    }, 300)
  }

  // Quem bate EXATO na referência vai pro topo: digitou "10", o produto ref. 10
  // aparece primeiro e os "contém 10" (nome/código) vêm depois.
  const termoBusca = busca.trim().toLowerCase()
  const listaFiltrada = lista
    .filter((p) => {
      const t = busca.toLowerCase()
      return (
        p.nome.toLowerCase().includes(t) ||
        (p.codigo_barras ?? '').includes(busca) ||
        (p.referencia ?? '').toLowerCase().includes(termoBusca) ||
        p.variacoes.some((v) => v.codigo_barras.includes(busca)) ||
        (p.categoria ?? '').toLowerCase().includes(t) ||
        (p.fornecedor_nome ?? '').toLowerCase().includes(t)
      )
    })
    .sort((a, b) => {
      if (!termoBusca) return 0
      const exato = (p: Produto) => ((p.referencia ?? '').toLowerCase() === termoBusca ? 1 : 0)
      return exato(b) - exato(a)
    })

  useEffect(() => {
    setPaginaAtual(1)
  }, [busca])

  const inicioPagina = (paginaAtual - 1) * ITENS_POR_PAGINA
  const listaPaginada = listaFiltrada.slice(inicioPagina, inicioPagina + ITENS_POR_PAGINA)

  const abrirNovo = () => {
    setFiscalProduto(FISCAL_PRODUTO_VAZIO)
    setEditando(null)
    setForm(FORM_VAZIO)
    setErro('')
    setDialogAberto(true)
  }

  const abrirEdicao = (p: Produto) => {
    const temGrade = p.variacoes.length > 0
    setEditando(p)
    setForm({
      codigo_barras: p.codigo_barras ?? '',
      referencia: p.referencia ?? '',
      nome: p.nome,
      categoria: p.categoria ?? '',
      preco: p.preco.toFixed(2),
      custo: (p.custo ?? 0) > 0 ? (p.custo ?? 0).toFixed(2) : '',
      estoque: temGrade ? '0' : String(p.estoque),
      fornecedor_id: p.fornecedor_id ? String(p.fornecedor_id) : '',
      temGrade,
      variacoes: temGrade ? construirGrade(p.variacoes) : gradeVazia()
    })
    setErro('')
    setDialogAberto(true)
  }

  const setF = (campo: keyof FormProduto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }))

  const gerarCodigo = () => setForm((f) => ({ ...f, codigo_barras: gerarEAN13() }))

  // ── Grade de tamanhos ──
  const setVariacao = (i: number, campo: 'codigo_barras' | 'estoque') => (valor: string) =>
    setForm((f) => ({
      ...f,
      variacoes: f.variacoes.map((v, idx) => (idx === i ? { ...v, [campo]: valor } : v))
    }))

  const gerarCodigoVariacao = (i: number) =>
    setForm((f) => ({
      ...f,
      variacoes: f.variacoes.map((v, idx) => (idx === i ? { ...v, codigo_barras: gerarEAN13() } : v))
    }))

  const salvar = async () => {
    if (!form.nome.trim()) { setErro('O nome do produto é obrigatório.'); return }
    const preco = parseFloat(form.preco.replace(',', '.'))
    if (isNaN(preco) || preco < 0) { setErro('Preço inválido.'); return }
    const custo = form.custo.trim() ? parseFloat(form.custo.replace(',', '.')) : 0
    if (isNaN(custo) || custo < 0) { setErro('Preço de compra inválido.'); return }

    // Tamanhos efetivamente cadastrados = os que têm código de barras preenchido.
    const ativos = form.variacoes.filter((v) => v.codigo_barras.trim())

    if (form.temGrade) {
      if (ativos.length === 0) {
        setErro('Adicione ao menos um tamanho com código de barras (ou desligue a grade).'); return
      }
      for (const v of ativos) {
        const est = parseInt(v.estoque)
        if (isNaN(est) || est < 0) { setErro(`Estoque inválido no tamanho ${v.tamanho}.`); return }
      }
      const codigos = ativos.map((v) => v.codigo_barras.trim())
      if (new Set(codigos).size !== codigos.length) {
        setErro('Há códigos de barras repetidos entre os tamanhos.'); return
      }
    } else if (!form.codigo_barras.trim()) {
      setErro('O código de barras é obrigatório.'); return
    }

    setCarregando(true)
    setErro('')

    const dados = {
      codigo_barras: form.temGrade ? null : form.codigo_barras.trim(),
      referencia: form.referencia.trim() || null,
      nome: form.nome.trim(),
      categoria: form.categoria.trim() || null,
      preco,
      custo,
      estoque: form.temGrade ? 0 : parseInt(form.estoque) || 0,
      fornecedor_id: form.fornecedor_id ? parseInt(form.fornecedor_id) : null,
      variacoes: form.temGrade
        ? ativos.map((v) => ({
            tamanho: v.tamanho,
            codigo_barras: v.codigo_barras.trim(),
            estoque: parseInt(v.estoque) || 0
          }))
        : undefined
    }

    const resp = editando
      ? await window.api.produtos.atualizar(editando.id, dados)
      : await window.api.produtos.criar(dados)

    if (resp.success) {
      // Dados fiscais seguem por caminho próprio — não fazem parte do cadastro
      // básico, que é usado também no PDV e na importação de XML.
      if (__FEAT_NFE__) {
        const idProduto = editando?.id ?? (resp.data as { id?: number } | null)?.id
        if (idProduto) await window.api.fiscal.salvarProduto(idProduto, fiscalProduto)
      }
      await carregar()
      setDialogAberto(false)
    } else {
      setErro(
        resp.error.includes('referencia')
          ? 'Já existe outro produto com esta referência.'
          : resp.error.includes('UNIQUE')
            ? 'Já existe um produto com este código de barras.'
            : resp.error
      )
    }
    setCarregando(false)
  }

  const abrirFornecedorRapido = () => {
    setNomeFornecedorRapido('')
    setErroFornecedor('')
    setModalFornecedorAberto(true)
  }

  const salvarFornecedorRapido = async () => {
    if (!nomeFornecedorRapido.trim()) {
      setErroFornecedor('O nome do fornecedor é obrigatório.')
      return
    }
    setSalvandoFornecedor(true)
    setErroFornecedor('')
    const resp = await window.api.fornecedores.criar({
      nome: nomeFornecedorRapido.trim(),
      cnpj: null,
      telefone: null,
      email: null,
      endereco: null,
    })
    if (resp.success) {
      const novoFornecedor = resp.data as Fornecedor
      const rFornecedores = await window.api.fornecedores.listar()
      if (rFornecedores.success) setFornecedores(rFornecedores.data as Fornecedor[])
      setForm((f) => ({ ...f, fornecedor_id: String(novoFornecedor.id) }))
      setModalFornecedorAberto(false)
    } else {
      setErroFornecedor(resp.error)
    }
    setSalvandoFornecedor(false)
  }

  const confirmar = useConfirm()
  const imprimir = useImprimir()

  const excluir = async (id: number, nome: string) => {
    if (
      !(await confirmar({
        titulo: 'Excluir produto',
        mensagem: `Tem certeza que deseja excluir o produto "${nome}"?`,
        variante: 'destructive'
      }))
    )
      return
    const resp = await window.api.produtos.deletar(id)
    if (resp.success) await carregar()
    else alert(`Erro: ${resp.error}`)
  }

  const gerarRelatorio = async (tipo: 'estoque' | 'referencias', acao: 'pdf' | 'imprimir') => {
    if (lista.length === 0) return
    setGerandoRelatorio(true)
    try {
      const html =
        tipo === 'estoque' ? gerarHtmlRelatorioEstoque(lista) : gerarHtmlTabelaReferencias(lista)
      const nome =
        tipo === 'estoque' ? nomeImpressao.relatorioEstoque() : nomeImpressao.tabelaReferencias()
      if (acao === 'imprimir') {
        const ok = await imprimir(html, nome, 'documento')
        if (ok) setRelatorioAberto(false)
        return
      }
      const resp = await window.api.impressao.salvarPdf(html, nome)
      if (!resp.success) {
        alert(`Erro ao gerar relatório: ${resp.error}`)
        return
      }
      setRelatorioAberto(false)
    } finally {
      setGerandoRelatorio(false)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Produtos</h2>
        <div className="flex gap-2">
          {ehDono && (
            <Button variant="outline" onClick={() => setModalCategoriasAberto(true)}>
              <Tag className="w-4 h-4 mr-2" />
              Categorias
            </Button>
          )}
          {ehDono && (
            <Button
              variant="outline"
              onClick={() => setNotasEntradaAberto(true)}
              title="Notas fiscais de compra já importadas — relatório mensal e XMLs pro contador"
            >
              <FileText className="w-4 h-4 mr-2" />
              Notas de entrada
            </Button>
          )}
          {ehDono && (
            <Button
              variant="outline"
              data-tour="produtos-importar-xml"
              onClick={() => setImportarXmlAberto(true)}
              title="Cadastrar produtos e repor estoque a partir do XML da nota fiscal de compra"
            >
              <FileUp className="w-4 h-4 mr-2" />
              Importar XML
            </Button>
          )}
          <Button
            variant="outline"
            data-tour="produtos-imprimir"
            onClick={() => setRelatorioAberto(true)}
            disabled={lista.length === 0}
          >
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
          {ehDono && (
            <Button onClick={abrirNovo} data-tour="produtos-novo">
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </Button>
          )}
        </div>
      </div>

      {/* Busca + Leitor USB */}
      <div className="flex gap-3 mb-4 max-w-xl">
        <div className="relative flex-1" data-tour="produtos-busca">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código, categoria..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="relative" data-tour="produtos-leitor">
          <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={inputScanRef}
            onChange={handleScanChange}
            onKeyDown={handleScanKeyDown}
            placeholder="Aponte o leitor aqui..."
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-52"
            title="Campo para leitor de código de barras USB"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-16">Ref.</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Código</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoria</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Preço</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Estoque</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fornecedor</th>
              <th className="w-24 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  {busca ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
                </td>
              </tr>
            )}
            {listaPaginada.map((p, i) => {
              const temGrade = p.variacoes.length > 0
              const aberto = expandido === p.id
              return (
              <Fragment key={p.id}>
              <tr
                className={`border-b border-border last:border-b-0 ${
                  i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                }`}
              >
                <td className="px-4 py-3 font-mono text-xs font-semibold">
                  {p.referencia ?? '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {temGrade ? (
                    <button
                      type="button"
                      onClick={() => setExpandido(aberto ? null : p.id)}
                      className="flex items-center gap-1 text-primary hover:underline"
                      title="Ver tamanhos"
                    >
                      {aberto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Layers className="w-3.5 h-3.5" />
                      {p.variacoes.length} tam.
                    </button>
                  ) : (
                    <div className="truncate max-w-[150px]" title={p.codigo_barras ?? undefined}>{p.codigo_barras}</div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">
                  <div className="truncate max-w-[280px]" title={p.nome}>{p.nome}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.categoria
                    ? <div className="truncate max-w-[160px]" title={p.categoria}>{p.categoria}</div>
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className={`px-4 py-3 text-right font-medium ${p.estoque === 0 ? 'text-destructive' : p.estoque <= 5 ? 'text-amber-600' : ''}`}>
                  {p.estoque}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.fornecedor_nome
                    ? <div className="truncate max-w-[180px]" title={p.fornecedor_nome}>{p.fornecedor_nome}</div>
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {ehDono && (
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => abrirEdicao(p)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => excluir(p.id, p.nome)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
              {temGrade && aberto && (
                <tr className="bg-muted/40 border-b border-border last:border-b-0">
                  <td colSpan={8} className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      {p.variacoes.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs"
                        >
                          <span className="font-semibold w-7 text-center">{v.tamanho}</span>
                          <span className="font-mono text-muted-foreground">{v.codigo_barras}</span>
                          <span className={`font-medium ${v.estoque === 0 ? 'text-destructive' : v.estoque <= 5 ? 'text-amber-600' : ''}`}>
                            {v.estoque} un.
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <Paginacao
        paginaAtual={paginaAtual}
        totalItens={listaFiltrada.length}
        itensPorPagina={ITENS_POR_PAGINA}
        onMudarPagina={setPaginaAtual}
        rotuloItem="produto(s)"
      />

      {/* Dialog criar/editar */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Código de barras + gerador (só quando o produto NÃO é de grade) */}
            {!form.temGrade && (
            <div className="grid gap-1.5">
              <Label htmlFor="codigo_barras">
                Código de barras <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="codigo_barras"
                  value={form.codigo_barras}
                  onChange={setF('codigo_barras')}
                  placeholder="Escanear ou digitar"
                  className="font-mono"
                  onKeyDown={(e) => {
                    // Captura Enter do leitor USB sem submeter o dialog
                    if (e.key === 'Enter') e.preventDefault()
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={gerarCodigo}
                  title="Gerar EAN-13 aleatório (prefixo 789 - Brasil)"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Gerar
                </Button>
              </div>
              {/* Pré-visualização do código de barras */}
              {form.codigo_barras && (
                <BarcodeGenerator
                  codigo={form.codigo_barras}
                  formato={form.codigo_barras.length === 13 ? 'EAN13' : 'CODE128'}
                  altura={50}
                />
              )}
            </div>
            )}

            <div className="grid grid-cols-2 gap-3 items-start">
              <div className="col-span-2 grid gap-1.5">
                <Label htmlFor="nome">
                  Nome <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={setF('nome')}
                  placeholder="Nome do produto"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="referencia" className="flex items-center gap-1.5">
                  Referência
                  <Tooltip content="Código curto pra achar o produto rápido sem leitor (digite a referência no campo do leitor + Enter). Deixe vazio pra numerar sozinho.">
                    <Info className="w-3.5 h-3.5 cursor-help text-muted-foreground" />
                  </Tooltip>
                </Label>
                <Input
                  id="referencia"
                  value={form.referencia}
                  onChange={setF('referencia')}
                  placeholder={editando ? '' : 'Automática (ex.: 10)'}
                  className="font-mono"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="categoria">Categoria</Label>
                <div className="flex gap-2">
                  <select
                    id="categoria"
                    value={form.categoria}
                    onChange={setF('categoria')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">— Sem categoria —</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.nome}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setModalCategoriasAberto(true)}
                    title="Gerenciar categorias"
                  >
                    <Tag className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="fornecedor">Fornecedor</Label>
                <div className="flex gap-2">
                  <select
                    id="fornecedor"
                    value={form.fornecedor_id}
                    onChange={setF('fornecedor_id')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">— Nenhum —</option>
                    {fornecedores.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={abrirFornecedorRapido}
                    title="Cadastrar novo fornecedor"
                  >
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Esse produto tem tamanhos? Só aparece para categorias que usam
                  grade (ou se o produto já é de grade, ao editar). */}
              {mostrarOpcaoGrade && (
                <label className="col-span-2 flex items-center gap-2 text-sm font-medium cursor-pointer select-none rounded-md border bg-muted/30 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={form.temGrade}
                    onChange={(e) => setForm((f) => ({ ...f, temGrade: e.target.checked }))}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  Esse produto tem tamanhos (grade P/M/G/GG)
                </label>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="preco">
                  Preço de venda (R$) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="preco"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.preco}
                  onChange={setF('preco')}
                  placeholder="0,00"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="custo" className="flex items-center gap-1.5">
                  Preço de compra (R$)
                  <Tooltip content="Quanto você paga no produto. Usado pro lucro/margem na dashboard.">
                    <Info className="w-3.5 h-3.5 cursor-help text-muted-foreground" />
                  </Tooltip>
                </Label>
                <Input
                  id="custo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.custo}
                  onChange={setF('custo')}
                  placeholder="0,00"
                />
              </div>

              {!form.temGrade && (
              <div className="grid gap-1.5">
                <Label htmlFor="estoque">Estoque inicial</Label>
                <Input
                  id="estoque"
                  type="number"
                  min="0"
                  step="1"
                  value={form.estoque}
                  onChange={setF('estoque')}
                />
              </div>
              )}
            </div>

            {/* Grade de tamanhos */}
            {form.temGrade && (
              <div className="grid gap-2">
                <Label>Tamanhos, códigos e estoque</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Preencha só os tamanhos que você vende. Cada um tem seu próprio código de barras
                  (pra bipar no caixa) e seu próprio estoque.
                </p>
                <div className="rounded-md border divide-y">
                  {form.variacoes.map((v, i) => (
                    <div key={v.tamanho} className="flex items-center gap-2 px-3 py-2">
                      <span className="w-9 shrink-0 text-center font-semibold text-sm">{v.tamanho}</span>
                      <Input
                        value={v.codigo_barras}
                        onChange={(e) => setVariacao(i, 'codigo_barras')(e.target.value)}
                        placeholder="Código de barras"
                        className="font-mono flex-1"
                        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => gerarCodigoVariacao(i)}
                        title="Gerar código EAN-13 para este tamanho"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={v.estoque}
                        onChange={(e) => setVariacao(i, 'estoque')(e.target.value)}
                        className="w-20"
                        title="Estoque deste tamanho"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {erro && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erro}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={carregando}>
              {carregando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Dialog cadastro rápido de fornecedor */}
      <Dialog open={modalFornecedorAberto} onOpenChange={setModalFornecedorAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cadastro Rápido de Fornecedor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            O fornecedor será cadastrado e já ficará selecionado no produto.
            Você pode completar os demais dados depois em <strong>Fornecedores</strong>.
          </p>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="nome-fornecedor-rapido">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome-fornecedor-rapido"
                value={nomeFornecedorRapido}
                onChange={(e) => setNomeFornecedorRapido(e.target.value)}
                placeholder="Nome do fornecedor"
                onKeyDown={(e) => { if (e.key === 'Enter') salvarFornecedorRapido() }}
                autoFocus
              />
            </div>
            {erroFornecedor && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">
                {erroFornecedor}
              </p>
            )}
          </div>
          {FiscalProdutoCampos && (
            <Suspense fallback={null}>
              <FiscalProdutoCampos
                produtoId={editando?.id ?? null}
                valor={fiscalProduto}
                onChange={setFiscalProduto}
              />
            </Suspense>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalFornecedorAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarFornecedorRapido} disabled={salvandoFornecedor}>
              {salvandoFornecedor ? 'Salvando...' : 'Cadastrar Fornecedor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={relatorioAberto} onOpenChange={(open) => !open && setRelatorioAberto(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Imprimir relatórios de produtos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border px-3 py-3 space-y-2">
              <p className="text-sm font-medium">Relatório de estoque</p>
              <p className="text-xs text-muted-foreground">
                {lista.length} produto(s) por categoria, com estoque do sistema e coluna pra
                contagem física (balanço).
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => gerarRelatorio('estoque', 'pdf')}
                  disabled={gerandoRelatorio || lista.length === 0}
                >
                  <FileDown className="w-3.5 h-3.5 mr-1.5" /> Salvar PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => gerarRelatorio('estoque', 'imprimir')}
                  disabled={gerandoRelatorio || lista.length === 0}
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir
                </Button>
              </div>
            </div>

            <div className="rounded-md border px-3 py-3 space-y-2">
              <p className="text-sm font-medium">Tabela de referências</p>
              <p className="text-xs text-muted-foreground">
                Só referência + nome, em colunas compactas e ordem alfabética — pra deixar no
                balcão como cola do vendedor.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => gerarRelatorio('referencias', 'pdf')}
                  disabled={gerandoRelatorio || lista.length === 0}
                >
                  <FileDown className="w-3.5 h-3.5 mr-1.5" /> Salvar PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => gerarRelatorio('referencias', 'imprimir')}
                  disabled={gerandoRelatorio || lista.length === 0}
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ModalCategorias
        aberto={modalCategoriasAberto}
        onFechar={() => setModalCategoriasAberto(false)}
        onMudancas={carregar}
      />

      <ModalImportarXml
        aberto={importarXmlAberto}
        onFechar={() => setImportarXmlAberto(false)}
        onImportado={carregar}
        categorias={categorias}
        produtos={lista}
      />

      <ModalNotasEntrada
        aberto={notasEntradaAberto}
        onFechar={() => setNotasEntradaAberto(false)}
      />
    </div>
  )
}

export default Produtos
