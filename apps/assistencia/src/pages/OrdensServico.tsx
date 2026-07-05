import { FC, Fragment, useEffect, useMemo, useState } from 'react'
import { IMaskInput } from 'react-imask'
import {
  Plus, Search, Wrench, MapPin, Eye, EyeOff, Package, ShieldCheck,
  Trash2, UserPlus, AlertTriangle, History
} from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@fhvptech/core/ui/dialog'
import { useToast } from '@fhvptech/core/ui/toast'
import Paginacao from '@fhvptech/core/ui/paginacao'

const ITENS_POR_PAGINA = 20

// ── Tipos espelhados do backend (electron/db/queries/ordens.ts) ──
type TipoAtendimento = 'bancada' | 'externo'
type StatusOS =
  | 'aberta' | 'orcamento' | 'aguardando_aprovacao' | 'aprovada' | 'agendada'
  | 'em_reparo' | 'aguardando_peca' | 'pronta' | 'entregue' | 'recusada' | 'cancelada'

type OrdemServico = {
  id: number
  tipo_atendimento: TipoAtendimento
  cliente_id: number
  tecnico_id: number
  status: StatusOS
  equipamento: string | null
  numero_serie: string | null
  acessorios: string | null
  estado_entrada: string | null
  senha_acesso: string | null
  endereco_atendimento: string | null
  agendado_para: string | null
  defeito_relatado: string
  diagnostico: string | null
  orcamento_aprovado_em: string | null
  garantia_dias: number
  entregue_em: string | null
  venda_id: number | null
  os_origem_id: number | null
  criada_em: string
  cliente_nome?: string
  cliente_telefone?: string | null
  tecnico_nome?: string
  total?: number
  dias_parada?: number
  garantia_ate?: string | null
}

type ItemOS = {
  id: number
  produto_id: number
  variacao_id: number | null
  quantidade: number
  preco_unitario: number
  produto_nome?: string
  produto_tipo?: string
  tamanho?: string | null
}

type HistoricoOS = {
  id: number
  status: StatusOS
  observacao: string | null
  vendedor_nome?: string
  criada_em: string
}

type OrdemDetalhada = OrdemServico & { itens: ItemOS[]; historico: HistoricoOS[] }

type ClienteOpcao = { id: number; nome: string; telefone: string | null }

type VariacaoOpcao = { id: number; tamanho: string; estoque: number }
type ProdutoOpcao = {
  id: number
  nome: string
  tipo: 'produto' | 'servico'
  preco: number
  estoque: number
  codigo_barras: string | null
  variacoes: VariacaoOpcao[]
}

// ── Rótulos/cores dos status (espelho do osCiclo.ts do backend) ──
const STATUS_META: Record<StatusOS, { rotulo: string; cor: string }> = {
  aberta: { rotulo: 'Aberta', cor: 'bg-slate-100 text-slate-700' },
  orcamento: { rotulo: 'Em orçamento', cor: 'bg-blue-100 text-blue-700' },
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação', cor: 'bg-amber-100 text-amber-700' },
  aprovada: { rotulo: 'Aprovada', cor: 'bg-violet-100 text-violet-700' },
  agendada: { rotulo: 'Agendada', cor: 'bg-cyan-100 text-cyan-700' },
  em_reparo: { rotulo: 'Em reparo', cor: 'bg-orange-100 text-orange-700' },
  aguardando_peca: { rotulo: 'Aguardando peça', cor: 'bg-yellow-100 text-yellow-800' },
  pronta: { rotulo: 'Pronta', cor: 'bg-green-100 text-green-700' },
  entregue: { rotulo: 'Entregue', cor: 'bg-emerald-100 text-emerald-700' },
  recusada: { rotulo: 'Recusada', cor: 'bg-red-100 text-red-700' },
  cancelada: { rotulo: 'Cancelada', cor: 'bg-slate-200 text-slate-500' }
}

const ENCERRADAS: StatusOS[] = ['entregue', 'recusada', 'cancelada']
const ORCAMENTO_EDITAVEL: StatusOS[] = ['aberta', 'orcamento']

const ABAS = [
  {
    id: 'andamento',
    rotulo: 'Em andamento',
    statuses: ['aberta', 'orcamento', 'aprovada', 'agendada', 'em_reparo', 'aguardando_peca'] as StatusOS[]
  },
  { id: 'aprovacao', rotulo: 'Aguard. aprovação', statuses: ['aguardando_aprovacao'] as StatusOS[] },
  { id: 'prontas', rotulo: 'Prontas', statuses: ['pronta'] as StatusOS[] },
  { id: 'encerradas', rotulo: 'Encerradas', statuses: ENCERRADAS },
  { id: 'todas', rotulo: 'Todas', statuses: null }
] as const

type IdAba = (typeof ABAS)[number]['id']

