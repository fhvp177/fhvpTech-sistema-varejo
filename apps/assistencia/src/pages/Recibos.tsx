import { FC, useEffect, useMemo, useState } from 'react'
import { IMaskInput } from 'react-imask'
import { Plus, Printer, FileDown, Ban, Search, ReceiptText, AlertTriangle } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Input } from '@fhvptech/core/ui/input'
import { Label } from '@fhvptech/core/ui/label'
import { useToast } from '@fhvptech/core/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import Paginacao from '@fhvptech/core/ui/paginacao'
import { useImprimir } from '@/components/ImpressaoProvider'
import { CampoCpfCnpj, CampoRg } from '@/components/CamposDocumento'
import { Select } from '@fhvptech/core/ui/select'
import CidadeSeletor from '@/components/CidadeSeletor'
import { obterDadosLoja } from '@/utils/dadosLoja'
import { montarRecibo } from '@/utils/documentoRecibo'
import { valorPorExtenso } from '@/utils/valorPorExtenso'
import { nomeImpressao } from '@/utils/nomeImpressao'
import { useSessao } from '@/App'

const ITENS_POR_PAGINA = 15

type Recibo = {
  id: number
  numero: number
  valor: number
  recebedor_nome: string
  recebedor_documento: string | null
  recebedor_rg: string | null
  pagador_nome: string
  pagador_documento: string | null
  pagador_rg: string | null
  pagador_cliente_id: number | null
  referente: string
  cidade: string | null
  uf: string | null
  data_recibo: string
  observacao: string | null
  cancelado: number
  cancelado_em: string | null
  cancelado_motivo: string | null
  criado_em: string
}

type Cliente = { id: number; nome: string; cpf: string | null; cnpj: string | null }

type Form = {
  valor: string
  recebedor_nome: string
  recebedor_documento: string
  recebedor_rg: string
  pagador_cliente_id: string // '' = digitado à mão
  pagador_nome: string
  pagador_documento: string
  pagador_rg: string
  referente: string
  cidade: string
  data_recibo: string
  observacao: string
}

