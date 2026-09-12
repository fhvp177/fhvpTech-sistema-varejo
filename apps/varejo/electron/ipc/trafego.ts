import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono } from '../sessao'
import {
  investimentosDoMes,
  gravarInvestimentos,
  resumoTrafego
} from '../db/queries/trafegoPago'

/**
 * Tráfego pago e ROAS.
 *
 * ⚠️ Os três canais são do DONO, sem exceção. Quanto a loja gasta em anúncio e
 * quanto cada canal devolve é decisão de dono, e o lançamento é a porta por
 * onde o número entra: quem pudesse gravar aqui mudaria o ROAS de um mês
 * inteiro digitando um valor.
 */

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/

export function registrarHandlersTrafego(): void {
  registrarCanal('trafego:resumo', (inicio: unknown, fim: unknown) => {
    try {
      requerDono()
      const de = String(inicio ?? '')
      const ate = String(fim ?? '')
      if (!DIA_ISO.test(de) || !DIA_ISO.test(ate)) {
        throw new Error('Período inválido. Use datas no formato AAAA-MM-DD.')
      }
      if (de > ate) throw new Error('A data inicial tem que vir antes da final.')
      return { success: true, data: resumoTrafego(de, ate) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('trafego:investimentos', (mes: unknown) => {
    try {
      requerDono()
      return { success: true, data: investimentosDoMes(String(mes ?? '')) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('trafego:gravarInvestimentos', (mes: unknown, linhas: unknown) => {
    try {
      requerDono()
      if (!Array.isArray(linhas)) throw new Error('Lançamentos inválidos.')
      gravarInvestimentos(
        String(mes ?? ''),
        linhas.map((l) => ({
          origem_id: Number((l as Record<string, unknown>)?.origem_id),
          valor: Number((l as Record<string, unknown>)?.valor),
          observacao: ((l as Record<string, unknown>)?.observacao ?? null) as string | null
        }))
      )
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
