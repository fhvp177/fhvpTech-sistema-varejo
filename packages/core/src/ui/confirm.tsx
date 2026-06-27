import { createContext, useCallback, useContext, useRef, useState, type FC, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from './dialog'
import { Button } from './button'

type ConfirmVariant = 'default' | 'destructive'

export type ConfirmOptions = {
  titulo?: string
  // Suporta \n (renderizado com whitespace-pre-line) ou JSX direto.
  mensagem: ReactNode
  rotuloConfirmar?: string
  rotuloCancelar?: string
  // 'destructive' pinta o botão de confirmar de vermelho e mostra o ícone de
  // alerta — usado nas exclusões.
  variante?: ConfirmVariant
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

// Substitui o window.confirm() nativo por um diálogo no tema do sistema.
// Uso: const confirmar = useConfirm(); if (!(await confirmar({...}))) return
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm deve ser usado dentro de ConfirmProvider')
  return ctx
}

export const ConfirmProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  // O resolve do Promise em aberto fica num ref pra responder no clique sem
  // disparar efeito colateral dentro do setState.
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const confirmar = useCallback<ConfirmFn>((o) => {
    return new Promise<boolean>((resolve) => {
      // Se já houver um diálogo aberto (caso raro), resolve o anterior como
      // negativo pra não deixar o await pendurado.
      resolverRef.current?.(false)
      resolverRef.current = resolve
      setOpts(o)
    })
  }, [])

  const responder = useCallback((ok: boolean) => {
    resolverRef.current?.(ok)
    resolverRef.current = null
    setOpts(null)
  }, [])

  const destrutivo = opts?.variante === 'destructive'

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <Dialog open={opts !== null} onOpenChange={(aberto) => { if (!aberto) responder(false) }}>
        {opts && (
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {destrutivo && (
                  <span className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                )}
                {opts.titulo ?? (destrutivo ? 'Confirmar exclusão' : 'Confirmar')}
              </DialogTitle>
            </DialogHeader>
            <DialogDescription className="whitespace-pre-line text-sm text-muted-foreground">
              {opts.mensagem}
            </DialogDescription>
            <DialogFooter>
              <Button variant="outline" onClick={() => responder(false)}>
                {opts.rotuloCancelar ?? 'Cancelar'}
              </Button>
              <Button
                variant={destrutivo ? 'destructive' : 'default'}
                onClick={() => responder(true)}
              >
                {opts.rotuloConfirmar ?? (destrutivo ? 'Excluir' : 'Confirmar')}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  )
}
