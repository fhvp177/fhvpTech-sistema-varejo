import { FC, ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCircle,
  RotateCcw,
  AlertTriangle,
  CalendarClock,
  Wallet
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useConfirm } from '@fhvptech/core/ui/confirm'
import { useToast } from '@fhvptech/core/ui/toast'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import Paginacao from '@fhvptech/core/ui/paginacao'
import { useSessao } from '@/App'

const ITENS_POR_PAGINA = 20

type Filtro = 'aberto' | 'pago' | 'todas'

type Fornecedor = { id: number; nome: string }

type FormConta = {
  descricao: string
  categoria: string
  fornecedor_id: string // '' = nenhum
  valor_total: string
  vencimento: string
  observacao: string
}

const FORM_VAZIO: FormConta = {
  descricao: '',
  categoria: '',
  fornecedor_id: '',
  valor_total: '',
  vencimento: '',
  observacao: ''
}

// Sugestões de categoria — o campo é livre (o lojista pode digitar outra).
const CATEGORIAS_SUGERIDAS = [
  'Mercadoria',
  'Aluguel',
  'Energia',
  'Água',
  'Internet/Telefone',
  'Salário',
  'Impostos',
  'Manutenção',
  'Outros'
]

const BADGE: Record<ContaPagar['situacao'], string> = {
  aberta: 'bg-amber-100 text-amber-700',
  vencida: 'bg-red-100 text-red-700',
  paga: 'bg-green-100 text-green-700'
}
const ROTULO_SITUACAO: Record<ContaPagar['situacao'], string> = {
  aberta: 'Em aberto',
  vencida: 'Vencida',
  paga: 'Paga'
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('pt-BR')

// Dias entre hoje (meia-noite local) e a data ISO. Negativo = já passou.
function diasAte(iso: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(iso + 'T00:00')
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000)
}

// Texto + cor do vencimento na tabela, conforme a proximidade.
function textoVencimento(c: ContaPagar): { texto: string; cor: string } {
  if (!c.vencimento) return { texto: 'Sem data', cor: 'text-muted-foreground' }
  const data = fmtData(c.vencimento)
  if (c.situacao === 'paga') return { texto: data, cor: 'text-muted-foreground' }
  const dias = diasAte(c.vencimento)
  if (dias < 0) return { texto: `${data} · venceu`, cor: 'text-red-600 font-medium' }
  if (dias === 0) return { texto: `${data} · hoje`, cor: 'text-amber-600 font-medium' }
  if (dias <= 7) return { texto: `${data} · em ${dias}d`, cor: 'text-amber-600' }
  return { texto: data, cor: '' }
}

