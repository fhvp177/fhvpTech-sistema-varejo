import { FC } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'

export type StatusPagamento = 'pago' | 'pendente' | 'inadimplente' | 'parcelado'

export type VendaDivida = {
  id: number
  cliente_id?: number | null
  data: string
  total: number
  valor_pago: number
  status_pagamento: StatusPagamento
  data_vencimento: string | null
  num_parcelas: number | null
  valor_inadimplente: number
}

const CORES_STATUS: Record<StatusPagamento, string> = {
  pago: 'bg-green-100 text-green-700 border border-green-200',
  pendente: 'bg-amber-100 text-amber-700 border border-amber-200',
  inadimplente: 'bg-red-100 text-red-700 border border-red-200',
  parcelado: 'bg-blue-100 text-blue-700 border border-blue-200'
}

const LABEL_STATUS: Record<StatusPagamento, string> = {
  pago: 'Pago',
  pendente: 'A prazo',
  inadimplente: 'Inadimplente',
  parcelado: 'Parcelado'
}

const fmtMoeda = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const fmtDataIso = (iso: string) =>
  new Date(iso + 'T00:00').toLocaleDateString('pt-BR')

type Props = {
  clienteNome: string | null
  vendas: VendaDivida[]
  totalEmAberto: number
  onFechar: () => void
  // Abre o diálogo de recebimento para uma venda específica. Opcional: quando
  // ausente, o diálogo fica só de leitura (ex.: tela de Clientes).
  onReceber?: (venda: VendaDivida) => void
}

const DividasClienteDialog: FC<Props> = ({ clienteNome, vendas, totalEmAberto, onFechar, onReceber }) => (
  <Dialog open={!!clienteNome} onOpenChange={(open) => !open && onFechar()}>
    {clienteNome && (
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Dívidas de {clienteNome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {vendas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Tudo quitado! Não há mais dívidas em aberto para {clienteNome}. 🎉
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <span className="text-amber-800 font-medium">Total em aberto</span>
                <span className="text-amber-900 font-bold text-xl">{fmtMoeda(totalEmAberto)}</span>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-14">Venda</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Data</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pago</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Restante</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Vencimento</th>
                      {onReceber && <th className="w-24 px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {vendas.map((v, i) => (
                      <tr key={v.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">#{v.id}</td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtDataHora(v.data)}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CORES_STATUS[v.status_pagamento]}`}>
                            {v.num_parcelas
                              ? `${LABEL_STATUS[v.status_pagamento]} (${v.num_parcelas}x)`
                              : LABEL_STATUS[v.status_pagamento]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">{fmtMoeda(v.total)}</td>
                        <td className="px-3 py-2 text-right text-green-600">{fmtMoeda(v.valor_pago)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-destructive">
                          {fmtMoeda(Math.max(0, v.total - v.valor_pago))}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">
                          {v.data_vencimento ? fmtDataIso(v.data_vencimento) : '—'}
                        </td>
                        {onReceber && (
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="outline" onClick={() => onReceber(v)}>
                              Receber
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {onReceber ? (
                <p className="text-xs text-muted-foreground">
                  Use o botão <strong>Receber</strong> em cada venda para registrar o pagamento — total ou parcial,
                  e parcela por parcela nas vendas parceladas.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Para registrar pagamentos ou ver mais detalhes (parcelas, itens), acesse a tela de <strong>Vendas</strong>.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    )}
  </Dialog>
)

// Calcula as dívidas agrupadas por cliente a partir de uma lista de vendas
export function calcularDividasPorCliente(
  vendas: VendaDivida[]
): Map<number, { total: number; vendas: VendaDivida[] }> {
  const map = new Map<number, { total: number; vendas: VendaDivida[] }>()
  for (const v of vendas) {
    if (v.cliente_id == null || v.status_pagamento === 'pago') continue
    const restante = +(v.total - v.valor_pago).toFixed(2)
    if (restante <= 0) continue
    const entry = map.get(v.cliente_id) ?? { total: 0, vendas: [] }
    entry.total += restante
    entry.vendas.push(v)
    map.set(v.cliente_id, entry)
  }
  return map
}

export default DividasClienteDialog
