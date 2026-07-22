import { FC, Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { IMaskInput } from 'react-imask'
import { Pencil, Trash2, Plus, Search, Wallet, User, Building2 } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { useConfirm } from '@fhvptech/core/ui/confirm'
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
import DividasClienteDialog, {
  calcularDividasPorCliente,
  type VendaDivida
} from '@/components/DividasClienteDialog'
import { useSessao } from '@/App'

const ITENS_POR_PAGINA = 20

type TipoPessoa = 'fisica' | 'juridica'

type Cliente = {
  id: number
  nome: string
  telefone: string
  endereco: string | null
  cpf: string | null
  data_nascimento: string | null
  tipo_pessoa: TipoPessoa
  cnpj: string | null
  razao_social: string | null
  observacao: string | null
  data_cadastro: string
}

const fmtMoeda = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Iniciais para a "fotinha" do cliente: 1ª letra do primeiro nome + 1ª do
// último (ou as 2 primeiras letras, se for um nome só).
const iniciaisDoNome = (nome: string): string => {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

// Cor estável por nome — o mesmo cliente cai sempre na mesma cor.
const CORES_AVATAR = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500', 'bg-indigo-500'
]
const corDoNome = (nome: string): string => {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (Math.imul(h, 31) + nome.charCodeAt(i)) | 0
  return CORES_AVATAR[Math.abs(h) % CORES_AVATAR.length]
}

type FormCliente = {
  nome: string
  telefone: string
  endereco: string
  cpf: string
  data_nascimento: string // DD/MM/YYYY no form, YYYY-MM-DD no banco
  tipo_pessoa: TipoPessoa
  cnpj: string
  razao_social: string
  observacao: string
}

// Dados fiscais do cliente (destinatário da NF-e) — só no plano Pro; no
// Básico a flag remove o componente e o chunk do binário.
const CadastroFiscalCliente = __FEAT_NFE__
  ? lazy(() => import('@/components/CadastroFiscalCliente'))
  : null

// Definido AQUI, e não importado do componente, porque ele é carregado por
// `lazy` — um import estático traria o módulo de volta pro binário do Básico.
const FISCAL_VAZIO: FiscalCliente = {
  endereco_logradouro: '',
  endereco_numero: '',
  endereco_complemento: '',
  endereco_bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  codigo_municipio: '',
  inscricao_estadual: '',
  indicador_ie: '9'
}

const FORM_VAZIO: FormCliente = {
  nome: '', telefone: '', endereco: '', cpf: '', data_nascimento: '',
  tipo_pessoa: 'fisica', cnpj: '', razao_social: '', observacao: ''
}

// YYYY-MM-DD → DD/MM/YYYY
const paraBr = (iso: string | null): string => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// DD/MM/YYYY → YYYY-MM-DD (retorna null se incompleto)
const paraIso = (br: string): string | null => {
  if (br.length < 10) return null
  const [d, m, y] = br.split('/')
  return `${y}-${m}-${d}`
}

const validarCPF = (cpf: string): boolean => {
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11) return false
  if (/^(\d)\1+$/.test(n)) return false // todos os dígitos iguais (ex: 111.111.111-11)
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(n[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto >= 10) resto = 0
  if (resto !== parseInt(n[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(n[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto >= 10) resto = 0
  return resto === parseInt(n[10])
}

const validarCNPJ = (cnpj: string): boolean => {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14) return false
  if (/^(\d)\1+$/.test(n)) return false
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let soma = 0
  for (let i = 0; i < 12; i++) soma += parseInt(n[i]) * pesos1[i]
  let resto = soma % 11
  const dig1 = resto < 2 ? 0 : 11 - resto
  if (dig1 !== parseInt(n[12])) return false
  soma = 0
  for (let i = 0; i < 13; i++) soma += parseInt(n[i]) * pesos2[i]
  resto = soma % 11
  const dig2 = resto < 2 ? 0 : 11 - resto
  return dig2 === parseInt(n[13])
}

const validarDataBr = (ddmmyyyy: string): boolean => {
  if (ddmmyyyy.length < 10) return false
  const [dd, mm, yyyy] = ddmmyyyy.split('/')
  const d = parseInt(dd), m = parseInt(mm) - 1, y = parseInt(yyyy)
  if (y < 1900 || y > new Date().getFullYear()) return false
  const dt = new Date(y, m, d)
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d
}

const Clientes: FC = () => {
  const { ehDono } = useSessao()
  const [lista, setLista] = useState<Cliente[]>([])
  const [vendas, setVendas] = useState<VendaDivida[]>([])
  const [busca, setBusca] = useState('')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormCliente>(FORM_VAZIO)
  // Dados fiscais do cliente (destinatário da NF-e). Vivem à parte do form
  // porque são gravados por outro caminho — ver window.api.fiscal.salvarCliente.
  const [fiscal, setFiscal] = useState<FiscalCliente>(FISCAL_VAZIO)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [clienteDividas, setClienteDividas] = useState<Cliente | null>(null)
  const [paginaAtual, setPaginaAtual] = useState(1)

  const carregarClientes = async () => {
    const resp = await window.api.clientes.listar()
    if (resp.success) setLista(resp.data as Cliente[])
  }

  const carregarVendas = async () => {
    const resp = await window.api.vendas.listar()
    if (resp.success) setVendas(resp.data as VendaDivida[])
  }

  useEffect(() => {
    carregarClientes()
    carregarVendas()
  }, [])

  // Agrupa as dívidas em aberto por cliente (qualquer venda não-paga com saldo restante > 0)
  const dividasPorCliente = useMemo(() => calcularDividasPorCliente(vendas), [vendas])

  const listaFiltrada = lista.filter((c) => {
    const t = busca.toLowerCase()
    return (
      c.nome.toLowerCase().includes(t) ||
      c.telefone.includes(t) ||
      (c.endereco ?? '').toLowerCase().includes(t) ||
      (c.cpf ?? '').includes(t) ||
      (c.cnpj ?? '').includes(t) ||
      (c.razao_social ?? '').toLowerCase().includes(t) ||
      (c.observacao ?? '').toLowerCase().includes(t)
    )
  })

  // Reseta para a primeira página quando o filtro muda
  useEffect(() => {
    setPaginaAtual(1)
  }, [busca])

  const inicioPagina = (paginaAtual - 1) * ITENS_POR_PAGINA
  const listaPaginada = listaFiltrada.slice(inicioPagina, inicioPagina + ITENS_POR_PAGINA)

  const abrirNovo = () => {
    setEditando(null)
    setForm(FORM_VAZIO)
    setFiscal(FISCAL_VAZIO)
    setErro('')
    setDialogAberto(true)
  }

  const abrirEdicao = (c: Cliente) => {
    setEditando(c)
    setForm({
      nome: c.nome,
      telefone: c.telefone,
      endereco: c.endereco ?? '',
      cpf: c.cpf ?? '',
      data_nascimento: paraBr(c.data_nascimento),
      tipo_pessoa: c.tipo_pessoa,
      cnpj: c.cnpj ?? '',
      razao_social: c.razao_social ?? '',
      observacao: c.observacao ?? '',
    })
    setErro('')
    setDialogAberto(true)
  }

  const salvar = async () => {
    if (!form.nome.trim()) { setErro('O nome do cliente é obrigatório.'); return }

    if (!form.telefone.trim()) {
      setErro('O telefone é obrigatório.')
      return
    }
    if (form.telefone.replace(/\D/g, '').length !== 11) {
      setErro('Telefone incompleto. Preencha o número completo no formato (00) 9.0000-0000.')
      return
    }

    if (form.tipo_pessoa === 'fisica') {
      if (form.cpf) {
        if (form.cpf.replace(/\D/g, '').length !== 11) {
          setErro('CPF incompleto. Preencha todos os 11 dígitos.')
          return
        }
        if (!validarCPF(form.cpf)) {
          setErro('CPF inválido. Verifique os números digitados.')
          return
        }
      }

      if (form.data_nascimento) {
        if (form.data_nascimento.length < 10) {
          setErro('Data de nascimento incompleta. Use o formato DD/MM/AAAA.')
          return
        }
        if (!validarDataBr(form.data_nascimento)) {
          setErro('Data de nascimento inválida. Verifique se o dia, mês e ano existem.')
          return
        }
      }
    } else {
      // Pessoa Jurídica — CNPJ obrigatório
      if (!form.cnpj.trim()) {
        setErro('O CNPJ é obrigatório para clientes empresa.')
        return
      }
      if (form.cnpj.replace(/\D/g, '').length !== 14) {
        setErro('CNPJ incompleto. Preencha todos os 14 dígitos.')
        return
      }
      if (!validarCNPJ(form.cnpj)) {
        setErro('CNPJ inválido. Verifique os números digitados.')
        return
      }
    }

    setCarregando(true)
    setErro('')

    const ehPj = form.tipo_pessoa === 'juridica'
    const dados = {
      nome: form.nome.trim(),
      telefone: form.telefone,
      endereco: form.endereco.trim() || null,
      cpf: ehPj ? null : (form.cpf || null),
      data_nascimento: ehPj ? null : paraIso(form.data_nascimento),
      tipo_pessoa: form.tipo_pessoa,
      cnpj: ehPj ? form.cnpj : null,
      razao_social: ehPj ? (form.razao_social.trim() || null) : null,
      observacao: form.observacao.trim() || null,
    }

    const resp = editando
      ? await window.api.clientes.atualizar(editando.id, dados)
      : await window.api.clientes.criar(dados)

    if (resp.success) {
      // Dados fiscais vão por um caminho próprio (não fazem parte do cadastro
      // básico). Só para empresa, e só quando a feature existe.
      if (__FEAT_NFE__ && ehPj) {
        const idCliente = editando?.id ?? (resp.data as { id?: number } | null)?.id
        if (idCliente) await window.api.fiscal.salvarCliente(idCliente, fiscal)
      }
      await carregarClientes()
      setDialogAberto(false)
    } else {
      setErro(resp.error)
    }
    setCarregando(false)
  }

  const confirmar = useConfirm()

  const excluir = async (id: number, nome: string) => {
    if (
      !(await confirmar({
        titulo: 'Excluir cliente',
        mensagem: `Excluir o cliente "${nome}"?\nAs vendas associadas serão mantidas.`,
        variante: 'destructive'
      }))
    )
      return
    const resp = await window.api.clientes.deletar(id)
    if (resp.success) await carregarClientes()
    else alert(`Erro: ${resp.error}`)
  }

  const formatarData = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR')

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Clientes</h2>
        <Button onClick={abrirNovo}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Cliente
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone, endereço, observação..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-10" />
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">CPF / CNPJ</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Telefone</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Endereço</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cadastro</th>
              <th className="w-32 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  {busca ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
                </td>
              </tr>
            )}
            {listaPaginada.map((c, i) => (
              <tr
                key={c.id}
                className={`border-b border-border last:border-b-0 ${
                  i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                }`}
              >
                <td className="px-4 py-3 text-muted-foreground">
                  {c.tipo_pessoa === 'juridica'
                    ? <Building2 className="w-4 h-4" aria-label="Empresa" />
                    : <User className="w-4 h-4" aria-label="Pessoa física" />}
                </td>
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${corDoNome(c.nome)}`}
                      aria-hidden
                    >
                      {iniciaisDoNome(c.nome)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate max-w-[190px] 2xl:max-w-[260px]" title={c.nome}>{c.nome}</div>
                      {c.tipo_pessoa === 'juridica' && c.razao_social && (
                        <div
                          className="text-xs text-muted-foreground font-normal truncate max-w-[190px] 2xl:max-w-[260px]"
                          title={c.razao_social}
                        >
                          {c.razao_social}
                        </div>
                      )}
                      {c.observacao && (
                        <div
                          className="text-xs text-muted-foreground font-normal italic truncate max-w-[190px] 2xl:max-w-[260px]"
                          title={c.observacao}
                        >
                          {c.observacao}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.tipo_pessoa === 'juridica' ? (c.cnpj || '—') : (c.cpf || '—')}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.telefone}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.endereco
                    ? <div className="truncate max-w-[130px] 2xl:max-w-[220px]" title={c.endereco}>{c.endereco}</div>
                    : '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatarData(c.data_cadastro)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    {dividasPorCliente.has(c.id) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-amber-600 hover:text-amber-700"
                        onClick={() => setClienteDividas(c)}
                        title={`Ver dívidas — ${fmtMoeda(dividasPorCliente.get(c.id)!.total)} em aberto`}
                      >
                        <Wallet className="w-4 h-4" />
                      </Button>
                    )}
                    {ehDono && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => abrirEdicao(c)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => excluir(c.id, c.nome)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
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
        rotuloItem="cliente(s)"
      />

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Toggle PF/PJ */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => { setForm((f) => ({ ...f, tipo_pessoa: 'fisica' })); setErro('') }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  form.tipo_pessoa === 'fisica'
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <User className="w-4 h-4" />
                Pessoa Física
              </button>
              <button
                type="button"
                onClick={() => { setForm((f) => ({ ...f, tipo_pessoa: 'juridica' })); setErro('') }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  form.tipo_pessoa === 'juridica'
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Building2 className="w-4 h-4" />
                Pessoa Jurídica
              </button>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nome">
                {form.tipo_pessoa === 'juridica' ? 'Nome Fantasia' : 'Nome'} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder={form.tipo_pessoa === 'juridica' ? 'Nome fantasia ou contato' : 'Nome completo do cliente'}
              />
            </div>

            {form.tipo_pessoa === 'juridica' && (
              <div className="grid gap-1.5">
                <Label htmlFor="razao_social">Razão Social (opcional)</Label>
                <Input
                  id="razao_social"
                  value={form.razao_social}
                  onChange={(e) => setForm((f) => ({ ...f, razao_social: e.target.value }))}
                  placeholder="Razão social da empresa"
                />
              </div>
            )}

            {/* Dados exigidos pela NF-e — só para empresa, só no plano Pro. */}
            {form.tipo_pessoa === 'juridica' && CadastroFiscalCliente && (
              <Suspense fallback={null}>
                <CadastroFiscalCliente
                  clienteId={editando?.id ?? null}
                  valor={fiscal}
                  onChange={setFiscal}
                />
              </Suspense>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="telefone">
                Telefone <span className="text-destructive">*</span>
              </Label>
              <IMaskInput
                id="telefone"
                mask="(00) 0.0000-0000"
                value={form.telefone}
                onAccept={(valor: string) => setForm((f) => ({ ...f, telefone: valor }))}
                placeholder="(00) 9.0000-0000"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {form.tipo_pessoa === 'fisica' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="cpf">CPF (opcional)</Label>
                  <IMaskInput
                    id="cpf"
                    mask="000.000.000-00"
                    value={form.cpf}
                    onAccept={(valor: string) => setForm((f) => ({ ...f, cpf: valor }))}
                    placeholder="000.000.000-00"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="data_nascimento">Data de Nascimento (opcional)</Label>
                  <IMaskInput
                    id="data_nascimento"
                    mask="00/00/0000"
                    value={form.data_nascimento}
                    onAccept={(valor: string) => setForm((f) => ({ ...f, data_nascimento: valor }))}
                    placeholder="DD/MM/AAAA"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="cnpj">CNPJ <span className="text-destructive">*</span></Label>
                <IMaskInput
                  id="cnpj"
                  mask="00.000.000/0000-00"
                  value={form.cnpj}
                  onAccept={(valor: string) => setForm((f) => ({ ...f, cnpj: valor }))}
                  placeholder="00.000.000/0000-00"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="endereco">Endereço (opcional)</Label>
              <Input
                id="endereco"
                value={form.endereco}
                onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
                placeholder="Rua, número, bairro, cidade"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="observacao">Observação (opcional)</Label>
              <textarea
                id="observacao"
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                placeholder="Ex.: compra todo dia 10, prefere entrega à tarde, sempre leva 2 peças..."
                rows={2}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
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
            <Button onClick={salvar} disabled={carregando}>
              {carregando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DividasClienteDialog
        clienteNome={clienteDividas?.nome ?? null}
        vendas={clienteDividas ? dividasPorCliente.get(clienteDividas.id)?.vendas ?? [] : []}
        totalEmAberto={clienteDividas ? dividasPorCliente.get(clienteDividas.id)?.total ?? 0 : 0}
        onFechar={() => setClienteDividas(null)}
      />
    </div>
  )
}

export default Clientes
