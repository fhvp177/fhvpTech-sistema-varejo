import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { buscarVendaPorId } from './vendas'

export type TipoDevolucao = 'credito' | 'dinheiro'

// Um item da venda na perspectiva da devolução: o que foi vendido, o que já
// voltou em devoluções anteriores, o que ainda dá pra devolver, e quanto vale
// cada unidade (valor EFETIVO pago, já proporcional ao desconto da venda).
export type ItemDevolvivel = {
  item_venda_id: number
  produto_id: number
  produto_nome: string
  quantidade_vendida: number
  quantidade_devolvida: number
  quantidade_disponivel: number
  preco_unitario: number
  valor_unitario_devolvido: number
}

export type Devolucao = {
  id: number
  venda_id: number
  data: string
  vendedor_id: number
  autorizado_por_id: number | null
  tipo: TipoDevolucao
  valor_total: number
  motivo: string | null
}

export type ItemDevolverEntrada = {
  item_venda_id: number
  quantidade: number
  restocar: boolean
}

export type DadosNovaDevolucao = {
  venda_id: number
  vendedor_id: number // quem registra (vendedor logado)
  // Dono que autorizou — exigido pelo IPC quando tipo = 'dinheiro'. A query só
  // grava o valor; a verificação de que é realmente dono fica na camada de IPC.
  autorizado_por_id?: number | null
  tipo: TipoDevolucao
  cliente_id?: number | null // obrigatório p/ crédito (crédito é de alguém)
  motivo?: string | null
  itens: ItemDevolverEntrada[]
}

function arred2(n: number): number {
  return Math.round(n * 100) / 100
}

// Fator que converte preço de tabela no valor EFETIVAMENTE pago por unidade,
// rateando o desconto da venda: total / subtotal (subtotal = soma das linhas).
// Sem desconto → 1. Como o v1 só devolve venda 'pago', total == valor pago.
function fatorDesconto(
  itens: Array<{ preco_unitario: number; quantidade: number }>,
  total: number
): number {
  const subtotal = itens.reduce((acc, i) => acc + i.preco_unitario * i.quantidade, 0)
  if (subtotal <= 0) return 1
  return total / subtotal
}

// Mapa item_venda_id -> quantidade já devolvida (somando devoluções anteriores
// da mesma venda). Usado pra não deixar devolver mais do que foi comprado.
function quantidadesDevolvidas(vendaId: number): Map<number, number> {
  const db = obterBancoDeDados()
  const linhas = db
    .prepare(
      `SELECT idv.item_venda_id AS item_venda_id, SUM(idv.quantidade) AS qtd
       FROM itens_devolucao idv
       JOIN devolucoes d ON d.id = idv.devolucao_id
       WHERE d.venda_id = ?
       GROUP BY idv.item_venda_id`
    )
    .all(vendaId) as Array<{ item_venda_id: number; qtd: number }>
  return new Map(linhas.map((l) => [l.item_venda_id, l.qtd]))
}

// Itens de uma venda prontos pra UI de devolução, com saldo devolvível e valor.
export function itensDevolviveis(vendaId: number): ItemDevolvivel[] {
  const venda = buscarVendaPorId(vendaId)
  if (!venda) return []
  const fator = fatorDesconto(venda.itens, venda.total)
  const jaDevolvido = quantidadesDevolvidas(vendaId)
  return venda.itens.map((it) => {
    const devolvida = jaDevolvido.get(it.id) ?? 0
    return {
      item_venda_id: it.id,
      produto_id: it.produto_id,
      produto_nome: it.produto_nome ?? '',
      quantidade_vendida: it.quantidade,
      quantidade_devolvida: devolvida,
      quantidade_disponivel: it.quantidade - devolvida,
      preco_unitario: it.preco_unitario,
      valor_unitario_devolvido: arred2(it.preco_unitario * fator)
    }
  })
}

// Saldo de crédito na loja de um cliente = soma do ledger (entradas − usos).
export function saldoCredito(clienteId: number): number {
  const db = obterBancoDeDados()
  const row = db
    .prepare('SELECT COALESCE(SUM(valor), 0) AS saldo FROM creditos_cliente WHERE cliente_id = ?')
    .get(clienteId) as { saldo: number }
  return arred2(row.saldo)
}

export function buscarDevolucao(id: number): Devolucao | undefined {
  const db = obterBancoDeDados()
  return db.prepare('SELECT * FROM devolucoes WHERE id = ?').get(id) as Devolucao | undefined
}

