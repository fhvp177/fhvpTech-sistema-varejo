import { useCallback, useEffect, useState } from 'react'
import { Lock, LogOut } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import LicencaBloqueada from '@fhvptech/core/ui/LicencaBloqueada'
import ModalPagamentoPix from '@fhvptech/core/ui/ModalPagamentoPix'
import LoginSistema from '@fhvptech/core/ui/LoginSistema'
import { useAutoLock } from '@fhvptech/core/lib/useAutoLock'

type EstadoLicenca = 'verificando' | 'valida' | 'invalida'
type EstadoAuth = 'verificando' | 'bloqueado' | 'desbloqueado'

type Sessao = {
  id: number
  nome: string
  ativo: number
  papel: 'dono' | 'funcionario'
  email: string | null
  tem_pin: number
}

// "Porteiro" da veterinária: valida licença e, em seguida, exige login. Ambos os
// motores (licença e auth) vêm do @fhvptech/core. Vencida → bloqueio + PIX;
// sem sessão → tela de login (com PIN no 1º uso e recuperação por email).
export default function App() {
  const [estadoLicenca, setEstadoLicenca] = useState<EstadoLicenca>('verificando')
  const [mensagemLicenca, setMensagemLicenca] = useState('')
  const [mostrarPagamento, setMostrarPagamento] = useState(false)

  const [estadoAuth, setEstadoAuth] = useState<EstadoAuth>('verificando')
  const [autoLockMinutos, setAutoLockMinutos] = useState(15)
  const [sessao, setSessao] = useState<Sessao | null>(null)

  const validarLicenca = useCallback(async (): Promise<void> => {
    const resp = await window.api.licenca.validar()
    if (resp.success) {
      setMensagemLicenca(resp.data.mensagem)
      setEstadoLicenca(resp.data.valida ? 'valida' : 'invalida')
    } else {
      setMensagemLicenca(resp.error)
      setEstadoLicenca('invalida')
    }
  }, [])

  useEffect(() => {
    validarLicenca()
  }, [validarLicenca])

  const recarregarSessao = useCallback(async (): Promise<Sessao | null> => {
    const resp = await window.api.auth.sessaoAtual()
    const s = resp.success ? resp.data : null
    setSessao(s)
    return s
  }, [])

  // Depois que a licença passa, lê auto-lock + sessão pra decidir login/desbloqueio.
  useEffect(() => {
    if (estadoLicenca !== 'valida') return
    ;(async () => {
      const respStatus = await window.api.auth.obterStatus()
      if (respStatus.success) setAutoLockMinutos(respStatus.data.autoLockMinutos)
      const s = await recarregarSessao()
      setEstadoAuth(s ? 'desbloqueado' : 'bloqueado')
    })()
  }, [estadoLicenca, recarregarSessao])

  const bloquear = useCallback(() => {
    // logout é fire-and-forget — a UI já some e o resultado não bloqueia.
    window.api.auth.logout().catch(() => {})
    setSessao(null)
    setEstadoAuth((prev) => (prev === 'desbloqueado' ? 'bloqueado' : prev))
  }, [])

  const aoLogar = useCallback(async () => {
    await recarregarSessao()
    setEstadoAuth('desbloqueado')
  }, [recarregarSessao])

  // Atalho global Ctrl+L bloqueia o sistema imediatamente.
  useEffect(() => {
    if (estadoAuth !== 'desbloqueado') return
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault()
        bloquear()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [estadoAuth, bloquear])

  // Auto-lock por inatividade — só roda quando desbloqueado e tempo > 0.
  useAutoLock(estadoAuth === 'desbloqueado' ? autoLockMinutos : 0, bloquear)

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

  if (estadoAuth === 'verificando') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Verificando acesso...</p>
      </div>
    )
  }

  if (estadoAuth === 'bloqueado') {
    return <LoginSistema onDesbloquear={aoLogar} />
  }

  // Desbloqueado — landing provisória. A modelagem do domínio (pets, tutores,
  // agenda) entra aqui no próximo passo, com sidebar e rotas.
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-2xl font-bold">FHVP Tech — Veterinária 🐾</h1>
      <p className="text-muted-foreground">
        Bem-vindo, <span className="font-semibold">{sessao?.nome}</span>
        {sessao?.papel === 'dono' ? ' (Dono)' : ' (Funcionário)'}.
      </p>
      <Button onClick={bloquear} variant="outline" title="Bloquear (Ctrl+L)">
        <Lock className="w-4 h-4 mr-2" />
        Bloquear
      </Button>
      <button
        onClick={bloquear}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <LogOut className="w-3 h-3" /> Sair
      </button>
    </div>
  )
}
