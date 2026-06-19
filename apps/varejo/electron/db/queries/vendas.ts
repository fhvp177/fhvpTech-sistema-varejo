import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

export type StatusPagamento = 'pago' | 'pendente' | 'inadimplente' | 'parcelado'

export type Parcela = {
  id: number
  venda_id: number
  numero: number
  valor: number
  data_vencimento: string
  status: 'pendente' | 'pago' | 'inadimplente'
}

export type Venda = {
  id: number
  cliente_id: number | null
  vendedor_id: number | null
  data: string
  total: number
  desconto: number
  entrada: number
  valor_pago: number
  status_pagamento: StatusPagamento
  data_vencimento: string | null
  num_parcelas: number | null
  valor_inadimplente: number
  valor_devolvido: number
  cliente_nome?: string | null
  cliente_telefone?: string | null
  cliente_endereco?: string | null
  cliente_cpf?: string | null
  cliente_tipo_pessoa?: 'fisica' | 'juridica' | null
  cliente_cnpj?: string | null
  cliente_razao_social?: string | null
  vendedor_nome?: string | null
}

export type ItemVenda = {
  id: number
  venda_id: number
  produto_id: number
  variacao_id: number | null
  quantidade: number
  preco_unitario: number
  produto_nome?: string
  codigo_barras?: string
  tamanho?: string | null
}

export type VendaDetalhada = Venda & { itens: ItemVenda[]; parcelas: Parcela[] }

// Estado mínimo da venda para permitir "desfazer" uma ação de pagamento.
export type SnapshotVenda = {
  status: StatusPagamento
  valor_pago: number
  parcelas: Array<{ id: number; status: 'pendente' | 'pago' | 'inadimplente' }>
}

function obterSnapshotVenda(id: number): SnapshotVenda | undefined {
  const db = obterBancoDeDados()
  const venda = db
    .prepare('SELECT status_pagamento, valor_pago FROM vendas WHERE id = ?')
    .get(id) as { status_pagamento: StatusPagamento; valor_pago: number } | undefined
  if (!venda) return undefined
  const parcelas = db
    .prepare('SELECT id, status FROM parcelas WHERE venda_id = ?')
    .all(id) as Array<{ id: number; status: 'pendente' | 'pago' | 'inadimplente' }>
  return { status: venda.status_pagamento, valor_pago: venda.valor_pago, parcelas }
}

export type DadosNovaVenda = {
  cliente_id: number | null
  vendedor_id: number
  status_pagamento: StatusPagamento
  data_vencimento: string | null
  num_parcelas?: number | null
  desconto?: number
  // Entrada paga no ato — só em venda parcelada ou a prazo. Reduz o valor
  // financiado/devido e já entra como valor_pago. Em venda à vista é ignorada.
  entrada?: number
  // Crédito na loja do cliente abatido nesta venda (forma de pagamento "usar
  // crédito"). v1: só em venda à vista ('pago'). Lança um 'uso' no ledger.
  valor_credito_usado?: number
  itens: Array<{
    produto_id: number
    // Tamanho vendido, quando o produto é de grade. null/ausente = produto simples
    // (baixa do estoque do próprio produto).
    variacao_id?: number | null
    quantidade: number
    preco_unitario: number
  }>
}

export type ResumoDashboard = {
  vendas_hoje: number
  total_hoje: number
  total_clientes: number
  total_produtos: number
}

// Adiciona N meses a uma data ISO, respeitando o último dia do mês alvo
function adicionarMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  const anoAlvo = ano + Math.floor((mes - 1 + meses) / 12)
  const mesAlvo = (mes - 1 + meses) % 12
  const ultimoDia = new Date(anoAlvo, mesAlvo + 1, 0).getDate()
  const diaAlvo = Math.min(dia, ultimoDia)
  return `${anoAlvo}-${String(mesAlvo + 1).padStart(2, '0')}-${String(diaAlvo).padStart(2, '0')}`
}

