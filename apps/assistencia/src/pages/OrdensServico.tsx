import { FC, Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { IMaskInput } from 'react-imask'
import {
  Plus, Search, Wrench, MapPin, Eye, EyeOff, Package, ShieldCheck,
  Trash2, UserPlus, History, Printer, MessageCircle, FileDown, Cctv, Laptop,
  ImagePlus, X, ClipboardList } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import EstadoVazio from '@fhvptech/core/ui/EstadoVazio'
import { Select } from '@fhvptech/core/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@fhvptech/core/ui/dialog'
import { useToast } from '@fhvptech/core/ui/toast'
import Paginacao from '@fhvptech/core/ui/paginacao'
import { useImprimir } from '@/components/ImpressaoProvider'
import { obterDadosLoja } from '@/utils/dadosLoja'
import { nomeImpressao } from '@/utils/nomeImpressao'
import { gerarHtmlComprovanteEntradaOS, gerarHtmlComprovanteEntregaOS } from '@/utils/comprovantesOS'
import { gerarHtmlLaudoOS, gerarHtmlOrcamentoOS } from '@/utils/documentosOS'
import { abrirWhatsAppOS } from '@/utils/whatsapp'
import { FORMAS_A_VISTA, type FormaPagamento } from '@/utils/formaPagamento'

const ITENS_POR_PAGINA = 20

// ── Tipos espelhados do backend (electron/db/queries/ordens.ts) ──
type TipoAtendimento = 'bancada' | 'externo'
type StatusOS =
  | 'aberta' | 'orcamento' | 'aguardando_aprovacao' | 'aprovada' | 'agendada'
  | 'em_reparo' | 'aguardando_peca' | 'pronta' | 'entregue' | 'recusada' | 'cancelada'

type NaturezaOS = 'conserto' | 'instalacao'
type CategoriaOS = 'equipamento' | 'cftv'

type OrdemServico = {
  id: number
  tipo_atendimento: TipoAtendimento
  natureza: NaturezaOS
  categoria: CategoriaOS
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
  estoque_disponivel?: number | null
}

type HistoricoOS = {
  id: number
  status: StatusOS
  observacao: string | null
  vendedor_nome?: string
  criada_em: string
}

type FotoOS = {
  id: number
  nome: string | null
  dados: string
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
  em_reparo: { rotulo: 'Em execução', cor: 'bg-orange-100 text-orange-700' },
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

// Redimensiona a foto no navegador antes de guardar: foto de celular (3-8MB)
// vira JPEG de até 1600px (~300-600KB) — o banco agradece e o laudo fica leve.
// Lê via FileReader→data URL (NÃO blob:): a CSP do index.html só libera
// img-src 'self' e data: — blob: seria bloqueado e a foto "falharia" à toa.
const LADO_MAX_FOTO = 1600
const redimensionarFoto = (arquivo: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error(`Não consegui ler o arquivo "${arquivo.name}".`))
    leitor.onload = () => {
      const img = new Image()
      img.onload = () => {
        const escala = Math.min(1, LADO_MAX_FOTO / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * escala))
        canvas.height = Math.max(1, Math.round(img.height * escala))
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = () => reject(new Error(`"${arquivo.name}" não é uma imagem válida.`))
      img.src = leitor.result as string
    }
    leitor.readAsDataURL(arquivo)
  })

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

// Conserto é o padrão da casa — só a instalação ganha selo, pra saltar aos olhos.
const BadgeInstalacao: FC = () => (
  <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
    Instalação
  </span>
)

