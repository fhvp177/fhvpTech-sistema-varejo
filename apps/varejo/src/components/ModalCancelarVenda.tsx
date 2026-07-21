import { FC, useEffect, useState } from 'react'
import { Ban } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { useToast } from '@fhvptech/core/ui/toast'

// Cancela (arquiva) uma venda. Espelha a regra do backend (avaliarCancelamento)
// só para a experiência — o backend é a trava de verdade. Dois cenários seguros:
//   • 'virgem'    — nada recebido/devolvido → cancelar devolve o estoque;
//   • 'devolvida' — já devolvida por inteiro → só arquiva.
// Qualquer outro estado é bloqueado com a orientação de usar a devolução.

export type VendaCancelar = {
  id: number
  total: number
  valor_pago: number
  valor_devolvido: number
}

type Props = {
  venda: VendaCancelar | null
  ehDono: boolean
  onFechar: () => void
  onConfirmado: () => void
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ModalCancelarVenda: FC<Props> = ({ venda, ehDono, onFechar, onConfirmado }) => {
  const { showToast } = useToast()
  const [motivo, setMotivo] = useState('')
  const [pin, setPin] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (venda) {
      setMotivo('')
      setPin('')
      setErro('')
    }
  }, [venda])

  const total = venda ? +venda.total.toFixed(2) : 0
  const devolvido = venda ? +venda.valor_devolvido.toFixed(2) : 0
  const pago = venda ? +venda.valor_pago.toFixed(2) : 0
  const cenario: 'virgem' | 'devolvida' | null = !venda
    ? null
    : pago === 0 && devolvido === 0
      ? 'virgem'
      : devolvido >= total
        ? 'devolvida'
        : null
  const bloqueado = venda != null && cenario === null

  const confirmar = async () => {
    if (!venda) return
    if (!motivo.trim()) {
      setErro('Informe o motivo do cancelamento.')
      return
    }
    if (!ehDono && !pin.trim()) {
      setErro('Digite o PIN de um gerente para autorizar.')
      return
    }
    setSalvando(true)
    setErro('')
    const resp = await window.api.vendas.cancelar(venda.id, motivo.trim(), ehDono ? undefined : pin.trim())
    setSalvando(false)
    if (resp.success) {
      showToast({ message: `Venda #${venda.id} cancelada.`, variant: 'success' })
      onConfirmado()
    } else {
      setErro(resp.error)
    }
  }

  return (
    <Dialog open={venda != null} onOpenChange={(open) => !open && onFechar()}>
      {venda && (
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              Cancelar venda #{venda.id}
            </DialogTitle>
          </DialogHeader>

          {bloqueado ? (
            <p className="text-sm text-muted-foreground">
              Esta venda tem valor em aberto (já houve recebimento, ou a devolução foi
              parcial), então não dá para cancelar direto. Faça a <strong>devolução</strong> do
              restante primeiro — ela cuida do estorno do dinheiro — e depois cancele.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {cenario === 'virgem'
                  ? 'Nada foi recebido nesta venda. Cancelar devolve os itens ao estoque e apaga a dívida — a venda some dos relatórios.'
                  : 'Esta venda já foi totalmente devolvida (itens e dinheiro). Cancelar só arquiva o registro: o estoque e o estorno já foram feitos pela devolução.'}
              </p>

              <div className="text-sm flex justify-between border rounded-lg px-3 py-2 bg-muted/20">
                <span className="text-muted-foreground">Valor da venda</span>
                <span className="font-medium">{fmt(venda.total)}</span>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Motivo <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => { setMotivo(e.target.value); setErro('') }}
                  rows={2}
                  placeholder="Ex.: venda lançada por engano, item bipado errado…"
                  className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>

              {!ehDono && (
                <div>
                  <label className="text-sm font-medium">
                    PIN do gerente <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => { setPin(e.target.value); setErro('') }}
                    placeholder="••••"
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Cancelar uma venda exige a autorização de um gerente.
                  </p>
                </div>
              )}

              {erro && (
                <p className="text-destructive text-xs bg-destructive/10 rounded px-2 py-1.5">{erro}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onFechar}>Fechar</Button>
            {!bloqueado && (
              <Button variant="destructive" onClick={confirmar} disabled={salvando}>
                {salvando ? 'Cancelando…' : 'Cancelar venda'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}

export default ModalCancelarVenda