function promoverVendasVencidas(): void {
  const db = obterBancoDeDados()
  // Promove parcelas vencidas
  db.prepare(
    `UPDATE parcelas SET status = 'inadimplente'
     WHERE status = 'pendente' AND date(data_vencimento) < date('now')`
  ).run()
  // Promove vendas parceladas que têm parcelas em atraso
  db.prepare(
    `UPDATE vendas SET status_pagamento = 'inadimplente'
     WHERE status_pagamento = 'parcelado'
       AND id IN (SELECT DISTINCT venda_id FROM parcelas WHERE status = 'inadimplente')`
  ).run()
  // Promove vendas simples pendentes vencidas
  db.prepare(
    `UPDATE vendas
     SET status_pagamento = 'inadimplente'
     WHERE status_pagamento = 'pendente'
       AND data_vencimento IS NOT NULL
       AND date(data_vencimento) < date('now')`
  ).run()
}

export function listarVendas(): Venda[] {
  const db = obterBancoDeDados()
  promoverVendasVencidas()
  return db
    .prepare(
      `SELECT v.*, c.nome AS cliente_nome,
              vd.nome AS vendedor_nome,
              COALESCE(p_late.valor_inadimplente, 0) AS valor_inadimplente,
              COALESCE(dev.valor_devolvido, 0) AS valor_devolvido
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
       LEFT JOIN (
         SELECT venda_id, SUM(valor) AS valor_inadimplente
         FROM parcelas WHERE status = 'inadimplente'
         GROUP BY venda_id
       ) p_late ON p_late.venda_id = v.id
       LEFT JOIN (
         SELECT venda_id, SUM(valor_total) AS valor_devolvido
         FROM devolucoes
         GROUP BY venda_id
       ) dev ON dev.venda_id = v.id
       ORDER BY v.data DESC
       LIMIT 300`
    )
    .all() as Venda[]
}

export function buscarVendaPorId(id: number): VendaDetalhada | undefined {
  const db = obterBancoDeDados()
  const venda = db
    .prepare(
      `SELECT v.*, c.nome AS cliente_nome,
              c.telefone AS cliente_telefone,
              c.endereco AS cliente_endereco,
              c.cpf AS cliente_cpf,
              c.tipo_pessoa AS cliente_tipo_pessoa,
              c.cnpj AS cliente_cnpj,
              c.razao_social AS cliente_razao_social,
              vd.nome AS vendedor_nome,
              COALESCE(p_late.valor_inadimplente, 0) AS valor_inadimplente,
              COALESCE(dev.valor_devolvido, 0) AS valor_devolvido
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
       LEFT JOIN (
         SELECT venda_id, SUM(valor) AS valor_inadimplente
         FROM parcelas WHERE status = 'inadimplente'
         GROUP BY venda_id
       ) p_late ON p_late.venda_id = v.id
       LEFT JOIN (
         SELECT venda_id, SUM(valor_total) AS valor_devolvido
         FROM devolucoes
         GROUP BY venda_id
       ) dev ON dev.venda_id = v.id
       WHERE v.id = ?`
    )
    .get(id) as Venda | undefined

  if (!venda) return undefined

  const itens = db
    .prepare(
      `SELECT iv.*,
              p.nome || CASE WHEN pv.tamanho IS NOT NULL THEN ' (' || pv.tamanho || ')' ELSE '' END AS produto_nome,
              COALESCE(pv.codigo_barras, p.codigo_barras) AS codigo_barras,
              pv.tamanho AS tamanho
       FROM itens_venda iv
       JOIN produtos p ON p.id = iv.produto_id
       LEFT JOIN produto_variacoes pv ON pv.id = iv.variacao_id
       WHERE iv.venda_id = ?`
    )
    .all(id) as ItemVenda[]

  const parcelas = db
    .prepare('SELECT * FROM parcelas WHERE venda_id = ? ORDER BY numero')
    .all(id) as Parcela[]

  return { ...venda, itens, parcelas }
}

