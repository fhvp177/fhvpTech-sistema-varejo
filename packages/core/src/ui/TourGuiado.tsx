import { FC, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button } from './button'

// Tour guiado pelas telas REAIS do sistema: escurece tudo, acende um holofote
// no elemento marcado com data-tour="..." e mostra um balão explicando. Cada
// passo pode navegar pra outra rota antes de destacar. Como o que aparece é o
// app de verdade, o tutorial nunca desatualiza — diferente de screenshot.
//
// O motor é genérico (vive no core); o ROTEIRO (passos) é de cada app.

export type PassoTour = {
  rota?: string // navega pra cá antes de mostrar o passo
  alvo?: string // valor de data-tour a destacar; ausente = balão centralizado
  titulo: string
  descricao: string
}

type Props = {
  passos: PassoTour[]
  onNavegar: (rota: string) => void
  onFechar: () => void
}

type Retangulo = { top: number; left: number; width: number; height: number }

const MARGEM_HOLOFOTE = 6
const LARGURA_BALAO = 340

const TourGuiado: FC<Props> = ({ passos, onNavegar, onFechar }) => {
  const [indice, setIndice] = useState(0)
  const [rect, setRect] = useState<Retangulo | null>(null)
  const [pronto, setPronto] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const passo = passos[indice]
  const ultimo = indice === passos.length - 1

  const medir = useCallback((el: Element): Retangulo => {
    const r = el.getBoundingClientRect()
    return { top: r.top, left: r.left, width: r.width, height: r.height }
  }, [])

  // A cada passo: navega (se pedir), espera o elemento existir na tela (a rota
  // nova pode ainda estar carregando) e mede. Sem alvo — ou alvo que não
  // apareceu em 2,5s — o balão vai pro centro, e o tour segue em frente.
  useEffect(() => {
    if (!passo) return
    setPronto(false)
    setRect(null)
    if (passo.rota) onNavegar(passo.rota)

    if (!passo.alvo) {
      setPronto(true)
      return
    }

    let tentativas = 0
    timerRef.current = setInterval(() => {
      const el = document.querySelector(`[data-tour="${passo.alvo}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
        setRect(medir(el))
        setPronto(true)
        if (timerRef.current) clearInterval(timerRef.current)
      } else if (++tentativas > 15) {
        setPronto(true) // fallback: balão central, sem holofote
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }, 100)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [passo, onNavegar, medir])

  // Janela mudou de tamanho? Re-mede o alvo atual.
  useEffect(() => {
    const aoRedimensionar = () => {
      if (!passo?.alvo) return
      const el = document.querySelector(`[data-tour="${passo.alvo}"]`)
      if (el) setRect(medir(el))
    }
    window.addEventListener('resize', aoRedimensionar)
    return () => window.removeEventListener('resize', aoRedimensionar)
  }, [passo, medir])

  const avancar = useCallback(() => {
    if (ultimo) onFechar()
    else setIndice((i) => i + 1)
  }, [ultimo, onFechar])

  const voltar = useCallback(() => setIndice((i) => Math.max(0, i - 1)), [])

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') avancar()
      else if (e.key === 'ArrowLeft') voltar()
    }
    window.addEventListener('keydown', teclas)
    return () => window.removeEventListener('keydown', teclas)
  }, [avancar, voltar, onFechar])

  if (!passo) return null

  // Posição do balão: abaixo do alvo se couber, senão acima; alvo alto demais
  // pra ambos (ex.: o menu lateral inteiro) ganha o balão AO LADO, centrado na
  // vertical — nunca fora da janela. Sem alvo, centralizado.
  const estiloBalao: React.CSSProperties = {}
  if (rect) {
    const cabeAbaixo = window.innerHeight - (rect.top + rect.height) > 230
    const cabeAcima = rect.top > 230
    if (cabeAbaixo || cabeAcima) {
      if (cabeAbaixo) estiloBalao.top = rect.top + rect.height + 14
      else estiloBalao.bottom = window.innerHeight - rect.top + 14
      estiloBalao.left = Math.max(
        12,
        Math.min(rect.left + rect.width / 2 - LARGURA_BALAO / 2, window.innerWidth - LARGURA_BALAO - 12)
      )
    } else {
      const cabeDireita = window.innerWidth - (rect.left + rect.width) > LARGURA_BALAO + 26
      estiloBalao.left = cabeDireita
        ? rect.left + rect.width + 14
        : Math.max(12, rect.left - LARGURA_BALAO - 14)
      estiloBalao.top = Math.max(
        12,
        Math.min(rect.top + rect.height / 2 - 110, window.innerHeight - 260)
      )
    }
  } else {
    estiloBalao.top = '50%'
    estiloBalao.left = '50%'
    estiloBalao.transform = 'translate(-50%, -50%)'
  }

  return (
    <>
      {/* Bloqueia cliques no app enquanto o tour está aberto */}
      <div className="fixed inset-0 z-[9990]" aria-hidden />

      {/* Holofote (ou véu inteiro, quando o passo não tem alvo) */}
      {rect ? (
        <div
          className="fixed z-[9991] rounded-lg border-2 border-primary pointer-events-none transition-all duration-300"
          style={{
            top: rect.top - MARGEM_HOLOFOTE,
            left: rect.left - MARGEM_HOLOFOTE,
            width: rect.width + MARGEM_HOLOFOTE * 2,
            height: rect.height + MARGEM_HOLOFOTE * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)'
          }}
        />
      ) : (
        pronto && <div className="fixed inset-0 z-[9991] bg-black/60 pointer-events-none" />
      )}

      {/* Balão do passo */}
      {pronto && (
        <div
          className="fixed z-[9992] bg-background border rounded-lg shadow-2xl p-4"
          style={{ width: LARGURA_BALAO, ...estiloBalao }}
        >
          <p className="text-xs text-muted-foreground mb-1">
            {indice + 1} de {passos.length}
          </p>
          <h3 className="font-semibold mb-1">{passo.titulo}</h3>
          <p className="text-sm text-muted-foreground">{passo.descricao}</p>
          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={onFechar}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline mr-auto"
            >
              Sair do tour
            </button>
            {indice > 0 && (
              <Button variant="outline" size="sm" onClick={voltar}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Anterior
              </Button>
            )}
            <Button size="sm" onClick={avancar}>
              {ultimo ? (
                <>
                  Concluir <Check className="w-3.5 h-3.5 ml-1" />
                </>
              ) : (
                <>
                  Próximo <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

export default TourGuiado
