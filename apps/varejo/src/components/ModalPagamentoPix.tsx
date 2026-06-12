import { FC, useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Loader2, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

// Intervalo entre consultas ao backend enquanto o QR está aberto. 4 segundos
// é confortável pro Worker (no free tier) e rápido o suficiente pro cliente
// não achar que travou após pagar.
const INTERVALO_POLLING_MS = 4000

// Plano único por enquanto. Quando tiver mais opções, vira um seletor.
const PLANO_PADRAO = {
  diasContratados: 30,
  valorCentavos: 8000,
  rotulo: '30 dias'
}

type Props = {
  aberto: boolean
  onClose: () => void
  onLicencaRenovada: () => void
}

const ModalPagamentoPix: FC<Props> = ({ aberto, onClose, onLicencaRenovada }) => {
  const [cobranca, setCobranca] = useState<CobrancaPix | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [ativando, setAtivando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const ativacaoIniciada = useRef(false)

  const criarCobranca = useCallback(async (): Promise<void> => {
    setCarregando(true)
    setErro(null)
    const resp = await window.api.licenca.criarCobranca({
      diasContratados: PLANO_PADRAO.diasContratados,
      valorCentavos: PLANO_PADRAO.valorCentavos
    })
    setCarregando(false)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setCobranca(resp.data)
  }, [])

  // Quando abre, cria a cobrança automaticamente. !erro impede loop infinito
  // se a primeira tentativa falhar — usuário precisa clicar "Tentar novamente".
  useEffect(() => {
    if (aberto && !cobranca && !carregando && !erro) {
      criarCobranca()
    }
    if (!aberto) {
      // Reset ao fechar pra próxima abertura começar do zero.
      setCobranca(null)
      setErro(null)
      setCopiado(false)
      ativacaoIniciada.current = false
    }
  }, [aberto, cobranca, carregando, erro, criarCobranca])

  // Polling enquanto cobrança está pendente.
  useEffect(() => {
    if (!cobranca || cobranca.status !== 'pendente') return
    const timer = setInterval(async () => {
      const resp = await window.api.licenca.consultarCobranca(cobranca.txid)
      if (resp.success) {
        setCobranca(resp.data)
      }
    }, INTERVALO_POLLING_MS)
    return () => clearInterval(timer)
  }, [cobranca])

  // Quando paga + tem chave, ativa licença automaticamente.
  useEffect(() => {
    if (
      cobranca?.status === 'paga' &&
      cobranca.chaveLicencaGerada &&
      !ativacaoIniciada.current
    ) {
      ativacaoIniciada.current = true
      setAtivando(true)
      window.api.licenca.ativar(cobranca.chaveLicencaGerada).then((resp) => {
        setAtivando(false)
        if (resp.success && resp.data.valida) {
          onLicencaRenovada()
        } else {
          setErro(
            resp.success
              ? resp.data.mensagem
              : `Falha ao ativar licença: ${resp.error}`
          )
        }
      })
    }
  }, [cobranca, onLicencaRenovada])

  const copiarPix = async (): Promise<void> => {
    if (!cobranca) return
    try {
      await navigator.clipboard.writeText(cobranca.qrcode)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setErro('Não foi possível copiar — copie manualmente.')
    }
  }

  const valorFormatado =
    cobranca &&
    (cobranca.valorCentavos / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    })

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-emerald-600" />
            Renovar licença via PIX
          </DialogTitle>
        </DialogHeader>

        {carregando && (
          <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Gerando cobrança...</p>
          </div>
        )}

        {erro && !carregando && (
          <div className="py-4 space-y-3">
            <p className="text-sm text-destructive">{erro}</p>
            <Button variant="outline" onClick={criarCobranca} className="w-full">
              Tentar novamente
            </Button>
          </div>
        )}

        {cobranca && !carregando && !erro && cobranca.status === 'pendente' && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{valorFormatado}</p>
              <p className="text-sm text-muted-foreground">
                Plano de {PLANO_PADRAO.rotulo}
              </p>
            </div>

            <div className="flex justify-center bg-white p-4 rounded border">
              <QRCodeSVG value={cobranca.qrcode} size={200} />
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                Abra o app do seu banco e leia o QR Code, ou copie o código abaixo:
              </p>
              <Button
                variant="outline"
                onClick={copiarPix}
                className="w-full font-mono text-xs"
              >
                {copiado ? (
                  <>
                    <Check className="w-4 h-4 mr-2" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" /> Copiar código PIX
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Aguardando confirmação do pagamento...
            </div>
          </div>
        )}

        {cobranca?.status === 'paga' && (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            {ativando ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <p className="font-medium">Pagamento confirmado!</p>
                <p className="text-sm text-muted-foreground">Ativando sua licença...</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="font-medium">Licença renovada com sucesso!</p>
                <p className="text-sm text-muted-foreground">
                  Você já pode usar o sistema normalmente.
                </p>
                <Button onClick={onClose} className="mt-2">
                  Continuar
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default ModalPagamentoPix
