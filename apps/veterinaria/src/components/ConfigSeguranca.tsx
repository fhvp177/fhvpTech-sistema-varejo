import { FC, useEffect, useState } from 'react'
import { KeyRound, Clock, Mail } from 'lucide-react'
import { Button } from '@fhvptech/core/ui/button'
import { Label } from '@fhvptech/core/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@fhvptech/core/ui/dialog'
import { useLock, useSessao } from '@/App'

const OPCOES_AUTO_LOCK: Array<{ valor: number; label: string }> = [
  { valor: 0, label: 'Desativado' },
  { valor: 15, label: '15 minutos' },
  { valor: 30, label: '30 minutos' },
  { valor: 60, label: '1 hora' },
  { valor: 120, label: '2 horas' }
]

const sanitizarPin = (v: string) => v.replace(/\D/g, '').slice(0, 6)
const REGEX_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const ConfigSeguranca: FC = () => {
  const { autoLockMinutos, setAutoLockMinutos, bloquear } = useLock()
  const { sessao, recarregar } = useSessao()
  const [feedback, setFeedback] = useState('')

  // Alterar PIN
  const [modalAberto, setModalAberto] = useState(false)
  const [pinAtual, setPinAtual] = useState('')
  const [pinNovo, setPinNovo] = useState('')
  const [pinConfirmacao, setPinConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  // E-mail de recuperação
  const [email, setEmail] = useState('')
  const [salvandoEmail, setSalvandoEmail] = useState(false)
  const [erroEmail, setErroEmail] = useState('')

  useEffect(() => {
    setEmail(sessao?.email ?? '')
  }, [sessao?.email])

  useEffect(() => {
    if (modalAberto) {
      setPinAtual('')
      setPinNovo('')
      setPinConfirmacao('')
      setErro('')
    }
  }, [modalAberto])

  const mostrarFeedback = (msg: string) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(''), 3000)
  }

  const salvarAutoLock = async (minutos: number) => {
    const resp = await window.api.auth.setarAutoLock(minutos)
    if (resp.success) {
      setAutoLockMinutos(minutos)
      const label = OPCOES_AUTO_LOCK.find((o) => o.valor === minutos)?.label ?? `${minutos} min`
      mostrarFeedback(
        minutos === 0 ? 'Bloqueio automático desativado.' : `Bloqueio automático: ${label}.`
      )
    }
  }

  const salvarEmail = async () => {
    if (!sessao) return
    setErroEmail('')
    const alvo = email.trim()
    if (alvo && !REGEX_EMAIL.test(alvo)) {
      setErroEmail('Digite um e-mail válido (ou deixe em branco).')
      return
    }
    setSalvandoEmail(true)
    const resp = await window.api.usuarios.atualizar(sessao.id, { email: alvo || null })
    setSalvandoEmail(false)
    if (!resp.success) {
      setErroEmail(resp.error)
      return
    }
    await recarregar()
    mostrarFeedback('E-mail de recuperação salvo.')
  }

  const alterarPin = async () => {
    setErro('')
    if (!sessao) {
      setErro('Sessão expirada. Faça login novamente.')
      return
    }
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
    const resp = await window.api.auth.alterarPin(sessao.id, pinAtual, pinNovo)
    setSalvando(false)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setModalAberto(false)
    mostrarFeedback('PIN alterado. O sistema será bloqueado por segurança.')
    setTimeout(() => bloquear(), 1200)
  }

  const emailMudou = (sessao?.email ?? '') !== email.trim()

  return (
    <div className="space-y-5">
      {/* Alterar PIN */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-start gap-3">
          <KeyRound className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm">Seu PIN de acesso</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sessao
                ? `Altera apenas o PIN de ${sessao.nome}. Após alterar, o sistema será bloqueado.`
                : 'Faça login pra alterar o PIN.'}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setModalAberto(true)}
          className="shrink-0"
          disabled={!sessao}
        >
          Alterar PIN
        </Button>
      </div>

      {/* E-mail de recuperação */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm font-medium">E-mail para recuperação de PIN</Label>
        </div>
        <div className="flex items-center gap-2 max-w-md">
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setErroEmail('')
            }}
            placeholder="seuemail@exemplo.com"
            className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            variant={emailMudou ? 'default' : 'outline'}
            onClick={salvarEmail}
            disabled={!emailMudou || salvandoEmail}
          >
            {salvandoEmail ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
        {erroEmail && <p className="text-destructive text-xs mt-1.5">{erroEmail}</p>}
        <p className="text-xs text-muted-foreground mt-1">
          Usado no "Esqueci meu PIN" — enviamos um código pra este endereço. Sem e-mail, só o dono
          consegue redefinir seu PIN.
        </p>
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
            <option key={op.valor} value={op.valor}>
              {op.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Quando o sistema ficar sem uso por este período, o PIN será exigido novamente.
        </p>
      </div>

      {feedback && <p className="text-sm font-medium text-green-600">{feedback}</p>}

      <p className="text-xs text-muted-foreground">
        Atalho rápido:{' '}
        <kbd className="px-1.5 py-0.5 border rounded text-[10px] font-mono">Ctrl+L</kbd> bloqueia o
        sistema imediatamente.
      </p>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar PIN — {sessao?.nome}</DialogTitle>
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') alterarPin()
                }}
                placeholder="••••"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.4em] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {erro && (
              <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erro}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>
              Cancelar
            </Button>
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
