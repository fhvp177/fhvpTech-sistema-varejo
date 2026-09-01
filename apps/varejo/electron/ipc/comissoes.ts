import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import {
  comissoesConfiguradas,
  definirComissaoPadrao,
  detalheComissao,
  estornarPagamentoComissao,
  limitesDoMes,
  listarPagamentosComissao,
  obterComissaoPadrao,
  registrarPagamentoComissao,
  resumoComissoes
} from '../db/queries/comissoes'
import { obterSessaoId, requerDono } from '../sessao'

/**
 * Canais de comissão.
 *
 * ── Todos exigem gerente, sem exceção ────────────────────────────────────────
 * Comissão é folha de pagamento. O risco aqui não é vazar pra fora da loja: é
 * vazar pra dentro — um vendedor lendo quanto o colega ganhou vira problema de
 * gente, e o sistema não tem como desfazer isso.
 *
 * A regra vale INCLUSIVE para `comissoes:configurado`, que devolve só um
 * booleano inofensivo. Não é que o booleano seja sensível: é que "todo canal
 * comissoes:* chama requerDono()" é uma regra que se verifica sozinha e não
 * depende de ninguém julgar caso a caso. Com uma exceção na lista, a segunda
 * exceção já entra sem discussão. Sem nenhuma, o teste estrutural prende.
 *
 * A tela chama `configurado` só quando quem está logado é gerente; para os
 * demais o canal responde erro, e a aba simplesmente não aparece — que é o
 * resultado desejado de qualquer forma.
 *
 * ── Quem pagou é quem está logado ────────────────────────────────────────────
 * `pago_por_id` sai de `obterSessaoId()`, nunca da tela. Assinatura que o
 * próprio chamador escolhe não é assinatura.
 */
export function registrarHandlersComissoes(): void {
  registrarCanal('comissoes:configurado', () => {
    try {
      requerDono()
      return { success: true, data: comissoesConfiguradas() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('comissoes:resumo', (mes: string) => {
    try {
      requerDono()
      const { inicio, fim } = limitesDoMes(mes)
      return {
        success: true,
        data: {
          inicio,
          fim,
          padrao: obterComissaoPadrao(),
          linhas: resumoComissoes(inicio, fim)
        }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('comissoes:detalhe', (vendedorId: number | null, mes: string) => {
    try {
      requerDono()
      const { inicio, fim } = limitesDoMes(mes)
      return { success: true, data: detalheComissao(vendedorId, inicio, fim) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal(
    'comissoes:registrarPagamento',
    (dados: { vendedor_id: number; mes: string; observacao?: string | null }) => {
      try {
        requerDono()
        const { inicio, fim } = limitesDoMes(dados.mes)
        const r = registrarPagamentoComissao({
          vendedor_id: dados.vendedor_id,
          periodo_inicio: inicio,
          periodo_fim: fim,
          pago_por_id: obterSessaoId(),
          observacao: dados.observacao ?? null
        })
        obterBackupManager().marcarAlteracao()
        return { success: true, data: r }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  registrarCanal('comissoes:estornarPagamento', (id: number) => {
    try {
      requerDono()
      estornarPagamentoComissao(id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('comissoes:listarPagamentos', (vendedorId?: number) => {
    try {
      requerDono()
      return { success: true, data: listarPagamentosComissao(vendedorId) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('comissoes:obterPadrao', () => {
    try {
      requerDono()
      return { success: true, data: obterComissaoPadrao() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('comissoes:definirPadrao', (pct: number) => {
    try {
      requerDono()
      definirComissaoPadrao(pct)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
