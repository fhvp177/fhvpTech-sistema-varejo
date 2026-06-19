import { FC, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Plus, Eye, CheckCircle, Search, Trash2, ShoppingCart, UserPlus, Printer, User, Building2, Percent, DollarSign, RotateCcw, Wallet, FileDown, FileText } from 'lucide-react'
import MesPicker from '@/components/MesPicker'
import { IMaskInput } from 'react-imask'
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
import Paginacao from '@fhvptech/core/ui/paginacao'
import { useToast } from '@fhvptech/core/ui/toast'
import ClienteSeletor, { type ClienteSeletorHandle } from '@/components/ClienteSeletor'
import ConsultaPreco from '@/components/ConsultaPreco'
import { gerarHtmlCupomVenda } from '@/utils/cupomVenda'
import { obterDadosLoja } from '@/utils/dadosLoja'
import { nomeImpressao } from '@/utils/nomeImpressao'
import { gerarHtmlComprovanteDevolucao } from '@/utils/comprovanteDevolucao'
import { gerarHtmlRelatorioVendas, rotuloMes, type ProdutoMaisVendido } from '@/utils/relatorioVendas'
import { usePdvMode, useSessao } from '@/App'
import ModalElevarPrivilegio from '@/components/ModalElevarPrivilegio'
import ModalDevolucao from '@/components/ModalDevolucao'

const ITENS_POR_PAGINA = 20

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusPagamento = 'pago' | 'pendente' | 'inadimplente' | 'parcelado'

type Parcela = {
  id: number
  venda_id: number
  numero: number
  valor: number
  data_vencimento: string
  status: 'pendente' | 'pago' | 'inadimplente'
}

type Venda = {
  id: number
  cliente_id: number | null
  vendedor_id: number | null
  data: string
  total: number
  desconto: number
  entrada: number
  valor_pago: number
  status_pagamento: StatusPagamento
  data_vencimento: string | null
  num_parcelas: number | null
  valor_inadimplente: number
  valor_devolvido: number
  cliente_nome?: string | null
  cliente_telefone?: string | null
  cliente_endereco?: string | null
  cliente_cpf?: string | null
  vendedor_nome?: string | null
}

type ItemVenda = {
  produto_id: number
  quantidade: number
  preco_unitario: number
  produto_nome?: string
  codigo_barras?: string
}

type VendaDetalhada = Venda & { itens: ItemVenda[]; parcelas: Parcela[] }

type DevolucaoComItens = {
  id: number
  venda_id: number
  data: string
  tipo: 'credito' | 'dinheiro'
  valor_total: number
  motivo: string | null
  cliente_nome: string | null
  itens: Array<{ produto_nome: string; quantidade: number; valor_unitario_devolvido: number }>
}

type ItemCarrinho = {
  produto_id: number
  variacao_id: number | null
  tamanho: string | null
  codigo_barras: string
  nome: string
  preco_unitario: number
  quantidade: number
  estoque_disponivel: number
}

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
  estoque: number // simples: o próprio; grade: soma dos tamanhos
  variacoes: Variacao[]
}

// Identidade de uma linha do carrinho: por tamanho (grade) ou pelo produto (simples).
const chaveItem = (produtoId: number, variacaoId: number | null): string =>
  variacaoId != null ? `v${variacaoId}` : `p${produtoId}`

