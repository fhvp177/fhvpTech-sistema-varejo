import { registrarCanal } from '@fhvptech/core/electron/roteador'
import { obterBackupManager } from '@fhvptech/core/electron/backup/BackupManager'
import { requerSessao } from '../sessao'
import {
  criarPedido,
  concluirPedido,
  cancelarPedido,
  listarPedidos,
  detalhePedido,
  totalSeparados,
  type DadosNovoPedido,
  type SituacaoPedido
} from '../db/queries/pedidos'

function validar(payload: unknown): Omit<DadosNovoPedido, 'vendedor_id'> {
  if (!payload || typeof payload !== 'object') throw new Error('Dados inválidos.')
  const p = payload as Record<string, unknown>

  const itens = Array.isArray(p.itens) ? p.itens : []
  if (itens.length === 0) throw new Error('Um pedido precisa de pelo menos um item.')

  const limpos = itens.map((i) => {
    const item = i as Record<string, unknown>
    const qtd = Number(item.quantidade)
    const preco = Number(item.preco_unitario)
    if (!Number.isFinite(qtd) || qtd <= 0) throw new Error('Quantidade inválida.')
    if (!Number.isFinite(preco) || preco < 0) throw new Error('Preço inválido.')
    return {
      produto_id: Number(item.produto_id),
      variacao_id: item.variacao_id == null ? null : Number(item.variacao_id),
      quantidade: Math.floor(qtd),
      preco_unitario: +preco.toFixed(2)
    }
  })

  const paraEntrega = !!p.para_entrega
  const endereco = String(p.endereco_entrega ?? '').trim() || null

  /*
   * ⚠️ Entrega sem endereço é pedido que ninguém consegue entregar. Barrar aqui
   * e não só na tela: o entregador só descobriria o problema com a joia na mão,
   * na rua.
   */
  if (paraEntrega && !endereco) {
    throw new Error('Para entregar é preciso informar o endereço.')
  }

  return {
    cliente_id: p.cliente_id == null || p.cliente_id === '' ? null : Number(p.cliente_id),
    para_entrega: paraEntrega,
    endereco_entrega: endereco,
    observacao: String(p.observacao ?? '').trim() || null,
    desconto: Number(p.desconto ?? 0) || 0,
    /*
     * ⚠️ O sinal atravessa a fronteira, e antes ele MORRIA aqui.
     *
     * A tela do PDV já oferecia o campo de sinal, e o botão "Separar pedido"
     * mandava o pedido sem ele: o operador recebia o dinheiro na maquininha, o
     * sistema não guardava nada, e o caixa fechava com sobra sem explicação.
     * Quem valida o valor e a forma é `criarPedido` — aqui só se limpa o que
     * veio da tela.
     */
    sinal: Number(p.sinal ?? 0) || 0,
    sinal_forma: (p.sinal_forma as string | null) ?? null,
    conta_id: p.conta_id == null || p.conta_id === '' ? null : Number(p.conta_id),
    caixa_id: p.caixa_id == null || p.caixa_id === '' ? null : Number(p.caixa_id),
    itens: limpos
  }
}

export function registrarHandlersPedidos(): void {
  registrarCanal('pedidos:criar', (dados: unknown) => {
    try {
      const sessao = requerSessao()
      const r = criarPedido({ ...validar(dados), vendedor_id: sessao.id })
      obterBackupManager().marcarAlteracao()
      return { success: true, data: r }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * O cliente pagou: o pedido vira venda.
   *
   * ⚠️ O vendedor da VENDA é quem está na sessão agora, não quem separou. É
   * quem recebeu o dinheiro que responde por ele — e é assim que a venda já
   * funciona em todo o resto do sistema.
   */
  registrarCanal('pedidos:concluir', (pedidoId: number, pagamento: unknown) => {
    try {
      const sessao = requerSessao()
      const p = (pagamento ?? {}) as Record<string, unknown>
      if (!p.caixa_id) throw new Error('CAIXA_FECHADO')
      const venda = concluirPedido(Number(pedidoId), {
        vendedor_id: sessao.id,
        caixa_id: Number(p.caixa_id),
        status_pagamento: (p.status_pagamento as 'pago') ?? 'pago',
        data_vencimento: (p.data_vencimento as string | null) ?? null,
        num_parcelas: p.num_parcelas == null ? null : Number(p.num_parcelas),
        entrada: Number(p.entrada ?? 0) || 0,
        forma_pagamento: (p.forma_pagamento as string | null) ?? null,
        // Em qual conta o dinheiro da ENTREGA entra. ⚠️ Ignorada quando a forma
        // é espécie: a nota fica na gaveta do operador (ver destinoDoRecebimento).
        conta_id: p.conta_id == null || p.conta_id === '' ? null : Number(p.conta_id)
      })
      obterBackupManager().marcarAlteracao()
      return { success: true, data: venda }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('pedidos:cancelar', (pedidoId: number, motivo?: string) => {
    try {
      requerSessao()
      cancelarPedido(Number(pedidoId), String(motivo ?? '').trim() || null)
      obterBackupManager().marcarAlteracao()
      return { success: true, data: null }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('pedidos:listar', (situacao?: string) => {
    try {
      return {
        success: true,
        data: listarPedidos((situacao as SituacaoPedido | 'todos') ?? 'separado')
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('pedidos:detalhe', (pedidoId: number) => {
    try {
      return { success: true, data: detalhePedido(Number(pedidoId)) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  registrarCanal('pedidos:totalSeparados', () => {
    try {
      return { success: true, data: totalSeparados() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
