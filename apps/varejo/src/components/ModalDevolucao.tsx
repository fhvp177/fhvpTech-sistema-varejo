import { FC, useEffect, useMemo, useState } from 'react'
import { Wallet, Banknote, UserPlus, ShieldAlert, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { Button } from '@fhvptech/core/ui/button'
import { Label } from '@fhvptech/core/ui/label'
import { Input } from '@fhvptech/core/ui/input'
import { IMaskInput } from 'react-imask'
import ClienteSeletor from '@/components/ClienteSeletor'
import { useToast } from '@fhvptech/core/ui/toast'
import { useImprimir } from '@/components/ImpressaoProvider'
import { gerarHtmlComprovanteDevolucao } from '@/utils/comprovanteDevolucao'
import { obterDadosLoja } from '@/utils/dadosLoja'

type ItemDevolvivel = {
  item_venda_id: number
  produto_id: number
  produto_nome: string
  quantidade_vendida: number
  quantidade_devolvida: number
  quantidade_disponivel: number
  preco_unitario: number
  valor_unitario_devolvido: number
}

type Cliente = { id: number; nome: string; telefone: string }

type Selecao = { quantidade: number; restocar: boolean }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Props = {
  vendaId: number | null // != null abre o modal
  onClose: () => void
  onConcluido: () => void // pai recarrega a lista
  ehDono: boolean
}

// Modal de devolução/troca (v1). Localiza os itens da venda, deixa escolher
// quantidade + se volta ao estoque, e resolve em crédito na loja (precisa de
// cliente) ou dinheiro de volta (saída de caixa → exige PIN do dono se quem
// opera não é dono). O valor de cada item já vem proporcional ao desconto.
const ModalDevolucao: FC<Props> = ({ vendaId, onClose, onConcluido, ehDono }) => {
  const { showToast } = useToast()
  const imprimir = useImprimir()
  const aberto = vendaId !== null
  // Nota fiscal da venda: devolver mercadoria com nota emitida tem implicação
  // fiscal que o sistema NÃO resolve sozinho — mas também não pode ficar mudo.
  const [notaDaVenda, setNotaDaVenda] = useState<NotaFiscalVenda | null>(null)

  const [carregando, setCarregando] = useState(false)
  const [statusOk, setStatusOk] = useState(true)
  const [itens, setItens] = useState<ItemDevolvivel[]>([])
  const [sel, setSel] = useState<Record<number, Selecao>>({})
  const [tipo, setTipo] = useState<'credito' | 'dinheiro'>('credito')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteCreditoId, setClienteCreditoId] = useState('')
  const [saldoAtual, setSaldoAtual] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [pinDono, setPinDono] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Cadastro rápido (nome + telefone) para o crédito de venda avulsa.
  const [novoAberto, setNovoAberto] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoTel, setNovoTel] = useState('')
  const [erroNovo, setErroNovo] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setCarregando(true)
    setStatusOk(true)
    setItens([])
    setSel({})
    setTipo('credito')
    setClienteCreditoId('')
    setSaldoAtual(null)
    setMotivo('')
    setPinDono('')
    setErro('')
    setSalvando(false)
    Promise.all([
      window.api.devolucoes.itensDevolviveis(vendaId!),
      window.api.vendas.buscarPorId(vendaId!),
      window.api.clientes.listar()
    ]).then(([rItens, rVenda, rClientes]) => {
      if (rItens.success) setItens(rItens.data)
      if (rVenda.success && rVenda.data) {
        const v = rVenda.data as {
          cliente_id: number | null
          status_pagamento: string
        }
        setStatusOk(v.status_pagamento === 'pago')
        if (v.cliente_id) setClienteCreditoId(String(v.cliente_id))
      }
      if (rClientes.success) setClientes(rClientes.data as Cliente[])
      setCarregando(false)
    })

    if (__FEAT_NFE__) {
      window.api.fiscal.notasDasVendas([vendaId!]).then((r) => {
        setNotaDaVenda(r.success ? (r.data[vendaId!] ?? null) : null)
      })
    }
  }, [aberto, vendaId])

  // Saldo de crédito do cliente que vai receber (mostra atual + novo).
  useEffect(() => {
    if (tipo !== 'credito' || !clienteCreditoId) {
      setSaldoAtual(null)
      return
    }
    window.api.devolucoes.saldoCredito(parseInt(clienteCreditoId)).then((r) => {
      if (r.success) setSaldoAtual(r.data)
    })
  }, [tipo, clienteCreditoId])

  const setQtd = (id: number, qtd: number, max: number): void => {
    setErro('')
    setSel((prev) => ({
      ...prev,
      [id]: { quantidade: Math.max(0, Math.min(qtd, max)), restocar: prev[id]?.restocar ?? true }
    }))
  }
  const setRestocar = (id: number, restocar: boolean): void => {
    setSel((prev) => ({
      ...prev,
      [id]: { quantidade: prev[id]?.quantidade ?? 0, restocar }
    }))
  }

  const totalDevolver = useMemo(
    () =>
      +itens
        .reduce((acc, it) => acc + (sel[it.item_venda_id]?.quantidade ?? 0) * it.valor_unitario_devolvido, 0)
        .toFixed(2),
    [itens, sel]
  )
  const algumSelecionado = totalDevolver > 0

  async function salvarNovoCliente(): Promise<void> {
    if (!novoNome.trim()) {
      setErroNovo('Informe o nome.')
      return
    }
    if (novoTel.replace(/\D/g, '').length !== 11) {
      setErroNovo('Telefone incompleto. Use (00) 9.0000-0000.')
      return
    }
    setSalvandoNovo(true)
    setErroNovo('')
    const resp = await window.api.clientes.criar({
      nome: novoNome.trim(),
      telefone: novoTel,
      endereco: null,
      cpf: null,
      data_nascimento: null,
      tipo_pessoa: 'fisica',
      cnpj: null,
      razao_social: null,
      observacao: null
    })
    if (resp.success) {
      const novo = resp.data as Cliente
      const r = await window.api.clientes.listar()
      if (r.success) setClientes(r.data as Cliente[])
      setClienteCreditoId(String(novo.id))
      setNovoAberto(false)
      setNovoNome('')
      setNovoTel('')
    } else {
      setErroNovo(resp.error)
    }
    setSalvandoNovo(false)
  }

  async function confirmar(): Promise<void> {
    setErro('')
    if (!algumSelecionado) {
      setErro('Selecione ao menos um item e a quantidade a devolver.')
      return
    }
    if (tipo === 'credito' && !clienteCreditoId) {
      setErro('Para gerar crédito na loja, selecione ou cadastre o cliente que vai receber.')
      return
    }
    if (tipo === 'dinheiro' && !ehDono && !/^\d{4,6}$/.test(pinDono)) {
      setErro('Devolução em dinheiro exige o PIN de um dono (4 a 6 dígitos).')
      return
    }
    const itensEnviar = itens
      .filter((it) => (sel[it.item_venda_id]?.quantidade ?? 0) > 0)
      .map((it) => ({
        item_venda_id: it.item_venda_id,
        quantidade: sel[it.item_venda_id]!.quantidade,
        restocar: sel[it.item_venda_id]?.restocar ?? true
      }))
    setSalvando(true)
    const resp = await window.api.devolucoes.registrar({
      venda_id: vendaId!,
      tipo,
      cliente_id: tipo === 'credito' ? parseInt(clienteCreditoId) : null,
      motivo: motivo.trim() || null,
      itens: itensEnviar,
      pinDono: tipo === 'dinheiro' && !ehDono ? pinDono : undefined
    })
    setSalvando(false)
    if (resp.success) {
      const dev = resp.data
      const nomeCliente =
        tipo === 'credito'
          ? clientes.find((c) => String(c.id) === clienteCreditoId)?.nome ?? null
          : null
      const itensComprovante = itens
        .filter((it) => (sel[it.item_venda_id]?.quantidade ?? 0) > 0)
        .map((it) => ({
          produto_nome: it.produto_nome,
          quantidade: sel[it.item_venda_id]!.quantidade,
          valor_unitario: it.valor_unitario_devolvido
        }))
      // Imprime o comprovante; não bloqueia nem reverte o sucesso se falhar.
      const loja = await obterDadosLoja()
      imprimir(
        gerarHtmlComprovanteDevolucao({
          id: dev.id,
          venda_id: dev.venda_id,
          data: dev.data,
          tipo: dev.tipo,
          valor_total: dev.valor_total,
          cliente_nome: nomeCliente,
          motivo: dev.motivo,
          saldo_credito_novo:
            tipo === 'credito' && saldoAtual !== null
              ? +(saldoAtual + totalDevolver).toFixed(2)
              : null,
          itens: itensComprovante
        }, loja),
        `comprovante-devolucao-${dev.id}`,
        'cupom'
      )
      showToast({
        message:
          tipo === 'credito'
            ? `Devolução registrada — ${fmt(totalDevolver)} em crédito na loja.`
            : `Devolução registrada — ${fmt(totalDevolver)} em dinheiro.`,
        variant: 'success'
      })
      onConcluido()
      onClose()
    } else {
      setErro(resp.error)
    }
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Devolução — Venda #{vendaId}</DialogTitle>
          </DialogHeader>

          {/* Devolver com nota emitida exige um documento fiscal de entrada,
              que o sistema ainda não emite. Avisar é o mínimo honesto: o
              lojista precisa saber que há uma pendência com o contador. */}
          {notaDaVenda?.status === 'autorizado' && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  Esta venda tem a <strong>nota fiscal nº {notaDaVenda.numero}</strong> autorizada.
                </p>
                <p>
                  A devolução aqui acerta o seu estoque e o dinheiro, mas{' '}
                  <strong>não desfaz a nota</strong>. Combine com o seu contador como registrar
                  esta devolução — normalmente é preciso um documento fiscal de entrada.
                </p>
              </div>
            </div>
          )}

          {carregando ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando itens…</p>
          ) : !statusOk ? (
            <p className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded px-3 py-2">
              Só é possível devolver itens de vendas <strong>totalmente pagas</strong>. Para vendas a
              prazo ou parceladas, fale com o dono.
            </p>
          ) : itens.every((it) => it.quantidade_disponivel <= 0) ? (
            <p className="text-sm bg-muted/40 text-muted-foreground rounded px-3 py-2">
              Todos os itens desta venda já foram devolvidos.
            </p>
          ) : (
            <div className="space-y-4 text-sm">
              {/* Itens devolvíveis */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Produto</th>
                      <th className="text-center px-2 py-2 font-medium w-24">Devolver</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Valor un.</th>
                      <th className="text-center px-2 py-2 font-medium w-20">Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it, i) => {
                      const indisponivel = it.quantidade_disponivel <= 0
                      const s = sel[it.item_venda_id]
                      return (
                        <tr
                          key={it.item_venda_id}
                          className={`${i % 2 ? 'bg-muted/20' : ''} ${indisponivel ? 'opacity-50' : ''}`}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium truncate max-w-[320px]" title={it.produto_nome}>{it.produto_nome}</div>
                            <div className="text-xs text-muted-foreground">
                              Comprou {it.quantidade_vendida}
                              {it.quantidade_devolvida > 0 && ` · já devolveu ${it.quantidade_devolvida}`}
                              {' · '}pode devolver {it.quantidade_disponivel}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              max={it.quantidade_disponivel}
                              disabled={indisponivel}
                              value={s?.quantidade ?? 0}
                              onChange={(e) =>
                                setQtd(it.item_venda_id, parseInt(e.target.value) || 0, it.quantidade_disponivel)
                              }
                              className="w-16 text-center border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:bg-muted"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">{fmt(it.valor_unitario_devolvido)}</td>
                          <td className="px-2 py-2 text-center">
                            <label
                              className="inline-flex items-center gap-1 text-xs cursor-pointer"
                              title="Devolver a unidade ao estoque (desmarque se o item voltou danificado)"
                            >
                              <input
                                type="checkbox"
                                disabled={indisponivel || !s?.quantidade}
                                checked={s?.restocar ?? true}
                                onChange={(e) => setRestocar(it.item_venda_id, e.target.checked)}
                              />
                              repor
                            </label>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Resolução: crédito x dinheiro */}
              <div>
                <Label className="text-xs mb-1.5 block">Como devolver o valor</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setTipo('credito'); setErro('') }}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      tipo === 'credito'
                        ? 'bg-blue-50 text-blue-700 border-blue-300'
                        : 'bg-background hover:bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <Wallet className="w-4 h-4" />
                    Crédito na loja
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTipo('dinheiro'); setErro('') }}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      tipo === 'dinheiro'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-background hover:bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    Dinheiro de volta
                  </button>
                </div>
              </div>

              {/* Crédito → cliente que recebe */}
              {tipo === 'credito' && (
                <div className="space-y-1.5">
                  <Label className="text-xs block">Cliente que recebe o crédito</Label>
                  <div className="flex gap-2">
                    <ClienteSeletor
                      clientes={clientes}
                      clienteIdSelecionado={clienteCreditoId}
                      onChange={setClienteCreditoId}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      title="Cadastro rápido"
                      onClick={() => { setNovoAberto(true); setErroNovo('') }}
                    >
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                  {saldoAtual !== null && (
                    <p className="text-xs text-muted-foreground">
                      Saldo atual: {fmt(saldoAtual)} → após esta devolução:{' '}
                      <span className="font-medium text-foreground">{fmt(saldoAtual + totalDevolver)}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Dinheiro + não-dono → PIN do dono */}
              {tipo === 'dinheiro' && !ehDono && (
                <div className="space-y-1.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <Label className="text-xs flex items-center gap-1.5 text-amber-700">
                    <ShieldAlert className="w-4 h-4" />
                    Saída de dinheiro do caixa exige autorização do dono
                  </Label>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pinDono}
                    onChange={(e) => { setPinDono(e.target.value.replace(/\D/g, '').slice(0, 6)); setErro('') }}
                    placeholder="PIN do dono"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-center tracking-[0.3em] font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              )}

              {/* Motivo (opcional) */}
              <div className="space-y-1.5">
                <Label className="text-xs block">Motivo (opcional)</Label>
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: tamanho errado, presente trocado…"
                />
              </div>

              {erro && (
                <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erro}</p>
              )}
            </div>
          )}

          {statusOk && !carregando && !itens.every((it) => it.quantidade_disponivel <= 0) && (
            <DialogFooter className="items-center sm:justify-between gap-2">
              <div className="text-sm">
                <span className="text-muted-foreground">A devolver: </span>
                <span className="font-bold text-base">{fmt(totalDevolver)}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={salvando}>
                  Cancelar
                </Button>
                <Button onClick={confirmar} disabled={salvando || !algumSelecionado}>
                  {salvando ? 'Registrando…' : 'Confirmar devolução'}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Cadastro rápido de cliente para o crédito */}
      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cadastro rápido</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Crédito é de uma pessoa — informe nome e telefone. Dá pra completar o cadastro depois em
            <strong> Clientes</strong>.
          </p>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="dev-novo-nome">Nome <span className="text-destructive">*</span></Label>
              <Input
                id="dev-novo-nome"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome do cliente"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dev-novo-tel">Telefone <span className="text-destructive">*</span></Label>
              <IMaskInput
                id="dev-novo-tel"
                mask="(00) 0.0000-0000"
                value={novoTel}
                onAccept={(v: string) => setNovoTel(v)}
                placeholder="(00) 9.0000-0000"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            {erroNovo && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erroNovo}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoAberto(false)}>Cancelar</Button>
            <Button onClick={salvarNovoCliente} disabled={salvandoNovo}>
              {salvandoNovo ? 'Salvando…' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default ModalDevolucao
