import { FC } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@fhvptech/core/ui/dialog'
import { MessageCircle, Package } from 'lucide-react'

// Detalhe que o popup do sino exibe ao clicar numa notificação. Vem do IPC
// notificacoes:detalhe (ver electron/ipc/notificacoes.ts).
export type RecebivelDetalhe = {
  cliente: string
  telefone: string
  valor: number
  vencimento: string
  origem: string
}
export type ProdutoAlertaDetalhe = { nome: string; estoque: number; dias_parado?: number }

export type DetalheNotificacao =
  | {
      kind: 'recebiveis'
      titulo: string
      criterio: string
      cobranca: 'vence' | 'atraso'
      itens: RecebivelDetalhe[]
    }
  | { kind: 'produtos'; titulo: string; criterio: string; itens: ProdutoAlertaDetalhe[] }

const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDataIso = (iso: string) => new Date(iso + 'T00:00').toLocaleDateString('pt-BR')

// Normaliza o telefone para o formato do wa.me (só dígitos, com DDI 55). Devolve
// null quando não há número utilizável — aí o botão de cobrança fica desabilitado.
function telefoneWhatsapp(tel: string): string | null {
  const d = (tel || '').replace(/\D/g, '')
  if (d.length < 10) return null
  return d.startsWith('55') ? d : '55' + d
}

// Texto FORMAL da cobrança (escolha do lojista). Duas variações: vencimento
// futuro/hoje ("vence em") e em atraso ("em atraso desde").
function mensagemCobranca(
  it: RecebivelDetalhe,
  modo: 'vence' | 'atraso',
  loja: string
): string {
  const valorTxt = fmtMoeda(it.valor)
  const dataTxt = fmtDataIso(it.vencimento)
  const lojaTxt = loja || 'nossa loja'
  if (modo === 'atraso') {
    return (
      `Prezado(a) ${it.cliente},\n\n` +
      `Informamos que consta um pagamento de ${valorTxt} em atraso desde ${dataTxt}, junto à ${lojaTxt}.\n\n` +
      `Atenciosamente.`
    )
  }
  return (
    `Prezado(a) ${it.cliente},\n\n` +
    `Informamos que há um pagamento de ${valorTxt} com vencimento em ${dataTxt} junto à ${lojaTxt}.\n\n` +
    `Atenciosamente.`
  )
}

type Props = {
  detalhe: DetalheNotificacao | null
  nomeLoja: string
  onFechar: () => void
  onVerProdutos: () => void
}

const ModalDetalheNotificacao: FC<Props> = ({ detalhe, nomeLoja, onFechar, onVerProdutos }) => (
  <Dialog open={!!detalhe} onOpenChange={(open) => !open && onFechar()}>
    {detalhe && (
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {detalhe.titulo} ({detalhe.itens.length})
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">{detalhe.criterio}</p>

        {detalhe.itens.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nada por aqui agora ✨</p>
        ) : detalhe.kind === 'recebiveis' ? (
          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
            {detalhe.itens.map((it, i) => {
              const num = telefoneWhatsapp(it.telefone)
              const cobrar = () => {
                if (!num) return
                const msg = mensagemCobranca(it, detalhe.cobranca, nomeLoja)
                window.open(
                  `https://wa.me/${num}?text=${encodeURIComponent(msg)}`,
                  '_blank',
                  'noopener,noreferrer'
                )
              }
              return (
                <li key={i} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{it.cliente}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtMoeda(it.valor)} · {it.origem} · vence {fmtDataIso(it.vencimento)}
                    </p>
                  </div>
                  {num ? (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={cobrar}>
                      <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Cobrar
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground shrink-0 self-center">
                      sem telefone
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <>
            <ul className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">
              {detalhe.itens.map((it, i) => (
                <li key={i} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-800 flex items-center gap-2 min-w-0">
                    <Package className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{it.nome}</span>
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {it.dias_parado != null ? `${it.dias_parado} dias parado` : `${it.estoque} un.`}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end pt-2">
              <Button size="sm" variant="outline" onClick={onVerProdutos}>
                Ver em Produtos
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    )}
  </Dialog>
)

export default ModalDetalheNotificacao
