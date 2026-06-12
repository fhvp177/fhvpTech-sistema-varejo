import { FC, useEffect, useState } from 'react'

type Notificacao = { sucesso: boolean }

const IndicadorBackupAtivo: FC = () => {
  const [notificacao, setNotificacao] = useState<Notificacao | null>(null)

  useEffect(() => {
    const remover = window.api.backup.onNotificacao((data) => {
      setNotificacao({ sucesso: data.sucesso })
      setTimeout(() => setNotificacao(null), 4000)
    })
    return remover
  }, [])

  if (!notificacao) return null

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2 ${
        notificacao.sucesso
          ? 'bg-green-600 text-white'
          : 'bg-red-600 text-white'
      }`}
    >
      {notificacao.sucesso ? '✓ Backup automático realizado' : '✗ Falha no backup automático'}
    </div>
  )
}

export default IndicadorBackupAtivo
