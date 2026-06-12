import { FC, useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  open: boolean
  onSucesso: () => void
  onCancelar?: () => void
}

const ModalSenhaRestauracao: FC<Props> = ({ open, onSucesso, onCancelar }) => {
  const [senha, setSenha] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSenha('')
      setErro('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!senha) return

    setVerificando(true)
    setErro('')

    const resp = await window.api.backup.verificarSenha(senha)

    if (resp.success && resp.data === true) {
      onSucesso()
    } else {
      setErro('Senha incorreta.')
      setSenha('')
      inputRef.current?.focus()
    }

    setVerificando(false)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancelar?.() }}>
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Acesso Restrito</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          A restauração de backup requer autenticação. Insira a senha configurada pelo suporte técnico.
        </p>
        <form onSubmit={verificar} className="space-y-4">
          <div>
            <Label htmlFor="senha-restauracao" className="text-sm mb-1.5 block">
              Senha
            </Label>
            <Input
              id="senha-restauracao"
              ref={inputRef}
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              autoComplete="off"
            />
            {erro && (
              <p className="text-destructive text-xs mt-1">{erro}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={verificando || !senha}>
            {verificando ? 'Verificando...' : 'Confirmar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ModalSenhaRestauracao
