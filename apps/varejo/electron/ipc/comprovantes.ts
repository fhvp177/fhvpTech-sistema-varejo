import { registrarCanal } from '@fhvptech/core/electron/roteador'
import {
  anexarComprovante,
  obterComprovante,
  resumoComprovante,
  vendasComComprovante,
  removerComprovante
} from '../db/queries/comprovantes'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono, obterSessaoId } from '../sessao'

/**
 * Comprovantes de pagamento.
 *
 * ── Quem pode o quê, e por quê ──────────────────────────────────────────────
 * **Anexar é do vendedor.** Quem recebe o PIX é quem tem a foto na mão, e é no
 * momento do recebimento que ela existe. Exigir o dono transformaria o recurso
 * em "depois eu peço para ele anexar", que é o mesmo que não ter.
 *
 * **Apagar é do dono.** Comprovante é prova de que o dinheiro entrou. Se quem
 * recebeu pudesse apagar, a prova valeria exatamente nada contra a única
 * pessoa de quem ela protege.
 */
export function registrarHandlersComprovantes(): void {
  registrarCanal(
    'comprovantes:anexar',
    (
      vendaId: number,
      arquivo: { mime: string; dados: string; nome_arquivo?: string | null }
    ) => {
      try {
        anexarComprovante({
          venda_id: Number(vendaId),
          mime: String(arquivo?.mime ?? ''),
          dados: String(arquivo?.dados ?? ''),
          nome_arquivo: arquivo?.nome_arquivo ?? null,
          // ⚠️ Vem da SESSÃO, nunca do que o chamador mandou: senão "quem
          // anexou" viraria um campo que qualquer um preenche com o nome de
          // outra pessoa, e o rastro deixaria de ser rastro.
          anexado_por: obterSessaoId()
        })
        obterBackupManager().marcarAlteracao()
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  registrarCanal('comprovantes:obter', (vendaId: number) => {
    try {
      return { success: true, data: obterComprovante(Number(vendaId)) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('comprovantes:resumo', (vendaId: number) => {
    try {
      return { success: true, data: resumoComprovante(Number(vendaId)) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('comprovantes:quaisTem', (ids: number[]) => {
    try {
      const limpos = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite)
      return { success: true, data: vendasComComprovante(limpos) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('comprovantes:remover', (vendaId: number) => {
    try {
      requerDono()
      removerComprovante(Number(vendaId))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