const fmt = (v: number): string => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// 'YYYY-MM-DD[ HH:MM[:SS]]' → 'DD/MM/AAAA' (+ hora quando houver e pedida)
const fmtData = (iso: string | null, comHora = false): string => {
  if (!iso) return '—'
  const d = `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  const hora = iso.length >= 16 ? iso.slice(11, 16) : ''
  return comHora && hora ? `${d} ${hora}` : d
}

const hojeLocal = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const numeroOS = (id: number): string => `#${String(id).padStart(3, '0')}`

const BadgeStatus: FC<{ status: StatusOS }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_META[status].cor}`}>
    {STATUS_META[status].rotulo}
  </span>
)

const BadgeTipo: FC<{ tipo: TipoAtendimento }> = ({ tipo }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">
    {tipo === 'bancada' ? <Wrench className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
    {tipo === 'bancada' ? 'Bancada' : 'Externo'}
  </span>
)

const BadgeGarantia: FC = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
    <ShieldCheck className="w-3 h-3" /> Garantia
  </span>
)

// ─────────────────────────────────────────────────────────────────────────────

const OrdensServico: FC = () => {
  const { showToast } = useToast()
  const [lista, setLista] = useState<OrdemServico[]>([])
  const [clientes, setClientes] = useState<ClienteOpcao[]>([])
  const [produtos, setProdutos] = useState<ProdutoOpcao[]>([])
  const [aba, setAba] = useState<IdAba>('andamento')
  const [busca, setBusca] = useState('')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [modalNovaAberto, setModalNovaAberto] = useState(false)
  const [detalhe, setDetalhe] = useState<OrdemDetalhada | null>(null)

  const carregar = async () => {
    const [rOs, rClientes, rProdutos] = await Promise.all([
      window.api.os.listar(),
      window.api.clientes.listar(),
      window.api.produtos.listar()
    ])
    if (rOs.success) setLista(rOs.data as OrdemServico[])
    if (rClientes.success) setClientes(rClientes.data as ClienteOpcao[])
    if (rProdutos.success) setProdutos(rProdutos.data as ProdutoOpcao[])
  }

  useEffect(() => {
    carregar()
  }, [])

  const abrirDetalhe = async (id: number) => {
    const resp = await window.api.os.obter(id)
    if (resp.success) setDetalhe(resp.data as OrdemDetalhada)
    else showToast({ message: resp.error, variant: 'destructive' })
  }

  // Recarrega lista + detalhe aberto (depois de qualquer ação)
  const atualizarTudo = async (id?: number) => {
    await carregar()
    if (id ?? detalhe?.id) await abrirDetalhe(id ?? detalhe!.id)
  }

  const contagens = useMemo(() => {
    const c: Record<IdAba, number> = { andamento: 0, aprovacao: 0, prontas: 0, encerradas: 0, todas: lista.length }
    for (const os of lista) {
      for (const a of ABAS) {
        if (a.statuses && (a.statuses as StatusOS[]).includes(os.status)) c[a.id]++
      }
    }
    return c
  }, [lista])

  const listaFiltrada = useMemo(() => {
    const statuses = ABAS.find((a) => a.id === aba)?.statuses ?? null
    const t = busca.toLowerCase().trim()
    return lista.filter((os) => {
      if (statuses && !(statuses as StatusOS[]).includes(os.status)) return false
      if (!t) return true
      return (
        numeroOS(os.id).includes(t) ||
        String(os.id) === t ||
        (os.cliente_nome ?? '').toLowerCase().includes(t) ||
        (os.equipamento ?? '').toLowerCase().includes(t) ||
        (os.numero_serie ?? '').toLowerCase().includes(t) ||
        (os.endereco_atendimento ?? '').toLowerCase().includes(t)
      )
    })
  }, [lista, aba, busca])

  useEffect(() => {
    setPaginaAtual(1)
  }, [aba, busca])

  const inicioPagina = (paginaAtual - 1) * ITENS_POR_PAGINA
  const listaPaginada = listaFiltrada.slice(inicioPagina, inicioPagina + ITENS_POR_PAGINA)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Ordens de Serviço</h2>
        <Button onClick={() => setModalNovaAberto(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova OS
        </Button>
      </div>

      {/* Abas por situação + busca */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              aba === a.id ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'hover:bg-muted/50'
            }`}
          >
            {a.rotulo}
            <span className="ml-1.5 text-xs text-muted-foreground">{contagens[a.id]}</span>
          </button>
        ))}
        <div className="relative ml-auto w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Nº da OS, cliente, aparelho, série..."
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
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-20">OS</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Atendimento</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Orçamento</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Movimento</th>
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  {busca || aba !== 'andamento'
                    ? 'Nenhuma OS encontrada.'
                    : 'Nenhuma OS em andamento. Clique em "Nova OS" para abrir a primeira.'}
                </td>
              </tr>
            )}
            {listaPaginada.map((os, i) => {
              const dias = os.dias_parada ?? 0
              const encerrada = ENCERRADAS.includes(os.status)
              return (
                <tr
                  key={os.id}
                  onClick={() => abrirDetalhe(os.id)}
                  className={`border-b border-border last:border-b-0 cursor-pointer hover:bg-accent/40 ${
                    i % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{numeroOS(os.id)}</td>
                  <td className="px-4 py-3 font-medium">
                    <div className="truncate max-w-[200px]" title={os.cliente_nome}>{os.cliente_nome}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <BadgeTipo tipo={os.tipo_atendimento} />
                      <span className="truncate max-w-[220px] text-muted-foreground" title={os.equipamento ?? os.endereco_atendimento ?? ''}>
                        {os.tipo_atendimento === 'bancada' ? os.equipamento : os.endereco_atendimento}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <BadgeStatus status={os.status} />
                      {os.os_origem_id != null && <BadgeGarantia />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {os.total ? fmt(os.total) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {os.status === 'entregue' ? (
                      <span className="text-muted-foreground">Garantia até {fmtData(os.garantia_ate ?? null)}</span>
                    ) : os.status === 'agendada' && os.agendado_para ? (
                      <span className="text-cyan-700">Visita {fmtData(os.agendado_para, true)}</span>
                    ) : encerrada ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={dias >= 7 ? 'text-destructive font-medium' : dias >= 3 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
                        {dias === 0 ? 'movida hoje' : `parada há ${dias} dia${dias !== 1 ? 's' : ''}`}
                      </span>
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
        rotuloItem="OS"
      />

      <ModalNovaOS
        aberto={modalNovaAberto}
        clientes={clientes}
        onFechar={() => setModalNovaAberto(false)}
        onCriada={async (id) => {
          setModalNovaAberto(false)
          await atualizarTudo(id)
        }}
        onClientesMudaram={carregar}
      />

      {detalhe && (
        <ModalDetalheOS
          os={detalhe}
          produtos={produtos}
          onFechar={() => setDetalhe(null)}
          onMudou={() => atualizarTudo(detalhe.id)}
          onAbrirOutra={(id) => atualizarTudo(id)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Nova OS

type FormNovaOS = {
  tipo: TipoAtendimento
  cliente_id: string
  equipamento: string
  numero_serie: string
  acessorios: string
  estado_entrada: string
  senha_acesso: string
  endereco_atendimento: string
  agendado_para: string
  defeito_relatado: string
}

const FORM_NOVA_VAZIO: FormNovaOS = {
  tipo: 'bancada',
  cliente_id: '',
  equipamento: '',
  numero_serie: '',
  acessorios: '',
  estado_entrada: '',
  senha_acesso: '',
  endereco_atendimento: '',
  agendado_para: '',
  defeito_relatado: ''
}

const ModalNovaOS: FC<{
  aberto: boolean
  clientes: ClienteOpcao[]
  onFechar: () => void
  onCriada: (id: number) => void
  onClientesMudaram: () => void
}> = ({ aberto, clientes, onFechar, onCriada, onClientesMudaram }) => {
  const [form, setForm] = useState<FormNovaOS>(FORM_NOVA_VAZIO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [jaPassouAqui, setJaPassouAqui] = useState<OrdemServico[]>([])
  // Cadastro rápido de cliente (o balcão não pode parar)
  const [clienteRapidoAberto, setClienteRapidoAberto] = useState(false)
  const [nomeClienteRapido, setNomeClienteRapido] = useState('')
  const [telefoneClienteRapido, setTelefoneClienteRapido] = useState('')

  useEffect(() => {
    if (aberto) {
      setForm(FORM_NOVA_VAZIO)
      setErro('')
      setJaPassouAqui([])
      setClienteRapidoAberto(false)
      setNomeClienteRapido('')
      setTelefoneClienteRapido('')
    }
  }, [aberto])

  const setF = (campo: keyof FormNovaOS) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  const verificarSerie = async () => {
    const serie = form.numero_serie.trim()
    if (!serie) { setJaPassouAqui([]); return }
    const resp = await window.api.os.historicoAparelho(serie)
    setJaPassouAqui(resp.success ? (resp.data as OrdemServico[]) : [])
  }

  const salvarClienteRapido = async () => {
    setErro('')
    if (!nomeClienteRapido.trim()) { setErro('O nome do cliente é obrigatório.'); return }
    if (telefoneClienteRapido.replace(/\D/g, '').length !== 11) {
      setErro('Telefone incompleto. Preencha no formato (00) 9.0000-0000.')
      return
    }
    const resp = await window.api.clientes.criar({
      nome: nomeClienteRapido.trim(),
      telefone: telefoneClienteRapido,
      endereco: null,
      cpf: null,
      data_nascimento: null,
      tipo_pessoa: 'fisica',
      cnpj: null,
      razao_social: null,
      observacao: null
    })
    if (!resp.success) { setErro(resp.error); return }
    const novo = resp.data as ClienteOpcao
    onClientesMudaram()
    setForm((f) => ({ ...f, cliente_id: String(novo.id) }))
    setClienteRapidoAberto(false)
  }

  const salvar = async () => {
    setErro('')
    if (!form.cliente_id) { setErro('Selecione o cliente.'); return }
    if (!form.defeito_relatado.trim()) { setErro('Descreva o defeito relatado pelo cliente.'); return }
    if (form.tipo === 'bancada' && !form.equipamento.trim()) {
      setErro('Informe o equipamento que ficou na bancada.'); return
    }
    if (form.tipo === 'externo' && !form.endereco_atendimento.trim()) {
      setErro('Informe o endereço do atendimento.'); return
    }
    setSalvando(true)
    const resp = await window.api.os.criar({
      tipo_atendimento: form.tipo,
      cliente_id: parseInt(form.cliente_id),
      defeito_relatado: form.defeito_relatado,
      equipamento: form.equipamento || null,
      numero_serie: form.numero_serie || null,
      acessorios: form.acessorios || null,
      estado_entrada: form.estado_entrada || null,
      senha_acesso: form.senha_acesso || null,
      endereco_atendimento: form.endereco_atendimento || null,
      agendado_para: form.agendado_para ? form.agendado_para.replace('T', ' ') : null
    })
    setSalvando(false)
    if (resp.success) onCriada((resp.data as OrdemServico).id)
    else setErro(resp.error)
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-[640px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Serviço</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Bancada × Externo */}
          <div className="flex gap-2">
            {(['bancada', 'externo'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, tipo: t }))}
                className={`flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  form.tipo === t ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
                }`}
              >
                {t === 'bancada' ? <Wrench className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                {t === 'bancada' ? 'Bancada (aparelho fica na loja)' : 'Externo (atendimento no cliente)'}
              </button>
            ))}
          </div>

          {/* Cliente */}
          <div className="grid gap-1.5">
            <Label htmlFor="os-cliente">
              Cliente <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <select
                id="os-cliente"
                value={form.cliente_id}
                onChange={setF('cliente_id')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— Selecione —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}{c.telefone ? ` · ${c.telefone}` : ''}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setClienteRapidoAberto((v) => !v)}
                title="Cadastrar cliente novo agora"
              >
                <UserPlus className="w-4 h-4" />
              </Button>
            </div>
            {clienteRapidoAberto && (
              <div className="grid grid-cols-[1fr_180px_auto] gap-2 rounded-md border bg-muted/30 p-2">
                <Input
                  placeholder="Nome do cliente"
                  value={nomeClienteRapido}
                  onChange={(e) => setNomeClienteRapido(e.target.value)}
                />
                <IMaskInput
                  mask="(00) 0.0000-0000"
                  value={telefoneClienteRapido}
                  onAccept={(valor: string) => setTelefoneClienteRapido(valor)}
                  placeholder="(00) 9.0000-0000"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button type="button" onClick={salvarClienteRapido}>Salvar</Button>
              </div>
            )}
          </div>

          {form.tipo === 'bancada' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="os-equip">
                    Equipamento <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="os-equip"
                    value={form.equipamento}
                    onChange={setF('equipamento')}
                    placeholder='Ex.: Notebook Dell Inspiron 15'
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="os-serie">Nº de série</Label>
                  <Input
                    id="os-serie"
                    value={form.numero_serie}
                    onChange={setF('numero_serie')}
                    onBlur={verificarSerie}
                    placeholder="Opcional"
                    className="font-mono"
                  />
                </div>
              </div>
              {jaPassouAqui.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <History className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      Este aparelho já passou pela loja {jaPassouAqui.length} vez{jaPassouAqui.length !== 1 ? 'es' : ''}.
                    </p>
                    {jaPassouAqui.slice(0, 3).map((o) => (
                      <p key={o.id}>
                        {numeroOS(o.id)} · {fmtData(o.criada_em)} · {STATUS_META[o.status].rotulo} · {o.defeito_relatado}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="os-acess">Acessórios que ficaram</Label>
                  <Input
                    id="os-acess"
                    value={form.acessorios}
                    onChange={setF('acessorios')}
                    placeholder="Ex.: carregador, capa"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="os-senha">Senha do aparelho</Label>
                  <Input
                    id="os-senha"
                    value={form.senha_acesso}
                    onChange={setF('senha_acesso')}
                    placeholder="Se o cliente autorizar"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="os-estado">Estado aparente na entrada</Label>
                <Input
                  id="os-estado"
                  value={form.estado_entrada}
                  onChange={setF('estado_entrada')}
                  placeholder="Ex.: carcaça riscada, sem parafusos da tampa"
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="os-end">
                  Endereço do atendimento <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="os-end"
                  value={form.endereco_atendimento}
                  onChange={setF('endereco_atendimento')}
                  placeholder="Rua, número, bairro"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="os-agenda">Agendar visita para</Label>
                <Input
                  id="os-agenda"
                  type="datetime-local"
                  value={form.agendado_para}
                  onChange={setF('agendado_para')}
                />
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="os-defeito">
              Defeito relatado pelo cliente <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="os-defeito"
              value={form.defeito_relatado}
              onChange={setF('defeito_relatado')}
              rows={3}
              placeholder='Nas palavras do cliente. Ex.: "liga mas não dá vídeo"'
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          {erro && (
            <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erro}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? 'Abrindo...' : 'Abrir OS'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Detalhe da OS

const ModalDetalheOS: FC<{
  os: OrdemDetalhada
  produtos: ProdutoOpcao[]
  onFechar: () => void
  onMudou: () => void
  onAbrirOutra: (id: number) => void
}> = ({ os, produtos, onFechar, onMudou, onAbrirOutra }) => {
  const { showToast } = useToast()
  const [senhaVisivel, setSenhaVisivel] = useState(false)
  const [diagnostico, setDiagnostico] = useState(os.diagnostico ?? '')
  const [garantiaDias, setGarantiaDias] = useState(String(os.garantia_dias))
  const [pickerAberto, setPickerAberto] = useState(false)
  const [motivoModal, setMotivoModal] = useState<null | 'cancelar' | 'recusar' | 'garantia'>(null)
  const [agendarPara, setAgendarPara] = useState('')

  useEffect(() => {
    setDiagnostico(os.diagnostico ?? '')
    setGarantiaDias(String(os.garantia_dias))
    setSenhaVisivel(false)
    setAgendarPara(os.agendado_para ? os.agendado_para.replace(' ', 'T').slice(0, 16) : '')
  }, [os.id, os.diagnostico, os.garantia_dias, os.agendado_para])

  const encerrada = ENCERRADAS.includes(os.status)
  const orcamentoEditavel = ORCAMENTO_EDITAVEL.includes(os.status)
  const total = os.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const dentroDaGarantia = os.status === 'entregue' && (os.garantia_ate ?? '') >= hojeLocal()

  const chamar = async (fn: () => Promise<{ success: boolean; error?: string }>, msgOk?: string) => {
    const resp = await fn()
    if (!resp.success) {
      showToast({ message: resp.error ?? 'Erro inesperado.', variant: 'destructive' })
      return false
    }
    if (msgOk) showToast({ message: msgOk, variant: 'success' })
    onMudou()
    return true
  }

  const mudarStatus = (novo: StatusOS, extras?: { observacao?: string; agendado_para?: string }) =>
    chamar(() => window.api.os.mudarStatus(os.id, novo, extras), `OS ${numeroOS(os.id)}: ${STATUS_META[novo].rotulo}.`)

  const salvarItens = (itens: ItemOS[]) =>
    chamar(() =>
      window.api.os.definirItens(
        os.id,
        itens.map((i) => ({
          produto_id: i.produto_id,
          variacao_id: i.variacao_id,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario
        }))
      )
    )

  const salvarDiagnostico = () =>
    chamar(() => window.api.os.atualizar(os.id, { diagnostico }), 'Diagnóstico salvo.')

  const salvarGarantia = () => {
    const dias = parseInt(garantiaDias)
    if (isNaN(dias) || dias < 0) {
      showToast({ message: 'Garantia inválida.', variant: 'destructive' })
      return
    }
    return chamar(() => window.api.os.atualizar(os.id, { garantia_dias: dias }), 'Garantia atualizada.')
  }

  // Ações principais por status (espelha as transições do backend — que valida de novo)
  const acoes: Array<{ rotulo: string; onClick: () => void; variante?: 'default' | 'outline' }> = []
  if (os.status === 'aberta') {
    acoes.push({ rotulo: 'Montar orçamento', onClick: () => mudarStatus('orcamento') })
  } else if (os.status === 'orcamento') {
    acoes.push({ rotulo: 'Enviar pra aprovação', onClick: () => mudarStatus('aguardando_aprovacao') })
  } else if (os.status === 'aguardando_aprovacao') {
    acoes.push({ rotulo: 'Cliente aprovou o orçamento', onClick: () => mudarStatus('aprovada') })
    acoes.push({ rotulo: 'Voltar pro orçamento', onClick: () => mudarStatus('orcamento'), variante: 'outline' })
    acoes.push({ rotulo: 'Cliente recusou', onClick: () => setMotivoModal('recusar'), variante: 'outline' })
  } else if (os.status === 'aprovada' || os.status === 'agendada') {
    acoes.push({ rotulo: 'Iniciar reparo', onClick: () => mudarStatus('em_reparo') })
  } else if (os.status === 'em_reparo') {
    acoes.push({ rotulo: 'Serviço pronto', onClick: () => mudarStatus('pronta') })
    acoes.push({ rotulo: 'Aguardando peça', onClick: () => mudarStatus('aguardando_peca'), variante: 'outline' })
  } else if (os.status === 'aguardando_peca') {
    acoes.push({ rotulo: 'Peça chegou — retomar reparo', onClick: () => mudarStatus('em_reparo') })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            OS {numeroOS(os.id)}
            <BadgeStatus status={os.status} />
            <BadgeTipo tipo={os.tipo_atendimento} />
            {os.os_origem_id != null && <BadgeGarantia />}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1 text-sm">
          {/* Ficha */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div>
              <span className="font-medium text-foreground">Cliente: </span>
              {os.cliente_nome}{os.cliente_telefone ? ` · ${os.cliente_telefone}` : ''}
            </div>
            <div>
              <span className="font-medium text-foreground">Técnico: </span>
              {os.tecnico_nome}
            </div>
            <div>
              <span className="font-medium text-foreground">Aberta em: </span>
              {fmtData(os.criada_em, true)}
            </div>
            {os.orcamento_aprovado_em && (
              <div>
                <span className="font-medium text-foreground">Orçamento aprovado em: </span>
                {fmtData(os.orcamento_aprovado_em, true)}
              </div>
            )}
            {os.tipo_atendimento === 'bancada' ? (
              <>
                <div className="col-span-2">
                  <span className="font-medium text-foreground">Equipamento: </span>
                  {os.equipamento}
                  {os.numero_serie && <span className="font-mono text-xs text-muted-foreground"> · série {os.numero_serie}</span>}
                </div>
                {os.acessorios && (
                  <div className="col-span-2">
                    <span className="font-medium text-foreground">Acessórios: </span>
                    {os.acessorios}
                  </div>
                )}
                {os.estado_entrada && (
                  <div className="col-span-2">
                    <span className="font-medium text-foreground">Estado na entrada: </span>
                    {os.estado_entrada}
                  </div>
                )}
                {os.senha_acesso && (
                  <div className="col-span-2 flex items-center gap-2">
                    <span className="font-medium text-foreground">Senha do aparelho: </span>
                    <span className="font-mono">{senhaVisivel ? os.senha_acesso : '••••••'}</span>
                    <button
                      type="button"
                      onClick={() => setSenhaVisivel((v) => !v)}
                      className="text-muted-foreground hover:text-foreground"
                      title={senhaVisivel ? 'Esconder' : 'Mostrar'}
                    >
                      {senhaVisivel ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="col-span-2">
                  <span className="font-medium text-foreground">Endereço: </span>
                  {os.endereco_atendimento}
                </div>
                {os.agendado_para && (
                  <div className="col-span-2">
                    <span className="font-medium text-foreground">Visita agendada: </span>
                    {fmtData(os.agendado_para, true)}
                  </div>
                )}
              </>
            )}
            <div className="col-span-2">
              <span className="font-medium text-foreground">Defeito relatado: </span>
              {os.defeito_relatado}
            </div>
          </div>

          {/* Diagnóstico do técnico */}
          <div className="grid gap-1.5">
            <Label htmlFor="os-diag">Diagnóstico do técnico (laudo)</Label>
            <textarea
              id="os-diag"
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
              disabled={encerrada}
              rows={2}
              placeholder="O que foi encontrado e o que será feito."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none disabled:opacity-60"
            />
            {!encerrada && diagnostico !== (os.diagnostico ?? '') && (
              <Button size="sm" variant="outline" className="justify-self-end" onClick={salvarDiagnostico}>
                Salvar diagnóstico
              </Button>
            )}
          </div>

          {/* Orçamento */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Orçamento</h4>
              {orcamentoEditavel && (
                <Button size="sm" variant="outline" onClick={() => setPickerAberto(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Adicionar item
                </Button>
              )}
            </div>
            {os.itens.length === 0 ? (
              <p className="text-muted-foreground text-xs border rounded-md px-3 py-4 text-center">
                Nenhum item ainda. {orcamentoEditavel ? 'Adicione serviços e peças do catálogo.' : ''}
              </p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {os.itens.map((item) => (
                      <tr key={item.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {item.produto_tipo === 'servico'
                              ? <Wrench className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              : <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                            <span className="truncate max-w-[260px]">
                              {item.produto_nome}{item.tamanho ? ` (${item.tamanho})` : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 w-20 text-center">
                          {orcamentoEditavel ? (
                            <input
                              type="number"
                              min="1"
                              defaultValue={item.quantidade}
                              key={`q${item.id}-${item.quantidade}`}
                              onBlur={(e) => {
                                const q = parseInt(e.target.value) || 1
                                if (q !== item.quantidade) {
                                  salvarItens(os.itens.map((i) => (i.id === item.id ? { ...i, quantidade: Math.max(1, q) } : i)))
                                }
                              }}
                              className="w-14 text-center border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          ) : (
                            `${item.quantidade}×`
                          )}
                        </td>
                        <td className="px-3 py-2 w-28 text-right">
                          {orcamentoEditavel ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={item.preco_unitario}
                              key={`p${item.id}-${item.preco_unitario}`}
                              onBlur={(e) => {
                                const p = parseFloat(e.target.value)
                                if (!isNaN(p) && p >= 0 && p !== item.preco_unitario) {
                                  salvarItens(os.itens.map((i) => (i.id === item.id ? { ...i, preco_unitario: p } : i)))
                                }
                              }}
                              className="w-24 text-right border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          ) : (
                            fmt(item.preco_unitario)
                          )}
                        </td>
                        <td className="px-3 py-2 w-28 text-right font-medium">
                          {fmt(item.quantidade * item.preco_unitario)}
                        </td>
                        {orcamentoEditavel && (
                          <td className="px-2 py-2 w-9">
                            <button
                              onClick={() => salvarItens(os.itens.filter((i) => i.id !== item.id))}
                              className="text-destructive/70 hover:text-destructive p-1"
                              title="Remover item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="bg-muted/40">
                      <td className="px-3 py-2 font-semibold" colSpan={orcamentoEditavel ? 3 : 2}>Total</td>
                      <td className="px-3 py-2 text-right font-bold">{fmt(total)}</td>
                      {orcamentoEditavel && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {!orcamentoEditavel && !encerrada && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                O orçamento está travado neste status — pra alterar, volte a OS pra "Em orçamento" (fica registrado).
              </p>
            )}
          </div>

          {/* Garantia */}
          {os.status === 'entregue' ? (
            <div className="flex items-center justify-between rounded-md border bg-emerald-50 border-emerald-200 px-3 py-2">
              <p className="text-emerald-800 text-xs font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Garantia de {os.garantia_dias} dias — válida até {fmtData(os.garantia_ate ?? null)}
                {!dentroDaGarantia && ' (encerrada)'}
              </p>
              {dentroDaGarantia && (
                <Button size="sm" variant="outline" onClick={() => setMotivoModal('garantia')}>
                  Abrir OS de garantia
                </Button>
              )}
            </div>
          ) : !encerrada ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="os-gar" className="text-xs text-muted-foreground">Garantia do serviço (dias):</Label>
              <Input
                id="os-gar"
                type="number"
                min="0"
                value={garantiaDias}
                onChange={(e) => setGarantiaDias(e.target.value)}
                className="w-20 h-8 text-center"
              />
              {garantiaDias !== String(os.garantia_dias) && (
                <Button size="sm" variant="outline" onClick={salvarGarantia}>Salvar</Button>
              )}
            </div>
          ) : null}

          {/* Ações do status atual */}
          {!encerrada && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {acoes.map((a) => (
                <Button key={a.rotulo} variant={a.variante ?? 'default'} onClick={a.onClick}>
                  {a.rotulo}
                </Button>
              ))}
              {os.status === 'aprovada' && os.tipo_atendimento === 'externo' && (
                <div className="flex items-center gap-2">
                  <Input
                    type="datetime-local"
                    value={agendarPara}
                    onChange={(e) => setAgendarPara(e.target.value)}
                    className="h-10 w-52"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!agendarPara) {
                        showToast({ message: 'Escolha a data/hora da visita.', variant: 'destructive' })
                        return
                      }
                      mudarStatus('agendada', { agendado_para: agendarPara.replace('T', ' ') })
                    }}
                  >
                    Agendar visita
                  </Button>
                </div>
              )}
              {os.status === 'pronta' && (
                <Button disabled title="Chega no próximo bloco: gera a venda, recebe e imprime cupom + garantia.">
                  Entregar e receber
                </Button>
              )}
              <Button
                variant="ghost"
                className="ml-auto text-destructive hover:text-destructive"
                onClick={() => setMotivoModal('cancelar')}
              >
                Cancelar OS
              </Button>
            </div>
          )}
          {os.status === 'pronta' && (
            <p className="text-[11px] text-muted-foreground -mt-3 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              O fechamento (entregar, receber e imprimir garantia) chega no próximo bloco da Fase 3b.
            </p>
          )}

          {/* Linha do tempo */}
          <div>
            <h4 className="font-semibold mb-2">Linha do tempo</h4>
            <ul className="space-y-1.5">
              {os.historico.map((h) => (
                <li key={h.id} className="flex items-baseline gap-2 text-xs">
                  <span className="text-muted-foreground font-mono shrink-0">{fmtData(h.criada_em, true)}</span>
                  <BadgeStatus status={h.status} />
                  <span className="text-muted-foreground truncate">
                    {h.vendedor_nome}{h.observacao ? ` — ${h.observacao}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {pickerAberto && (
          <ModalPickerItem
            produtos={produtos}
            onFechar={() => setPickerAberto(false)}
            onEscolher={(produto_id, variacao_id, preco) => {
              setPickerAberto(false)
              const existente = os.itens.find(
                (i) => i.produto_id === produto_id && (i.variacao_id ?? null) === (variacao_id ?? null)
              )
              const novos = existente
                ? os.itens.map((i) => (i.id === existente.id ? { ...i, quantidade: i.quantidade + 1 } : i))
                : [...os.itens, { id: 0, produto_id, variacao_id: variacao_id ?? null, quantidade: 1, preco_unitario: preco }]
              salvarItens(novos)
            }}
          />
        )}

        {motivoModal && (
          <ModalMotivo
            titulo={
              motivoModal === 'cancelar' ? `Cancelar OS ${numeroOS(os.id)}`
              : motivoModal === 'recusar' ? 'Cliente recusou o orçamento'
              : 'Abrir OS de garantia'
            }
            descricao={
              motivoModal === 'cancelar' ? 'Informe o motivo do cancelamento — fica registrado na linha do tempo.'
              : motivoModal === 'recusar' ? 'Se quiser, anote o motivo da recusa (opcional).'
              : 'Descreva o problema que o aparelho apresentou dentro da garantia.'
            }
            rotuloConfirmar={motivoModal === 'cancelar' ? 'Cancelar OS' : motivoModal === 'recusar' ? 'Registrar recusa' : 'Abrir OS'}
            obrigatorio={motivoModal !== 'recusar'}
            destrutivo={motivoModal === 'cancelar'}
            onFechar={() => setMotivoModal(null)}
            onConfirmar={async (texto) => {
              if (motivoModal === 'cancelar') {
                if (await mudarStatus('cancelada', { observacao: texto })) setMotivoModal(null)
              } else if (motivoModal === 'recusar') {
                if (await mudarStatus('recusada', { observacao: texto || undefined })) setMotivoModal(null)
              } else {
                const resp = await window.api.os.criarGarantia(os.id, texto)
                if (resp.success) {
                  setMotivoModal(null)
                  showToast({ message: `OS de garantia aberta.`, variant: 'success' })
                  onAbrirOutra((resp.data as OrdemServico).id)
                } else {
                  showToast({ message: resp.error, variant: 'destructive' })
                }
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Escolher item do catálogo pro orçamento (mesmo espírito do buscador do PDV)

const ModalPickerItem: FC<{
  produtos: ProdutoOpcao[]
  onFechar: () => void
  onEscolher: (produtoId: number, variacaoId: number | null, preco: number) => void
}> = ({ produtos, onFechar, onEscolher }) => {
  const [termo, setTermo] = useState('')
  const filtrados = useMemo(() => {
    const t = termo.toLowerCase().trim()
    const base = t
      ? produtos.filter((p) => p.nome.toLowerCase().includes(t) || (p.codigo_barras ?? '').includes(t))
      : produtos
    // Serviços primeiro: numa OS, mão de obra é o item mais comum.
    return [...base].sort((a, b) =>
      a.tipo === b.tipo ? a.nome.localeCompare(b.nome, 'pt-BR') : a.tipo === 'servico' ? -1 : 1
    )
  }, [produtos, termo])

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar item ao orçamento</DialogTitle>
        </DialogHeader>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Serviço ou peça..."
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
          {filtrados.slice(0, 50).map((p, i) => (
            <Fragment key={p.id}>
              {p.variacoes.length > 0 ? (
                <div className={`px-3 py-2.5 text-sm ${i > 0 ? 'border-t' : ''}`}>
                  <div className="flex justify-between items-center gap-3">
                    <div className="font-medium truncate min-w-0" title={p.nome}>{p.nome}</div>
                    <div className="font-semibold shrink-0">{fmt(p.preco)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {p.variacoes.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => onEscolher(p.id, v.id, p.preco)}
                        className="px-2 py-1 rounded border text-xs font-medium hover:bg-accent"
                      >
                        {v.tamanho}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => onEscolher(p.id, null, p.preco)}
                  className={`w-full text-left px-3 py-2.5 text-sm flex justify-between items-center hover:bg-accent ${i > 0 ? 'border-t' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {p.tipo === 'servico'
                      ? <Wrench className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      : <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <span className="truncate" title={p.nome}>{p.nome}</span>
                  </div>
                  <span className="font-semibold shrink-0 ml-3">{fmt(p.preco)}</span>
                </button>
              )}
            </Fragment>
          ))}
          {filtrados.length === 0 && (
            <p className="text-center py-8 text-muted-foreground text-sm">Nenhum item encontrado.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt de texto (motivo de cancelamento/recusa, defeito da garantia)

const ModalMotivo: FC<{
  titulo: string
  descricao: string
  rotuloConfirmar: string
  obrigatorio: boolean
  destrutivo?: boolean
  onFechar: () => void
  onConfirmar: (texto: string) => void
}> = ({ titulo, descricao, rotuloConfirmar, obrigatorio, destrutivo, onFechar, onConfirmar }) => {
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <p className="text-xs text-muted-foreground">{descricao}</p>
          <textarea
            autoFocus
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setErro('') }}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
          {erro && <p className="text-destructive text-xs">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button
            variant={destrutivo ? 'destructive' : 'default'}
            onClick={() => {
              if (obrigatorio && !texto.trim()) {
                setErro('Esse campo é obrigatório.')
                return
              }
              onConfirmar(texto.trim())
            }}
          >
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default OrdensServico
