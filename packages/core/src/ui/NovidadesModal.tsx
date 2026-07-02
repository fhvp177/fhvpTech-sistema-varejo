import { FC, ReactNode } from 'react'
import { Sparkles, X } from 'lucide-react'
import './animacoes.css'

// Um destaque do "O que há de novo". Conteúdo vem do app (serve a qualquer nicho).
export type ItemNovidade = { emoji?: string; titulo: string; descricao?: ReactNode }

type Props = {
  versao: string
  itens: ItemNovidade[]
  onFechar: () => void
}

const NovidadesModal: FC<Props> = ({ versao, itens, onFechar }) => {
  if (itens.length === 0) return null
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Cabeçalho */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-blue-600 to-blue-500 text-white shrink-0">
          <button
            type="button"
            onClick={onFechar}
            className="absolute right-3 top-3 text-white/80 hover:text-white transition-colors p-1 rounded-md"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="anim-pop">
              <Sparkles className="anim-flutua w-6 h-6" />
            </span>
            <h2 className="text-xl font-bold">Novidades</h2>
          </div>
          <p className="text-sm text-white/80 mt-1">O que melhorou na versão {versao}</p>
        </div>

        {/* Lista de destaques */}
        <div className="px-6 py-4 overflow-y-auto space-y-3.5">
          {itens.map((it, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-2xl leading-none shrink-0 mt-0.5">{it.emoji ?? '✨'}</span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{it.titulo}</p>
                {it.descricao && (
                  <p className="text-sm text-slate-500 leading-snug mt-0.5">{it.descricao}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onFechar}
            className="bg-blue-600 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            Entendi!
          </button>
        </div>
      </div>
    </div>
  )
}

export default NovidadesModal
