import { registrarCanal } from '@fhvptech/core/electron/roteador'
import {
  listarVendas,
  listarVendasCanceladas,
  buscarVendaPorId,
  criarVenda,
  atualizarStatusVenda,
  pagarParcela,
  registrarPagamentoParcial,
  estornarParcela,
  estornarRecebimento,
  cancelarVenda,
  resumoDashboard,
  produtosMaisVendidosNoMes,
  aReceberPorVencimentoNoMes,
  type DadosNovaVenda,
  type StatusPagamento
} from '../db/queries/vendas'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { lerConfig } from '@fhvptech/core/electron/backup/configBackup'
import { requerSessao, ehDono } from '../sessao'
import { verificarPinDono } from '../auth'

// Dispara um backup ZIP em background após uma venda, se a opção estiver ativa.
// Não bloqueia o handler IPC e nunca propaga erros — o usuário não pode esperar
// por um backup pra confirmar uma venda.
function dispararBackupPorVendaSeAtivo(): void {
  if (lerConfig('backup_por_venda') !== '1') return
  obterBackupManager()
    .executarBackup('por-venda')
    .catch((err) => {
      console.warn('[backup] backup por-venda falhou:', (err as Error).message)
    })
}

export function registrarHandlersVendas(): void {
  registrarCanal('vendas:listar', (mes?: string) => {
    try {
      return { success: true, data: listarVendas(mes) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('vendas:listarCanceladas', (mes?: string) => {
    try {
      return { success: true, data: listarVendasCanceladas(mes) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('vendas:buscarPorId', (id: number) => {
    try {
      return { success: true, data: buscarVendaPorId(id) ?? null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // A venda é sempre atribuída ao vendedor logado. Ignora qualquer vendedor_id
  // que venha do renderer — a sessão é fonte da verdade pra rastreabilidade.
  registrarCanal('vendas:criar', (dados: DadosNovaVenda) => {
    try {
      const sessao = requerSessao()
      const resultado = criarVenda({ ...dados, vendedor_id: sessao.id })
      obterBackupManager().marcarAlteracao()
      dispararBackupPorVendaSeAtivo()
      return { success: true, data: resultado }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('vendas:atualizarStatus', (id: number, status: StatusPagamento) => {
    try {
      atualizarStatusVenda(id, status)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('vendas:pagarParcela', (parcelaId: number) => {
    try {
      pagarParcela(parcelaId)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('vendas:registrarPagamentoParcial', (id: number, valor: number) => {
    try {
      registrarPagamentoParcial(id, valor)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Estornar (reverter) um recebimento. Ação corretiva do gerente — coerente com a
  // hierarquia: o vendedor registra o recebimento, mas só o gerente reverte. A regra
  // de "o que" reverter fica nas queries. Uma parcela (parcelada) ou o recebimento
  // inteiro (venda simples).
  registrarCanal('vendas:estornarParcela', (parcelaId: number) => {
    try {
      requerSessao()
      if (!ehDono()) {
        throw new Error('Estornar um recebimento requer a autorização do gerente.')
      }
      estornarParcela(parcelaId)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('vendas:estornarRecebimento', (id: number) => {
    try {
      requerSessao()
      if (!ehDono()) {
        throw new Error('Estornar um recebimento requer a autorização do gerente.')
      }
      estornarRecebimento(id)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('vendas:resumoDashboard', () => {
    try {
      return { success: true, data: resumoDashboard() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('vendas:produtosMaisVendidos', (mes: string) => {
    try {
      return { success: true, data: produtosMaisVendidosNoMes(mes) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // A receber com vencimento dentro do mês ('YYYY-MM') — usado pelo relatório
  // de vendas, que não consegue derivar isso das vendas do mês (parcelas de
  // vendas antigas vencem no mês também).
  registrarCanal('vendas:aReceberDoMes', (mes: string) => {
    try {
      return { success: true, data: aReceberPorVencimentoNoMes(mes) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Cancelar (arquivar) uma venda. Só o gerente — ou um vendedor com o PIN do gerente,
  // mesmo fluxo do cadastro/desconto. A regra de quais vendas podem ser canceladas
  // (virgem ou totalmente devolvida) fica na query `cancelarVenda`.
  registrarCanal('vendas:cancelar', async (id: number, motivo: string, pinDono?: string) => {
    try {
      const sessao = requerSessao()
      let autorId = sessao.id
      if (!ehDono()) {
        const donoId = pinDono ? await verificarPinDono(pinDono) : null
        if (donoId === null) {
          throw new Error('Cancelar uma venda requer a autorização de um gerente.')
        }
        autorId = donoId
      }
      cancelarVenda(id, autorId, motivo)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