export function criarVenda(dados: DadosNovaVenda): VendaDetalhada {
  const db = obterBancoDeDados()
  const ehParcelado = dados.status_pagamento === 'parcelado' && dados.num_parcelas && dados.num_parcelas > 1

  if (!dados.vendedor_id) {
    throw new Error('Selecione o vendedor responsável pela venda.')
  }
  const vendedor = db
    .prepare('SELECT id FROM vendedores WHERE id = ? AND ativo = 1')
    .get(dados.vendedor_id) as { id: number } | undefined
  if (!vendedor) {
    throw new Error('Vendedor inválido ou inativo.')
  }

  for (const item of dados.itens) {
    if (item.variacao_id != null) {
      const v = db
        .prepare(
          `SELECT pv.estoque AS estoque, pv.tamanho AS tamanho, p.nome AS nome
           FROM produto_variacoes pv JOIN produtos p ON p.id = pv.produto_id
           WHERE pv.id = ?`
        )
        .get(item.variacao_id) as { estoque: number; tamanho: string; nome: string } | undefined
      if (!v) throw new Error(`Tamanho #${item.variacao_id} não encontrado.`)
      if (item.quantidade > v.estoque) {
        throw new Error(
          `Estoque insuficiente para "${v.nome} (${v.tamanho})": ` +
          `solicitado ${item.quantidade}, disponível ${v.estoque}.`
        )
      }
    } else {
      const produto = db
        .prepare('SELECT nome, estoque FROM produtos WHERE id = ?')
        .get(item.produto_id) as { nome: string; estoque: number } | undefined

      if (!produto) throw new Error(`Produto #${item.produto_id} não encontrado.`)
      if (item.quantidade > produto.estoque) {
        throw new Error(
          `Estoque insuficiente para "${produto.nome}": ` +
          `solicitado ${item.quantidade}, disponível ${produto.estoque}.`
        )
      }
    }
  }

  const subtotal = dados.itens.reduce(
    (acc, item) => acc + item.quantidade * item.preco_unitario,
    0
  )
  const desconto = Math.max(0, +(dados.desconto ?? 0).toFixed(2))
  if (desconto > subtotal) {
    throw new Error('O desconto não pode ser maior que o subtotal da venda.')
  }
  const total = +(subtotal - desconto).toFixed(2)

  // Entrada paga no ato (parcelado ou a prazo). Reduz o valor financiado/devido
  // e entra como valor_pago. O total da venda permanece o valor cheio.
  const entrada = Math.max(0, +(dados.entrada ?? 0).toFixed(2))
  if (entrada > 0) {
    if (dados.status_pagamento === 'pago') {
      throw new Error('Venda à vista não tem entrada — o cliente paga o total.')
    }
    if (entrada >= total) {
      throw new Error('A entrada não pode ser igual ou maior que o total. Para receber tudo agora, use "À vista".')
    }
  }

  // Uso de crédito da loja (forma de pagamento "usar crédito"). v1: só à vista.
  const creditoUsado = Math.max(0, +(dados.valor_credito_usado ?? 0).toFixed(2))
  if (creditoUsado > 0) {
    if (!dados.cliente_id) {
      throw new Error('Para usar crédito, selecione o cliente dono do crédito.')
    }
    if (dados.status_pagamento !== 'pago') {
      throw new Error('Crédito da loja só pode ser usado em venda à vista.')
    }
    if (creditoUsado > total) {
      throw new Error('O crédito usado não pode ser maior que o total da venda.')
    }
    const { saldo } = db
      .prepare('SELECT COALESCE(SUM(valor), 0) AS saldo FROM creditos_cliente WHERE cliente_id = ?')
      .get(dados.cliente_id) as { saldo: number }
    if (creditoUsado > +saldo.toFixed(2)) {
      throw new Error(`Crédito insuficiente. Saldo disponível: R$ ${saldo.toFixed(2).replace('.', ',')}.`)
    }
  }

  const inserirVenda = db.prepare(
    `INSERT INTO vendas (cliente_id, vendedor_id, total, desconto, entrada, valor_pago, status_pagamento, data_vencimento, num_parcelas)
     VALUES (@cliente_id, @vendedor_id, @total, @desconto, @entrada, @valor_pago, @status_pagamento, @data_vencimento, @num_parcelas)`
  )
  const inserirItem = db.prepare(
    `INSERT INTO itens_venda (venda_id, produto_id, variacao_id, quantidade, preco_unitario)
     VALUES (@venda_id, @produto_id, @variacao_id, @quantidade, @preco_unitario)`
  )
  const decrementarEstoqueProduto = db.prepare(
    'UPDATE produtos SET estoque = estoque - ? WHERE id = ?'
  )
  const decrementarEstoqueVariacao = db.prepare(
    'UPDATE produto_variacoes SET estoque = estoque - ? WHERE id = ?'
  )
  const inserirParcela = db.prepare(
    `INSERT INTO parcelas (venda_id, numero, valor, data_vencimento)
     VALUES (@venda_id, @numero, @valor, @data_vencimento)`
  )

  let vendaId!: number
  db.transaction(() => {
    const result = inserirVenda.run({
      cliente_id: dados.cliente_id,
      vendedor_id: dados.vendedor_id,
      total,
      desconto,
      entrada,
      valor_pago: entrada,
      status_pagamento: dados.status_pagamento,
      data_vencimento: dados.data_vencimento,
      num_parcelas: dados.num_parcelas ?? null
    })
    vendaId = result.lastInsertRowid as number

    for (const item of dados.itens) {
      inserirItem.run({
        venda_id: vendaId,
        produto_id: item.produto_id,
        variacao_id: item.variacao_id ?? null,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario
      })
      if (item.variacao_id != null) {
        decrementarEstoqueVariacao.run(item.quantidade, item.variacao_id)
      } else {
        decrementarEstoqueProduto.run(item.quantidade, item.produto_id)
      }
    }

    if (ehParcelado && dados.data_vencimento && dados.num_parcelas) {
      const n = dados.num_parcelas
      // Só o que sobra depois da entrada é parcelado.
      const valorFinanciado = +(total - entrada).toFixed(2)
      const valorBase = Math.floor((valorFinanciado * 100) / n) / 100
      const valorUltima = +(valorFinanciado - valorBase * (n - 1)).toFixed(2)
      for (let i = 0; i < n; i++) {
        inserirParcela.run({
          venda_id: vendaId,
          numero: i + 1,
          valor: i === n - 1 ? valorUltima : valorBase,
          data_vencimento: adicionarMeses(dados.data_vencimento, i)
        })
      }
    }

    if (creditoUsado > 0) {
      db.prepare(
        `INSERT INTO creditos_cliente (cliente_id, tipo, valor, venda_id)
         VALUES (?, 'uso', ?, ?)`
      ).run(dados.cliente_id, -creditoUsado, vendaId)
    }
  })()

  return buscarVendaPorId(vendaId)!
}

