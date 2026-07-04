import { FC, useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

const LIMITE_FALHAS = 3

const AlertaBackupFalhando: FC = () => {
  const [falhas, setFalhas] = useState(0)
  const [dispensado, setDispensado] = useState(false)

  useEffect(() => {
    window.api.backup.obterStatus().then((resp) => {
      if (resp.success) {
        const s = resp.data as { falhasConsecutivas: number }
        setFalhas(s.falhasConsecutivas)
      }
    })

    // Atualiza o contador após cada backup automático
    const remover = window.api.backup.onNotificacao(() => {
      window.api.backup.obterStatus().then((resp) => {
        if (resp.success) {
          const s = resp.data as { falhasConsecutivas: number }
          setFalhas(s.falhasConsecutivas)
          if (s.falhasConsecutivas === 0) setDispensado(false)
        }
      })
    })
    return remover
  }, [])

  if (falhas < LIMITE_FALHAS || dispensado) return null

  return (
    <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-800 shrink-0">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        O backup automático falhou <strong>{falhas} vezes consecutivas</strong>. Verifique as
        configurações em <em>Configurações → Backup</em>.
      </span>
      <button
        onClick={() => setDispensado(true)}
        className="text-amber-600 hover:text-amber-900 transition-colors"
        title="Dispensar alerta"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default AlertaBackupFalhando
