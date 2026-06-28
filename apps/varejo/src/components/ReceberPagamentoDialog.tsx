import { FC, useEffect, useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { useToast } from '@fhvptech/core/ui/toast'

// Recebimento de uma venda em aberto, com o MESMO comportamento da aba Vendas:
// pagamento parcial (venda a prazo), quitação de parcela (venda parcelada) e
// "Desfazer" no toast. Reusa os mesmos canais IPC — só a tela é própria, para
// não mexer no modal crítico da Vendas.

type ParcelaDetalhe = {
  id: number
  numero: number
  valor: number
  data_vencimento: string
  status: 'pendente' | 'pago' | 'inadimplente'
}

type VendaDetalhe = {
  id: number
  total: number
  valor_pago: number
  status_pagamento: 'pago' | 'pendente' | 'inadimplente' | 'parcelado'
  num_parcelas: number | null
  parcelas: ParcelaDetalhe[]
}

const CORES_PARCELA: Record<string, string> = {
  pago: 'bg-green-100 text-green-700',
  pendente: 'bg-amber-100 text-amber-700',
  inadimplente: 'bg-red-100 text-red-700'
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('pt-BR')

type Props = {
  vendaId: number | null
  clienteNome: string
  onFechar: () => void
  // Chamado após qualquer mudança (pagamento ou desfazer) para o pai recarregar
  // os cards/listas do dashboard.
  onMudou: () => void
}

const ReceberPagamentoDialog: FC<Props> = ({ vendaId, clienteNome, onFechar, onMudou }) => {
  const { showToast } = useToast()
  const [venda, setVenda] = useState<VendaDetalhe | null>(null)
  const [valorPagamento, setValorPagamento] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = async (id: number) => {
    const resp = await window.api.vendas.buscarPorId(id)
    if (resp.success && resp.data) {
      const v = resp.data as VendaDetalhe
      setVenda(v)
      const restante = +(v.total - v.valor_pago).toFixed(2)
      setValorPagamento(restante > 0 ? String(restante) : '')
      setErro('')
    }
  }

  useEffect(() => {
    if (vendaId == null) {
      setVenda(null)
      return
    }
    carregar(vendaId)
  }, [vendaId])

  const desfazer = async (id: number, snapshot: SnapshotVenda) => {
    const resp = await window.api.vendas.restaurar(id, snapshot)
    if (!resp.success) {
      showToast({ message: `Não foi possível desfazer: ${resp.error}`, variant: 'destructive' })
      return
    }
    await carregar(id)
    onMudou()
    showToast({ message: 'Pagamento revertido.', variant: 'success' })
  }

  const registrar = async () => {
    if (!venda) return
    const valor = parseFloat(valorPagamento.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) {
      setErro('Informe um valor válido maior que zero.')
      return
    }
    setSalvando(true)
    setErro('')
    const resp = await window.api.vendas.registrarPagamentoParcial(venda.id, valor)
    if (resp.success) {
      await carregar(venda.id)
      onMudou()
      const snapshot = resp.data?.snapshot
      showToast({
        message: `Pagamento de ${fmt(valor)} registrado.`,
        variant: 'success',
        action: snapshot ? { label: 'Desfazer', onClick: () => desfazer(venda.id, snapshot) } : undefined
      })
    } else {
      setErro(resp.error)
    }
    setSalvando(false)
  }

  const pagarParcela = async (parcelaId: number) => {
    if (!venda) return
    const resp = await window.api.vendas.pagarParcela(parcelaId)
    await carregar(venda.id)
    onMudou()
    if (resp.success && resp.data) {
      const { vendaId: vid, snapshot } = resp.data
      showToast({
        message: 'Parcela marcada como paga.',
        variant: 'success',
        action: { label: 'Desfazer', onClick: () => desfazer(vid, snapshot) }
      })
    }
  }

  const restante = venda ? Math.max(0, +(venda.total - venda.valor_pago).toFixed(2)) : 0

  return (
    <Dialog open={vendaId != null} onOpenChange={(open) => !open && onFechar()}>
      {vendaId != null && venda && (
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receber — Venda #{venda.id}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground -mt-1">{clienteNome}</p>

            {/* Resumo do que falta */}
            <div className="border rounded-lg p-3 space-y-2 bg-muted/20 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor total</span>
                <span>{fmt(venda.total)}</span>
              </div>
              {venda.valor_pago > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Já pago</span>
                  <span className="text-green-600 font-medium">{fmt(venda.valor_pago)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Restante</span>
                <span className="text-destructive">{fmt(restante)}</span>
              </div>
              {venda.valor_pago > 0 && (
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (venda.valor_pago / venda.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            {/* Venda a prazo simples (não parcelada): pagamento parcial ou total */}
            {venda.status_pagamento !== 'pago' && !venda.num_parcelas && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={valorPagamento}
                    onChange={(e) => { setValorPagamento(e.target.value); setErro('') }}
                    placeholder="Valor recebido"
                    className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button size="sm" onClick={registrar} disabled={salvando}>
                    {salvando ? 'Salvando...' : 'Registrar'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Para receber tudo, deixe o valor do restante. Para um pagamento parcial, digite quanto recebeu agora.
                </p>
                {erro && (
                  <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erro}</p>
                )}
              </div>
            )}

            {/* Venda parcelada: quitar parcela por parcela */}
            {venda.parcelas.length > 0 && (
              <div>
                <p className="font-medium text-sm mb-1.5">Parcelas</p>
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
                      {venda.parcelas.map((p, i) => (
                        <tr key={p.id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                          <td className="px-3 py-2 text-muted-foreground">{p.numero}</td>
                          <td className="px-3 py-2">{fmtData(p.data_vencimento)}</td>
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

            {venda.status_pagamento === 'pago' && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
                Esta venda está totalmente quitada. 🎉
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onFechar}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}

export default ReceberPagamentoDialog