export function atualizarStatusVenda(id: number, status: StatusPagamento): SnapshotVenda | undefined {
  const db = obterBancoDeDados()
  const snapshot = obterSnapshotVenda(id)
  db.transaction(() => {
    if (status === 'pago') {
      const venda = db.prepare('SELECT total FROM vendas WHERE id = ?').get(id) as { total: number } | undefined
      db.prepare('UPDATE vendas SET status_pagamento = ?, valor_pago = ? WHERE id = ?')
        .run(status, venda?.total ?? 0, id)
      db.prepare("UPDATE parcelas SET status = 'pago' WHERE venda_id = ?").run(id)
    } else {
      db.prepare('UPDATE vendas SET status_pagamento = ? WHERE id = ?').run(status, id)
    }
  })()
  return snapshot
}

export function registrarPagamentoParcial(id: number, valor: number): SnapshotVenda | undefined {
  const db = obterBancoDeDados()
  const snapshot = obterSnapshotVenda(id)
  db.transaction(() => {
    const venda = db
      .prepare('SELECT total, valor_pago FROM vendas WHERE id = ?')
      .get(id) as { total: number; valor_pago: number } | undefined
    if (!venda) throw new Error('Venda não encontrada.')
    if (valor <= 0) throw new Error('O valor deve ser maior que zero.')

    const restante = +(venda.total - venda.valor_pago).toFixed(2)
    if (restante <= 0) throw new Error('Esta venda já está totalmente paga.')

    const valorEfetivo = Math.min(valor, restante)
    const novoValorPago = +(venda.valor_pago + valorEfetivo).toFixed(2)
    const novoStatus = novoValorPago >= venda.total ? 'pago' : undefined

    if (novoStatus) {
      db.prepare('UPDATE vendas SET valor_pago = ?, status_pagamento = ? WHERE id = ?')
        .run(novoValorPago, novoStatus, id)
    } else {
      db.prepare('UPDATE vendas SET valor_pago = ? WHERE id = ?')
        .run(novoValorPago, id)
    }
  })()
  return snapshot
}

