import { FC } from 'react'
import { Check, ChevronRight, X, PartyPopper, ListChecks } from 'lucide-react'

// Um passo da lista de primeiros passos. `concluido` é derivado do dado real pelo
// app (existe produto? existe venda?), então a checklist nunca "mente".
export type PassoChecklist = {
  id: string
  rotulo: string
  concluido: boolean
  // Leva o lojista até a tela onde ele cumpre o passo. Ausente = sem botão "Ir".
  onIr?: () => void
}

type Props = {
  passos: PassoChecklist[]
  onDispensar: () => void
  titulo?: string
}

const PrimeirosPassos: FC<Props> = ({ passos, onDispensar, titulo = 'Primeiros passos' }) => {
  const feitos = passos.filter((p) => p.concluido).length
  const total = passos.length
  const tudoPronto = total > 0 && feitos === total

  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
          <ListChecks className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold flex items-center gap-2">
            {titulo}
            <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {feitos}/{total}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {tudoPronto ? 'Tudo pronto — você já domina o básico!' : 'Configure o essencial em poucos cliques'}
          </p>
        </div>
        <button
          type="button"
          onClick={onDispensar}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md shrink-0"
          title="Dispensar (não mostrar mais)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Barra de progresso */}
      <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-[width] ${tudoPronto ? 'bg-green-600' : 'bg-blue-600'}`}
          style={{ width: `${total > 0 ? (feitos / total) * 100 : 0}%` }}
        />
      </div>

      {tudoPronto ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5">
          <PartyPopper className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-800 flex-1">
            Parabéns! Você completou os primeiros passos. 🎉
          </p>
          <button
            type="button"
            onClick={onDispensar}
            className="text-xs font-medium text-green-700 hover:text-green-900 underline shrink-0"
          >
            Fechar
          </button>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {passos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={p.onIr}
                disabled={p.concluido || !p.onIr}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                  p.concluido
                    ? 'cursor-default'
                    : p.onIr
                      ? 'hover:bg-muted cursor-pointer'
                      : 'cursor-default'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                    p.concluido
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'border-muted-foreground/40 text-transparent'
                  }`}
                >
                  <Check className="w-3 h-3" strokeWidth={3} />
                </span>
                <span
                  className={`flex-1 ${
                    p.concluido ? 'text-muted-foreground line-through' : 'text-foreground font-medium'
                  }`}
                >
                  {p.rotulo}
                </span>
                {!p.concluido && p.onIr && (
                  <span className="flex items-center gap-0.5 text-xs font-medium text-blue-600 shrink-0">
                    Ir <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default PrimeirosPassos
