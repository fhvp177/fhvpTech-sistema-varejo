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
  cancelada?: number
  cancelada_em?: string | null
  cancelada_por_id?: number | null
  cancelamento_motivo?: string | null
  cancelada_por_nome?: string | null
  // 1 quando a venda consumiu crédito da loja (bloqueia o estorno simples — usar
  // devolução). Só é preenchido em buscarVendaPorId.
  usou_credito?: number
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

export function promoverVendasVencidas(): void {
  const db = obterBancoDeDados()
  // Promove parcelas vencidas (ignora parcelas de vendas canceladas)
  db.prepare(
    `UPDATE parcelas SET status = 'inadimplente'
     WHERE status = 'pendente' AND date(data_vencimento) < date('now')
       AND venda_id IN (SELECT id FROM vendas WHERE cancelada = 0)`
  ).run()
  // Promove vendas parceladas que têm parcelas em atraso
  db.prepare(
    `UPDATE vendas SET status_pagamento = 'inadimplente'
     WHERE status_pagamento = 'parcelado'
       AND cancelada = 0
       AND id IN (SELECT DISTINCT venda_id FROM parcelas WHERE status = 'inadimplente')`
  ).run()
  // Promove vendas simples pendentes vencidas
  db.prepare(
    `UPDATE vendas
     SET status_pagamento = 'inadimplente'
     WHERE status_pagamento = 'pendente'
       AND cancelada = 0
       AND data_vencimento IS NOT NULL
       AND date(data_vencimento) < date('now')`
  ).run()
}

