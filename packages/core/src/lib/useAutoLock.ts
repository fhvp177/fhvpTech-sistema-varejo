import { useEffect, useRef } from 'react'

// Dispara onLock quando o usuário ficar `minutos` sem interagir (mouse/teclado/click/scroll).
// Passe `minutos = 0` para desativar. Compartilhado entre os apps FHVP Tech.
export function useAutoLock(minutos: number, onLock: () => void): void {
  // Mantém referência sempre atualizada do callback para evitar re-criar o efeito
  // a cada render só porque a função mudou de identidade.
  const onLockRef = useRef(onLock)
  useEffect(() => {
    onLockRef.current = onLock
  }, [onLock])

  useEffect(() => {
    if (minutos <= 0) return

    const ms = minutos * 60_000
    let timer: ReturnType<typeof setTimeout>

    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => onLockRef.current(), ms)
    }

    const eventos: Array<keyof DocumentEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart'
    ]
    for (const ev of eventos) document.addEventListener(ev, reset, { passive: true })
    reset()

    return () => {
      clearTimeout(timer)
      for (const ev of eventos) document.removeEventListener(ev, reset)
    }
  }, [minutos])
}
