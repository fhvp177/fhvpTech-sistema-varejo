import { useCallback, useEffect, useState } from 'react'
import { Button } from '@fhvptech/core/ui/button'
import LicencaBloqueada from '@fhvptech/core/ui/LicencaBloqueada'
import ModalPagamentoPix from '@fhvptech/core/ui/ModalPagamentoPix'

type EstadoLicenca = 'verificando' | 'valida' | 'invalida'

// "Porteiro" de licença da veterinária: ao abrir, valida a licença pelo core.
// Vencida → tela de bloqueio + PIX (mesma do varejo, vinda do @fhvptech/core).
// Ainda sem auth/login (auth segue só no varejo por enquanto).
export default function App() {
  const [estadoLicenca, setEstadoLicenca] = useState<EstadoLicenca>('verificando')
  const [mensagemLicenca, setMensagemLicenca] = useState('')
  const [mostrarPagamento, setMostrarPagamento] = useState(false)

  const validarLicenca = useCallback(async (): Promise<void> => {
    const resp = await window.api.licenca.validar()
    if (resp.success) {
      const status = resp.data as { valida: boolean; mensagem: string }
      setMensagemLicenca(status.mensagem)
      setEstadoLicenca(status.valida ? 'valida' : 'invalida')
    } else {
      setMensagemLicenca(resp.error)
      setEstadoLicenca('invalida')
    }
  }, [])

  useEffect(() => {
    validarLicenca()
  }, [validarLicenca])

  if (estadoLicenca === 'verificando') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Verificando licença...</p>
      </div>
    )
  }

  if (estadoLicenca === 'invalida') {
    return (
      <>
        <LicencaBloqueada
          mensagemInicial={mensagemLicenca}
          subtitulo="Sistema de Gestão Veterinária"
          onAtivar={() => setEstadoLicenca('valida')}
          onRenovarComPix={() => setMostrarPagamento(true)}
        />
        <ModalPagamentoPix
          aberto={mostrarPagamento}
          onClose={() => setMostrarPagamento(false)}
          onLicencaRenovada={validarLicenca}
        />
      </>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-2xl font-bold">FHVP Tech — Veterinária 🐾</h1>
      <p className="text-muted-foreground">Licença OK — casca rodando sobre o @fhvptech/core.</p>
      <Button>Botão do UI kit compartilhado</Button>
    </div>
  )
}
