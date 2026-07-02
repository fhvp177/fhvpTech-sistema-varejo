import { createContext, useCallback, useContext, useEffect, useRef, useState, type FC, type ReactNode } from 'react'
import { X, Undo2 } from 'lucide-react'
import './animacoes.css'

type ToastVariant = 'default' | 'success' | 'destructive'

type ToastOptions = {
  message: string
  variant?: ToastVariant
  durationMs?: number
  // `icon` é opcional: sem ele, mostra o ícone de desfazer (Undo2), que é o uso
  // mais comum da ação. Passe um ícone próprio para ações como imprimir.
  action?: { label: string; onClick: () => void; icon?: ReactNode }
}

type ToastInterno = ToastOptions & {
  id: number
  durationMs: number
  variant: ToastVariant
}

type ToastContextValue = {
  showToast: (opts: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastInterno[]>([])
  const proximoId = useRef(1)

  const removerToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((opts: ToastOptions) => {
    const id = proximoId.current++
    setToasts((prev) => [
      ...prev,
      { id, ...opts, durationMs: opts.durationMs ?? 8000, variant: opts.variant ?? 'default' }
    ])
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => removerToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// Check que se desenha (círculo primeiro, risco depois). Mesma geometria do
// check-circle do lucide, mas com traços animáveis via pathLength normalizado.
const CheckAnimado: FC = () => (
  <svg
    viewBox="0 0 24 24"
    className="w-5 h-5 text-green-600 shrink-0 mt-0.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" pathLength="100" className="anim-check-circulo" />
    <path d="M8 12.5l2.5 2.5L16 9.5" pathLength="100" className="anim-check-risco" />
  </svg>
)

const ToastItem: FC<{ toast: ToastInterno; onClose: () => void }> = ({ toast, onClose }) => {
  const [progresso, setProgresso] = useState(100)

  useEffect(() => {
    const inicio = Date.now()
    const interval = window.setInterval(() => {
      const decorrido = Date.now() - inicio
      const restante = Math.max(0, 100 - (decorrido / toast.durationMs) * 100)
      setProgresso(restante)
      if (decorrido >= toast.durationMs) {
        window.clearInterval(interval)
        onClose()
      }
    }, 50)
    return () => window.clearInterval(interval)
  }, [toast.durationMs, onClose])

  const corBarra =
    toast.variant === 'success' ? 'bg-green-500'
    : toast.variant === 'destructive' ? 'bg-red-500'
    : 'bg-blue-500'

  return (
    <div
      className={`pointer-events-auto bg-card border rounded-lg shadow-lg overflow-hidden ${
        // A tremida substitui a entrada deslizante (as duas disputariam a mesma
        // shorthand `animation` — não podem coexistir no mesmo elemento).
        toast.variant === 'destructive' ? 'anim-treme' : 'animate-in slide-in-from-right-5 fade-in-0'
      }`}
    >
      <div className="flex items-start gap-3 p-3 pr-2">
        {toast.variant === 'success' && <CheckAnimado />}
        <p className="flex-1 text-sm pt-0.5">{toast.message}</p>
        {toast.action && (
          <button
            onClick={() => { toast.action!.onClick(); onClose() }}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0 px-2 py-1"
          >
            {toast.action.icon ?? <Undo2 className="w-3 h-3" />}
            {toast.action.label}
          </button>
        )}
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0 p-1"
          aria-label="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="h-1 bg-muted">
        <div
          className={`h-full ${corBarra} transition-[width] ease-linear`}
          style={{ width: `${progresso}%`, transitionDuration: '50ms' }}
        />
      </div>
    </div>
  )
}
