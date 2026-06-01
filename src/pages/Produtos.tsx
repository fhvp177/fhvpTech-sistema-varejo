import { FC, useEffect, useRef, useState } from 'react'
import { Pencil, Trash2, Plus, Search, Barcode, RefreshCw, UserPlus, Printer, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import BarcodeGenerator, { gerarEAN13 } from '@/components/BarcodeGenerator'
import Paginacao from '@/components/ui/paginacao'
import ModalCategorias from '@/components/ModalCategorias'
import { useSessao } from '@/App'

const ITENS_POR_PAGINA = 20

type Produto = {
  id: number
  codigo_barras: string
  nome: string
  categoria: string | null
  preco: number
  estoque: number
  fornecedor_id: number | null
  fornecedor_nome?: string | null
}

type Fornecedor = { id: number; nome: string }

type FormProduto = {
  codigo_barras: string
  nome: string
  categoria: string
  preco: string
  estoque: string
  fornecedor_id: string
}

const FORM_VAZIO: FormProduto = {
  codigo_barras: '',
  nome: '',
  categoria: '',
  preco: '',
  estoque: '0',
  fornecedor_id: ''
}

type Categoria = { id: number; nome: string; produtos_count: number }

function gerarHtmlRelatorio(produtos: Produto[]): string {
  const data = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  const grupos = new Map<string, Produto[]>()
  for (const p of produtos) {
    const cat = p.categoria || 'Sem Categoria'
    if (!grupos.has(cat)) grupos.set(cat, [])
    grupos.get(cat)!.push(p)
  }

  const categoriasOrdenadas = [...grupos.keys()].sort((a, b) => {
    if (a === 'Sem Categoria') return 1
    if (b === 'Sem Categoria') return -1
    return a.localeCompare(b, 'pt-BR')
  })

  const totalProdutos = produtos.length
  const totalItens = produtos.reduce((acc, p) => acc + p.estoque, 0)

  const tabelasHtml = categoriasOrdenadas.map((cat) => {
    const prods = grupos.get(cat)!.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const linhas = prods.map((p) => {
      const cls = p.estoque === 0 ? 'estoque-zero' : p.estoque <= 5 ? 'estoque-baixo' : ''
      const fornecedor = p.fornecedor_nome
        ? `<div class="fornecedor-nome">${p.fornecedor_nome}</div>`
        : ''
      return `<tr>
        <td>${p.nome}${fornecedor}</td>
        <td class="col-codigo">${p.codigo_barras}</td>
        <td class="col-estoque ${cls}">${p.estoque}</td>
        <td class="col-contagem"></td>
      </tr>`
    }).join('')
    return `<div class="grupo-categoria">
      <div class="grupo-titulo">${cat} (${prods.length} produto${prods.length !== 1 ? 's' : ''})</div>
      <table>
        <thead><tr>
          <th>Produto</th>
          <th class="col-codigo">Cód. Barras</th>
          <th class="col-estoque">Estoque Sist.</th>
          <th class="col-contagem">Contagem Física</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório de Estoque</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
    @page { margin: 15mm; }
    .cabecalho { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 12px; }
    .cabecalho h1 { font-size: 16px; font-weight: bold; letter-spacing: 1px; }
    .cabecalho .info { font-size: 10px; color: #555; margin-top: 4px; }
    .resumo { display: flex; gap: 24px; margin-bottom: 16px; padding: 8px 12px; background: #f5f5f5; border: 1px solid #ddd; }
    .resumo div { font-size: 11px; }
    .resumo span { font-weight: bold; }
    .grupo-categoria { margin-bottom: 14px; page-break-inside: avoid; }
    .grupo-titulo { background: #333; color: #fff; padding: 4px 8px; font-weight: bold; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #eee; border: 1px solid #ccc; padding: 4px 6px; text-align: left; font-size: 10px; font-weight: bold; }
    tbody td { border: 1px solid #ddd; padding: 4px 6px; font-size: 10px; }
    .col-codigo { width: 130px; font-family: monospace; font-size: 9px; }
    .col-estoque { width: 90px; text-align: center; font-weight: bold; }
    .col-contagem { width: 110px; text-align: center; background: #fffef0; }
    .estoque-zero { color: #cc0000; }
    .estoque-baixo { color: #d97706; }
    .fornecedor-nome { font-size: 9px; color: #666; font-style: italic; margin-top: 1px; }
    .rodape { margin-top: 20px; text-align: center; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="cabecalho">
    <h1>RELATÓRIO DE ESTOQUE</h1>
    <div class="info">Gerado em: ${data}</div>
  </div>
  <div class="resumo">
    <div>Total de produtos: <span>${totalProdutos}</span></div>
    <div>Total de itens em estoque: <span>${totalItens}</span></div>
  </div>
  ${tabelasHtml}
  <div class="rodape">FHVP Tech — Balanço de Estoque</div>
</body>
</html>`
}

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
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [paginaAtual, setPaginaAtual] = useState(1)

  // Cadastro rápido de fornecedor
  const [modalFornecedorAberto, setModalFornecedorAberto] = useState(false)
  const [nomeFornecedorRapido, setNomeFornecedorRapido] = useState('')
  const [erroFornecedor, setErroFornecedor] = useState('')
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false)

  // Controle do leitor USB — detecta leitura rápida (< 80ms entre teclas)
  const scanBuffer = useRef('')
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputScanRef = useRef<HTMLInputElement>(null)

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

  const listaFiltrada = lista.filter((p) => {
    const t = busca.toLowerCase()
    return (
      p.nome.toLowerCase().includes(t) ||
      p.codigo_barras.includes(t) ||
      (p.categoria ?? '').toLowerCase().includes(t) ||
      (p.fornecedor_nome ?? '').toLowerCase().includes(t)
    )
  })

  useEffect(() => {
    setPaginaAtual(1)
  }, [busca])

  const inicioPagina = (paginaAtual - 1) * ITENS_POR_PAGINA
  const listaPaginada = listaFiltrada.slice(inicioPagina, inicioPagina + ITENS_POR_PAGINA)

  const abrirNovo = () => {
    setEditando(null)
    setForm(FORM_VAZIO)
    setErro('')
    setDialogAberto(true)
  }

  const abrirEdicao = (p: Produto) => {
    setEditando(p)
    setForm({
      codigo_barras: p.codigo_barras,
      nome: p.nome,
      categoria: p.categoria ?? '',
      preco: p.preco.toFixed(2),
      estoque: String(p.estoque),
      fornecedor_id: p.fornecedor_id ? String(p.fornecedor_id) : ''
    })
    setErro('')
    setDialogAberto(true)
  }

  const setF = (campo: keyof FormProduto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }))

  const gerarCodigo = () => setForm((f) => ({ ...f, codigo_barras: gerarEAN13() }))

  const salvar = async () => {
    if (!form.nome.trim()) { setErro('O nome do produto é obrigatório.'); return }
    if (!form.codigo_barras.trim()) { setErro('O código de barras é obrigatório.'); return }
    const preco = parseFloat(form.preco.replace(',', '.'))
    if (isNaN(preco) || preco < 0) { setErro('Preço inválido.'); return }

    setCarregando(true)
    setErro('')

    const dados = {
      codigo_barras: form.codigo_barras.trim(),
      nome: form.nome.trim(),
      categoria: form.categoria.trim() || null,
      preco,
      estoque: parseInt(form.estoque) || 0,
      fornecedor_id: form.fornecedor_id ? parseInt(form.fornecedor_id) : null
    }

    const resp = editando
      ? await window.api.produtos.atualizar(editando.id, dados)
      : await window.api.produtos.criar(dados)

    if (resp.success) {
      await carregar()
      setDialogAberto(false)
    } else {
      setErro(resp.error.includes('UNIQUE') ? 'Já existe um produto com este código de barras.' : resp.error)
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

  const excluir = async (id: number, nome: string) => {
    if (!confirm(`Excluir produto "${nome}"?`)) return
    const resp = await window.api.produtos.deletar(id)
    if (resp.success) await carregar()
    else alert(`Erro: ${resp.error}`)
  }

  const imprimirRelatorio = async () => {
    const html = gerarHtmlRelatorio(lista)
    const resp = await window.api.impressao.imprimir(html)
    if (!resp.success) alert(`Erro ao imprimir: ${resp.error}`)
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
          <Button variant="outline" onClick={imprimirRelatorio} disabled={lista.length === 0}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir Estoque
          </Button>
          {ehDono && (
            <Button onClick={abrirNovo}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Produto
            </Button>
          )}
        </div>
      </div>

      {/* Busca + Leitor USB */}
      <div className="flex gap-3 mb-4 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código, categoria..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="relative">
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
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  {busca ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
                </td>
              </tr>
            )}
            {listaPaginada.map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.codigo_barras}</td>
                <td className="px-4 py-3 font-medium">{p.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.categoria || '—'}</td>
                <td className="px-4 py-3 text-right">
                  {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className={`px-4 py-3 text-right font-medium ${p.estoque === 0 ? 'text-destructive' : p.estoque <= 5 ? 'text-amber-600' : ''}`}>
                  {p.estoque}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.fornecedor_nome || '—'}</td>
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
            ))}
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
            {/* Código de barras + gerador */}
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

            <div className="grid grid-cols-2 gap-3">
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

              <div className="grid gap-1.5">
                <Label htmlFor="preco">
                  Preço (R$) <span className="text-destructive">*</span>
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
            </div>

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

      <ModalCategorias
        aberto={modalCategoriasAberto}
        onFechar={() => setModalCategoriasAberto(false)}
        onMudancas={carregar}
      />
    </div>
  )
}

export default Produtos