type Cliente = {
  id: number
  nome: string
  telefone: string
  tipo_pessoa?: 'fisica' | 'juridica'
  cpf?: string | null
  cnpj?: string | null
  razao_social?: string | null
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CORES_STATUS: Record<StatusPagamento, string> = {
  pago: 'bg-green-100 text-green-700 border border-green-200',
  pendente: 'bg-amber-100 text-amber-700 border border-amber-200',
  inadimplente: 'bg-red-100 text-red-700 border border-red-200',
  parcelado: 'bg-blue-100 text-blue-700 border border-blue-200'
}

const LABEL_STATUS: Record<StatusPagamento, string> = {
  pago: 'Pago',
  pendente: 'Venda a prazo',
  inadimplente: 'Inadimplente',
  parcelado: 'Parcelado'
}

// Rótulos da forma de pagamento no PDV — usados durante a venda (presente),
// diferente de LABEL_STATUS que descreve o estado da venda no histórico (passado).
const LABEL_FORMA_PAGAMENTO: Record<StatusPagamento, string> = {
  pago: 'À vista',
  pendente: 'Venda a prazo',
  inadimplente: 'Inadimplente',
  parcelado: 'Parcelado'
}

const CORES_PARCELA: Record<string, string> = {
  pago: 'bg-green-100 text-green-700',
  pendente: 'bg-amber-100 text-amber-700',
  inadimplente: 'bg-red-100 text-red-700'
}

const badgeVenda = (v: Venda): string => {
  if (v.num_parcelas) {
    if (v.status_pagamento === 'parcelado') return `Parcelado (${v.num_parcelas}x)`
    if (v.status_pagamento === 'pago') return `Pago (${v.num_parcelas}x)`
  }
  return LABEL_STATUS[v.status_pagamento]
}

// Indicador de devolução — dimensão separada do status de pagamento, mostrado
// como ícone ↩ discreto (não como pílula, pra não competir com o status).
// Vermelho = totalmente devolvida (valor devolvido cobre ~todo o total, com
// tolerância p/ o arredondamento do rateio do desconto); laranja = parcial.
const seloDevolucao = (
  v: { total: number; valor_devolvido?: number }
): { label: string; cor: string } | null => {
  const devolvido = v.valor_devolvido ?? 0
  if (devolvido <= 0) return null
  return devolvido >= v.total - 0.05
    ? { label: 'Totalmente devolvida', cor: 'text-rose-600' }
    : { label: 'Devolução parcial', cor: 'text-orange-500' }
}

const fmt = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const fmtDataCurta = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('pt-BR')

// ─── Componente principal ─────────────────────────────────────────────────────

type View = 'historico' | 'pdv'

const Vendas: FC = () => {
  const [view, setView] = useState<View>('historico')
  return view === 'historico' ? (
    <HistoricoVendas onNova={() => setView('pdv')} />
  ) : (
    <PDV onSair={() => setView('historico')} />
  )
}

// ─── Histórico de Vendas ──────────────────────────────────────────────────────

const HistoricoVendas: FC<{ onNova: () => void }> = ({ onNova }) => {
  const [lista, setLista] = useState<Venda[]>([])
  const [filtroStatus, setFiltroStatus] = useState<StatusPagamento | 'todos'>('todos')
  const [filtroMes, setFiltroMes] = useState<string>('') // '' = todas as datas; 'YYYY-MM' = mês específico
  const [busca, setBusca] = useState('')
  const [vendaDetalhada, setVendaDetalhada] = useState<VendaDetalhada | null>(null)
  const [valorPagamento, setValorPagamento] = useState('')
  const [salvandoPagamento, setSalvandoPagamento] = useState(false)
  const [erroPagamento, setErroPagamento] = useState('')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [devolverVendaId, setDevolverVendaId] = useState<number | null>(null)
  const [menuImprimir, setMenuImprimir] = useState<{ vendaId: number; devolucoes: DevolucaoComItens[] } | null>(null)
  const [relatorioAberto, setRelatorioAberto] = useState(false)
  const [relMes, setRelMes] = useState('') // mês escolhido dentro do diálogo de relatório
  const [relIncluiProdutos, setRelIncluiProdutos] = useState(false)
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)
  const { showToast } = useToast()
  const { ehDono } = useSessao()

  const carregar = async () => {
    const resp = await window.api.vendas.listar()
    if (resp.success) setLista(resp.data as Venda[])
  }

  const desfazerPagamento = async (vendaId: number, snapshot: SnapshotVenda) => {
    const resp = await window.api.vendas.restaurar(vendaId, snapshot)
    if (!resp.success) {
      showToast({ message: `Não foi possível desfazer: ${resp.error}`, variant: 'destructive' })
      return
    }
    await carregar()
    if (vendaDetalhada && vendaDetalhada.id === vendaId) {
      const r = await window.api.vendas.buscarPorId(vendaId)
      if (r.success && r.data) setVendaDetalhada(r.data as VendaDetalhada)
    }
    showToast({ message: 'Pagamento revertido.', variant: 'success' })
  }

  useEffect(() => { carregar() }, [])

  // Aplica mês + busca primeiro (a base usada também nos contadores de cada aba).
  const listaPorMes = filtroMes
    ? lista.filter((v) => v.data.slice(0, 7) === filtroMes)
    : lista

  const termo = busca.trim().toLowerCase()
  const listaBase = termo
    ? listaPorMes.filter(
        (v) =>
          (v.cliente_nome || 'venda avulsa').toLowerCase().includes(termo) ||
          String(v.id).includes(termo)
      )
    : listaPorMes

  const listaFiltrada = filtroStatus === 'todos'
    ? listaBase
    : listaBase.filter((v) => v.status_pagamento === filtroStatus)

  useEffect(() => {
    setPaginaAtual(1)
  }, [filtroStatus, filtroMes, busca])

  // Limite máximo do <input type="month"> — não faz sentido escolher futuro.
  const mesMaximo = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  const inicioPagina = (paginaAtual - 1) * ITENS_POR_PAGINA
  const listaPaginada = listaFiltrada.slice(inicioPagina, inicioPagina + ITENS_POR_PAGINA)

  // Vendas do mês escolhido no diálogo de relatório — independente do filtro da lista.
  const vendasDoMesRelatorio = relMes ? lista.filter((v) => v.data.slice(0, 7) === relMes) : []

  const verDetalhes = async (id: number) => {
    const resp = await window.api.vendas.buscarPorId(id)
    if (resp.success && resp.data) {
      const venda = resp.data as VendaDetalhada
      setVendaDetalhada(venda)
      const restante = +(venda.total - venda.valor_pago).toFixed(2)
      setValorPagamento(restante > 0 ? String(restante) : '')
      setErroPagamento('')
    }
  }

  const registrarPagamento = async (id: number) => {
    const valor = parseFloat(valorPagamento.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) {
      setErroPagamento('Informe um valor válido maior que zero.')
      return
    }
    setSalvandoPagamento(true)
    setErroPagamento('')
    const resp = await window.api.vendas.registrarPagamentoParcial(id, valor)
    if (resp.success) {
      await verDetalhes(id)
      await carregar()
      const snapshot = resp.data?.snapshot
      if (snapshot) {
        showToast({
          message: `Pagamento de ${fmt(valor)} registrado.`,
          action: { label: 'Desfazer', onClick: () => desfazerPagamento(id, snapshot) }
        })
      }
    } else {
      setErroPagamento(resp.error)
    }
    setSalvandoPagamento(false)
  }

  const marcarComoPago = async (id: number) => {
    const resp = await window.api.vendas.atualizarStatus(id, 'pago')
    await carregar()
    if (resp.success) {
      const snapshot = resp.data?.snapshot
      if (snapshot) {
        showToast({
          message: 'Venda marcada como paga.',
          action: { label: 'Desfazer', onClick: () => desfazerPagamento(id, snapshot) }
        })
      }
    }
  }

  // Monta o HTML + nome do cupom de uma venda (reusado por Imprimir e Salvar PDF).
  const gerarCupom = async (id: number): Promise<{ html: string; nome: string } | null> => {
    const resp = await window.api.vendas.buscarPorId(id)
    if (!resp.success || !resp.data) {
      alert('Não foi possível carregar os dados da venda.')
      return null
    }
    const loja = await obterDadosLoja()
    const html = gerarHtmlCupomVenda(resp.data as VendaDetalhada, loja)
    return { html, nome: nomeImpressao.cupomVenda(id) }
  }

  const imprimirCupom = async (id: number) => {
    const doc = await gerarCupom(id)
    if (!doc) return
    const r = await window.api.impressao.imprimir(doc.html, doc.nome)
    if (!r.success) alert(`Erro ao imprimir: ${r.error}`)
  }

  const salvarPdfCupom = async (id: number) => {
    const doc = await gerarCupom(id)
    if (!doc) return
    const r = await window.api.impressao.salvarPdf(doc.html, doc.nome)
    if (!r.success) alert(`Erro ao salvar PDF: ${r.error}`)
  }

  // Clique na impressora: abre um menu pra escolher Imprimir ou Salvar PDF.
  // Sem devolução, mostra só o cupom da compra; com devolução, também os
  // comprovante(s) de devolução.
  const abrirMenuImprimir = async (v: Venda) => {
    if (!v.valor_devolvido || v.valor_devolvido <= 0) {
      setMenuImprimir({ vendaId: v.id, devolucoes: [] })
      return
    }
    const resp = await window.api.devolucoes.porVenda(v.id)
    setMenuImprimir({ vendaId: v.id, devolucoes: resp.success ? resp.data : [] })
  }

  // Monta o HTML + nome do comprovante de uma devolução.
  const gerarComprovanteDevolucao = async (dev: DevolucaoComItens): Promise<{ html: string; nome: string }> => {
    const loja = await obterDadosLoja()
    const html = gerarHtmlComprovanteDevolucao({
      id: dev.id,
      venda_id: dev.venda_id,
      data: dev.data,
      tipo: dev.tipo,
      valor_total: dev.valor_total,
      cliente_nome: dev.cliente_nome,
      motivo: dev.motivo,
      saldo_credito_novo: null,
      itens: dev.itens.map((it) => ({
        produto_nome: it.produto_nome,
        quantidade: it.quantidade,
        valor_unitario: it.valor_unitario_devolvido
      }))
    }, loja)
    return { html, nome: nomeImpressao.devolucao(dev.id, dev.venda_id) }
  }

  const imprimirComprovanteDevolucao = async (dev: DevolucaoComItens) => {
    const doc = await gerarComprovanteDevolucao(dev)
    const r = await window.api.impressao.imprimir(doc.html, doc.nome)
    if (!r.success) alert(`Erro ao imprimir: ${r.error}`)
  }

  const salvarPdfComprovanteDevolucao = async (dev: DevolucaoComItens) => {
    const doc = await gerarComprovanteDevolucao(dev)
    const r = await window.api.impressao.salvarPdf(doc.html, doc.nome)
    if (!r.success) alert(`Erro ao salvar PDF: ${r.error}`)
  }

  // Relatório de vendas do mês selecionado. O resumo gerencial sai de listaPorMes
  // (já em memória); "mais vendidos" exige a query agregada no backend.
  const gerarRelatorio = async (acao: 'pdf' | 'imprimir') => {
    if (!relMes || vendasDoMesRelatorio.length === 0) return
    setGerandoRelatorio(true)
    try {
      let maisVendidos: ProdutoMaisVendido[] | undefined
      if (relIncluiProdutos) {
        const r = await window.api.vendas.produtosMaisVendidos(relMes)
        maisVendidos = r.success ? (r.data as ProdutoMaisVendido[]) : []
      }
      const html = gerarHtmlRelatorioVendas(vendasDoMesRelatorio, relMes, maisVendidos)
      const nome = nomeImpressao.relatorioVendas(relMes)
      const r =
        acao === 'pdf'
          ? await window.api.impressao.salvarPdf(html, nome)
          : await window.api.impressao.imprimir(html, nome)
      if (!r.success) {
        showToast({ message: `Erro ao gerar relatório: ${r.error}`, variant: 'destructive' })
        return
      }
      setRelatorioAberto(false)
    } finally {
      setGerandoRelatorio(false)
    }
  }

  const pagarParcela = async (parcelaId: number) => {
    const resp = await window.api.vendas.pagarParcela(parcelaId)
    if (vendaDetalhada) {
      const r = await window.api.vendas.buscarPorId(vendaDetalhada.id)
      if (r.success && r.data) setVendaDetalhada(r.data as VendaDetalhada)
    }
    await carregar()
    if (resp.success && resp.data) {
      const { vendaId, snapshot } = resp.data
      showToast({
        message: 'Parcela marcada como paga.',
        action: { label: 'Desfazer', onClick: () => desfazerPagamento(vendaId, snapshot) }
      })
    }
  }

  const tabs: Array<{ key: StatusPagamento | 'todos'; label: string }> = [
    { key: 'todos', label: 'Todos' },
    { key: 'pago', label: 'Pagos' },
    { key: 'pendente', label: 'Pendentes' },
    { key: 'parcelado', label: 'Parcelados' },
    { key: 'inadimplente', label: 'Inadimplentes' }
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Vendas</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setRelMes(filtroMes || mesMaximo); setRelatorioAberto(true) }}
            disabled={lista.length === 0}
          >
            <FileText className="w-4 h-4 mr-2" />
            Relatório do mês
          </Button>
          <Button onClick={onNova}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Venda (PDV)
          </Button>
        </div>
      </div>

      {/* Busca por cliente ou nº da venda */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por cliente ou nº da venda..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filtro de status + filtro de mês */}
      <div className="flex items-end justify-between gap-3 mb-4 border-b flex-wrap">
        <div className="flex gap-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFiltroStatus(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                filtroStatus === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">
                {key === 'todos'
                  ? listaBase.length
                  : listaBase.filter((v) => v.status_pagamento === key).length}
              </span>
            </button>
          ))}
        </div>
        <div className="pb-1.5">
          <MesPicker
            value={filtroMes}
            onChange={setFiltroMes}
            allowClear
            maxMes={mesMaximo}
            placeholder="Todas as datas"
            align="right"
          />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-12">#</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cliente</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vencimento</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="w-32 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground">
                  Nenhuma venda encontrada.
                </td>
              </tr>
            )}
            {listaPaginada.map((v, i) => (
              <tr key={v.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{v.id}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtData(v.data)}</td>
                <td className="px-4 py-3 font-medium">{v.cliente_nome || 'Venda avulsa'}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  {v.num_parcelas && v.status_pagamento === 'inadimplente' && v.valor_inadimplente > 0
                    ? (
                      <span title={`Total da venda: ${fmt(v.total)}`}>
                        {fmt(v.valor_inadimplente)}
                        <span className="text-xs text-muted-foreground ml-1 font-normal">em atraso</span>
                      </span>
                    )
                    : !v.num_parcelas && v.status_pagamento !== 'pago' && v.valor_pago > 0
                      ? (
                        <span title={`Total da venda: ${fmt(v.total)} — Pago: ${fmt(v.valor_pago)}`}>
                          {fmt(v.total - v.valor_pago)}
                          <span className="text-xs text-muted-foreground ml-1 font-normal">restante</span>
                        </span>
                      )
                      : fmt(v.total)}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {v.num_parcelas
                    ? `${v.num_parcelas}x — 1ª ${v.data_vencimento ? fmtDataCurta(v.data_vencimento) : '—'}`
                    : v.data_vencimento ? fmtDataCurta(v.data_vencimento) : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${CORES_STATUS[v.status_pagamento]}`}>
                      {badgeVenda(v)}
                    </span>
                    {(() => {
                      const selo = seloDevolucao(v)
                      return selo ? (
                        <span title={selo.label} className="inline-flex">
                          <RotateCcw className={`w-3.5 h-3.5 ${selo.cor}`} />
                        </span>
                      ) : null
                    })()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => verDetalhes(v.id)} title="Ver detalhes">
                      <Eye className="w-4 h-4" />
                    </Button>
                    {v.status_pagamento !== 'pago' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-green-600 hover:text-green-700"
                        onClick={() => marcarComoPago(v.id)}
                        title="Marcar como pago"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => abrirMenuImprimir(v)}
                      title="Imprimir ou salvar cupom"
                    >
                      <Printer className="w-4 h-4" />
                    </Button>
                    {v.status_pagamento === 'pago' && seloDevolucao(v)?.label !== 'Totalmente devolvida' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-blue-600 hover:text-blue-700"
                        onClick={() => setDevolverVendaId(v.id)}
                        title="Devolução / troca"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
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
        rotuloItem="venda(s)"
      />

      {/* Dialog detalhes da venda */}
      <Dialog open={!!vendaDetalhada} onOpenChange={(open) => !open && setVendaDetalhada(null)}>
        {vendaDetalhada && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Venda #{vendaDetalhada.id}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Cliente: </span>
                  {vendaDetalhada.cliente_nome || 'Avulso'}
                </div>
                <div>
                  <span className="font-medium text-foreground">Vendedor: </span>
                  {vendaDetalhada.vendedor_nome || '—'}
                </div>
                <div>
                  <span className="font-medium text-foreground">Data: </span>
                  {fmtData(vendaDetalhada.data)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Status: </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CORES_STATUS[vendaDetalhada.status_pagamento]}`}>
                    {badgeVenda(vendaDetalhada)}
                  </span>
                  {(() => {
                    const selo = seloDevolucao(vendaDetalhada)
                    return selo ? (
                      <span className={`ml-2 inline-flex items-center gap-1 text-xs font-medium ${selo.cor}`}>
                        <RotateCcw className="w-3.5 h-3.5" />
                        {selo.label}
                      </span>
                    ) : null
                  })()}
                </div>
                {vendaDetalhada.num_parcelas ? (
                  <div>
                    <span className="font-medium text-foreground">Parcelamento: </span>
                    {vendaDetalhada.num_parcelas}x de ≈ {fmt((vendaDetalhada.total - vendaDetalhada.entrada) / vendaDetalhada.num_parcelas)}
                  </div>
                ) : vendaDetalhada.data_vencimento ? (
                  <div>
                    <span className="font-medium text-foreground">Vencimento: </span>
                    {fmtDataCurta(vendaDetalhada.data_vencimento)}
                  </div>
                ) : null}
                {vendaDetalhada.entrada > 0 && (
                  <div>
                    <span className="font-medium text-foreground">Entrada: </span>
                    {fmt(vendaDetalhada.entrada)}
                  </div>
                )}
              </div>

              {/* Itens da venda */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Produto</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qtd</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Unitário</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendaDetalhada.itens.map((item, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                        <td className="px-3 py-2">{item.produto_nome}</td>
                        <td className="px-3 py-2 text-right">{item.quantidade}</td>
                        <td className="px-3 py-2 text-right">{fmt(item.preco_unitario)}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {fmt(item.quantidade * item.preco_unitario)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/50 font-semibold">
                    {vendaDetalhada.desconto > 0 && (
                      <>
                        <tr className="font-normal text-muted-foreground">
                          <td colSpan={3} className="px-3 py-1 text-right">Subtotal</td>
                          <td className="px-3 py-1 text-right">
                            {fmt(vendaDetalhada.total + vendaDetalhada.desconto)}
                          </td>
                        </tr>
                        <tr className="font-normal text-emerald-700">
                          <td colSpan={3} className="px-3 py-1 text-right">Desconto</td>
                          <td className="px-3 py-1 text-right">− {fmt(vendaDetalhada.desconto)}</td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right">Total</td>
                      <td className="px-3 py-2 text-right">{fmt(vendaDetalhada.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagamento parcial — apenas para venda a prazo simples não quitada */}
              {vendaDetalhada.status_pagamento !== 'pago' && !vendaDetalhada.num_parcelas && (
                <div className="border rounded-lg p-3 space-y-2.5 bg-muted/20">
                  <p className="font-medium text-sm">Registrar Pagamento</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor total</span>
                    <span>{fmt(vendaDetalhada.total)}</span>
                  </div>
                  {vendaDetalhada.valor_pago > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Já pago</span>
                      <span className="text-green-600 font-medium">{fmt(vendaDetalhada.valor_pago)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold border-t pt-2">
                    <span>Restante</span>
                    <span className="text-destructive">
                      {fmt(Math.max(0, vendaDetalhada.total - vendaDetalhada.valor_pago))}
                    </span>
                  </div>
                  {vendaDetalhada.valor_pago > 0 && (
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="bg-green-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (vendaDetalhada.valor_pago / vendaDetalhada.total) * 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="flex gap-2 pt-0.5">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={valorPagamento}
                      onChange={(e) => { setValorPagamento(e.target.value); setErroPagamento('') }}
                      placeholder="Valor recebido"
                      className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button
                      size="sm"
                      onClick={() => registrarPagamento(vendaDetalhada.id)}
                      disabled={salvandoPagamento}
                    >
                      {salvandoPagamento ? 'Salvando...' : 'Registrar'}
                    </Button>
                  </div>
                  {erroPagamento && (
                    <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">
                      {erroPagamento}
                    </p>
                  )}
                </div>
              )}

              {/* Parcelas — visível apenas para vendas parceladas */}
              {vendaDetalhada.parcelas.length > 0 && (
                <div>
                  <p className="font-medium mb-1.5">Parcelas</p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10">#</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Vencimento</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Valor</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                          <th className="w-10 px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {vendaDetalhada.parcelas.map((p, i) => (
                          <tr key={p.id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                            <td className="px-3 py-2 text-muted-foreground">{p.numero}</td>
                            <td className="px-3 py-2">{fmtDataCurta(p.data_vencimento)}</td>
                            <td className="px-3 py-2 text-right font-medium">{fmt(p.valor)}</td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CORES_PARCELA[p.status]}`}>
                                {p.status === 'pago' ? 'Pago' : p.status === 'inadimplente' ? 'Atrasado' : 'Pendente'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {p.status !== 'pago' && (
                                <button
                                  onClick={() => pagarParcela(p.id)}
                                  title="Marcar parcela como paga"
                                  className="text-green-600 hover:text-green-700 transition-colors"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {vendaDetalhada.status_pagamento === 'pago' && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const id = vendaDetalhada.id
                    setVendaDetalhada(null)
                    setDevolverVendaId(id)
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Devolução / troca
                </Button>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Menu: o que imprimir (compra ou comprovante de devolução) */}
      <Dialog open={!!menuImprimir} onOpenChange={(open) => !open && setMenuImprimir(null)}>
        {menuImprimir && (
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {menuImprimir.devolucoes.length > 0 ? 'Cupom ou comprovante?' : 'Cupom da venda'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {/* Cupom da compra */}
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <Printer className="w-4 h-4 shrink-0 text-muted-foreground" />
                  Cupom da compra
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      imprimirCupom(menuImprimir.vendaId)
                      setMenuImprimir(null)
                    }}
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5" />
                    Imprimir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      salvarPdfCupom(menuImprimir.vendaId)
                      setMenuImprimir(null)
                    }}
                  >
                    <FileDown className="w-3.5 h-3.5 mr-1.5" />
                    Salvar PDF
                  </Button>
                </div>
              </div>

              {/* Comprovantes de devolução */}
              {menuImprimir.devolucoes.map((dev) => (
                <div key={dev.id} className="rounded-lg border p-3">
                  <div className="flex items-start gap-2 text-sm font-medium mb-2 leading-snug">
                    <RotateCcw className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />
                    <span>
                      Devolução Nº {String(dev.id).padStart(3, '0')} — {fmt(dev.valor_total)}{' '}
                      ({dev.tipo === 'credito' ? 'crédito' : 'dinheiro'})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        imprimirComprovanteDevolucao(dev)
                        setMenuImprimir(null)
                      }}
                    >
                      <Printer className="w-3.5 h-3.5 mr-1.5" />
                      Imprimir
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        salvarPdfComprovanteDevolucao(dev)
                        setMenuImprimir(null)
                      }}
                    >
                      <FileDown className="w-3.5 h-3.5 mr-1.5" />
                      Salvar PDF
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Relatório do mês: escolhe o mês, o conteúdo e gera em PDF ou impressão */}
      <Dialog open={relatorioAberto} onOpenChange={(open) => !open && setRelatorioAberto(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Relatório de {relMes ? rotuloMes(relMes) : 'vendas'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Mês de referência</p>
              <MesPicker
                value={relMes}
                onChange={setRelMes}
                maxMes={mesMaximo}
                placeholder="Selecione o mês"
              />
              {relMes && (
                <p className="text-xs text-muted-foreground">
                  {vendasDoMesRelatorio.length === 0
                    ? 'Nenhuma venda neste mês.'
                    : `${vendasDoMesRelatorio.length} venda(s) no mês.`}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <button
                onClick={() => setRelIncluiProdutos(false)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  !relIncluiProdutos ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
                }`}
              >
                <p className="text-sm font-medium">Resumo gerencial</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Faturamento, ticket médio, totais por status e por vendedor, e a lista das vendas.
                </p>
              </button>
              <button
                onClick={() => setRelIncluiProdutos(true)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  relIncluiProdutos ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
                }`}
              >
                <p className="text-sm font-medium">Resumo + produtos mais vendidos</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tudo do resumo, mais o ranking de produtos vendidos no mês.
                </p>
              </button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => gerarRelatorio('pdf')}
                disabled={gerandoRelatorio || !relMes || vendasDoMesRelatorio.length === 0}
              >
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                Salvar PDF
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => gerarRelatorio('imprimir')}
                disabled={gerandoRelatorio || !relMes || vendasDoMesRelatorio.length === 0}
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" />
                Imprimir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ModalDevolucao
        vendaId={devolverVendaId}
        ehDono={ehDono}
        onClose={() => setDevolverVendaId(null)}
        onConcluido={carregar}
      />
    </div>
  )
}

// ─── PDV (Ponto de Venda) ─────────────────────────────────────────────────────

const PDV: FC<{ onSair: () => void }> = ({ onSair }) => {
  const { setAtivo: setPdvAtivo } = usePdvMode()
  const { ehDono } = useSessao()
  const { showToast } = useToast()
  const [tetoDesconto, setTetoDesconto] = useState(10)
  const [modalElevarAberto, setModalElevarAberto] = useState(false)
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [clienteId, setClienteId] = useState('')
  const [statusPagamento, setStatusPagamento] = useState<StatusPagamento>('pago')
  const [creditoDisponivel, setCreditoDisponivel] = useState(0)
  const [usarCredito, setUsarCredito] = useState(false)
  const [dataVencimento, setDataVencimento] = useState('')
  const [numParcelas, setNumParcelas] = useState(2)
  const [entradaInput, setEntradaInput] = useState('')
  const [descontoTipo, setDescontoTipo] = useState<'R$' | '%'>('R$')
  const [descontoEntrada, setDescontoEntrada] = useState('')
  const [codigoScan, setCodigoScan] = useState('')
  const [feedbackScan, setFeedbackScan] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [buscaProdutos, setBuscaProdutos] = useState(false)
  const [termoBusca, setTermoBusca] = useState('')
  const [consultaPrecoAberta, setConsultaPrecoAberta] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const clienteSeletorRef = useRef<ClienteSeletorHandle>(null)

  useEffect(() => {
    setPdvAtivo(true)
    return () => setPdvAtivo(false)
  }, [setPdvAtivo])

  // Cadastro rápido de cliente
  const [modalClienteAberto, setModalClienteAberto] = useState(false)
  const [tipoPessoaRapido, setTipoPessoaRapido] = useState<'fisica' | 'juridica'>('fisica')
  const [nomeClienteRapido, setNomeClienteRapido] = useState('')
  const [telefoneClienteRapido, setTelefoneClienteRapido] = useState('')
  const [cnpjClienteRapido, setCnpjClienteRapido] = useState('')
  const [razaoSocialRapido, setRazaoSocialRapido] = useState('')
  const [erroCliente, setErroCliente] = useState('')
  const [salvandoCliente, setSalvandoCliente] = useState(false)

  useEffect(() => {
    Promise.all([
      window.api.clientes.listar(),
      window.api.produtos.listar(),
      window.api.auth.lerTetoDesconto()
    ]).then(([rClientes, rProdutos, rTeto]) => {
      if (rClientes.success) setClientes(rClientes.data as Cliente[])
      if (rProdutos.success) setProdutos(rProdutos.data as Produto[])
      if (rTeto.success) setTetoDesconto(rTeto.data)
    })
    scanRef.current?.focus()
  }, [])

  // Saldo de crédito do cliente selecionado (pra oferecer "usar crédito" no à
  // vista). Reseta o toggle ao trocar de cliente.
  useEffect(() => {
    setUsarCredito(false)
    if (!clienteId) {
      setCreditoDisponivel(0)
      return
    }
    window.api.devolucoes.saldoCredito(parseInt(clienteId)).then((r) => {
      if (r.success) setCreditoDisponivel(r.data)
    })
  }, [clienteId])

  // Refs para callbacks usadas pelos atalhos — evita re-registrar o listener
  // a cada keystroke. As funções capturam estado via closure e são atualizadas
  // a cada render através de um useEffect mais abaixo.
  const finalizarVendaRef = useRef<() => void>(() => {})
  const abrirClienteRapidoRef = useRef<() => void>(() => {})
  const onSairRef = useRef(onSair)
  useEffect(() => { onSairRef.current = onSair }, [onSair])

  const subtotal = carrinho.reduce((acc, item) => acc + item.quantidade * item.preco_unitario, 0)
  const totalItens = carrinho.reduce((acc, item) => acc + item.quantidade, 0)

  const descontoNum = parseFloat(descontoEntrada.replace(',', '.')) || 0
  const descontoValor =
    descontoTipo === '%'
      ? +((subtotal * Math.min(100, Math.max(0, descontoNum))) / 100).toFixed(2)
      : +Math.min(subtotal, Math.max(0, descontoNum)).toFixed(2)
  const total = +(subtotal - descontoValor).toFixed(2)

  // Crédito da loja só abate no à vista. Aplica o menor entre saldo e total.
  const creditoAplicado =
    usarCredito && statusPagamento === 'pago' ? +Math.min(creditoDisponivel, total).toFixed(2) : 0
  const aPagar = +(total - creditoAplicado).toFixed(2)

  // Entrada paga no ato — só em parcelado/a prazo. O que sobra (valorFinanciado)
  // é o que vai pras parcelas ou fica devido na data de vencimento.
  const entradaNum = parseFloat(entradaInput.replace(',', '.')) || 0
  const entradaValor =
    statusPagamento !== 'pago' ? +Math.min(total, Math.max(0, entradaNum)).toFixed(2) : 0
  const valorFinanciado = +(total - entradaValor).toFixed(2)

  // Adiciona ao carrinho. `variacao` definida = vende aquele tamanho (baixa o
  // estoque dele); null = produto simples. A linha do carrinho é única por tamanho.
  const adicionarItem = (produto: Produto, variacao: Variacao | null) => {
    const estoque = variacao ? variacao.estoque : produto.estoque
    const nomeExib = variacao ? `${produto.nome} (${variacao.tamanho})` : produto.nome
    const codigo = variacao ? variacao.codigo_barras : (produto.codigo_barras ?? '')
    const variacaoId = variacao ? variacao.id : null
    const k = chaveItem(produto.id, variacaoId)

    if (estoque <= 0) {
      setFeedbackScan({ tipo: 'erro', msg: `"${nomeExib}" está sem estoque.` })
      setTimeout(() => setFeedbackScan(null), 3000)
      return
    }
    const existente = carrinho.find((item) => chaveItem(item.produto_id, item.variacao_id) === k)
    if (existente && existente.quantidade >= estoque) {
      setFeedbackScan({ tipo: 'erro', msg: `Limite de estoque atingido para "${nomeExib}" (máx ${estoque}).` })
      setTimeout(() => setFeedbackScan(null), 3000)
      return
    }
    setCarrinho((prev) => {
      const ex = prev.find((item) => chaveItem(item.produto_id, item.variacao_id) === k)
      if (ex) {
        return prev.map((item) =>
          chaveItem(item.produto_id, item.variacao_id) === k
            ? { ...item, quantidade: item.quantidade + 1 }
            : item
        )
      }
      return [
        ...prev,
        {
          produto_id: produto.id,
          variacao_id: variacaoId,
          tamanho: variacao ? variacao.tamanho : null,
          codigo_barras: codigo,
          nome: nomeExib,
          preco_unitario: produto.preco,
          quantidade: 1,
          estoque_disponivel: estoque
        }
      ]
    })
    setFeedbackScan({ tipo: 'ok', msg: `✓ ${nomeExib}` })
    setTimeout(() => setFeedbackScan(null), 2000)
  }

  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const codigo = codigoScan.trim()
    if (!codigo) return

    setCodigoScan('')
    const resp = await window.api.produtos.buscarPorCodigoBarras(codigo)

    if (resp.success && resp.data) {
      const r = resp.data as Produto & { variacao_encontrada: Variacao | null }
      adicionarItem(r, r.variacao_encontrada)
    } else {
      setFeedbackScan({ tipo: 'erro', msg: `Código "${codigo}" não encontrado.` })
      setTimeout(() => setFeedbackScan(null), 3000)
    }
    scanRef.current?.focus()
  }

  const atualizarQtd = (k: string, qtd: number) => {
    if (qtd <= 0) {
      setCarrinho((prev) => prev.filter((item) => chaveItem(item.produto_id, item.variacao_id) !== k))
    } else {
      setCarrinho((prev) =>
        prev.map((item) => {
          if (chaveItem(item.produto_id, item.variacao_id) !== k) return item
          return { ...item, quantidade: Math.min(qtd, item.estoque_disponivel) }
        })
      )
    }
  }

  const atualizarPreco = (k: string, preco: number) => {
    if (isNaN(preco) || preco < 0) return
    setCarrinho((prev) =>
      prev.map((item) =>
        chaveItem(item.produto_id, item.variacao_id) === k ? { ...item, preco_unitario: preco } : item
      )
    )
  }

  // % de desconto efetivo aplicado — usado pra checar contra o teto do vendedor
  const descontoPctReal = subtotal > 0 ? (descontoValor / subtotal) * 100 : 0
  const descontoAcimaDoTeto = !ehDono && descontoValor > 0 && descontoPctReal > tetoDesconto

  // Zera o PDV para a próxima venda sem sair da tela — mantém o caixa fluido
  // quando há fila. Limpar o cliente reseta crédito/usarCredito via efeito.
  const limparParaProximaVenda = () => {
    setCarrinho([])
    setClienteId('')
    setStatusPagamento('pago')
    setDataVencimento('')
    setNumParcelas(2)
    setEntradaInput('')
    setDescontoTipo('R$')
    setDescontoEntrada('')
    setCodigoScan('')
    setErro('')
    setFeedbackScan(null)
    scanRef.current?.focus()
  }

  // Imprime o cupom direto da venda recém-criada (criarVenda já devolve itens,
  // parcelas e vendedor) — evita uma ida extra ao banco e não sai do caixa.
  const imprimirCupomVenda = async (venda: VendaDetalhada) => {
    const loja = await obterDadosLoja()
    const html = gerarHtmlCupomVenda(venda, loja)
    const r = await window.api.impressao.imprimir(html, nomeImpressao.cupomVenda(venda.id))
    if (!r.success) {
      showToast({ message: `Erro ao imprimir: ${r.error}`, variant: 'destructive' })
    }
  }

  const persistirVenda = async () => {
    setSalvando(true)
    setErro('')

    // vendedor_id é forçado no backend a partir da sessão — passamos 0 só pra
    // satisfazer o tipo, o handler ignora.
    const dados = {
      cliente_id: clienteId ? parseInt(clienteId) : null,
      vendedor_id: 0,
      status_pagamento: statusPagamento,
      data_vencimento: dataVencimento || null,
      num_parcelas: statusPagamento === 'parcelado' ? numParcelas : null,
      desconto: descontoValor,
      entrada: entradaValor,
      valor_credito_usado: creditoAplicado,
      itens: carrinho.map((item) => ({
        produto_id: item.produto_id,
        variacao_id: item.variacao_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario
      }))
    }

    const resp = await window.api.vendas.criar(dados)
    if (resp.success) {
      const venda = resp.data as VendaDetalhada | null
      limparParaProximaVenda()
      setSalvando(false)
      showToast({
        message: venda?.id ? `Venda #${venda.id} registrada.` : 'Venda registrada.',
        variant: 'success',
        action: venda
          ? {
              label: 'Imprimir cupom',
              icon: <Printer className="w-3 h-3" />,
              onClick: () => imprimirCupomVenda(venda)
            }
          : undefined
      })
    } else {
      setErro(resp.error)
      setSalvando(false)
    }
  }

  const finalizarVenda = async () => {
    if (carrinho.length === 0) { setErro('Adicione pelo menos um produto.'); return }
    if (statusPagamento !== 'pago' && !clienteId) {
      setErro('Selecione um cliente para vendas a prazo ou parceladas.')
      return
    }
    if (statusPagamento !== 'pago' && !dataVencimento) {
      setErro(
        statusPagamento === 'parcelado'
          ? 'Informe a data de vencimento da 1ª parcela.'
          : 'Informe a data de vencimento para pagamentos pendentes.'
      )
      return
    }
    if (statusPagamento === 'parcelado' && (numParcelas < 2 || numParcelas > 24)) {
      setErro('O número de parcelas deve ser entre 2 e 24.')
      return
    }
    if (descontoTipo === '%' && descontoNum > 100) {
      setErro('Desconto em percentual não pode passar de 100%.')
      return
    }
    if (descontoValor >= subtotal && subtotal > 0) {
      setErro('Desconto não pode ser maior ou igual ao subtotal da venda.')
      return
    }
    if (statusPagamento !== 'pago' && entradaValor >= total && total > 0) {
      setErro('A entrada não pode ser igual ou maior que o total. Para receber tudo agora, use "À vista".')
      return
    }

    // Vendedor (não-dono) só finaliza desconto acima do teto se um dono autorizar
    if (descontoAcimaDoTeto) {
      setErro('')
      setModalElevarAberto(true)
      return
    }

    await persistirVenda()
  }

  // Mantém os refs atualizados para o listener global de atalhos chamar
  // as versões mais recentes das funções (que capturam estado via closure).
  useEffect(() => {
    finalizarVendaRef.current = finalizarVenda
    abrirClienteRapidoRef.current = abrirClienteRapido
  })

  // Atalhos de teclado do PDV — registrados uma vez no mount.
  // Usar refs evita re-registrar listeners a cada keystroke do usuário.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Não interfere com atalhos globais (ex: Ctrl+L = bloquear sistema)
      if (e.ctrlKey || e.altKey || e.metaKey) return

      switch (e.key) {
        case 'F2':
          e.preventDefault()
          setConsultaPrecoAberta(true)
          break
        case 'F3':
          e.preventDefault()
          setBuscaProdutos(true)
          setTermoBusca('')
          break
        case 'F4':
          e.preventDefault()
          clienteSeletorRef.current?.abrir()
          break
        case 'F5':
          e.preventDefault()
          abrirClienteRapidoRef.current()
          break
        case 'F9':
          e.preventDefault()
          finalizarVendaRef.current()
          break
        case 'Escape':
          // Se algum modal estiver aberto, deixa o Radix fechá-lo (não previne).
          // Só sai do PDV se nada estiver aberto.
          if (consultaPrecoAberta || buscaProdutos || modalClienteAberto) return
          e.preventDefault()
          onSairRef.current()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [consultaPrecoAberta, buscaProdutos, modalClienteAberto])

  const abrirClienteRapido = () => {
    setTipoPessoaRapido('fisica')
    setNomeClienteRapido('')
    setTelefoneClienteRapido('')
    setCnpjClienteRapido('')
    setRazaoSocialRapido('')
    setErroCliente('')
    setModalClienteAberto(true)
  }

  const salvarClienteRapido = async () => {
    if (!nomeClienteRapido.trim()) { setErroCliente('O nome é obrigatório.'); return }
    if (telefoneClienteRapido.replace(/\D/g, '').length !== 11) {
      setErroCliente('Telefone incompleto. Preencha no formato (00) 9.0000-0000.')
      return
    }
    if (tipoPessoaRapido === 'juridica') {
      if (!cnpjClienteRapido.trim()) {
        setErroCliente('O CNPJ é obrigatório para clientes empresa.')
        return
      }
      if (cnpjClienteRapido.replace(/\D/g, '').length !== 14) {
        setErroCliente('CNPJ incompleto. Preencha todos os 14 dígitos.')
        return
      }
      if (!validarCNPJ(cnpjClienteRapido)) {
        setErroCliente('CNPJ inválido. Verifique os números digitados.')
        return
      }
    }
    setSalvandoCliente(true)
    setErroCliente('')
    const ehPj = tipoPessoaRapido === 'juridica'
    const resp = await window.api.clientes.criar({
      nome: nomeClienteRapido.trim(),
      telefone: telefoneClienteRapido,
      endereco: null,
      cpf: null,
      data_nascimento: null,
      tipo_pessoa: tipoPessoaRapido,
      cnpj: ehPj ? cnpjClienteRapido : null,
      razao_social: ehPj ? (razaoSocialRapido.trim() || null) : null,
      observacao: null,
    })
    if (resp.success) {
      const novoCliente = resp.data as Cliente
      const rClientes = await window.api.clientes.listar()
      if (rClientes.success) setClientes(rClientes.data as Cliente[])
      setClienteId(String(novoCliente.id))
      setModalClienteAberto(false)
    } else {
      setErroCliente(resp.error)
    }
    setSalvandoCliente(false)
  }

  const produtosFiltrados = produtos.filter(
    (p) =>
      p.nome.toLowerCase().includes(termoBusca.toLowerCase()) ||
      (p.codigo_barras ?? '').includes(termoBusca) ||
      p.variacoes.some((v) => v.codigo_barras.includes(termoBusca))
  )

  return (
    <div className="flex flex-col h-full">
    <div className="flex flex-1 min-h-0">
      {/* ── Painel esquerdo: scanner + carrinho ── */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={onSair}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-[2rem] font-bold">CAIXA ABERTO</h2>
        </div>

        <div className="mb-3">
          <Label className="text-xs text-muted-foreground mb-1 block">
            Leitor de código de barras (Enter para adicionar)
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={scanRef}
                value={codigoScan}
                onChange={(e) => setCodigoScan(e.target.value)}
                onKeyDown={handleScan}
                placeholder="Aponte o leitor ou digite o código de barras..."
                className="flex h-10 w-full rounded-md border-2 border-primary bg-background px-3 py-2 pl-9 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button variant="outline" onClick={() => { setBuscaProdutos(true); setTermoBusca('') }}>
              <ShoppingCart className="w-4 h-4 mr-2" />
              Buscar produto
            </Button>
          </div>
          {feedbackScan && (
            <p className={`text-sm mt-1 font-medium ${feedbackScan.tipo === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
              {feedbackScan.msg}
            </p>
          )}
        </div>

        {/* Carrinho */}
        <div className="flex-1 border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Produto</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">Qtd</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Unitário</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">Subtotal</th>
                <th className="w-10 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {carrinho.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-muted-foreground">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Carrinho vazio. Escaneie um produto para começar.
                  </td>
                </tr>
              )}
              {carrinho.map((item, i) => {
                const k = chaveItem(item.produto_id, item.variacao_id)
                return (
                <tr key={k} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="px-3 py-2 font-medium">
                    <div>{item.nome}</div>
                    <div className="text-xs text-muted-foreground font-mono">{item.codigo_barras}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="number"
                      min="1"
                      max={item.estoque_disponivel}
                      value={item.quantidade}
                      onChange={(e) => atualizarQtd(k, parseInt(e.target.value) || 0)}
                      className="w-16 text-center border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="text-xs text-muted-foreground mt-0.5">/ {item.estoque_disponivel}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.preco_unitario}
                      onChange={(e) => atualizarPreco(k, parseFloat(e.target.value))}
                      className="w-24 text-right border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {fmt(item.quantidade * item.preco_unitario)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => atualizarQtd(k, 0)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Painel direito: resumo + pagamento ── */}
      <div className="w-96 border-l bg-muted/20 flex flex-col p-5 gap-4 shrink-0 overflow-y-auto">
        {/* Cliente */}
        <div>
          <Label className="text-xs mb-1 block">
            Cliente
            {statusPagamento !== 'pago'
              ? <span className="text-destructive ml-0.5">*</span>
              : <span className="text-muted-foreground ml-1">(opcional)</span>
            }
          </Label>
          <div className="flex gap-2">
            <ClienteSeletor
              ref={clienteSeletorRef}
              clientes={clientes}
              clienteIdSelecionado={clienteId}
              onChange={setClienteId}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={abrirClienteRapido}
              title="Cadastrar novo cliente"
              className="shrink-0"
            >
              <UserPlus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Desconto */}
        <div>
          <Label className="text-xs mb-1 block">Desconto</Label>
          <div className="flex gap-2">
            <div className="flex p-0.5 bg-muted rounded-md shrink-0">
              <button
                type="button"
                onClick={() => setDescontoTipo('R$')}
                className={`flex items-center justify-center w-9 h-9 rounded text-xs font-medium transition-colors ${
                  descontoTipo === 'R$' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Desconto em reais"
              >
                <DollarSign className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setDescontoTipo('%')}
                className={`flex items-center justify-center w-9 h-9 rounded text-xs font-medium transition-colors ${
                  descontoTipo === '%' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Desconto em porcentagem"
              >
                <Percent className="w-4 h-4" />
              </button>
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
              max={descontoTipo === '%' ? 100 : subtotal}
              value={descontoEntrada}
              onChange={(e) => { setDescontoEntrada(e.target.value); setErro('') }}
              placeholder={descontoTipo === '%' ? '0%' : 'R$ 0,00'}
              className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {!ehDono && (
            <p className={`text-[11px] mt-1 ${descontoAcimaDoTeto ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
              Teto sem PIN do dono: {tetoDesconto}%
              {descontoAcimaDoTeto && ' — vai exigir autorização ao finalizar'}
            </p>
          )}
        </div>

        {/* Usar crédito da loja — só à vista, cliente com saldo */}
        {statusPagamento === 'pago' && clienteId && creditoDisponivel > 0 && (
          <label
            className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer text-sm transition-colors ${
              usarCredito ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-background hover:bg-muted/30'
            }`}
          >
            <input
              type="checkbox"
              checked={usarCredito}
              onChange={(e) => setUsarCredito(e.target.checked)}
              className="w-4 h-4"
            />
            <Wallet className="w-4 h-4 shrink-0" />
            <div className="flex-1">
              <div className="font-medium">Usar crédito do cliente</div>
              <div className="text-xs opacity-80">Saldo disponível: {fmt(creditoDisponivel)}</div>
            </div>
          </label>
        )}

        {/* Resumo numérico */}
        <div className="border rounded-lg p-4 bg-background space-y-2 text-base">
          <div className="flex justify-between text-muted-foreground text-sm">
            <span>Produtos</span>
            <span>{carrinho.length} tipo(s) — {totalItens} un.</span>
          </div>
          {descontoValor > 0 && (
            <>
              <div className="flex justify-between text-sm pt-1 border-t">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-700">
                <span>Desconto{descontoTipo === '%' && descontoNum > 0 ? ` (${descontoNum}%)` : ''}</span>
                <span>− {fmt(descontoValor)}</span>
              </div>
            </>
          )}
          <div className={`flex justify-between font-bold text-[2rem] pt-2 ${descontoValor > 0 ? '' : 'border-t'}`}>
            <span>TOTAL</span>
            <span>{fmt(total)}</span>
          </div>
          {creditoAplicado > 0 && (
            <>
              <div className="flex justify-between text-sm text-blue-600 pt-1 border-t">
                <span>Crédito do cliente</span>
                <span>− {fmt(creditoAplicado)}</span>
              </div>
              <div className="flex justify-between font-bold text-xl">
                <span>A PAGAR</span>
                <span>{fmt(aPagar)}</span>
              </div>
            </>
          )}
          {entradaValor > 0 && (
            <div className="flex justify-between text-sm text-emerald-700 pt-1 border-t">
              <span>Entrada (agora)</span>
              <span>− {fmt(entradaValor)}</span>
            </div>
          )}
          {entradaValor > 0 && (
            <div className="flex justify-between text-sm font-medium">
              <span>{statusPagamento === 'parcelado' ? 'Restante (a parcelar)' : 'Restante (a prazo)'}</span>
              <span>{fmt(valorFinanciado)}</span>
            </div>
          )}
          {statusPagamento === 'parcelado' && valorFinanciado > 0 && numParcelas >= 2 && (
            <div className="flex justify-between text-sm text-blue-600 font-medium pt-0.5">
              <span>{numParcelas}x de</span>
              <span>≈ {fmt(valorFinanciado / numParcelas)}</span>
            </div>
          )}
        </div>

        {/* Forma de pagamento */}
        <div>
          <Label className="text-xs mb-2 block">Forma de pagamento</Label>
          <div className="space-y-1.5">
            {(['pago', 'pendente', 'parcelado'] as StatusPagamento[]).map((s) => (
              <label
                key={s}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                  statusPagamento === s
                    ? CORES_STATUS[s] + ' border-current font-medium'
                    : 'bg-background hover:bg-muted/30'
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={statusPagamento === s}
                  onChange={() => { setStatusPagamento(s); setErro(''); if (s === 'pago') setEntradaInput('') }}
                  className="hidden"
                />
                <span
                  className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                    statusPagamento === s ? 'bg-current border-current' : 'border-muted-foreground'
                  }`}
                />
                {LABEL_FORMA_PAGAMENTO[s]}
              </label>
            ))}
          </div>
        </div>

        {/* Entrada — paga no ato, abate do valor financiado (parcelado) ou
            devido (a prazo). Não aparece no à vista. */}
        {statusPagamento !== 'pago' && (
          <div>
            <Label htmlFor="entrada" className="text-xs mb-1 block">
              Entrada <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                R$
              </span>
              <input
                id="entrada"
                type="number"
                min="0"
                step="0.01"
                max={total}
                value={entradaInput}
                onChange={(e) => { setEntradaInput(e.target.value); setErro('') }}
                placeholder="0,00"
                className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <p className="text-[11px] mt-1 text-muted-foreground">
              {statusPagamento === 'parcelado'
                ? 'Pago agora; o restante é dividido nas parcelas.'
                : 'Pago agora; o restante fica devido no vencimento.'}
            </p>
          </div>
        )}

        {/* Número de parcelas (apenas para parcelado) */}
        {statusPagamento === 'parcelado' && (
          <div>
            <Label htmlFor="num-parcelas" className="text-xs mb-1 block">
              Número de parcelas <span className="text-destructive">*</span>
            </Label>
            <input
              id="num-parcelas"
              type="number"
              min={2}
              max={24}
              value={numParcelas}
              onChange={(e) =>
                setNumParcelas(Math.max(2, Math.min(24, parseInt(e.target.value) || 2)))
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}

        {/* Data de vencimento */}
        {statusPagamento !== 'pago' && (
          <div>
            <Label htmlFor="vencimento" className="text-xs mb-1 block">
              {statusPagamento === 'parcelado' ? '1ª parcela — vencimento' : 'Data de vencimento'}
              {' '}<span className="text-destructive">*</span>
            </Label>
            <Input
              id="vencimento"
              type="date"
              value={dataVencimento}
              onChange={(e) => setDataVencimento(e.target.value)}
            />
          </div>
        )}

        {erro && (
          <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erro}</p>
        )}

        <div className="mt-auto space-y-2">
          <Button
            className="w-full"
            onClick={finalizarVenda}
            disabled={salvando || carrinho.length === 0}
          >
            {salvando
              ? 'Registrando...'
              : statusPagamento === 'pago'
                ? `Finalizar — ${fmt(aPagar)}`
                : entradaValor > 0
                  ? `Finalizar — entrada ${fmt(entradaValor)}`
                  : 'Finalizar venda'}
          </Button>
          <Button variant="outline" className="w-full" onClick={onSair}>
            Cancelar
          </Button>
        </div>
      </div>

      {/* ── Dialog: cadastro rápido de cliente ── */}
      <Dialog open={modalClienteAberto} onOpenChange={setModalClienteAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cadastro Rápido de Cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            O cliente será cadastrado e já ficará selecionado na venda.
            Dados adicionais podem ser completados depois em <strong>Clientes</strong>.
          </p>
          <div className="grid gap-3 py-1">
            {/* Toggle PF/PJ */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => { setTipoPessoaRapido('fisica'); setErroCliente('') }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  tipoPessoaRapido === 'fisica'
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <User className="w-4 h-4" />
                Física
              </button>
              <button
                type="button"
                onClick={() => { setTipoPessoaRapido('juridica'); setErroCliente('') }}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  tipoPessoaRapido === 'juridica'
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Building2 className="w-4 h-4" />
                Jurídica
              </button>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nome-cliente-rapido">
                {tipoPessoaRapido === 'juridica' ? 'Nome Fantasia' : 'Nome'} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome-cliente-rapido"
                value={nomeClienteRapido}
                onChange={(e) => setNomeClienteRapido(e.target.value)}
                placeholder={tipoPessoaRapido === 'juridica' ? 'Nome fantasia ou contato' : 'Nome completo do cliente'}
                autoFocus
              />
            </div>

            {tipoPessoaRapido === 'juridica' && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="razao-social-rapido">Razão Social (opcional)</Label>
                  <Input
                    id="razao-social-rapido"
                    value={razaoSocialRapido}
                    onChange={(e) => setRazaoSocialRapido(e.target.value)}
                    placeholder="Razão social da empresa"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cnpj-cliente-rapido">
                    CNPJ <span className="text-destructive">*</span>
                  </Label>
                  <IMaskInput
                    id="cnpj-cliente-rapido"
                    mask="00.000.000/0000-00"
                    value={cnpjClienteRapido}
                    onAccept={(valor: string) => setCnpjClienteRapido(valor)}
                    placeholder="00.000.000/0000-00"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="telefone-cliente-rapido">
                Telefone <span className="text-destructive">*</span>
              </Label>
              <IMaskInput
                id="telefone-cliente-rapido"
                mask="(00) 0.0000-0000"
                value={telefoneClienteRapido}
                onAccept={(valor: string) => setTelefoneClienteRapido(valor)}
                placeholder="(00) 9.0000-0000"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            {erroCliente && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">
                {erroCliente}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalClienteAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarClienteRapido} disabled={salvandoCliente}>
              {salvandoCliente ? 'Salvando...' : 'Cadastrar Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: busca manual de produto ── */}
      <Dialog open={buscaProdutos} onOpenChange={setBuscaProdutos}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buscar Produto</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Nome ou código de barras..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            {produtosFiltrados.slice(0, 50).map((p, i) => {
              // Produto de grade: o clique não adiciona direto — o lojista escolhe o
              // tamanho nos chips (cada um mostra o estoque e baixa do tamanho certo).
              if (p.variacoes.length > 0) {
                return (
                  <div key={p.id} className={`px-3 py-2.5 text-sm ${i > 0 ? 'border-t' : ''}`}>
                    <div className="flex justify-between items-center gap-3">
                      <div className="font-medium">{p.nome}</div>
                      <div className="font-semibold shrink-0">{fmt(p.preco)}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {p.variacoes.map((v) => (
                        <button
                          key={v.id}
                          disabled={v.estoque === 0}
                          onClick={() => {
                            adicionarItem(p, v)
                            setBuscaProdutos(false)
                            scanRef.current?.focus()
                          }}
                          className={`px-2 py-1 rounded border text-xs font-medium transition-colors ${
                            v.estoque === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent'
                          }`}
                          title={v.estoque === 0 ? `${v.tamanho} sem estoque` : `Adicionar ${v.tamanho} (${v.estoque} em estoque)`}
                        >
                          {v.tamanho} · {v.estoque}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              }
              return (
                <button
                  key={p.id}
                  disabled={p.estoque === 0}
                  onClick={() => {
                    adicionarItem(p, null)
                    setBuscaProdutos(false)
                    scanRef.current?.focus()
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex justify-between items-center ${
                    i > 0 ? 'border-t' : ''
                  } ${p.estoque === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent'}`}
                >
                  <div>
                    <div className="font-medium">{p.nome}</div>
                    <div className="text-xs text-muted-foreground font-mono">{p.codigo_barras}</div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="font-semibold">{fmt(p.preco)}</div>
                    <div className={`text-xs ${p.estoque === 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {p.estoque} em estoque
                    </div>
                  </div>
                </button>
              )
            })}
            {produtosFiltrados.length === 0 && (
              <p className="text-center py-8 text-muted-foreground text-sm">
                Nenhum produto encontrado.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Consulta de preço (F2) ── */}
      <ConsultaPreco
        aberto={consultaPrecoAberta}
        onFechar={() => { setConsultaPrecoAberta(false); scanRef.current?.focus() }}
        produtos={produtos}
      />

      {/* ── Autorização do dono pra desconto acima do teto ── */}
      <ModalElevarPrivilegio
        aberto={modalElevarAberto}
        onClose={() => setModalElevarAberto(false)}
        onAutorizar={() => {
          setModalElevarAberto(false)
          persistirVenda()
        }}
        motivo={`O desconto aplicado (${descontoPctReal.toFixed(1)}%) ultrapassa o teto de ${tetoDesconto}% sem PIN do dono. Peça pra um dono digitar o PIN dele pra autorizar esta venda.`}
      />
    </div>

      {/* ── Barra de dicas com atalhos (estilo PDV antigo) ── */}
      <div className="shrink-0 bg-slate-900 text-slate-300 text-xs px-4 py-1.5 flex items-center justify-center gap-5 flex-wrap select-none">
        <DicaTecla tecla="F2" acao="Consulta preço" />
        <DicaTecla tecla="F3" acao="Buscar produto" />
        <DicaTecla tecla="F4" acao="Cliente" />
        <DicaTecla tecla="F5" acao="+ Cliente" />
        <DicaTecla tecla="F9" acao="Finalizar" />
        <DicaTecla tecla="ESC" acao="Sair" />
      </div>
    </div>
  )
}

const DicaTecla: FC<{ tecla: string; acao: string }> = ({ tecla, acao }) => (
  <span className="flex items-center gap-1.5">
    <kbd className="px-1.5 py-0.5 bg-slate-700 border border-slate-600 rounded text-[10px] font-mono text-slate-100">
      {tecla}
    </kbd>
    <span>{acao}</span>
  </span>
)

export default Vendas
