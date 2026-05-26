import { FC, useEffect, useState } from 'react'
import { KeyRound, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { useLock } from '@/App'

const OPCOES_AUTO_LOCK: Array<{ valor: number; label: string }> = [
  { valor: 0, label: 'Desativado' },
  { valor: 15, label: '15 minutos' },
  { valor: 30, label: '30 minutos' },
  { valor: 60, label: '1 hora' },
  { valor: 120, label: '2 horas' }
]

const sanitizarPin = (v: string) => v.replace(/\D/g, '').slice(0, 6)

const ConfigSeguranca: FC = () => {
  const { autoLockMinutos, setAutoLockMinutos, bloquear } = useLock()
  const [modalAberto, setModalAberto] = useState(false)
  const [pinAtual, setPinAtual] = useState('')
  const [pinNovo, setPinNovo] = useState('')
  const [pinConfirmacao, setPinConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<string>('')

  useEffect(() => {
    if (modalAberto) {
      setPinAtual('')
      setPinNovo('')
      setPinConfirmacao('')
      setErro('')
    }
  }, [modalAberto])

  const salvarAutoLock = async (minutos: number) => {
    const resp = await window.api.auth.setarAutoLock(minutos)
    if (resp.success) {
      setAutoLockMinutos(minutos)
      if (minutos === 0) {
        setFeedback('Bloqueio automático desativado.')
      } else {
        const label = OPCOES_AUTO_LOCK.find((o) => o.valor === minutos)?.label ?? `${minutos} min`
        setFeedback(`Bloqueio automático ajustado para ${label}.`)
      }
      setTimeout(() => setFeedback(''), 3000)
    }
  }

  const alterarPin = async () => {
    setErro('')
    if (!/^\d{4,6}$/.test(pinNovo)) {
      setErro('O novo PIN deve ter de 4 a 6 dígitos numéricos.')
      return
    }
    if (pinNovo !== pinConfirmacao) {
      setErro('A confirmação não confere com o novo PIN.')
      return
    }
    if (pinNovo === pinAtual) {
      setErro('O novo PIN deve ser diferente do atual.')
      return
    }
    setSalvando(true)
    const resp = await window.api.auth.alterarPin(pinAtual, pinNovo)
    setSalvando(false)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setModalAberto(false)
    setFeedback('PIN alterado com sucesso. O sistema será bloqueado por segurança.')
    // Pequena espera para o feedback ser percebido antes de bloquear
    setTimeout(() => bloquear(), 1200)
  }

  return (
    <div className="space-y-5">
      {/* Alterar PIN */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-start gap-3">
          <KeyRound className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm">PIN de acesso</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Senha numérica usada para destravar o sistema.
              Após alterar, o sistema será bloqueado e o novo PIN será exigido.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setModalAberto(true)} className="shrink-0">
          Alterar PIN
        </Button>
      </div>

      {/* Auto-bloqueio */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Bloquear automaticamente após inatividade</Label>
        </div>
        <select
          value={autoLockMinutos}
          onChange={(e) => salvarAutoLock(parseInt(e.target.value, 10))}
          className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {OPCOES_AUTO_LOCK.map((op) => (
            <option key={op.valor} value={op.valor}>{op.label}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Quando o sistema ficar sem uso por este período, o PIN será exigido novamente.
        </p>
      </div>

      {feedback && (
        <p className="text-sm font-medium text-green-600">{feedback}</p>
      )}

      <p className="text-xs text-muted-foreground">
        Atalho rápido: <kbd className="px-1.5 py-0.5 border rounded text-[10px] font-mono">Ctrl+L</kbd>{' '}
        bloqueia o sistema imediatamente.
      </p>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar PIN</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs mb-1 block">PIN atual</Label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pinAtual}
                onChange={(e) => setPinAtual(sanitizarPin(e.target.value))}
                placeholder="••••"
                autoFocus
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.4em] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Novo PIN (4 a 6 dígitos)</Label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pinNovo}
                onChange={(e) => setPinNovo(sanitizarPin(e.target.value))}
                placeholder="••••"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.4em] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Confirmar novo PIN</Label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pinConfirmacao}
                onChange={(e) => setPinConfirmacao(sanitizarPin(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') alterarPin() }}
                placeholder="••••"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.4em] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {erro && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erro}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={alterarPin} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar novo PIN'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ConfigSeguranca