// Sem `mes`: as 300 vendas mais recentes (visão padrão do histórico). Com `mes`
// ('YYYY-MM'): TODAS as vendas daquele mês, sem teto (um mês é naturalmente
// limitado). Filtrar o mês AQUI, no banco, evita o bug de esconder vendas antigas
// quando a loja passa de 300 vendas no total e o filtro era feito só em memória.
export function listarVendas(mes?: string): Venda[] {
  const db = obterBancoDeDados()
  promoverVendasVencidas()
  const filtroMes = mes ? 'AND substr(v.data, 1, 7) = @mes' : ''
  const limite = mes ? '' : 'LIMIT 300'
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
       WHERE v.cancelada = 0
       ${filtroMes}
       ORDER BY v.data DESC
       ${limite}`
    )
    .all(mes ? { mes } : {}) as Venda[]
}

// Vendas arquivadas (canceladas) — para a aba "Canceladas". Inclui quem cancelou,
// quando e o motivo (já vêm em v.*). Respeita o filtro de mês pela data da venda.
export function listarVendasCanceladas(mes?: string): Venda[] {
  const db = obterBancoDeDados()
  const filtroMes = mes ? 'AND substr(v.data, 1, 7) = @mes' : ''
  return db
    .prepare(
      `SELECT v.*, c.nome AS cliente_nome,
              vd.nome AS vendedor_nome,
              vdc.nome AS cancelada_por_nome,
              0 AS valor_inadimplente,
              COALESCE(dev.valor_devolvido, 0) AS valor_devolvido
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN vendedores vd ON vd.id = v.vendedor_id
       LEFT JOIN vendedores vdc ON vdc.id = v.cancelada_por_id
       LEFT JOIN (
         SELECT venda_id, SUM(valor_total) AS valor_devolvido
         FROM devolucoes
         GROUP BY venda_id
       ) dev ON dev.venda_id = v.id
       WHERE v.cancelada = 1
       ${filtroMes}
       ORDER BY v.cancelada_em DESC, v.id DESC`
    )
    .all(mes ? { mes } : {}) as Venda[]
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
              EXISTS(SELECT 1 FROM creditos_cliente cc WHERE cc.venda_id = v.id AND cc.tipo = 'uso') AS usou_credito,
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
      throw new Error('Para usar crédito, selecione o cliente gerente do crédito.')
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
      // valor_pago é a fonte da verdade do total recebido. À vista já entra
      // integralmente paga (senão relatório/dívida/cancelamento a leem como não
      // recebida). Parcelado/a prazo começam só com a entrada (0 se não houver).
      valor_pago: dados.status_pagamento === 'pago' ? total : entrada,
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

// Guarda comum de pagamento/estorno: uma venda cancelada (arquivada) não deve
// receber pagamento nem estorno. Defesa no backend — a UI já esconde as ações.
function garantirVendaAtiva(vendaId: number): void {
  const db = obterBancoDeDados()
  const v = db.prepare('SELECT cancelada FROM vendas WHERE id = ?').get(vendaId) as
    | { cancelada: number }
    | undefined
  if (!v) throw new Error('Venda não encontrada.')
  if (v.cancelada) throw new Error('Esta venda está cancelada e não aceita novas operações.')
}

// Estorno e devolução são dois mecanismos de reversão diferentes; sobrepô-los na
// mesma venda duplicaria o acerto (o cliente recebe de volta E a venda reabre
// devendo). Se já há devolução, o caminho é a devolução, não o estorno.
function garantirSemDevolucao(vendaId: number): void {
  const db = obterBancoDeDados()
  const tem = db.prepare('SELECT 1 FROM devolucoes WHERE venda_id = ? LIMIT 1').get(vendaId)
  if (tem) {
    throw new Error(
      'Esta venda tem devolução registrada — reverter o recebimento por cima duplicaria o acerto. Ajuste pela devolução.'
    )
  }
}

export function atualizarStatusVenda(id: number, status: StatusPagamento): void {
  garantirVendaAtiva(id)
  const db = obterBancoDeDados()
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
}

export function registrarPagamentoParcial(id: number, valor: number): void {
  const db = obterBancoDeDados()
  garantirVendaAtiva(id)
  db.transaction(() => {
    const venda = db
      .prepare('SELECT total, valor_pago, num_parcelas FROM vendas WHERE id = ?')
      .get(id) as { total: number; valor_pago: number; num_parcelas: number | null } | undefined
    if (!venda) throw new Error('Venda não encontrada.')
    if (venda.num_parcelas && venda.num_parcelas > 1) {
      throw new Error('Venda parcelada: registre o pagamento por parcela.')
    }
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
}

export function pagarParcela(parcelaId: number): void {
  const db = obterBancoDeDados()
  const parcela = db
    .prepare('SELECT venda_id, valor, status FROM parcelas WHERE id = ?')
    .get(parcelaId) as { venda_id: number; valor: number; status: string } | undefined
  if (!parcela) throw new Error('Parcela não encontrada.')
  garantirVendaAtiva(parcela.venda_id)

  db.transaction(() => {
    // Credita o valor da parcela no valor_pago da venda — só se ela ainda não
    // estava paga (evita somar duas vezes em clique duplo). Assim o valor_pago
    // reflete o total recebido (entrada + parcelas pagas) e o "restante"
    // (total - valor_pago) fica correto nas telas de dívida.
    const jaPaga = parcela.status === 'pago'
    db.prepare("UPDATE parcelas SET status = 'pago' WHERE id = ?").run(parcelaId)
    if (!jaPaga) {
      db.prepare('UPDATE vendas SET valor_pago = ROUND(valor_pago + ?, 2) WHERE id = ?')
        .run(parcela.valor, parcela.venda_id)
    }

    const { total, pagas } = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'pago' THEN 1 ELSE 0 END) AS pagas
         FROM parcelas WHERE venda_id = ?`
      )
      .get(parcela.venda_id) as { total: number; pagas: number }

    if (total === pagas) {
      // Quitada: fixa valor_pago = total para não acumular resíduo de centavos
      // do rateio das parcelas.
      const venda = db
        .prepare('SELECT total FROM vendas WHERE id = ?')
        .get(parcela.venda_id) as { total: number }
      db.prepare("UPDATE vendas SET status_pagamento = 'pago', valor_pago = ? WHERE id = ?")
        .run(venda.total, parcela.venda_id)
    } else {
      const temAtrasada = db
        .prepare("SELECT 1 FROM parcelas WHERE venda_id = ? AND status = 'inadimplente'")
        .get(parcela.venda_id)
      const novoStatus = temAtrasada ? 'inadimplente' : 'parcelado'
      db.prepare('UPDATE vendas SET status_pagamento = ? WHERE id = ?').run(novoStatus, parcela.venda_id)
    }
  })()
}

