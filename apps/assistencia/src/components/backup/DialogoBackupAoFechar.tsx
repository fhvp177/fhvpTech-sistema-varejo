import { FC, useEffect, useState } from 'react'

/**
 * Overlay de tela cheia exibido enquanto o backup diário é executado
 * antes do sistema ser fechado. Responde ao evento IPC 'backup:carregando'.
 *
 * Visível = true  → backup iniciado (BackupAoFechar.ts enviou true)
 * Visível = false → backup falhou antes de fechar (janela permanecerá aberta)
 */
const DialogoBackupAoFechar: FC = () => {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const remover = window.api.backup.onCarregando((mostrar) => {
      setVisivel(mostrar)
    })
    return remover
  }, [])

  if (!visivel) return null

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center z-[100] gap-5">
      <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
      <div className="text-center space-y-1">
        <p className="text-white text-base font-semibold">Fazendo backup...</p>
        <p className="text-slate-400 text-sm">O sistema será fechado em seguida.</p>
      </div>
    </div>
  )
}

export default DialogoBackupAoFechar