const ContasPagar: FC = () => {
  const { ehDono } = useSessao()
  const confirmar = useConfirm()
  const { showToast } = useToast()

  const [lista, setLista] = useState<ContaPagar[]>([])
  const [resumo, setResumo] = useState<ResumoContasPagar | null>(null)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [filtro, setFiltro] = useState<Filtro>('aberto')
  const [busca, setBusca] = useState('')
  const [paginaAtual, setPaginaAtual] = useState(1)

  // Dialog de criar/editar
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<ContaPagar | null>(null)
  const [form, setForm] = useState<FormConta>(FORM_VAZIO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Dialog de pagamento
  const [pagando, setPagando] = useState<ContaPagar | null>(null)
  const [valorPag, setValorPag] = useState('')
  const [erroPag, setErroPag] = useState('')
  const [salvandoPag, setSalvandoPag] = useState(false)

  const carregar = async () => {
    const [respLista, respResumo] = await Promise.all([
      window.api.contasPagar.listar(filtro),
      window.api.contasPagar.resumo()
    ])
    if (respLista.success) setLista(respLista.data)
    if (respResumo.success) setResumo(respResumo.data)
  }

  const carregarFornecedores = async () => {
    const resp = await window.api.fornecedores.listar()
    if (resp.success) setFornecedores(resp.data as Fornecedor[])
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro])

  useEffect(() => {
    carregarFornecedores()
  }, [])

  useEffect(() => {
    setPaginaAtual(1)
  }, [busca, filtro])

  const listaFiltrada = useMemo(
    () =>
      lista.filter((c) =>
        [c.descricao, c.categoria, c.fornecedor_nome]
          .filter(Boolean)
          .some((campo) => campo!.toLowerCase().includes(busca.toLowerCase()))
      ),
    [lista, busca]
  )

  const inicioPagina = (paginaAtual - 1) * ITENS_POR_PAGINA
  const listaPaginada = listaFiltrada.slice(inicioPagina, inicioPagina + ITENS_POR_PAGINA)

  // ── Criar / editar ──
  const abrirNova = () => {
    setEditando(null)
    setForm(FORM_VAZIO)
    setErro('')
    setDialogAberto(true)
  }

  const abrirEdicao = (c: ContaPagar) => {
    setEditando(c)
    setForm({
      descricao: c.descricao,
      categoria: c.categoria ?? '',
      fornecedor_id: c.fornecedor_id != null ? String(c.fornecedor_id) : '',
      valor_total: String(c.valor_total),
      vencimento: c.vencimento ?? '',
      observacao: c.observacao ?? ''
    })
    setErro('')
    setDialogAberto(true)
  }

  const salvar = async () => {
    if (!form.descricao.trim()) {
      setErro('Descreva a conta (ex.: "Duplicata Fornecedor X", "Aluguel de julho").')
      return
    }
    const valor = parseFloat(form.valor_total.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) {
      setErro('Informe um valor maior que zero.')
      return
    }

    setSalvando(true)
    setErro('')
    const dados = {
      descricao: form.descricao.trim(),
      categoria: form.categoria.trim() || null,
      fornecedor_id: form.fornecedor_id ? Number(form.fornecedor_id) : null,
      valor_total: valor,
      vencimento: form.vencimento || null,
      observacao: form.observacao.trim() || null
    }
    const resp = editando
      ? await window.api.contasPagar.atualizar(editando.id, dados)
      : await window.api.contasPagar.criar(dados)

    if (resp.success) {
      await carregar()
      setDialogAberto(false)
      showToast({
        message: editando ? 'Conta atualizada.' : 'Conta cadastrada.',
        variant: 'success'
      })
    } else {
      setErro(resp.error)
    }
    setSalvando(false)
  }

  const excluir = async (c: ContaPagar) => {
    if (
      !(await confirmar({
        titulo: 'Excluir conta',
        mensagem: `Excluir a conta "${c.descricao}"? Isso apaga o registro para sempre.`,
        variante: 'destructive'
      }))
    )
      return
    const resp = await window.api.contasPagar.deletar(c.id)
    if (resp.success) {
      await carregar()
      showToast({ message: 'Conta excluída.', variant: 'success' })
    } else {
      showToast({ message: resp.error, variant: 'destructive' })
    }
  }

  // ── Pagamento ──
  const abrirPagamento = (c: ContaPagar) => {
    setPagando(c)
    setValorPag(c.restante > 0 ? String(c.restante) : '')
    setErroPag('')
  }

  const registrarPagamento = async () => {
    if (!pagando) return
    const valor = parseFloat(valorPag.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) {
      setErroPag('Informe um valor válido maior que zero.')
      return
    }
    setSalvandoPag(true)
    setErroPag('')
    const resp = await window.api.contasPagar.registrarPagamento(pagando.id, valor)
    if (resp.success) {
      await carregar()
      setPagando(null)
      showToast({ message: `Pagamento de ${fmt(valor)} registrado.`, variant: 'success' })
    } else {
      setErroPag(resp.error)
    }
    setSalvandoPag(false)
  }

  const desfazerPagamentos = async () => {
    if (!pagando) return
    if (
      !(await confirmar({
        titulo: 'Desfazer pagamentos',
        mensagem: `A conta "${pagando.descricao}" volta a ficar totalmente em aberto. Confirma?`,
        variante: 'destructive'
      }))
    )
      return
    const resp = await window.api.contasPagar.estornarPagamento(pagando.id)
    if (resp.success) {
      await carregar()
      setPagando(null)
      showToast({ message: 'Pagamentos desfeitos.', variant: 'success' })
    } else {
      showToast({ message: resp.error, variant: 'destructive' })
    }
  }

  const setCampo = (campo: keyof FormConta) => (valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  const restantePagando = pagando
    ? Math.max(0, +(pagando.valor_total - pagando.valor_pago).toFixed(2))
    : 0

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Contas a Pagar</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            O que a loja deve — fornecedores, aluguel, luz, salários e afins.
          </p>
        </div>
        {ehDono && (
          <Button onClick={abrirNova}>
            <Plus className="w-4 h-4 mr-2" />
            Nova conta
          </Button>
        )}
      </div>

      {/* Cartões-resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <CartaoResumo
          rotulo="Vencidas"
          valor={resumo?.vencido_total}
          destaque="text-red-600"
          icone={<AlertTriangle className="w-4 h-4" />}
        />
        <CartaoResumo
          rotulo="Vencem em 7 dias"
          valor={resumo?.vence_7d_total}
          destaque="text-amber-600"
          icone={<CalendarClock className="w-4 h-4" />}
        />
        <CartaoResumo
          rotulo="Total em aberto"
          valor={resumo?.aberto_total}
          icone={<Wallet className="w-4 h-4" />}
        />
        <CartaoResumo
          rotulo="Pago no mês"
          valor={resumo?.pago_mes}
          destaque="text-green-600"
          icone={<CheckCircle className="w-4 h-4" />}
        />
      </div>

      {/* Filtro por situação + busca */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex rounded-lg border p-0.5 bg-muted/30">
          {(
            [
              ['aberto', 'Em aberto'],
              ['pago', 'Pagas'],
              ['todas', 'Todas']
            ] as [Filtro, string][]
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setFiltro(valor)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filtro === valor
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição, categoria, fornecedor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Conta</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vencimento</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Valor</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Situação</th>
              <th className="w-28 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-muted-foreground">
                  {busca
                    ? 'Nenhuma conta encontrada para a busca.'
                    : filtro === 'aberto'
                      ? 'Nenhuma conta em aberto. Tudo pago por aqui! 🎉'
                      : 'Nenhuma conta cadastrada.'}
                </td>
              </tr>
            )}
            {listaPaginada.map((c, i) => {
              const venc = textoVencimento(c)
              return (
                <tr
                  key={c.id}
                  className={`border-b border-border last:border-b-0 ${
                    i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium truncate max-w-[280px]" title={c.descricao}>
                      {c.descricao}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      {c.categoria && (
                        <span className="bg-muted rounded px-1.5 py-0.5">{c.categoria}</span>
                      )}
                      {c.fornecedor_nome && <span className="truncate">{c.fornecedor_nome}</span>}
                    </div>
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${venc.cor}`}>{venc.texto}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-medium">{fmt(c.valor_total)}</div>
                    {c.valor_pago > 0 && c.situacao !== 'paga' && (
                      <div className="text-xs text-muted-foreground">
                        falta {fmt(c.restante)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE[c.situacao]}`}
                    >
                      {ROTULO_SITUACAO[c.situacao]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {ehDono && (
                      <div className="flex gap-1 justify-end">
                        {c.situacao !== 'paga' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700 h-8 px-2"
                            onClick={() => abrirPagamento(c)}
                            title="Registrar pagamento"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Pagar
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => abrirPagamento(c)}
                            title="Ver pagamento / desfazer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => abrirEdicao(c)}
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => excluir(c)}
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
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
        rotuloItem="conta(s)"
      />

      {/* Dialog criar/editar */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-[538px]">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar conta' : 'Nova conta a pagar'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="descricao">
                Descrição <span className="text-destructive">*</span>
              </Label>
              <Input
                id="descricao"
                value={form.descricao}
                onChange={(e) => setCampo('descricao')(e.target.value)}
                placeholder='Ex.: "Duplicata Fornecedor X" ou "Aluguel de julho"'
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="valor">
                  Valor <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="valor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.valor_total}
                  onChange={(e) => setCampo('valor_total')(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vencimento">Vencimento</Label>
                <Input
                  id="vencimento"
                  type="date"
                  value={form.vencimento}
                  onChange={(e) => setCampo('vencimento')(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="categoria">Categoria</Label>
                <Input
                  id="categoria"
                  list="categorias-conta"
                  value={form.categoria}
                  onChange={(e) => setCampo('categoria')(e.target.value)}
                  placeholder="Mercadoria, Aluguel..."
                />
                <datalist id="categorias-conta">
                  {CATEGORIAS_SUGERIDAS.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fornecedor">Fornecedor</Label>
                <select
                  id="fornecedor"
                  value={form.fornecedor_id}
                  onChange={(e) => setCampo('fornecedor_id')(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">— Nenhum —</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="observacao">Observação</Label>
              <Input
                id="observacao"
                value={form.observacao}
                onChange={(e) => setCampo('observacao')(e.target.value)}
                placeholder="Opcional — nº da nota, boleto, condição..."
              />
            </div>

            {erro && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erro}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de pagamento */}
      <Dialog open={pagando != null} onOpenChange={(open) => !open && setPagando(null)}>
        {pagando && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="truncate" title={pagando.descricao}>
                Pagar — {pagando.descricao}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="border rounded-lg p-3 space-y-2 bg-muted/20 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor total</span>
                  <span>{fmt(pagando.valor_total)}</span>
                </div>
                {pagando.valor_pago > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Já pago</span>
                    <span className="text-green-600 font-medium">{fmt(pagando.valor_pago)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Restante</span>
                  <span className={restantePagando > 0 ? 'text-destructive' : 'text-green-600'}>
                    {fmt(restantePagando)}
                  </span>
                </div>
                {pagando.valor_pago > 0 && (
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="bg-green-500 h-1.5 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (pagando.valor_pago / pagando.valor_total) * 100)}%`
                      }}
                    />
                  </div>
                )}
              </div>

              {restantePagando > 0 ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={valorPag}
                      onChange={(e) => {
                        setValorPag(e.target.value)
                        setErroPag('')
                      }}
                      placeholder="Valor pago"
                      className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button size="sm" onClick={registrarPagamento} disabled={salvandoPag}>
                      {salvandoPag ? 'Salvando...' : 'Registrar'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Para quitar, deixe o valor do restante. Para um pagamento parcial, digite quanto
                    pagou agora.
                  </p>
                  {erroPag && (
                    <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">
                      {erroPag}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
                  Esta conta está quitada. 🎉
                </p>
              )}

              {pagando.valor_pago > 0 && (
                <button
                  onClick={desfazerPagamentos}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Desfazer pagamentos desta conta
                </button>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPagando(null)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

const CartaoResumo: FC<{
  rotulo: string
  valor: number | undefined
  destaque?: string
  icone: ReactNode
}> = ({ rotulo, valor, destaque, icone }) => (
  <div className="border rounded-xl p-3 bg-card">
    <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
      {icone}
      <span className="text-xs font-medium">{rotulo}</span>
    </div>
    <p className={`text-xl font-bold ${destaque ?? ''}`}>
      {valor == null ? '...' : fmt(valor)}
    </p>
  </div>
)

export default ContasPagar
