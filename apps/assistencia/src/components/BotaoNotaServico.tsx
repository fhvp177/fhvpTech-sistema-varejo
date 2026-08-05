import { FC, useState } from 'react'
import { AlertTriangle, Check, Clock, FileText, Landmark, Loader2, X } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { useImprimirPdf } from '@/components/ImpressaoProvider'
import { nomeImpressao } from '@/utils/nomeImpressao'

/**
 * Emissão da NFS-e de uma venda que teve serviço.
 *
 * Fica ao lado do botão da nota de mercadoria, e não dentro dele, porque numa
 * venda mista as DUAS notas existem ao mesmo tempo: a peça é tributada pelo
 * estado, a mão de obra pelo município. Juntar os dois num botão só obrigaria o
 * lojista a escolher entre notas que na verdade se somam.
 *
 * Como na NFC-e, emitir é SEMPRE pós-venda gravada: prefeitura fora do ar não
 * trava o caixa — a nota fica "processando" e o botão permite consultar depois.
 */

type Props = {
  vendaId: number
  nota: NotaServicoVenda | null
  onMudou: (nota: NotaServicoVenda | null) => void
  /** Cancelar documento fiscal é decisão do gerente, não de balcão. */
  ehDono?: boolean
}

const BotaoNotaServico: FC<Props> = ({ vendaId, nota, onMudou, ehDono = false }) => {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [painelAberto, setPainelAberto] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const imprimirPdf = useImprimirPdf()

  const emitir = async () => {
    setOcupado(true)
    setErro('')
    const r = await window.api.fiscal.emitirNfse({ vendaId })
    setOcupado(false)
    if (!r.success) {
      setErro(r.error)
      return
    }
    onMudou(r.data.nota)
    // A prefeitura responde em segundos, mas não na mesma requisição. Uma
    // consulta rápida tira o "processando" da tela sozinha na maioria das vezes.
    if (r.data.nota?.status === 'processando') {
      setTimeout(async () => {
        const s = await window.api.fiscal.statusNfse({ vendaId })
        if (s.success) onMudou(s.data)
      }, 2500)
    }
  }

  const consultar = async () => {
    setOcupado(true)
    const r = await window.api.fiscal.statusNfse({ vendaId })
    setOcupado(false)
    if (r.success) onMudou(r.data)
    else setErro(r.error)
  }

  const imprimir = async () => {
    setOcupado(true)
    setErro('')
    const r = await window.api.fiscal.danfse({ vendaId })
    setOcupado(false)
    if (!r.success) {
      setErro(r.error)
      return
    }
    // DANFSE é documento A4 — nunca vai na bobina do cupom.
    await imprimirPdf(r.data.pdfBase64, nomeImpressao.notaServico(vendaId), 'documento')
  }

  const cancelar = async () => {
    setOcupado(true)
    setErro('')
    const r = await window.api.fiscal.cancelarNfse({ vendaId, justificativa })
    setOcupado(false)
    if (!r.success) {
      setErro(r.error)
      return
    }
    onMudou(r.data)
    setPainelAberto(false)
    setJustificativa('')
  }

  // ── Aparência por estado ────────────────────────────────────────────────────
  if (!nota || nota.status === 'negada' || nota.status === 'erro') {
    return (
      <div className="inline-flex flex-col items-start gap-1">
        <Button variant="outline" size="sm" onClick={emitir} disabled={ocupado}>
          {ocupado ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Landmark className="w-3.5 h-3.5 mr-1.5" />
          )}
          {nota ? 'Tentar nota de serviço' : 'Nota de serviço'}
        </Button>
        {(erro || nota?.motivo) && (
          <span className="text-[11px] text-destructive max-w-[260px]">
            {erro || nota?.motivo}
          </span>
        )}
      </div>
    )
  }

  if (nota.status === 'processando') {
    return (
      <Button variant="outline" size="sm" onClick={consultar} disabled={ocupado}>
        {ocupado ? (
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
        ) : (
          <Clock className="w-3.5 h-3.5 mr-1.5" />
        )}
        Aguardando a prefeitura
      </Button>
    )
  }

  if (nota.status === 'cancelada' || nota.status === 'substituida') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <X className="w-3.5 h-3.5" />
        Nota de serviço {nota.status}
      </span>
    )
  }

  // autorizada
  return (
    <>
      <button
        type="button"
        onClick={() => setPainelAberto(true)}
        className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:underline"
      >
        <Check className="w-3.5 h-3.5" />
        Nota de serviço {nota.numero > 0 ? `nº ${nota.numero}` : 'autorizada'}
      </button>

      <Dialog open={painelAberto} onOpenChange={setPainelAberto}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nota de serviço</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {nota.numero > 0 && (
              <p>
                <span className="text-muted-foreground">Número:</span> {nota.numero}
              </p>
            )}
            {nota.codigo_verificacao && (
              <div>
                <p className="text-muted-foreground text-xs">Código de verificação</p>
                <p className="font-mono text-xs break-all">{nota.codigo_verificacao}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  É com este código que o cliente confere a nota no site da prefeitura.
                </p>
              </div>
            )}

            {erro && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{erro}</p>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={imprimir} disabled={ocupado}>
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Imprimir nota (A4)
            </Button>

            {ehDono && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Cancelar registra o cancelamento na prefeitura. O prazo é curto e varia por
                  município — passado ele, só o contador resolve.
                </p>
                <textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Justificativa (mínimo 15 caracteres)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[70px]"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={cancelar}
                  disabled={ocupado || justificativa.trim().length < 15}
                >
                  Cancelar nota
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPainelAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default BotaoNotaServico
