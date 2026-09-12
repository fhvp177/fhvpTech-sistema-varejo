import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerDono, requerSessao } from '../sessao'
import {
  buscarItensVendidos,
  itensDaVenda,
  listarGarantias,
  garantiasDoItem,
  abrirGarantia,
  fecharGarantia,
  reabrirGarantia,
  resumoGarantias,
  prazoPadraoDaLoja,
  definirPrazoPadraoDaLoja
} from '../db/queries/garantias'

/**
 * Garantias.
 *
 * ── ⚠️ Quem faz o quê, e por quê ────────────────────────────────────────────
 * CONSULTAR e ABRIR são de qualquer operador logado: é atendimento de balcão,
 * acontece com o cliente na frente, e exigir o dono ali faria o vendedor mandar
 * o cliente voltar outro dia.
 *
 * FECHAR é do dono. O desfecho é onde a loja assume (ou não) o custo de uma
 * troca, de um conserto ou de uma devolução, e é a linha que depois vira
 * relatório de quanto a garantia custa. Quem atende não decide sozinho quanto a
 * loja vai pagar.
 *
 * DEFINIR O PRAZO PADRÃO também é do dono: é uma promessa que passa a valer
 * para toda venda nova da loja.
 */

export function registrarHandlersGarantias(): void {
  registrarCanal('garantias:buscarItens', (termo: unknown) => {
    try {
      requerSessao()
      return { success: true, data: buscarItensVendidos(String(termo ?? '')) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('garantias:itensDaVenda', (vendaId: unknown) => {
    try {
      requerSessao()
      return { success: true, data: itensDaVenda(Number(vendaId)) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('garantias:listar', (situacao?: unknown) => {
    try {
      requerSessao()
      const s = String(situacao ?? '')
      const filtro = ['aberta', 'resolvida', 'recusada'].includes(s) ? s : undefined
      return { success: true, data: listarGarantias(filtro) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('garantias:doItem', (itemVendaId: unknown) => {
    try {
      requerSessao()
      return { success: true, data: garantiasDoItem(Number(itemVendaId)) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('garantias:resumo', () => {
    try {
      requerSessao()
      return { success: true, data: resumoGarantias() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('garantias:abrir', (dados: unknown) => {
    try {
      const sessao = requerSessao()
      const p = (dados ?? {}) as Record<string, unknown>
      const r = abrirGarantia({
        item_venda_id: Number(p.item_venda_id),
        defeito: String(p.defeito ?? ''),
        observacao: (p.observacao ?? null) as string | null,
        vendedor_id: sessao.id
      })
      obterBackupManager().marcarAlteracao()
      return { success: true, data: r }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal(
    'garantias:fechar',
    (id: unknown, desfecho: unknown, observacao?: unknown) => {
      try {
        requerDono()
        const sessao = requerSessao()
        fecharGarantia(
          Number(id),
          String(desfecho ?? ''),
          sessao.id,
          (observacao ?? null) as string | null
        )
        obterBackupManager().marcarAlteracao()
        return { success: true, data: null }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  registrarCanal('garantias:reabrir', (id: unknown) => {
    try {
      requerDono()
      reabrirGarantia(Number(id))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /*
   * ⚠️ LER o prazo padrão é livre, e precisa ser: o cadastro de produto mostra
   * "usa o padrão da loja (90 dias)" no campo vazio, e o comprovante imprime o
   * prazo. Negar a leitura ao vendedor deixaria os dois sem o número.
   */
  registrarCanal('garantias:prazoPadrao', () => {
    try {
      return { success: true, data: prazoPadraoDaLoja() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('garantias:definirPrazoPadrao', (dias: unknown) => {
    try {
      requerDono()
      definirPrazoPadraoDaLoja(Number(dias))
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