export function pagarParcela(parcelaId: number): { vendaId: number; snapshot: SnapshotVenda } | undefined {
  const db = obterBancoDeDados()
  const parcela = db
    .prepare('SELECT venda_id FROM parcelas WHERE id = ?')
    .get(parcelaId) as { venda_id: number } | undefined
  if (!parcela) return undefined
  const snapshot = obterSnapshotVenda(parcela.venda_id)
  if (!snapshot) return undefined

  db.transaction(() => {
    db.prepare("UPDATE parcelas SET status = 'pago' WHERE id = ?").run(parcelaId)

    const { total, pagas } = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'pago' THEN 1 ELSE 0 END) AS pagas
         FROM parcelas WHERE venda_id = ?`
      )
      .get(parcela.venda_id) as { total: number; pagas: number }

    if (total === pagas) {
      db.prepare("UPDATE vendas SET status_pagamento = 'pago' WHERE id = ?").run(parcela.venda_id)
    } else {
      const temAtrasada = db
        .prepare("SELECT 1 FROM parcelas WHERE venda_id = ? AND status = 'inadimplente'")
        .get(parcela.venda_id)
      const novoStatus = temAtrasada ? 'inadimplente' : 'parcelado'
      db.prepare('UPDATE vendas SET status_pagamento = ? WHERE id = ?').run(novoStatus, parcela.venda_id)
    }
  })()
  return { vendaId: parcela.venda_id, snapshot }
}

// Restaura uma venda ao estado capturado antes de uma ação de pagamento.
// Usado para "desfazer" cliques acidentais em botões de pagamento.
export function restaurarVenda(id: number, snapshot: SnapshotVenda): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    db.prepare('UPDATE vendas SET status_pagamento = ?, valor_pago = ? WHERE id = ?')
      .run(snapshot.status, snapshot.valor_pago, id)
    const atualizarParcela = db.prepare('UPDATE parcelas SET status = ? WHERE id = ?')
    for (const p of snapshot.parcelas) {
      atualizarParcela.run(p.status, p.id)
    }
  })()
}

export type ProdutoMaisVendido = {
  produto_nome: string
  quantidade: number
  receita: number
}

// Produtos mais vendidos em um mês ('YYYY-MM'), ordenados por quantidade.
// Usa substr(v.data, 1, 7) (e não strftime) pra casar exatamente com o filtro
// de mês do histórico no front, que compara os 7 primeiros caracteres da data.
export function produtosMaisVendidosNoMes(mes: string): ProdutoMaisVendido[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT p.nome AS produto_nome,
              SUM(iv.quantidade) AS quantidade,
              SUM(iv.quantidade * iv.preco_unitario) AS receita
       FROM itens_venda iv
       JOIN vendas v ON v.id = iv.venda_id
       JOIN produtos p ON p.id = iv.produto_id
       WHERE substr(v.data, 1, 7) = ?
       GROUP BY iv.produto_id
       ORDER BY quantidade DESC, receita DESC
       LIMIT 50`
    )
    .all(mes) as ProdutoMaisVendido[]
}

export function resumoDashboard(): ResumoDashboard {
  promoverVendasVencidas()
  const db = obterBancoDeDados()
  const { vendas_hoje, total_hoje } = db
    .prepare(
      `SELECT COUNT(*) AS vendas_hoje, COALESCE(SUM(total), 0) AS total_hoje
       FROM vendas WHERE date(data) = date('now')`
    )
    .get() as { vendas_hoje: number; total_hoje: number }

  const { total_clientes } = db
    .prepare('SELECT COUNT(*) AS total_clientes FROM clientes')
    .get() as { total_clientes: number }

  const { total_produtos } = db
    .prepare('SELECT COUNT(*) AS total_produtos FROM produtos')
    .get() as { total_produtos: number }

  return { vendas_hoje, total_hoje, total_clientes, total_produtos }
}
