import { FC, useEffect, useState } from 'react'
import { KeyRound, Clock, Percent } from 'lucide-react'
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

const ConfigSeguranca: FC = () => {
  const { autoLockMinutos, setAutoLockMinutos, bloquear } = useLock()
  const { vendedor, ehDono } = useSessao()
  const [modalAberto, setModalAberto] = useState(false)
  const [pinAtual, setPinAtual] = useState('')
  const [pinNovo, setPinNovo] = useState('')
  const [pinConfirmacao, setPinConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<string>('')

  const [tetoDesconto, setTetoDesconto] = useState<number>(10)
  const [tetoEditado, setTetoEditado] = useState<string>('10')
  const [salvandoTeto, setSalvandoTeto] = useState(false)
  const [erroTeto, setErroTeto] = useState('')

  useEffect(() => {
    if (modalAberto) {
      setPinAtual('')
      setPinNovo('')
      setPinConfirmacao('')
      setErro('')
    }
  }, [modalAberto])

  useEffect(() => {
    window.api.auth.lerTetoDesconto().then((resp) => {
      if (resp.success) {
        setTetoDesconto(resp.data)
        setTetoEditado(String(resp.data))
      }
    })
  }, [])

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

  const salvarTeto = async () => {
    setErroTeto('')
    const valor = parseFloat(tetoEditado.replace(',', '.'))
    if (isNaN(valor) || valor < 0 || valor > 100) {
      setErroTeto('Informe um valor entre 0 e 100.')
      return
    }
    setSalvandoTeto(true)
    const resp = await window.api.auth.setarTetoDesconto(valor)
    setSalvandoTeto(false)
    if (!resp.success) {
      setErroTeto(resp.error)
      return
    }
    setTetoDesconto(valor)
    setFeedback(`Teto de desconto ajustado para ${valor}%.`)
    setTimeout(() => setFeedback(''), 3000)
  }

  const alterarPin = async () => {
    setErro('')
    if (!vendedor) {
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
    const resp = await window.api.auth.alterarPinVendedor(vendedor.id, pinAtual, pinNovo)
    setSalvando(false)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    setModalAberto(false)
    setFeedback('PIN alterado com sucesso. O sistema será bloqueado por segurança.')
    setTimeout(() => bloquear(), 1200)
  }

  const tetoMudou = parseFloat(tetoEditado.replace(',', '.')) !== tetoDesconto

  return (
    <div className="space-y-5">
      {/* Alterar PIN */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-start gap-3">
          <KeyRound className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm">Seu PIN de acesso</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {vendedor
                ? `Altera apenas o PIN de ${vendedor.nome}. Após alterar, o sistema será bloqueado.`
                : 'Faça login pra alterar o PIN.'}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setModalAberto(true)}
          className="shrink-0"
          disabled={!vendedor}
        >
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

      {/* Teto de desconto */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Percent className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm font-medium">
            Teto de desconto sem PIN do dono
          </Label>
        </div>
        <div className="flex items-center gap-2 max-w-xs">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.5}
            value={tetoEditado}
            onChange={(e) => {
              setTetoEditado(e.target.value)
              setErroTeto('')
            }}
            disabled={!ehDono}
            className="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground"
          />
          <span className="text-sm text-muted-foreground">%</span>
          {ehDono && (
            <Button
              size="sm"
              variant={tetoMudou ? 'default' : 'outline'}
              onClick={salvarTeto}
              disabled={!tetoMudou || salvandoTeto}
            >
              {salvandoTeto ? 'Salvando...' : 'Salvar'}
            </Button>
          )}
        </div>
        {erroTeto && (
          <p className="text-destructive text-xs mt-1.5">{erroTeto}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Vendedor pode dar até este desconto. Acima disso, o sistema pedirá o PIN do dono.
          {' '}<span className="italic">0% exige PIN pra qualquer desconto.</span>
          {!ehDono && (
            <span className="block mt-1 text-amber-600">
              Somente o dono pode alterar este valor.
            </span>
          )}
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
            <DialogTitle>Alterar PIN — {vendedor?.nome}</DialogTitle>
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