// Estorna (reverte) o recebimento de UMA parcela paga: devolve a parcela para
// pendente ou inadimplente conforme já venceu, tira o valor do total recebido da
// venda (valor_pago) e recalcula o status. É o inverso exato do pagarParcela e
// funciona em qualquer parcela paga, a qualquer momento. Ação do gerente — a trava
// de permissão fica no IPC.
export function estornarParcela(parcelaId: number): void {
  const db = obterBancoDeDados()
  const parcela = db
    .prepare('SELECT venda_id, valor, status FROM parcelas WHERE id = ?')
    .get(parcelaId) as { venda_id: number; valor: number; status: string } | undefined
  if (!parcela) throw new Error('Parcela não encontrada.')
  if (parcela.status !== 'pago') throw new Error('Esta parcela não está paga.')
  garantirVendaAtiva(parcela.venda_id)
  garantirSemDevolucao(parcela.venda_id)

  db.transaction(() => {
    // Volta a parcela para pendente/inadimplente conforme o vencimento.
    db.prepare(
      `UPDATE parcelas
       SET status = CASE WHEN data_vencimento < date('now', 'localtime') THEN 'inadimplente' ELSE 'pendente' END
       WHERE id = ?`
    ).run(parcelaId)
    // Tira o valor da parcela do total recebido (nunca abaixo de zero).
    db.prepare('UPDATE vendas SET valor_pago = MAX(0, ROUND(valor_pago - ?, 2)) WHERE id = ?')
      .run(parcela.valor, parcela.venda_id)
    // Recalcula o status da venda: se sobrou parcela atrasada, inadimplente;
    // senão volta a ser uma venda parcelada em aberto.
    const temAtrasada = db
      .prepare("SELECT 1 FROM parcelas WHERE venda_id = ? AND status = 'inadimplente'")
      .get(parcela.venda_id)
    const novoStatus = temAtrasada ? 'inadimplente' : 'parcelado'
    db.prepare('UPDATE vendas SET status_pagamento = ? WHERE id = ?').run(novoStatus, parcela.venda_id)
  })()
}

// Estorna o recebimento de uma venda SIMPLES (à vista ou a prazo sem parcelas):
// reabre a venda zerando o total recebido e voltando o status para pendente ou
// inadimplente conforme o vencimento. Vendas simples não guardam os pagamentos
// parciais individualmente, então o estorno é do recebimento inteiro — as
// parceladas usam estornarParcela. Ação do gerente (trava no IPC).
export function estornarRecebimento(vendaId: number): void {
  const db = obterBancoDeDados()
  const venda = db
    .prepare('SELECT cliente_id, num_parcelas, valor_pago, status_pagamento FROM vendas WHERE id = ?')
    .get(vendaId) as
    | { cliente_id: number | null; num_parcelas: number | null; valor_pago: number; status_pagamento: StatusPagamento }
    | undefined
  if (!venda) throw new Error('Venda não encontrada.')
  garantirVendaAtiva(vendaId)
  garantirSemDevolucao(vendaId)
  if (venda.num_parcelas && venda.num_parcelas > 1) {
    throw new Error('Venda parcelada: estorne parcela por parcela.')
  }
  // Venda avulsa (sem cliente): estornar criaria uma dívida sem a quem atribuir —
  // não há como cobrar. Aqui o caminho é a Devolução/troca, não o estorno.
  if (venda.cliente_id == null) {
    throw new Error(
      'Venda avulsa (sem cliente) não pode ser estornada — não há a quem atribuir o valor em aberto. Use Devolução/troca.'
    )
  }
  // Venda à vista grava valor_pago = 0 (é o status 'pago' que a marca como paga),
  // então "tem recebimento" quando valor_pago > 0 OU o status é 'pago'.
  const temRecebimento = venda.valor_pago > 0 || venda.status_pagamento === 'pago'
  if (!temRecebimento) throw new Error('Esta venda não tem recebimento para estornar.')
  // À vista que consumiu crédito da loja: reabrir sem devolver o crédito cobraria
  // o cliente duas vezes. Bloqueia — esse caso se resolve pela devolução.
  const usouCredito = db
    .prepare("SELECT 1 FROM creditos_cliente WHERE venda_id = ? AND tipo = 'uso'")
    .get(vendaId)
  if (usouCredito) {
    throw new Error(
      'Esta venda usou crédito da loja. Para reverter, faça uma devolução (o estorno não devolve o crédito).'
    )
  }

  db.prepare(
    `UPDATE vendas
     SET valor_pago = 0,
         status_pagamento = CASE
           WHEN data_vencimento IS NOT NULL AND data_vencimento < date('now', 'localtime') THEN 'inadimplente'
           ELSE 'pendente' END
     WHERE id = ?`
  ).run(vendaId)
}