// Registra uma devolução: grava o cabeçalho + itens, devolve estoque (dos itens
// marcados pra restocar) e, se for crédito, lança a entrada no ledger do cliente.
// Tudo numa transação. v1: só vendas 'pago'.
export function registrarDevolucao(dados: DadosNovaDevolucao): Devolucao {
  const db = obterBancoDeDados()

  const venda = buscarVendaPorId(dados.venda_id)
  if (!venda) throw new Error('Venda não encontrada.')
  if (venda.status_pagamento !== 'pago') {
    throw new Error(
      'No momento só dá pra devolver itens de vendas totalmente pagas. ' +
        'Para vendas a prazo/parceladas, fale com o dono.'
    )
  }
  if (!dados.vendedor_id) throw new Error('Vendedor responsável não informado.')
  if (!dados.itens.length) throw new Error('Selecione ao menos um item para devolver.')
  if (dados.tipo === 'credito' && !dados.cliente_id) {
    throw new Error('Para gerar crédito na loja é preciso identificar o cliente.')
  }

  const fator = fatorDesconto(venda.itens, venda.total)
  const jaDevolvido = quantidadesDevolvidas(dados.venda_id)
  const porItem = new Map(venda.itens.map((i) => [i.id, i]))

  const linhas = dados.itens.map((entrada) => {
    const it = porItem.get(entrada.item_venda_id)
    if (!it) throw new Error('Item selecionado não pertence a esta venda.')
    if (entrada.quantidade <= 0) throw new Error('Quantidade a devolver inválida.')
    const disponivel = it.quantidade - (jaDevolvido.get(it.id) ?? 0)
    if (entrada.quantidade > disponivel) {
      throw new Error(
        `Quantidade a devolver de "${it.produto_nome}" (${entrada.quantidade}) ` +
          `é maior que o disponível (${disponivel}).`
      )
    }
    return {
      item_venda_id: it.id,
      produto_id: it.produto_id,
      quantidade: entrada.quantidade,
      valor_unitario_devolvido: arred2(it.preco_unitario * fator),
      restocado: entrada.restocar ? 1 : 0
    }
  })

  const valorTotal = arred2(
    linhas.reduce((acc, l) => acc + l.valor_unitario_devolvido * l.quantidade, 0)
  )

  const inserirDevolucao = db.prepare(
    `INSERT INTO devolucoes (venda_id, vendedor_id, autorizado_por_id, tipo, valor_total, motivo)
     VALUES (@venda_id, @vendedor_id, @autorizado_por_id, @tipo, @valor_total, @motivo)`
  )
  const inserirItem = db.prepare(
    `INSERT INTO itens_devolucao (devolucao_id, item_venda_id, produto_id, quantidade, valor_unitario_devolvido, restocado)
     VALUES (@devolucao_id, @item_venda_id, @produto_id, @quantidade, @valor_unitario_devolvido, @restocado)`
  )
  const incrementarEstoqueProduto = db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?')
  const incrementarEstoqueVariacao = db.prepare('UPDATE produto_variacoes SET estoque = estoque + ? WHERE id = ?')
  const inserirCredito = db.prepare(
    `INSERT INTO creditos_cliente (cliente_id, tipo, valor, devolucao_id)
     VALUES (@cliente_id, 'entrada', @valor, @devolucao_id)`
  )

  let devolucaoId!: number
  db.transaction(() => {
    const res = inserirDevolucao.run({
      venda_id: dados.venda_id,
      vendedor_id: dados.vendedor_id,
      autorizado_por_id: dados.autorizado_por_id ?? null,
      tipo: dados.tipo,
      valor_total: valorTotal,
      motivo: dados.motivo ?? null
    })
    devolucaoId = res.lastInsertRowid as number

    for (const l of linhas) {
      inserirItem.run({ devolucao_id: devolucaoId, ...l })
      // Repõe no tamanho certo quando o item vendido era de grade; senão, no produto.
      if (l.restocado) {
        const variacaoId = porItem.get(l.item_venda_id)?.variacao_id ?? null
        if (variacaoId != null) incrementarEstoqueVariacao.run(l.quantidade, variacaoId)
        else incrementarEstoqueProduto.run(l.quantidade, l.produto_id)
      }
    }

    if (dados.tipo === 'credito') {
      inserirCredito.run({
        cliente_id: dados.cliente_id,
        valor: valorTotal,
        devolucao_id: devolucaoId
      })
    }
  })()

  return buscarDevolucao(devolucaoId)!
}

export type DevolucaoComItens = Devolucao & {
  cliente_nome: string | null
  itens: Array<{ produto_nome: string; quantidade: number; valor_unitario_devolvido: number }>
}

// Devoluções de uma venda (com itens e nome do cliente) — para reimprimir o
// comprovante de uma devolução já feita.
export function listarDevolucoesPorVenda(vendaId: number): DevolucaoComItens[] {
  const db = obterBancoDeDados()
  const devs = db
    .prepare(
      `SELECT d.*, c.nome AS cliente_nome
       FROM devolucoes d
       LEFT JOIN vendas v ON v.id = d.venda_id
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE d.venda_id = ?
       ORDER BY d.data ASC, d.id ASC`
    )
    .all(vendaId) as Array<Devolucao & { cliente_nome: string | null }>
  const itensStmt = db.prepare(
    `SELECT p.nome || CASE WHEN pv.tamanho IS NOT NULL THEN ' (' || pv.tamanho || ')' ELSE '' END AS produto_nome,
            idv.quantidade, idv.valor_unitario_devolvido
     FROM itens_devolucao idv
     JOIN produtos p ON p.id = idv.produto_id
     LEFT JOIN itens_venda iv ON iv.id = idv.item_venda_id
     LEFT JOIN produto_variacoes pv ON pv.id = iv.variacao_id
     WHERE idv.devolucao_id = ?`
  )
  return devs.map((d) => ({
    ...d,
    itens: itensStmt.all(d.id) as Array<{
      produto_nome: string
      quantidade: number
      valor_unitario_devolvido: number
    }>
  }))
}
