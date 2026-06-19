import { ipcMain } from 'electron'
import { obterMetricasDashboard, type IntervaloDashboard, CHAVE_META_MENSAL } from '../db/queries/dashboard'
import { gravarConfig } from '@fhvptech/core/electron/backup/configBackup'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function validar(payload: unknown): IntervaloDashboard {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Intervalo inválido.')
  }
  const p = payload as Record<string, unknown>
  const chaves = ['inicio_atual', 'fim_atual', 'inicio_anterior', 'fim_anterior'] as const
  for (const k of chaves) {
    if (typeof p[k] !== 'string' || !ISO_DATE.test(p[k] as string)) {
      throw new Error(`Campo ${k} deve ser uma data ISO YYYY-MM-DD.`)
    }
  }
  if ((p.inicio_atual as string) > (p.fim_atual as string)) {
    throw new Error('inicio_atual deve ser anterior ou igual a fim_atual.')
  }
  if ((p.inicio_anterior as string) > (p.fim_anterior as string)) {
    throw new Error('inicio_anterior deve ser anterior ou igual a fim_anterior.')
  }
  return {
    inicio_atual: p.inicio_atual as string,
    fim_atual: p.fim_atual as string,
    inicio_anterior: p.inicio_anterior as string,
    fim_anterior: p.fim_anterior as string
  }
}

export function registrarHandlersDashboard(): void {
  ipcMain.handle('dashboard:metricas', (_event, payload: unknown) => {
    try {
      const intervalo = validar(payload)
      return { success: true, data: obterMetricasDashboard(intervalo) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('dashboard:salvarMeta', (_event, valor: unknown) => {
    try {
      const meta = Number(valor)
      if (!Number.isFinite(meta) || meta < 0) throw new Error('Meta inválida.')
      gravarConfig(CHAVE_META_MENSAL, String(Math.round(meta * 100) / 100))
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