const hoje = (): string => {
  // Data LOCAL. `toISOString()` devolveria UTC e, à noite, gravaria o recibo
  // com a data de amanhã.
  const d = new Date()
  const dois = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

const FORM_VAZIO: Form = {
  valor: '',
  recebedor_nome: '',
  recebedor_documento: '',
  recebedor_rg: '',
  pagador_cliente_id: '',
  pagador_nome: '',
  pagador_documento: '',
  pagador_rg: '',
  referente: '',
  cidade: '',
  data_recibo: hoje(),
  observacao: ''
}

const fmt = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtData = (iso: string): string =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—'

/** "1.234,56" (o que a pessoa digita) → 1234.56. */
const parseValor = (s: string): number => {
  const limpo = s.replace(/\./g, '').replace(',', '.')
  const n = Number.parseFloat(limpo)
  return Number.isFinite(n) ? n : NaN
}

const Recibos: FC = () => {
  const { ehDono } = useSessao()
  const { showToast } = useToast()
  const imprimir = useImprimir()

  const [lista, setLista] = useState<Recibo[]>([])
  const [meses, setMeses] = useState<string[]>([])
  const [mes, setMes] = useState('') // '' = últimos emitidos
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)

  const [clientes, setClientes] = useState<Cliente[]>([])
  // Estado da cidade do recibo. Estreita a busca do seletor E vai pro documento,
  // que imprime "PACOTI - CEARÁ": nome de cidade pequena não identifica o lugar
  // sozinho. Começa no do estabelecimento e acompanha o que for escolhido.
  const [ufDaBusca, setUfDaBusca] = useState('')
  const [proximo, setProximo] = useState<number | null>(null)

  const [dialogAberto, setDialogAberto] = useState(false)
  const [form, setForm] = useState<Form>(FORM_VAZIO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [cancelando, setCancelando] = useState<Recibo | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [erroCancelamento, setErroCancelamento] = useState('')

  const carregar = async (mesAlvo = mes) => {
    const [r, rm, rp] = await Promise.all([
      window.api.recibos.listar(mesAlvo || undefined),
      window.api.recibos.meses(),
      window.api.recibos.proximoNumero()
    ])
    if (r.success) setLista(r.data as Recibo[])
    if (rm.success) setMeses(rm.data as string[])
    if (rp.success) setProximo(rp.data as number)
  }

  useEffect(() => {
    carregar()
    window.api.clientes.listar().then((r) => {
      if (r.success) setClientes(r.data as Cliente[])
    })
  }, [])

  useEffect(() => {
    setPagina(1)
  }, [busca, mes])

  const listaFiltrada = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return lista
    return lista.filter(
      (r) =>
        String(r.numero).includes(t) ||
        r.pagador_nome.toLowerCase().includes(t) ||
        r.recebedor_nome.toLowerCase().includes(t) ||
        r.referente.toLowerCase().includes(t)
    )
  }, [lista, busca])

  const paginada = listaFiltrada.slice((pagina - 1) * ITENS_POR_PAGINA, pagina * ITENS_POR_PAGINA)

  // Prévia do extenso enquanto o valor é digitado. É o campo que ninguém
  // confere depois de impresso, então ele aparece ANTES de imprimir.
  const valorDigitado = parseValor(form.valor)
  const previaExtenso =
    Number.isFinite(valorDigitado) && valorDigitado > 0 ? valorPorExtenso(valorDigitado) : ''

  const abrirNovo = async () => {
    setErro('')
    const loja = await obterDadosLoja()
    setForm({
      ...FORM_VAZIO,
      data_recibo: hoje(),
      // Quem recebe é a loja, quase sempre — mas continua editável, porque às
      // vezes quem assina é o técnico em nome próprio.
      recebedor_nome: loja.razao_social || loja.nome,
      recebedor_documento: loja.cnpj,
      cidade: loja.cidade
    })
    setUfDaBusca(loja.uf)
    setDialogAberto(true)
  }

  const escolherCliente = (id: string) => {
    const c = clientes.find((x) => String(x.id) === id)
    setForm((f) => ({
      ...f,
      pagador_cliente_id: id,
      // Puxa o que o cadastro tem; o que não tiver, quem emite completa. Os
      // dados vão CONGELADOS no recibo — mudar o cliente depois não reescreve
      // o papel que já foi assinado.
      pagador_nome: c ? c.nome : '',
      pagador_documento: c ? (c.cpf || c.cnpj || '') : ''
    }))
  }

  const salvar = async () => {
    setErro('')
    const valor = parseValor(form.valor)
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro('Informe um valor maior que zero.')
      return
    }
    if (!form.recebedor_nome.trim()) {
      setErro('Informe quem está recebendo.')
      return
    }
    if (!form.pagador_nome.trim()) {
      setErro('Informe quem está pagando.')
      return
    }
    if (!form.referente.trim()) {
      setErro('Diga a que se refere o pagamento — é o que o recibo declara.')
      return
    }

    setSalvando(true)
    const r = await window.api.recibos.criar({
      valor,
      recebedor_nome: form.recebedor_nome,
      recebedor_documento: form.recebedor_documento,
      recebedor_rg: form.recebedor_rg,
      pagador_nome: form.pagador_nome,
      pagador_documento: form.pagador_documento,
      pagador_rg: form.pagador_rg,
      pagador_cliente_id: form.pagador_cliente_id ? Number(form.pagador_cliente_id) : null,
      referente: form.referente,
      cidade: form.cidade,
      uf: ufDaBusca,
      data_recibo: form.data_recibo,
      observacao: form.observacao
    })
    setSalvando(false)
    if (!r.success) {
      setErro(r.error)
      return
    }

    const recibo = r.data as Recibo
    setDialogAberto(false)
    await carregar()
    showToast({ message: `Recibo nº ${recibo.numero} emitido.` })
    // Imprime na sequência: o papel é o produto desta tela, e quem emitiu está
    // com a pessoa na frente esperando para assinar.
    await gerarImpressao(recibo)
  }

  const htmlDe = async (recibo: Recibo): Promise<string> =>
    montarRecibo(await obterDadosLoja(), recibo)

  const gerarImpressao = async (recibo: Recibo) => {
    await imprimir(await htmlDe(recibo), nomeImpressao.recibo(recibo.numero), 'documento')
  }

  const gerarPdf = async (recibo: Recibo) => {
    const r = await window.api.impressao.salvarPdf(
      await htmlDe(recibo),
      nomeImpressao.recibo(recibo.numero),
      'documento'
    )
    if (!r.success) {
      showToast({ message: `Erro ao gerar PDF: ${r.error}`, variant: 'destructive' })
    }
  }

  const confirmarCancelamento = async () => {
    if (!cancelando) return
    setErroCancelamento('')
    if (motivoCancelamento.trim().length < 5) {
      setErroCancelamento('Diga em poucas palavras por que este recibo está sendo cancelado.')
      return
    }
    const r = await window.api.recibos.cancelar({
      numero: cancelando.numero,
      motivo: motivoCancelamento.trim()
    })
    if (!r.success) {
      setErroCancelamento(r.error)
      return
    }
    setCancelando(null)
    setMotivoCancelamento('')
    await carregar()
    showToast({ message: 'Recibo cancelado.' })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ReceiptText className="w-6 h-6 text-primary" />
            Recibos
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Comprovante de dinheiro que entrou fora do caixa — adiantamento, acerto, aluguel.
            Venda tem cupom e nota fiscal.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="w-4 h-4 mr-1.5" />
          Novo recibo
          {proximo != null && (
            <span className="ml-1.5 text-xs opacity-75">nº {proximo}</span>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por número, nome ou motivo…"
            className="pl-9"
          />
        </div>
        <Select
          value={mes}
          onChange={(v) => {
            setMes(v)
            carregar(v)
          }}
          placeholder="Últimos emitidos"
          className="w-48"
          opcoes={[
            { valor: '', rotulo: 'Últimos emitidos' },
            ...meses.map((m) => ({ valor: m, rotulo: `${m.slice(5, 7)}/${m.slice(0, 4)}` }))
          ]}
        />
      </div>

      {listaFiltrada.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-muted-foreground">
          <ReceiptText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {lista.length === 0
              ? 'Nenhum recibo emitido ainda.'
              : 'Nenhum recibo encontrado com esse filtro.'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-medium">Nº</th>
                <th className="px-4 py-2.5 font-medium">Data</th>
                <th className="px-4 py-2.5 font-medium">Recebido de</th>
                <th className="px-4 py-2.5 font-medium">Referente a</th>
                <th className="px-4 py-2.5 font-medium text-right">Valor</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginada.map((r) => (
                <tr key={r.id} className={r.cancelado ? 'opacity-60' : ''}>
                  <td className="px-4 py-3 font-mono">{r.numero}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtData(r.data_recibo)}</td>
                  <td className="px-4 py-3">
                    <div className={`truncate max-w-[220px] ${r.cancelado ? 'line-through' : ''}`}>
                      {r.pagador_nome}
                    </div>
                    {r.cancelado === 1 && (
                      <div
                        className="text-xs text-destructive flex items-center gap-1"
                        title={r.cancelado_motivo ?? ''}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Cancelado
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="truncate max-w-[280px]" title={r.referente}>
                      {r.referente}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                    {fmt(r.valor)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => gerarImpressao(r)}
                        title="Imprimir (2ª via)"
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => gerarPdf(r)}
                        title="Salvar em PDF"
                      >
                        <FileDown className="w-4 h-4" />
                      </Button>
                      {ehDono && !r.cancelado && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setCancelando(r)
                            setMotivoCancelamento('')
                            setErroCancelamento('')
                          }}
                          title="Cancelar recibo"
                        >
                          <Ban className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacao
        paginaAtual={pagina}
        totalItens={listaFiltrada.length}
        itensPorPagina={ITENS_POR_PAGINA}
        onMudarPagina={setPagina}
        rotuloItem="recibo(s)"
      />

      {/* ── Novo recibo ───────────────────────────────────────────────────── */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Novo recibo{proximo != null ? ` — nº ${proximo}` : ''}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="valor">
                  Valor <span className="text-destructive">*</span>
                </Label>
                <IMaskInput
                  id="valor"
                  mask={Number}
                  scale={2}
                  radix=","
                  thousandsSeparator="."
                  padFractionalZeros
                  normalizeZeros={false}
                  value={form.valor}
                  onAccept={(v: string) => setForm((f) => ({ ...f, valor: v }))}
                  placeholder="0,00"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="data_recibo">
                  Data do recibo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="data_recibo"
                  type="date"
                  value={form.data_recibo}
                  onChange={(e) => setForm((f) => ({ ...f, data_recibo: e.target.value }))}
                />
              </div>
            </div>

            {/* O extenso aparece ANTES de imprimir porque é ele que vale se
                discordar do algarismo — e é o campo que ninguém relê no papel. */}
            {previaExtenso && (
              <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs">
                <span className="text-muted-foreground">Por extenso: </span>
                <span className="font-medium">{previaExtenso}</span>
              </div>
            )}

            <div className="border-t pt-3 space-y-3">
              <p className="text-sm font-medium">Quem está pagando</p>
              <div className="grid gap-1.5">
                <Label htmlFor="pagador_cliente">Cliente cadastrado (opcional)</Label>
                <Select
                  id="pagador_cliente"
                  value={form.pagador_cliente_id}
                  onChange={escolherCliente}
                  placeholder="— digitar à mão —"
                  opcoes={[
                    { valor: '', rotulo: '— digitar à mão —' },
                    ...clientes.map((c) => ({
                      valor: String(c.id),
                      rotulo: c.nome,
                      detalhe: c.cpf || c.cnpj || undefined
                    }))
                  ]}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pagador_nome">
                  Nome <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pagador_nome"
                  value={form.pagador_nome}
                  onChange={(e) => setForm((f) => ({ ...f, pagador_nome: e.target.value }))}
                  placeholder="Nome completo de quem pagou"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pagador_documento">CPF / CNPJ (opcional)</Label>
                  <CampoCpfCnpj
                    id="pagador_documento"
                    value={form.pagador_documento}
                    onChange={(v) => setForm((f) => ({ ...f, pagador_documento: v }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pagador_rg">RG (opcional)</Label>
                  <CampoRg
                    id="pagador_rg"
                    value={form.pagador_rg}
                    onChange={(v) => setForm((f) => ({ ...f, pagador_rg: v }))}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-sm font-medium">Quem está recebendo</p>
              <div className="grid gap-1.5">
                <Label htmlFor="recebedor_nome">
                  Nome <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="recebedor_nome"
                  value={form.recebedor_nome}
                  onChange={(e) => setForm((f) => ({ ...f, recebedor_nome: e.target.value }))}
                  placeholder="Vem da loja; troque se quem assina for outra pessoa"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="recebedor_documento">CPF / CNPJ (opcional)</Label>
                  <CampoCpfCnpj
                    id="recebedor_documento"
                    value={form.recebedor_documento}
                    onChange={(v) => setForm((f) => ({ ...f, recebedor_documento: v }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="recebedor_rg">RG (opcional)</Label>
                  <CampoRg
                    id="recebedor_rg"
                    value={form.recebedor_rg}
                    onChange={(v) => setForm((f) => ({ ...f, recebedor_rg: v }))}
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="referente">
                  Referente a <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="referente"
                  value={form.referente}
                  onChange={(e) => setForm((f) => ({ ...f, referente: e.target.value }))}
                  placeholder="ex.: adiantamento do conserto do notebook Dell"
                />
                <p className="text-xs text-muted-foreground">
                  É o que o recibo declara ter sido pago. Sem isso, o papel diz que recebeu
                  dinheiro sem dizer por quê.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="cidade">Cidade</Label>
                  {/* Mesma busca dos dados da loja, alimentada pela lista do
                      IBGE embutida no app — não vai à rede. Escolher a cidade
                      traz o estado junto, e é o par que o recibo imprime. */}
                  <CidadeSeletor
                    cidade={form.cidade}
                    uf={ufDaBusca}
                    onDigitar={(v) => setForm((f) => ({ ...f, cidade: v }))}
                    onSelecionar={(c, u) => {
                      setForm((f) => ({ ...f, cidade: c }))
                      setUfDaBusca(u)
                    }}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="observacao">Observação (opcional)</Label>
                  <Input
                    id="observacao"
                    value={form.observacao}
                    onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {erro && <p className="text-sm text-destructive">{erro}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Emitindo…' : 'Emitir e imprimir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancelamento ──────────────────────────────────────────────────── */}
      <Dialog open={cancelando !== null} onOpenChange={(a) => !a && setCancelando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar o recibo nº {cancelando?.numero}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              O número <strong>não volta para a fila</strong>. Recibo é papel que pode já ter
              saído da loja — reaproveitar o número faria existirem dois documentos diferentes
              com a mesma identificação. O buraco na sequência, com o motivo registrado, é o que
              conta a verdade depois.
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="motivo">Motivo</Label>
              <Input
                id="motivo"
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                placeholder="ex.: valor digitado errado"
              />
            </div>
            {erroCancelamento && <p className="text-destructive">{erroCancelamento}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelando(null)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={confirmarCancelamento}>
              Cancelar recibo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Recibos
