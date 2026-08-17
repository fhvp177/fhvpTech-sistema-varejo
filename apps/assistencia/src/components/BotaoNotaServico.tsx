import { forwardRef, useImperativeHandle, useState } from 'react'
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
import type { GatilhoNota } from '@/utils/notasDaVenda'

/**
 * Emissão da NFS-e de uma venda que teve serviço.
 *
 * Numa venda mista as DUAS notas existem ao mesmo tempo: a peça é tributada
 * pelo estado, a mão de obra pelo município. Elas se SOMAM — nunca se escolhe
 * entre uma e outra.
 *
 * Quem organiza isso na tela é o `NotasDaVenda`: quando os dois documentos
 * cabem, ele reúne os dois num ícone só e chama este componente pelo ref
 * (`semGatilho`); quando só cabe o serviço, este componente aparece sozinho,
 * com o próprio ícone. Ver a explicação da regra em utils/notasDaVenda.ts.
 *
 * Como na NFC-e, emitir é SEMPRE pós-venda gravada: prefeitura fora do ar não
 * trava o caixa — a nota fica "processando" e dá pra consultar depois.
 */

type Props = {
  vendaId: number
  nota: NotaServicoVenda | null
  onMudou: (nota: NotaServicoVenda | null) => void
  /** Cancelar documento fiscal é decisão do gerente, não de balcão. */
  ehDono?: boolean
  /** Esconde o próprio gatilho — quem abre é o pai, pelo ref. */
  semGatilho?: boolean
}

const BotaoNotaServico = forwardRef<GatilhoNota, Props>(function BotaoNotaServico(
  { vendaId, nota, onMudou, ehDono = false, semGatilho = false },
  ref
) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [painelAberto, setPainelAberto] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  // Dois lugares para dar má notícia, porque são dois momentos diferentes:
  // `erro` aparece DENTRO do painel da nota (falha ao imprimir ou cancelar, com
  // o painel aberto na frente do usuário) e `detalhe` é um diálogo próprio,
  // para o que falha com o painel fechado — emitir e consultar. Um só serviria
  // aos dois casos mal: ou a mensagem apareceria atrás do painel, ou abriria
  // uma caixa por cima de outra.
  const [detalhe, setDetalhe] = useState('')
  const imprimirPdf = useImprimirPdf()

  const emitir = async () => {
    setOcupado(true)
    setDetalhe('')
    const r = await window.api.fiscal.emitirNfse({ vendaId })
    setOcupado(false)
    if (!r.success) {
      setDetalhe(r.error)
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
    else setDetalhe(r.error)
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

  // ── Um clique, um lugar ─────────────────────────────────────────────────────
  // Tudo que este componente faz entra por aqui: o ícone da coluna e a ordem
  // vinda do painel da venda mista chamam a MESMA função. Antes cada estado
  // tinha o seu botão com o seu onClick, e foi assim que ele acabou sendo um
  // botão largo de texto no meio de uma fileira de ícones.
  const clicar = () => {
    if (ocupado) return
    if (!nota || nota.status === 'negada' || nota.status === 'erro') {
      // Nota recusada: mostra o motivo em vez de reemitir no susto — mesma
      // regra da nota de mercadoria. O botão "Tentar novamente" do diálogo é
      // que reemite, e aí é escolha consciente.
      if (nota) {
        setDetalhe(nota.motivo || 'A nota de serviço não foi aceita.')
        return
      }
      emitir()
      return
    }
    if (nota.status === 'processando') {
      consultar()
      return
    }
    if (nota.status === 'autorizada') setPainelAberto(true)
    // cancelada/substituída não têm ação: o documento acabou.
  }

  useImperativeHandle(ref, () => ({ abrir: clicar }))

  // ── Aparência por estado ────────────────────────────────────────────────────
  // Ícone fantasma, como o da nota de mercadoria: a coluna de ações é uma
  // fileira de ícones e um botão de texto no meio dela desalinha a linha
  // inteira. O estado vive na cor e no `title`.
  const aparencia = (): { Icone: typeof Landmark; cor: string; titulo: string } => {
    if (ocupado) return { Icone: Loader2, cor: 'text-muted-foreground', titulo: 'Processando…' }
    if (!nota) {
      return { Icone: Landmark, cor: 'text-muted-foreground', titulo: 'Emitir nota de serviço' }
    }
    switch (nota.status) {
      case 'autorizada':
        return {
          Icone: Check,
          cor: 'text-emerald-600',
          titulo: `Nota de serviço ${nota.numero > 0 ? `nº ${nota.numero} ` : ''}autorizada`
        }
      case 'processando':
        return {
          Icone: Clock,
          cor: 'text-amber-600',
          titulo: 'Aguardando a prefeitura — clique para verificar'
        }
      case 'cancelada':
      case 'substituida':
        return {
          Icone: X,
          cor: 'text-muted-foreground',
          titulo: `Nota de serviço ${nota.status}`
        }
      default:
        return {
          Icone: AlertTriangle,
          cor: 'text-red-600',
          titulo: 'A nota de serviço não foi aceita'
        }
    }
  }

  const { Icone, cor, titulo } = aparencia()

  return (
    <>
      {!semGatilho && (
        <Button
          variant="ghost"
          size="icon"
          className={cor}
          onClick={clicar}
          title={titulo}
          disabled={ocupado}
        >
          <Icone className={`w-4 h-4 ${ocupado ? 'animate-spin' : ''}`} />
        </Button>
      )}

      {/* Motivo da recusa, no mesmo formato da nota de mercadoria. Antes isto
          era um texto vermelho solto embaixo do botão, que esticava a linha da
          tabela — e sumia de vez quando o gatilho não era desenhado. */}
      <Dialog open={detalhe !== ''} onOpenChange={(a) => !a && setDetalhe('')}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>A nota de serviço não foi emitida</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap break-words">{detalhe}</p>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setDetalhe('')
                emitir()
              }}
              disabled={ocupado}
            >
              Tentar novamente
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Painel da nota autorizada. O `nota &&` não é zelo à toa: antes os
          estados eram `return`s separados e o TypeScript sabia que aqui a nota
          existia. Agora o componente tem um corpo só, e sem esta guarda um
          `nota.numero` explodiria se o painel abrisse sem nota. */}
      <Dialog open={painelAberto && nota != null} onOpenChange={setPainelAberto}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nota de serviço</DialogTitle>
          </DialogHeader>
          {nota && (

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
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPainelAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})

export default BotaoNotaServico