// Estados em que cancelar é seguro (a regra completa fica aqui).
export type ElegibilidadeCancelamento =
  | { permitido: true; cenario: 'virgem' | 'devolvida' }
  | { permitido: false; motivo: string }

type EstadoVendaCancelamento = {
  total: number
  valor_pago: number
  cancelada: number
  valor_devolvido: number
}

function lerEstadoCancelamento(id: number): EstadoVendaCancelamento | undefined {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT v.total, v.valor_pago, v.cancelada,
              COALESCE((SELECT SUM(valor_total) FROM devolucoes WHERE venda_id = v.id), 0) AS valor_devolvido
       FROM vendas v WHERE v.id = ?`
    )
    .get(id) as EstadoVendaCancelamento | undefined
}

// Decide se a venda pode ser cancelada e em qual cenário:
//  • 'virgem'    — nada recebido e nada devolvido → cancelar devolve o estoque;
//  • 'devolvida' — já foi integralmente devolvida → cancelar só arquiva (a
//                  devolução já repôs estoque e estornou o dinheiro).
// Qualquer estado intermediário (recebido sem devolução, devolução parcial) é
// barrado: ainda há valor a acertar, e isso é trabalho da devolução.
export function avaliarCancelamento(estado: EstadoVendaCancelamento): ElegibilidadeCancelamento {
  if (estado.cancelada) return { permitido: false, motivo: 'Esta venda já está cancelada.' }
  const total = +estado.total.toFixed(2)
  const devolvido = +estado.valor_devolvido.toFixed(2)
  const pago = +estado.valor_pago.toFixed(2)
  if (pago === 0 && devolvido === 0) return { permitido: true, cenario: 'virgem' }
  if (devolvido >= total) return { permitido: true, cenario: 'devolvida' }
  return {
    permitido: false,
    motivo:
      'Só dá para cancelar uma venda sem nenhum recebimento, ou que já foi totalmente devolvida. ' +
      'Esta tem valor em aberto — faça a devolução do restante antes de cancelar.'
  }
}

// Eligibilidade para a UI decidir se mostra/habilita o botão "Cancelar".
export function elegibilidadeCancelamento(id: number): ElegibilidadeCancelamento {
  const estado = lerEstadoCancelamento(id)
  if (!estado) return { permitido: false, motivo: 'Venda não encontrada.' }
  return avaliarCancelamento(estado)
}

// Cancela (arquiva) a venda. No cenário 'virgem' devolve o estoque; no 'devolvida'
// não mexe em estoque/dinheiro (a devolução já acertou). A venda some de todos os
// relatórios pelo filtro `cancelada = 0`, mas fica no banco para auditoria.
export function cancelarVenda(id: number, canceladaPorId: number, motivo: string): void {
  const db = obterBancoDeDados()
  const motivoLimpo = (motivo ?? '').trim()
  if (!motivoLimpo) throw new Error('Informe o motivo do cancelamento.')

  const estado = lerEstadoCancelamento(id)
  if (!estado) throw new Error('Venda não encontrada.')
  const elegivel = avaliarCancelamento(estado)
  if (!elegivel.permitido) throw new Error(elegivel.motivo)

  // Venda com nota fiscal VÁLIDA não pode ser cancelada por aqui: o documento
  // continuaria valendo na SEFAZ, com mercadoria que não saiu. Cancelar a nota
  // é ato fiscal próprio (prazo curto, justificativa, registro na SEFAZ), então
  // exige ser feito antes — de propósito, na tela da nota.
  //
  // A tabela pode não existir em instalação que nunca teve o módulo fiscal.
  const temTabelaNota = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'nfce_emitidas'`)
    .get()
  if (temTabelaNota) {
    const notaViva = db
      .prepare(
        `SELECT numero, status FROM nfce_emitidas
         WHERE venda_id = ? AND status IN ('autorizado','pendente')
         ORDER BY tentativa DESC LIMIT 1`
      )
      .get(id) as { numero: number; status: string } | undefined
    if (notaViva) {
      throw new Error(
        notaViva.status === 'pendente'
          ? 'Esta venda tem uma nota fiscal aguardando a SEFAZ. Verifique o resultado antes de cancelar.'
          : `Esta venda tem a nota fiscal nº ${notaViva.numero} autorizada. Cancele a nota primeiro (na lista de vendas, no ícone da nota).`
      )
    }
  }

  const itens = db
    .prepare('SELECT produto_id, variacao_id, quantidade FROM itens_venda WHERE venda_id = ?')
    .all(id) as Array<{ produto_id: number; variacao_id: number | null; quantidade: number }>

  db.transaction(() => {
    if (elegivel.cenario === 'virgem') {
      // Venda nunca acertada por devolução: devolve o estoque ao cancelar.
      const incProduto = db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?')
      const incVariacao = db.prepare('UPDATE produto_variacoes SET estoque = estoque + ? WHERE id = ?')
      for (const it of itens) {
        if (it.variacao_id != null) incVariacao.run(it.quantidade, it.variacao_id)
        else incProduto.run(it.quantidade, it.produto_id)
      }
    }
    db.prepare(
      `UPDATE vendas
       SET cancelada = 1, cancelada_em = datetime('now', 'localtime'),
           cancelada_por_id = ?, cancelamento_motivo = ?
       WHERE id = ?`
    ).run(canceladaPorId, motivoLimpo, id)
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
         AND v.cancelada = 0
       GROUP BY iv.produto_id
       ORDER BY quantidade DESC, receita DESC
       LIMIT 50`
    )
    .all(mes) as ProdutoMaisVendido[]
}

export type AReceberPorVencimento = {
  a_vencer: number // vencimento de hoje em diante, ainda em aberto
  vencido: number  // vencimento já passou e ninguém pagou (em atraso)
}

// Quanto a loja tem pra receber com VENCIMENTO dentro de [inicio, fim] (ISO
// 'YYYY-MM-DD', inclusivo), somando parcelas em aberto e vendas simples a prazo.
// A âncora é o vencimento, não a data da venda — parcelas de vendas feitas em
// meses anteriores entram. É um número diferente (e complementar) do faturamento,
// que soma pela data da venda; somar os dois dobraria a contagem.
export function aReceberPorVencimento(inicio: string, fim: string): AReceberPorVencimento {
  promoverVendasVencidas()
  const db = obterBancoDeDados()
  const parcelas = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN date(p.data_vencimento) >= date('now') THEN p.valor ELSE 0 END), 0) AS a_vencer,
         COALESCE(SUM(CASE WHEN date(p.data_vencimento) <  date('now') THEN p.valor ELSE 0 END), 0) AS vencido
       FROM parcelas p
       JOIN vendas v ON v.id = p.venda_id
       WHERE p.status <> 'pago'
         AND v.cancelada = 0
         AND date(p.data_vencimento) >= ? AND date(p.data_vencimento) <= ?`
    )
    .get(inicio, fim) as AReceberPorVencimento
  const vendasSimples = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN date(data_vencimento) >= date('now') THEN total - valor_pago ELSE 0 END), 0) AS a_vencer,
         COALESCE(SUM(CASE WHEN date(data_vencimento) <  date('now') THEN total - valor_pago ELSE 0 END), 0) AS vencido
       FROM vendas
       WHERE status_pagamento IN ('pendente', 'inadimplente')
         AND cancelada = 0
         AND num_parcelas IS NULL
         AND data_vencimento IS NOT NULL
         AND total - valor_pago > 0
         AND date(data_vencimento) >= ? AND date(data_vencimento) <= ?`
    )
    .get(inicio, fim) as AReceberPorVencimento
  return {
    a_vencer: +(parcelas.a_vencer + vendasSimples.a_vencer).toFixed(2),
    vencido: +(parcelas.vencido + vendasSimples.vencido).toFixed(2)
  }
}

// Mesma conta, recortada para um mês ('YYYY-MM') — usada pelo relatório de vendas.
export function aReceberPorVencimentoNoMes(mes: string): AReceberPorVencimento {
  const [ano, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(ano, m, 0).getDate()
  return aReceberPorVencimento(`${mes}-01`, `${mes}-${String(ultimoDia).padStart(2, '0')}`)
}

export function resumoDashboard(): ResumoDashboard {
  promoverVendasVencidas()
  const db = obterBancoDeDados()
  const { vendas_hoje, total_hoje } = db
    .prepare(
      `SELECT COUNT(*) AS vendas_hoje, COALESCE(SUM(total), 0) AS total_hoje
       FROM vendas WHERE date(data) = date('now') AND cancelada = 0`
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