// Equipamento é o feijão-com-arroz — só o CFTV ganha selo.
const BadgeCftv: FC = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 text-cyan-700 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
    <Cctv className="w-3 h-3" /> CFTV
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
  const location = useLocation()

  // Chegadas do Painel Diário: abrir direto uma OS específica ou o formulário de nova.
  useEffect(() => {
    const st = location.state as { abrirOs?: number; novaOs?: boolean } | null
    if (st?.abrirOs) abrirDetalhe(st.abrirOs)
    if (st?.novaOs) setModalNovaAberto(true)
  }, [])

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
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Ordens de Serviço
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ficou pra fazer? É OS. Levou embora agora? É venda no PDV.
          </p>
        </div>
        <Button onClick={() => setModalNovaAberto(true)} data-tour="os-nova">
          <Plus className="w-4 h-4 mr-2" />
          Nova OS
        </Button>
      </div>

      {/* Abas por situação + busca */}
      <div className="flex flex-wrap items-center gap-2 mb-4" data-tour="os-abas">
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
      <div className="border rounded-lg overflow-x-auto">
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
                <td colSpan={6}>
                  <EstadoVazio
                    icone={<ClipboardList className="w-9 h-9" />}
                    dica={busca || aba !== 'andamento' ? undefined : 'O botão "Nova OS" abre a primeira.'}
                  >
                    {busca || aba !== 'andamento'
                      ? 'Nenhuma OS encontrada.'
                      : 'Nenhuma OS em andamento.'}
                  </EstadoVazio>
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
                      {os.categoria === 'cftv' && <BadgeCftv />}
                      <span className="truncate max-w-[220px] text-muted-foreground" title={os.equipamento ?? os.endereco_atendimento ?? ''}>
                        {os.tipo_atendimento === 'bancada' ? os.equipamento : os.endereco_atendimento}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <BadgeStatus status={os.status} />
                      {os.natureza === 'instalacao' && <BadgeInstalacao />}
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
  categoria: CategoriaOS
  natureza: NaturezaOS
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
  categoria: 'equipamento',
  natureza: 'conserto',
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
    if (!form.defeito_relatado.trim()) { setErro('Descreva o que precisa ser feito.'); return }
    if (form.categoria === 'equipamento' && !form.equipamento.trim()) {
      setErro('Informe o equipamento que ficou na bancada.'); return
    }
    if (form.categoria === 'cftv' && !form.endereco_atendimento.trim()) {
      setErro('Informe o endereço do atendimento.'); return
    }
    setSalvando(true)
    const resp = await window.api.os.criar({
      categoria: form.categoria,
      // Equipamento fica SEMPRE na bancada da loja; serviço na rua é só CFTV.
      tipo_atendimento: form.categoria === 'cftv' ? 'externo' : 'bancada',
      natureza: form.natureza,
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
          {/* Cliente primeiro — depois a pergunta que molda o resto do formulário. */}
          <div className="grid gap-1.5">
            <Label htmlFor="os-cliente">
              Cliente <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <Select
                id="os-cliente"
                value={form.cliente_id}
                onChange={(v) => setForm((f) => ({ ...f, cliente_id: v }))}
                placeholder="— Selecione —"
                opcoes={[
                  { valor: '', rotulo: '— Selecione —' },
                  ...clientes.map((c) => ({
                    valor: String(c.id),
                    rotulo: c.nome,
                    detalhe: c.telefone || undefined
                  }))
                ]}
              />
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

          {/* EM QUE se trabalha — a primeira bifurcação: o resto do formulário
              se adapta a ela. CFTV é sempre no local do cliente; equipamento
              fica sempre na bancada da loja. */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'equipamento', rotulo: 'Equipamento', desc: 'Computador, notebook, impressora, celular...', Icone: Laptop },
                { id: 'cftv', rotulo: 'Sistema CFTV', desc: 'Câmeras, DVR e monitoramento no local', Icone: Cctv }
              ] as const
            ).map(({ id, rotulo, desc, Icone }) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, categoria: id, natureza: id === 'cftv' ? 'instalacao' : 'conserto' }))
                }
                className={`flex flex-col items-center gap-0.5 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                  form.categoria === id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icone className="w-4 h-4" />
                  {rotulo}
                </span>
                <span className="text-[11px] font-normal text-muted-foreground">{desc}</span>
              </button>
            ))}
          </div>

          {form.categoria === 'equipamento' ? (
            <>
              {/* Chips de um toque: o balcão é rápido. O aparelho fica SEMPRE
                  na bancada da loja — serviço na rua, por aqui, é só o CFTV. */}
              <div className="flex flex-wrap gap-1.5 -mb-1">
                {(['Computador', 'Notebook', 'Impressora', 'Celular'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, equipamento: `${c} ` }))}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    {c}
                  </button>
                ))}
              </div>
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
                  <Label htmlFor="os-serie">Número de Série (Opcional)</Label>
                  {/* Máscara permissiva: só letras/números/traço, sempre maiúsculo —
                      série de fabricante varia demais pra um formato fixo. */}
                  <IMaskInput
                    id="os-serie"
                    mask={/^[a-zA-Z0-9-]*$/}
                    prepare={(s: string) => s.toUpperCase()}
                    value={form.numero_serie}
                    onAccept={(valor: string) => setForm((f) => ({ ...f, numero_serie: valor }))}
                    onBlur={verificarSerie}
                    placeholder="ex.: SN-4F7K9821"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    placeholder="ex.: 1234"
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
            <>
              {/* Sistema CFTV: sempre no local do cliente. Instalação nova é o
                  caso clássico; manutenção cobre câmera sem imagem, DVR mudo. */}
              <div className="flex gap-2">
                {(['instalacao', 'conserto'] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, natureza: n }))}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      form.natureza === n ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
                    }`}
                  >
                    {n === 'instalacao' ? 'Instalação nova' : 'Manutenção / conserto'}
                  </button>
                ))}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="os-sistema">Sistema / equipamentos no local (opcional)</Label>
                <Input
                  id="os-sistema"
                  value={form.equipamento}
                  onChange={setF('equipamento')}
                  placeholder="Ex.: DVR Intelbras 8 canais + 6 câmeras"
                />
              </div>
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
            </>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="os-defeito">
              {form.categoria === 'cftv'
                ? form.natureza === 'instalacao'
                  ? 'O que será instalado? (escopo do serviço)'
                  : 'Qual o problema do sistema?'
                : 'Defeito relatado pelo cliente'}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <textarea
              id="os-defeito"
              value={form.defeito_relatado}
              onChange={setF('defeito_relatado')}
              rows={3}
              placeholder={
                form.categoria === 'cftv'
                  ? form.natureza === 'instalacao'
                    ? 'Ex.: 4 câmeras + DVR com acesso pelo celular'
                    : 'Ex.: câmera do portão sem imagem; DVR parou de gravar'
                  : 'Nas palavras do cliente. Ex.: "liga mas não dá vídeo"'
              }
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
  const [fechamentoAberto, setFechamentoAberto] = useState(false)
  // Registro fotográfico + erro do laudo "na cara" (nada de toast escondido)
  const [fotos, setFotos] = useState<FotoOS[]>([])
  const [erroLaudo, setErroLaudo] = useState(false)
  const [erroFoto, setErroFoto] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const inputFotoRef = useRef<HTMLInputElement>(null)
  const imprimir = useImprimir()

  useEffect(() => {
    setDiagnostico(os.diagnostico ?? '')
    setGarantiaDias(String(os.garantia_dias))
    setSenhaVisivel(false)
    setFechamentoAberto(false)
    setAgendarPara(os.agendado_para ? os.agendado_para.replace(' ', 'T').slice(0, 16) : '')
  }, [os.id, os.diagnostico, os.garantia_dias, os.agendado_para])

  useEffect(() => {
    setErroLaudo(false)
    setErroFoto('')
    setArrastando(false)
    ;(async () => {
      const r = await window.api.os.listarFotos(os.id)
      setFotos(r.success ? (r.data as FotoOS[]) : [])
    })()
  }, [os.id])

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

  // Documentos formais em PDF (A4, papel timbrado): orçamento pra aprovação
  // por escrito / propostas CFTV, e laudo técnico assinado pelo responsável.
  const gerarPdf = async (qual: 'orcamento' | 'laudo') => {
    if (qual === 'orcamento' && os.itens.length === 0) {
      showToast({ message: 'Adicione itens ao orçamento antes de gerar o PDF.', variant: 'destructive' })
      return
    }
    if (qual === 'laudo') {
      // Sem diagnóstico não existe laudo — e o aviso tem que ser NA CARA:
      // pinta o campo de vermelho e rola até ele (toast some atrás do modal).
      if (!diagnostico.trim()) {
        setErroLaudo(true)
        const campo = document.getElementById('os-diag')
        campo?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        ;(campo as HTMLTextAreaElement | null)?.focus({ preventScroll: true })
        return
      }
      // Diagnóstico digitado mas ainda não salvo? Salva sozinho — clicar em
      // "Laudo técnico" já diz que o parecer está pronto.
      if (diagnostico !== (os.diagnostico ?? '')) {
        const ok = await chamar(() => window.api.os.atualizar(os.id, { diagnostico }), 'Diagnóstico salvo.')
        if (!ok) return
      }
    }
    const loja = await obterDadosLoja()
    const html =
      qual === 'orcamento'
        ? gerarHtmlOrcamentoOS(os, loja)
        : gerarHtmlLaudoOS({ ...os, diagnostico }, loja, fotos)
    const nome = qual === 'orcamento' ? nomeImpressao.osOrcamento(os.id) : nomeImpressao.osLaudo(os.id)
    const r = await window.api.impressao.salvarPdf(html, nome)
    if (!r.success) showToast({ message: `Erro ao gerar PDF: ${r.error}`, variant: 'destructive' })
  }

  // Anexa em série: cada foto é redimensionada e já entra na OS (a lista que
  // volta do banco substitui a local — sem segunda viagem).
  const anexarFotos = async (arquivos: FileList | File[]) => {
    setErroFoto('')
    for (const arquivo of Array.from(arquivos)) {
      if (!arquivo.type.startsWith('image/')) {
        setErroFoto(`"${arquivo.name}" não é uma imagem.`)
        continue
      }
      try {
        const dados = await redimensionarFoto(arquivo)
        const r = await window.api.os.adicionarFoto(os.id, arquivo.name || null, dados)
        if (!r.success) { setErroFoto(r.error); break }
        setFotos(r.data as FotoOS[])
      } catch (e) {
        setErroFoto((e as Error).message)
      }
    }
  }

  const removerFoto = async (fotoId: number) => {
    const r = await window.api.os.removerFoto(fotoId)
    if (r.success) setFotos(r.data as FotoOS[])
    else showToast({ message: r.error, variant: 'destructive' })
  }

  const chamarWhatsApp = () => {
    if (!abrirWhatsAppOS(os.cliente_telefone, { ...os, total })) {
      showToast({ message: 'Este cliente não tem um telefone válido no cadastro.', variant: 'destructive' })
    }
  }

  // Comprovantes na térmica (mesmo fluxo do cupom do PDV: diálogo de impressora
  // do sistema, ou direto se o dono ligou "imprimir direto" nas Configurações).
  const imprimirComprovante = async (qual: 'entrada' | 'entrega', dadosOS: OrdemDetalhada = os) => {
    const loja = await obterDadosLoja()

    // Quanto ainda falta receber, pro QR do PIX no comprovante de entrega.
    // Vem da venda vinculada consultada AGORA, e não da soma dos itens da OS:
    // as duas dão o mesmo número no dia da entrega, mas só a venda sabe o que
    // aconteceu depois. Uma 2ª via tirada semanas mais tarde, com o cliente já
    // tendo pago, sai sem cobrança — que é o certo.
    let saldoEmAberto = 0
    if (qual === 'entrega' && dadosOS.venda_id != null) {
      const rv = await window.api.vendas.buscarPorId(dadosOS.venda_id)
      if (rv.success && rv.data) {
        const venda = rv.data as { total: number; valor_pago: number }
        saldoEmAberto = venda.total - venda.valor_pago
      }
    }

    const html =
      qual === 'entrada'
        ? gerarHtmlComprovanteEntradaOS(dadosOS, loja)
        : gerarHtmlComprovanteEntregaOS({ ...dadosOS, saldo_em_aberto: saldoEmAberto }, loja)
    const nome =
      qual === 'entrada' ? nomeImpressao.osEntrada(dadosOS.id) : nomeImpressao.osEntrega(dadosOS.id)
    await imprimir(html, nome, 'cupom')
  }

  const salvarGarantia = () => {
    const dias = parseInt(garantiaDias)
    if (isNaN(dias) || dias < 0) {
      showToast({ message: 'Garantia inválida.', variant: 'destructive' })
      return
    }
    return chamar(() => window.api.os.atualizar(os.id, { garantia_dias: dias }), 'Garantia atualizada.')
  }

  // Ações principais por status (espelha as transições do backend — que valida de novo)
  const acoes: Array<{
    rotulo: string
    onClick: () => void
    variante?: 'default' | 'outline'
    desabilitada?: boolean
    aviso?: string
  }> = []
  // Sem itens não tem o que aprovar — e uma OS aprovada vazia terminaria
  // entregue de graça no fechamento. Garantia (os_origem_id) é a exceção:
  // cortesia por natureza, igual à regra do backend.
  const orcamentoVazio = os.itens.length === 0 && os.os_origem_id == null
  if (os.status === 'aberta') {
    acoes.push({ rotulo: 'Montar orçamento', onClick: () => mudarStatus('orcamento') })
  } else if (os.status === 'orcamento') {
    acoes.push({
      rotulo: 'Enviar pra aprovação',
      onClick: () => mudarStatus('aguardando_aprovacao'),
      desabilitada: orcamentoVazio,
      aviso: orcamentoVazio
        ? 'Adicione ao menos um item ao orçamento pra poder enviar pra aprovação — OS sem itens terminaria entregue de graça.'
        : undefined
    })
  } else if (os.status === 'aguardando_aprovacao') {
    acoes.push({ rotulo: 'Cliente aprovou o orçamento', onClick: () => mudarStatus('aprovada') })
    acoes.push({ rotulo: 'Voltar pro orçamento', onClick: () => mudarStatus('orcamento'), variante: 'outline' })
    acoes.push({ rotulo: 'Cliente recusou', onClick: () => setMotivoModal('recusar'), variante: 'outline' })
  } else if (os.status === 'aprovada' || os.status === 'agendada') {
    acoes.push({
      rotulo:
        os.natureza === 'instalacao' ? 'Iniciar instalação'
        : os.categoria === 'cftv' ? 'Iniciar manutenção'
        : 'Iniciar reparo',
      onClick: () => mudarStatus('em_reparo')
    })
  } else if (os.status === 'em_reparo') {
    acoes.push({
      rotulo:
        os.natureza === 'instalacao' ? 'Instalação concluída'
        : os.categoria === 'cftv' ? 'Manutenção concluída'
        : 'Serviço pronto',
      onClick: () => mudarStatus('pronta')
    })
    acoes.push({
      rotulo: os.natureza === 'instalacao' ? 'Aguardando material' : 'Aguardando peça',
      onClick: () => mudarStatus('aguardando_peca'),
      variante: 'outline'
    })
  } else if (os.status === 'aguardando_peca') {
    acoes.push({
      rotulo: os.natureza === 'instalacao' ? 'Material chegou — retomar' : 'Peça chegou — retomar reparo',
      onClick: () => mudarStatus('em_reparo')
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            OS {numeroOS(os.id)}
            <BadgeStatus status={os.status} />
            <BadgeTipo tipo={os.tipo_atendimento} />
            {os.categoria === 'cftv' && <BadgeCftv />}
            {os.natureza === 'instalacao' && <BadgeInstalacao />}
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
                {os.equipamento && (
                  <div className="col-span-2">
                    <span className="font-medium text-foreground">
                      {os.categoria === 'cftv' ? 'Sistema: ' : 'Equipamento: '}
                    </span>
                    {os.equipamento}
                  </div>
                )}
                {os.agendado_para && (
                  <div className="col-span-2">
                    <span className="font-medium text-foreground">Visita agendada: </span>
                    {fmtData(os.agendado_para, true)}
                  </div>
                )}
              </>
            )}
            <div className="col-span-2">
              <span className="font-medium text-foreground">
                {os.natureza === 'instalacao'
                  ? 'Serviço solicitado: '
                  : os.categoria === 'cftv'
                    ? 'Problema do sistema: '
                    : 'Defeito relatado: '}
              </span>
              {os.defeito_relatado}
            </div>
          </div>

          {/* Diagnóstico do técnico */}
          <div className="grid gap-1.5">
            <Label htmlFor="os-diag">Diagnóstico do técnico (laudo)</Label>
            <textarea
              id="os-diag"
              value={diagnostico}
              onChange={(e) => { setDiagnostico(e.target.value); setErroLaudo(false) }}
              disabled={encerrada}
              rows={2}
              placeholder="O que foi encontrado e o que será feito."
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none disabled:opacity-60 ${
                erroLaudo ? 'border-destructive ring-1 ring-destructive' : 'border-input'
              }`}
            />
            {erroLaudo && (
              <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">
                Pra gerar o laudo técnico, preencha aqui o diagnóstico — é ele que vira a
                "Análise e parecer técnico" do documento.
              </p>
            )}
            {!encerrada && diagnostico !== (os.diagnostico ?? '') && (
              <Button size="sm" variant="outline" className="justify-self-end" onClick={salvarDiagnostico}>
                Salvar diagnóstico
              </Button>
            )}
          </div>

          {/* Registro fotográfico — as fotos que ilustram o laudo técnico */}
          {(!encerrada || fotos.length > 0) && (
            <div className="grid gap-1.5">
              <Label>Fotos do laudo{fotos.length > 0 ? ` (${fotos.length})` : ''}</Label>
              {!encerrada && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setArrastando(false)
                    if (e.dataTransfer.files.length > 0) anexarFotos(e.dataTransfer.files)
                  }}
                  onClick={() => inputFotoRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-3 py-5 text-xs cursor-pointer transition-colors ${
                    arrastando
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-input text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  <ImagePlus className="w-5 h-5" />
                  <span>
                    <b>Solte as fotos aqui</b> ou clique para escolher · JPG/PNG, até 12 por OS
                  </span>
                </div>
              )}
              <input
                ref={inputFotoRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) anexarFotos(e.target.files)
                  e.target.value = '' // permite escolher o mesmo arquivo de novo
                }}
              />
              {erroFoto && (
                <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erroFoto}</p>
              )}
              {fotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fotos.map((f) => (
                    <div key={f.id} className="relative group w-20 h-20 rounded-md border overflow-hidden">
                      <img
                        src={f.dados}
                        alt={f.nome ?? 'Foto da OS'}
                        title={f.nome ?? ''}
                        className="w-full h-full object-cover"
                      />
                      {!encerrada && (
                        <button
                          type="button"
                          onClick={() => removerFoto(f.id)}
                          title="Remover foto"
                          className="absolute top-0.5 right-0.5 rounded-full bg-black/60 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
              <div className="border rounded-md overflow-x-auto">
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
                          {/* Orçar peça que falta é normal (compra-se depois da
                              aprovação) — mas o técnico precisa VER a promessa.
                              A trava dura continua na entrega. */}
                          {item.produto_tipo === 'produto' &&
                            item.estoque_disponivel != null &&
                            item.quantidade > item.estoque_disponivel && (
                              <p className="text-[11px] text-amber-600 mt-0.5 ml-[22px]">
                                {item.estoque_disponivel <= 0
                                  ? 'sem estoque — a peça precisa ser comprada antes da entrega'
                                  : `só ${item.estoque_disponivel} em estoque — o resto precisa ser comprado antes da entrega`}
                              </p>
                            )}
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
                <Button
                  key={a.rotulo}
                  variant={a.variante ?? 'default'}
                  onClick={a.onClick}
                  disabled={a.desabilitada}
                  title={a.aviso}
                >
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
                <Button onClick={() => setFechamentoAberto(true)}>Entregar e receber</Button>
              )}
              <Button
                variant="ghost"
                className="ml-auto text-destructive hover:text-destructive"
                onClick={() => setMotivoModal('cancelar')}
              >
                Cancelar OS
              </Button>
              {acoes
                .filter((a) => a.desabilitada && a.aviso)
                .map((a) => (
                  <p key={a.rotulo} className="basis-full text-xs text-amber-600">
                    {a.aviso}
                  </p>
                ))}
            </div>
          )}
          {/* Documentos: térmica (comprovantes) + PDF formal (orçamento/laudo) + WhatsApp */}
          <div className="flex flex-wrap gap-2">
            {os.tipo_atendimento === 'bancada' && (
              <Button size="sm" variant="outline" onClick={() => imprimirComprovante('entrada')}>
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Comprovante de entrada
              </Button>
            )}
            {os.status === 'entregue' && (
              <Button size="sm" variant="outline" onClick={() => imprimirComprovante('entrega')}>
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Comprovante de entrega
              </Button>
            )}
            {os.itens.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => gerarPdf('orcamento')}>
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                Orçamento (PDF)
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => gerarPdf('laudo')}>
              <FileDown className="w-3.5 h-3.5 mr-1.5" />
              Laudo técnico (PDF)
            </Button>
            {os.cliente_telefone && ['aguardando_aprovacao', 'agendada', 'pronta'].includes(os.status) && (
              <Button
                size="sm"
                variant="outline"
                className="text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800"
                onClick={chamarWhatsApp}
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                Chamar no WhatsApp
              </Button>
            )}
          </div>

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

        {fechamentoAberto && (
          <ModalFechamento
            os={os}
            total={total}
            onFechar={() => setFechamentoAberto(false)}
            onFechada={async (atualizada) => {
              setFechamentoAberto(false)
              showToast({ message: `OS ${numeroOS(os.id)} entregue.`, variant: 'success' })
              onMudou()
              // Cliente na frente do balcão: já emite o comprovante de entrega
              // (com venda, garantia e validade recém-carimbadas).
              await imprimirComprovante('entrega', atualizada)
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
  // Cadastro na hora: o serviço que ainda não existe no catálogo não pode
  // travar o orçamento. Nasce aqui e já cai como item da OS.
  const [criando, setCriando] = useState<null | 'servico' | 'produto'>(null)
  const [novoNome, setNovoNome] = useState('')
  const [novoPreco, setNovoPreco] = useState('')
  const [novoEstoque, setNovoEstoque] = useState('1')
  const [erroNovo, setErroNovo] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)

  const abrirCriar = (tipo: 'servico' | 'produto') => {
    setCriando(tipo)
    setNovoNome(termo.trim()) // aproveita o que foi buscado e não achado
    setNovoPreco('')
    setNovoEstoque('1')
    setErroNovo('')
  }

  const salvarNovo = async () => {
    const nome = novoNome.trim()
    if (!nome) { setErroNovo('Informe o nome.'); return }
    const preco = parseFloat(novoPreco.replace(',', '.'))
    if (isNaN(preco) || preco < 0) { setErroNovo('Preço inválido.'); return }
    setSalvandoNovo(true)
    const resp = await window.api.produtos.criar({
      tipo: criando,
      nome,
      codigo_barras: null,
      categoria: null,
      preco,
      custo: 0,
      estoque: criando === 'produto' ? Math.max(0, parseInt(novoEstoque) || 0) : 0,
      fornecedor_id: null
    })
    setSalvandoNovo(false)
    if (resp.success) {
      const novo = resp.data as { id: number; preco: number }
      onEscolher(novo.id, null, novo.preco)
    } else {
      setErroNovo(resp.error)
    }
  }
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
                        title={`${v.estoque} em estoque`}
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
                    {p.tipo === 'produto' && (
                      <span
                        className={`shrink-0 text-[11px] ${
                          p.estoque <= 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'
                        }`}
                      >
                        {p.estoque <= 0 ? 'sem estoque' : `${p.estoque} em estoque`}
                      </span>
                    )}
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

        {/* Cadastro na hora — o item que não existe no catálogo não trava o orçamento */}
        <div className="mt-2">
          {criando === null ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => abrirCriar('servico')}>
                <Wrench className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                Cadastrar serviço
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => abrirCriar('produto')}>
                <Package className="w-3.5 h-3.5 mr-1.5" />
                Cadastrar peça/produto
              </Button>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium">
                {criando === 'servico' ? 'Novo serviço' : 'Nova peça/produto'} — entra no catálogo e
                já cai neste orçamento.
              </p>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder={criando === 'servico' ? 'Ex.: Troca de tela' : 'Ex.: SSD 480GB'}
                  value={novoNome}
                  onChange={(e) => { setNovoNome(e.target.value); setErroNovo('') }}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Preço (R$)"
                  value={novoPreco}
                  onChange={(e) => { setNovoPreco(e.target.value); setErroNovo('') }}
                  className="w-28"
                />
                {criando === 'produto' && (
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    title="Estoque inicial da peça"
                    placeholder="Estoque"
                    value={novoEstoque}
                    onChange={(e) => setNovoEstoque(e.target.value)}
                    className="w-24"
                  />
                )}
              </div>
              {erroNovo && (
                <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erroNovo}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setCriando(null)}>Voltar</Button>
                <Button size="sm" onClick={salvarNovo} disabled={salvandoNovo}>
                  {salvandoNovo ? 'Salvando...' : 'Salvar e adicionar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Entregar e receber: gera a venda a partir do orçamento (a máquina financeira
// é a mesma do PDV — crediário, parcelas e entrada inclusos). OS sem itens
// (garantia/cortesia) só registra a entrega.

const ModalFechamento: FC<{
  os: OrdemDetalhada
  total: number
  onFechar: () => void
  onFechada: (atualizada: OrdemDetalhada) => void
}> = ({ os, total, onFechar, onFechada }) => {
  const dataDaqui = (dias: number): string => {
    const d = new Date()
    d.setDate(d.getDate() + dias)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // CONDIÇÃO (quando) e FORMA (como) são coisas diferentes e ficam lado a lado
  // aqui — esta variável já se chamou `forma` e guardava a condição, que é a
  // mesma confusão que existia no PDV. Ver src/utils/formaPagamento.ts.
  const [condicao, setCondicao] = useState<'pago' | 'pendente' | 'parcelado'>('pago')
  // Sem pré-marcação: padrão marcado vira mentira silenciosa no relatório.
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | null>(null)
  // Sem data pré-preenchida DE PROPÓSITO: o vencimento é um combinado com o
  // cliente — tem que ser escolhido conscientemente (os atalhos dão a rapidez).
  const [vencimento, setVencimento] = useState('')
  const [parcelas, setParcelas] = useState('2')
  const [entrada, setEntrada] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const semCobranca = os.itens.length === 0
  // Mesma regra do PDV: só pergunta quando há dinheiro entrando agora. OS sem
  // cobrança (garantia/cortesia) e entrega a prazo não têm o que responder.
  const precisaEscolherForma = !semCobranca && condicao === 'pago' && total > 0
  const entradaNum = Math.max(0, parseFloat(entrada.replace(',', '.')) || 0)
  const nParcelas = parseInt(parcelas) || 0
  const financiado = Math.max(0, total - entradaNum)

  const confirmar = async () => {
    setErro('')
    if (precisaEscolherForma && !formaPagamento) {
      setErro('Escolha como o cliente pagou (dinheiro, débito, crédito ou PIX).')
      return
    }
    if (!semCobranca && condicao !== 'pago') {
      if (total <= 0) {
        setErro('O total é zero — não há nada pra receber depois. Use "À vista".')
        return
      }
      if (!vencimento) {
        setErro(condicao === 'parcelado' ? 'Escolha a data do 1º vencimento.' : 'Escolha a data de vencimento.')
        return
      }
      if (condicao === 'parcelado' && nParcelas < 2) { setErro('Parcelado exige ao menos 2 parcelas.'); return }
      if (entradaNum >= total) {
        setErro('A entrada não pode ser igual ou maior que o total — pra receber tudo agora, use "À vista".')
        return
      }
    }
    setSalvando(true)
    const resp = await window.api.os.fechar(
      os.id,
      semCobranca
        ? { status_pagamento: 'pago' }
        : {
            status_pagamento: condicao,
            data_vencimento: condicao === 'pago' ? null : vencimento,
            num_parcelas: condicao === 'parcelado' ? nParcelas : null,
            entrada: condicao === 'pago' ? 0 : entradaNum,
            // A prazo o backend deriva 'crediario' sozinho — não mandamos nada.
            forma_pagamento: precisaEscolherForma ? formaPagamento : null
          }
    )
    setSalvando(false)
    if (resp.success) onFechada(resp.data as OrdemDetalhada)
    else setErro(resp.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Entregar e receber — OS {numeroOS(os.id)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {semCobranca ? (
            <p className="text-sm text-muted-foreground">
              Esta OS não tem itens no orçamento — a entrega será registrada <b>sem cobrança</b>{' '}
              (cortesia ou atendimento em garantia).
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <span className="text-sm font-medium">Total do serviço</span>
                <span className="text-xl font-bold text-primary">{fmt(total)}</span>
              </div>

              <div className="flex gap-2">
                {(
                  [
                    { id: 'pago', rotulo: 'À vista' },
                    { id: 'pendente', rotulo: 'A prazo' },
                    { id: 'parcelado', rotulo: 'Parcelado' }
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => { setCondicao(f.id); setErro('') }}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      condicao === f.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
                    }`}
                  >
                    {f.rotulo}
                  </button>
                ))}
              </div>

              {/* Forma de pagamento — COMO o dinheiro entrou. Mesmo bloco do
                  PDV: a OS entregue à vista é uma venda como qualquer outra, e
                  sem isto ela nasceria sem forma e furaria o relatório. */}
              {precisaEscolherForma && (
                <div className="grid gap-1.5">
                  <Label>
                    Forma de pagamento <span className="text-destructive">*</span>
                  </Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FORMAS_A_VISTA.map((f) => {
                      const Icone = f.icone
                      const marcada = formaPagamento === f.valor
                      return (
                        <button
                          key={f.valor}
                          type="button"
                          onClick={() => { setFormaPagamento(f.valor); setErro('') }}
                          aria-pressed={marcada}
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors text-left ${
                            marcada
                              ? 'border-primary bg-primary/5 ring-1 ring-primary font-medium'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <Icone className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{f.rotulo}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {condicao !== 'pago' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="fech-venc">
                      {condicao === 'parcelado' ? '1º vencimento' : 'Vencimento'}{' '}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="fech-venc"
                      type="date"
                      value={vencimento}
                      onChange={(e) => { setVencimento(e.target.value); setErro('') }}
                    />
                    <div className="flex gap-1.5">
                      {[7, 15, 30].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => { setVencimento(dataDaqui(d)); setErro('') }}
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            vencimento === dataDaqui(d)
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'text-muted-foreground hover:bg-accent'
                          }`}
                        >
                          +{d} dias
                        </button>
                      ))}
                    </div>
                  </div>
                  {condicao === 'parcelado' ? (
                    <div className="grid gap-1.5">
                      <Label htmlFor="fech-parc">Parcelas</Label>
                      <Select
                        id="fech-parc"
                        value={parcelas}
                        onChange={setParcelas}
                        opcoes={Array.from({ length: 11 }, (_, i) => i + 2).map((n) => ({
                          valor: String(n),
                          rotulo: `${n}× de ≈ ${fmt(financiado / n)}`
                        }))}
                      />
                    </div>
                  ) : (
                    <div />
                  )}
                  <div className="col-span-2 grid gap-1.5">
                    <Label htmlFor="fech-entrada">Entrada recebida agora (opcional)</Label>
                    <Input
                      id="fech-entrada"
                      type="number"
                      min="0"
                      step="0.01"
                      value={entrada}
                      onChange={(e) => setEntrada(e.target.value)}
                      placeholder="0,00"
                    />
                    {entradaNum > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Fica {condicao === 'parcelado' ? 'parcelado' : 'a receber'}: <b>{fmt(financiado)}</b>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {erro && (
            <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erro}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Voltar</Button>
          <Button onClick={confirmar} disabled={salvando}>
            {salvando ? 'Registrando...' : semCobranca ? 'Confirmar entrega' : 'Receber e entregar'}
          </Button>
        </DialogFooter>
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
