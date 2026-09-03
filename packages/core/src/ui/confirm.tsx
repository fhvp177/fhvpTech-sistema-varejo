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

type ConfirmVariant = 'default' | 'aviso' | 'destructive'

type ConfirmBase = {
  titulo?: string
  // Suporta \n (renderizado com whitespace-pre-line) ou JSX direto.
  mensagem: ReactNode
  rotuloConfirmar?: string
  rotuloCancelar?: string
}

/**
 * ── Por que isto é uma união, e não um objeto simples ────────────────────────
 * O foco começa em "Cancelar" porque ele é o primeiro botão do rodapé. Isso é
 * uma proteção, não um acaso: 23 dos 31 usos deste diálogo são EXCLUSÕES, e num
 * diálogo de exclusão o Enter tem que ser inofensivo.
 *
 * Mas há confirmações que não destroem nada — só avisam de uma consequência —
 * e nelas obrigar a mão a sair do teclado é atrito puro. Quem opera um caixa
 * não larga o teclado no meio de um atendimento.
 *
 * A união resolve os dois: `focoInicial: 'confirmar'` existe, e o compilador
 * RECUSA combiná-lo com `variante: 'destructive'`. Não é convenção nem
 * comentário pedindo cuidado — é erro de build. Um comentário protege até
 * alguém não lê-lo; o tipo protege sempre.
 *
 * (Se um dia um diálogo destrutivo realmente precisar disso, a conversa tem que
 * acontecer AQUI, mudando esta união — que é exatamente onde ela deve acontecer.)
 */
export type ConfirmOptions = ConfirmBase &
  (
    | {
        // Exclusões: botão vermelho, ícone de alerta. O foco fica no Cancelar,
        // sem opção — ver acima.
        variante: 'destructive'
        focoInicial?: 'cancelar'
      }
    | {
        // 'aviso' mostra o ícone de alerta em âmbar e mantém o botão de
        // confirmar normal: serve pro que tem consequência mas não apaga nada.
        variante?: 'default' | 'aviso'
        focoInicial?: 'cancelar' | 'confirmar'
      }
  )

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
  // Só usado quando o chamador pede foco no confirmar — ver ConfirmOptions.
  const confirmarBtnRef = useRef<HTMLButtonElement>(null)

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
  const avisa = destrutivo || opts?.variante === 'aviso'

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <Dialog open={opts !== null} onOpenChange={(aberto) => { if (!aberto) responder(false) }}>
        {opts && (
          <DialogContent
            className="max-w-sm"
            // O Radix foca o primeiro elemento do diálogo ao abrir, que é o
            // Cancelar. Só saímos disso quando o chamador pede — e o tipo já
            // garante que nenhum diálogo de exclusão consegue pedir.
            onOpenAutoFocus={(e) => {
              if (opts.focoInicial !== 'confirmar') return
              e.preventDefault()
              confirmarBtnRef.current?.focus()
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {avisa && (
                  <span
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      destrutivo ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                    }`}
                  >
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
                ref={confirmarBtnRef}
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
