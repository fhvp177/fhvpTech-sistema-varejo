import { FC, ReactNode, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

// Um slide do guia de boas-vindas. Conteúdo (ícone, cores, textos) vem do app —
// este componente é só a casca visual, então serve a qualquer nicho.
export type SlideGuia = {
  icone: ReactNode
  // classes do "chip" do ícone, ex.: 'bg-blue-100 text-blue-600'
  corIcone?: string
  titulo: string
  descricao: ReactNode
}

type Props = {
  slides: SlideGuia[]
  // Disparado ao concluir (último slide), pular ou fechar — o app marca como visto.
  onConcluir: () => void
  rotuloFinal?: string
}

const GuiaBoasVindas: FC<Props> = ({ slides, onConcluir, rotuloFinal = 'Começar a usar' }) => {
  const [indice, setIndice] = useState(0)
  if (slides.length === 0) return null

  const slide = slides[indice]
  const primeiro = indice === 0
  const ultimo = indice === slides.length - 1

  const avancar = () => (ultimo ? onConcluir() : setIndice((i) => i + 1))
  const voltar = () => setIndice((i) => Math.max(0, i - 1))

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Cabeçalho com botão de pular/fechar */}
        <div className="flex justify-end p-3 pb-0">
          <button
            type="button"
            onClick={onConcluir}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md"
            title="Pular tutorial"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo do slide */}
        <div className="px-8 pb-2 text-center min-h-[260px] flex flex-col items-center justify-center">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 ${
              slide.corIcone ?? 'bg-blue-100 text-blue-600'
            }`}
          >
            {slide.icone}
          </div>
          <h2 className="text-xl font-bold text-slate-800">{slide.titulo}</h2>
          <p className="text-sm text-slate-500 mt-2.5 leading-relaxed max-w-sm">
            {slide.descricao}
          </p>
        </div>

        {/* Indicador de progresso (bolinhas) */}
        <div className="flex items-center justify-center gap-1.5 py-4">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndice(i)}
              className={`h-2 rounded-full transition-all ${
                i === indice ? 'w-6 bg-blue-600' : 'w-2 bg-slate-300 hover:bg-slate-400'
              }`}
              title={`Ir para o passo ${i + 1}`}
            />
          ))}
        </div>

        {/* Rodapé com navegação */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={voltar}
            disabled={primeiro}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-0 disabled:pointer-events-none transition-colors px-2 py-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>

          {!ultimo && (
            <button
              type="button"
              onClick={onConcluir}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Pular
            </button>
          )}

          <button
            type="button"
            onClick={avancar}
            className="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            {ultimo ? rotuloFinal : 'Próximo'}
            {!ultimo && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

export default GuiaBoasVindas
