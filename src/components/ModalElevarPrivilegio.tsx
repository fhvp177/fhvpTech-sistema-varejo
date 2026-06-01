import { FC, useEffect, useRef, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Props = {
  aberto: boolean
  onClose: () => void
  // Quando o PIN do dono é aceito, recebe o donoId pra registro/log futuro.
  onAutorizar: (donoId: number) => void
  motivo: string
}

const sanitizar = (v: string) => v.replace(/\D/g, '').slice(0, 6)

const ModalElevarPrivilegio: FC<Props> = ({ aberto, onClose, onAutorizar, motivo }) => {
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState('')
  const [validando, setValidando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aberto) {
      setPin('')
      setErro('')
      setValidando(false)
      // Pequeno delay pra dar tempo do Radix renderizar antes do focus
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [aberto])

  const autorizar = async () => {
    setErro('')
    if (!/^\d{4,6}$/.test(pin)) {
      setErro('Digite o PIN do dono (4 a 6 dígitos).')
      return
    }
    setValidando(true)
    const resp = await window.api.auth.elevar(pin)
    setValidando(false)
    if (!resp.success) {
      setErro(resp.error)
      return
    }
    if (!resp.data.ok || resp.data.donoId === null) {
      setErro('PIN do dono incorreto.')
      setPin('')
      inputRef.current?.focus()
      return
    }
    onAutorizar(resp.data.donoId)
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            Autorização do dono
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">{motivo}</p>
          <div>
            <Label className="text-xs mb-1 block">PIN de um dono da loja</Label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(sanitizar(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') autorizar()
              }}
              disabled={validando}
              placeholder="••••"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.4em] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted"
            />
          </div>
          {erro && (
            <p className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">{erro}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={validando}>
            Cancelar
          </Button>
          <Button onClick={autorizar} disabled={validando || pin.length < 4}>
            {validando ? 'Validando...' : 'Autorizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ModalElevarPrivilegio
