import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import {
  estaEncerrada,
  podeTransitar,
  ROTULOS_STATUS,
  type StatusOS,
  type TipoAtendimento
} from './osCiclo'

// A OS cuida do TRABALHO; o dinheiro é da máquina de vendas (no fechamento os
// itens viram uma venda comum — ver fecharOS, Fase 3b-3). Regras do ciclo em
// osCiclo.ts (módulo puro). Toda mudança de status passa por mudarStatus, que
// valida a transição e grava a caixa-preta (os_historico).

export type ItemOS = {
  id: number
  os_id: number
  produto_id: number
  variacao_id: number | null
  quantidade: number
  preco_unitario: number
  produto_nome?: string
  produto_tipo?: string
  tamanho?: string | null
}

export type HistoricoOS = {
  id: number
  os_id: number
  status: StatusOS
  observacao: string | null
  vendedor_id: number
  vendedor_nome?: string
  criada_em: string
}

export type OrdemServico = {
  id: number
  tipo_atendimento: TipoAtendimento
  cliente_id: number
  tecnico_id: number
  status: StatusOS
  equipamento: string | null
  numero_serie: string | null
  acessorios: string | null
  estado_entrada: string | null
  senha_acesso: string | null
  endereco_atendimento: string | null
  agendado_para: string | null
  defeito_relatado: string
  diagnostico: string | null
  orcamento_aprovado_em: string | null
  garantia_dias: number
  entregue_em: string | null
  venda_id: number | null
  os_origem_id: number | null
  criada_em: string
  // enriquecidos nas listagens
  cliente_nome?: string
  cliente_telefone?: string | null
  tecnico_nome?: string
  total?: number
  dias_parada?: number
  garantia_ate?: string | null
}

export type OrdemDetalhada = OrdemServico & {
  itens: ItemOS[]
  historico: HistoricoOS[]
}

export type DadosNovaOS = {
  tipo_atendimento: TipoAtendimento
  cliente_id: number
  defeito_relatado: string
  equipamento?: string | null
  numero_serie?: string | null
  acessorios?: string | null
  estado_entrada?: string | null
  senha_acesso?: string | null
  endereco_atendimento?: string | null
  agendado_para?: string | null
}

export type DadosEdicaoOS = {
  defeito_relatado?: string
  diagnostico?: string | null
  equipamento?: string | null
  numero_serie?: string | null
  acessorios?: string | null
  estado_entrada?: string | null
  senha_acesso?: string | null
  endereco_atendimento?: string | null
  agendado_para?: string | null
  garantia_dias?: number
}

export type DadosItemOS = {
  produto_id: number
  variacao_id?: number | null
  quantidade: number
  preco_unitario: number
}

const limpar = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t || null
}

// SELECT base das listagens: nome do cliente/técnico, total do orçamento,
// dias parada (desde o último movimento) e fim da garantia (quando entregue).
const SELECT_OS = `
  SELECT os.*,
         c.nome AS cliente_nome,
         c.telefone AS cliente_telefone,
         v.nome AS tecnico_nome,
         COALESCE((SELECT SUM(i.quantidade * i.preco_unitario) FROM os_itens i WHERE i.os_id = os.id), 0) AS total,
         CAST(julianday('now', 'localtime') - julianday(
           COALESCE((SELECT MAX(h.criada_em) FROM os_historico h WHERE h.os_id = os.id), os.criada_em)
         ) AS INTEGER) AS dias_parada,
         CASE WHEN os.entregue_em IS NOT NULL
              THEN date(os.entregue_em, '+' || os.garantia_dias || ' days')
              ELSE NULL END AS garantia_ate
  FROM ordens_servico os
  JOIN clientes c ON c.id = os.cliente_id
  JOIN vendedores v ON v.id = os.tecnico_id`

export function listarOS(): OrdemServico[] {
  const db = obterBancoDeDados()
  return db.prepare(`${SELECT_OS} ORDER BY os.id DESC`).all() as OrdemServico[]
}

export function obterOS(id: number): OrdemDetalhada | null {
  const db = obterBancoDeDados()
  const os = db.prepare(`${SELECT_OS} WHERE os.id = ?`).get(id) as OrdemServico | undefined
  if (!os) return null

  const itens = db
    .prepare(
      `SELECT i.*, p.nome AS produto_nome, p.tipo AS produto_tipo, pv.tamanho AS tamanho
       FROM os_itens i
       JOIN produtos p ON p.id = i.produto_id
       LEFT JOIN produto_variacoes pv ON pv.id = i.variacao_id
       WHERE i.os_id = ?
       ORDER BY i.id`
    )
    .all(id) as ItemOS[]

  const historico = db
    .prepare(
      `SELECT h.*, v.nome AS vendedor_nome
       FROM os_historico h
       JOIN vendedores v ON v.id = h.vendedor_id
       WHERE h.os_id = ?
       ORDER BY h.id DESC`
    )
    .all(id) as HistoricoOS[]

  return { ...os, itens, historico }
}

function gravarHistorico(osId: number, status: StatusOS, observacao: string | null, vendedorId: number): void {
  const db = obterBancoDeDados()
  db.prepare(
    `INSERT INTO os_historico (os_id, status, observacao, vendedor_id) VALUES (?, ?, ?, ?)`
  ).run(osId, status, observacao, vendedorId)
}

export function criarOS(dados: DadosNovaOS, tecnicoId: number): OrdemDetalhada {
  const db = obterBancoDeDados()

  if (!dados.cliente_id) throw new Error('Selecione o cliente da OS.')
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(dados.cliente_id)
  if (!cliente) throw new Error('Cliente não encontrado.')

  const defeito = limpar(dados.defeito_relatado)
  if (!defeito) throw new Error('Descreva o defeito relatado pelo cliente.')

  const tipo: TipoAtendimento = dados.tipo_atendimento === 'externo' ? 'externo' : 'bancada'
  const equipamento = limpar(dados.equipamento)
  const endereco = limpar(dados.endereco_atendimento)
  if (tipo === 'bancada' && !equipamento) {
    throw new Error('Informe o equipamento que ficou na bancada (ex.: "Notebook Dell Inspiron").')
  }
  if (tipo === 'externo' && !endereco) {
    throw new Error('Informe o endereço do atendimento externo.')
  }

  let osId!: number
  db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO ordens_servico
           (tipo_atendimento, cliente_id, tecnico_id, equipamento, numero_serie, acessorios,
            estado_entrada, senha_acesso, endereco_atendimento, agendado_para, defeito_relatado)
         VALUES (@tipo, @cliente_id, @tecnico_id, @equipamento, @numero_serie, @acessorios,
                 @estado_entrada, @senha_acesso, @endereco, @agendado_para, @defeito)`
      )
      .run({
        tipo,
        cliente_id: dados.cliente_id,
        tecnico_id: tecnicoId,
        equipamento: tipo === 'bancada' ? equipamento : null,
        numero_serie: tipo === 'bancada' ? limpar(dados.numero_serie) : null,
        acessorios: tipo === 'bancada' ? limpar(dados.acessorios) : null,
        estado_entrada: tipo === 'bancada' ? limpar(dados.estado_entrada) : null,
        senha_acesso: tipo === 'bancada' ? limpar(dados.senha_acesso) : null,
        endereco: tipo === 'externo' ? endereco : null,
        agendado_para: tipo === 'externo' ? limpar(dados.agendado_para) : null,
        defeito
      })
    osId = r.lastInsertRowid as number
    gravarHistorico(osId, 'aberta', null, tecnicoId)
  })()

  return obterOS(osId)!
}

export function atualizarOS(id: number, dados: DadosEdicaoOS): void {
  const db = obterBancoDeDados()
  const atual = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id) as
    | (Record<string, string | number | null> & { status: StatusOS })
    | undefined
  if (!atual) throw new Error('OS não encontrada.')
  if (estaEncerrada(atual.status)) {
    throw new Error(`Esta OS está encerrada (${ROTULOS_STATUS[atual.status]}) e não pode mais ser editada.`)
  }

  const garantia = dados.garantia_dias
  if (garantia !== undefined && (!Number.isInteger(garantia) || garantia < 0 || garantia > 730)) {
    throw new Error('Garantia inválida: use um número de dias entre 0 e 730.')
  }

  const defeito = dados.defeito_relatado !== undefined ? limpar(dados.defeito_relatado) : undefined
  if (defeito === null) throw new Error('O defeito relatado não pode ficar vazio.')

  // Edição parcial: campo ausente no payload preserva o valor atual do banco
  // (mesma cautela do data_nascimento na poda da Fase 1 — nunca apagar por fora).
  const mesclar = (campo: keyof DadosEdicaoOS, coluna: string): string | null =>
    dados[campo] !== undefined ? limpar(dados[campo] as string | null) : (atual[coluna] as string | null)

  db.prepare(
    `UPDATE ordens_servico SET
       defeito_relatado = @defeito,
       diagnostico = @diagnostico,
       equipamento = @equipamento,
       numero_serie = @numero_serie,
       acessorios = @acessorios,
       estado_entrada = @estado_entrada,
       senha_acesso = @senha_acesso,
       endereco_atendimento = @endereco,
       agendado_para = @agendado_para,
       garantia_dias = @garantia
     WHERE id = @id`
  ).run({
    id,
    defeito: defeito ?? (atual.defeito_relatado as string),
    diagnostico: mesclar('diagnostico', 'diagnostico'),
    equipamento: mesclar('equipamento', 'equipamento'),
    numero_serie: mesclar('numero_serie', 'numero_serie'),
    acessorios: mesclar('acessorios', 'acessorios'),
    estado_entrada: mesclar('estado_entrada', 'estado_entrada'),
    senha_acesso: mesclar('senha_acesso', 'senha_acesso'),
    endereco: mesclar('endereco_atendimento', 'endereco_atendimento'),
    agendado_para: mesclar('agendado_para', 'agendado_para'),
    garantia: garantia ?? (atual.garantia_dias as number)
  })
}

// Substitui o orçamento inteiro (mesma estratégia da grade de tamanhos:
// o formulário manda o conjunto, o banco espelha). Editável só enquanto o
// orçamento está em construção; depois de enviado/aprovado, é preciso voltar
// o status pra 'orcamento' — mantém a aprovação do cliente honesta.
export function definirItensOS(osId: number, itens: DadosItemOS[], vendedorId: number): void {
  const db = obterBancoDeDados()
  const os = db.prepare('SELECT status FROM ordens_servico WHERE id = ?').get(osId) as
    | { status: StatusOS }
    | undefined
  if (!os) throw new Error('OS não encontrada.')
  if (os.status !== 'aberta' && os.status !== 'orcamento') {
    throw new Error(
      `O orçamento só pode ser alterado enquanto está em construção. ` +
        `Status atual: ${ROTULOS_STATUS[os.status]}.`
    )
  }

  for (const item of itens) {
    if (!item.produto_id) throw new Error('Item sem produto/serviço.')
    if (!Number.isInteger(item.quantidade) || item.quantidade < 1) {
      throw new Error('Quantidade inválida em um dos itens.')
    }
    if (typeof item.preco_unitario !== 'number' || isNaN(item.preco_unitario) || item.preco_unitario < 0) {
      throw new Error('Preço inválido em um dos itens.')
    }
    const p = db.prepare('SELECT id FROM produtos WHERE id = ?').get(item.produto_id)
    if (!p) throw new Error(`Produto/serviço #${item.produto_id} não encontrado.`)
  }

  db.transaction(() => {
    db.prepare('DELETE FROM os_itens WHERE os_id = ?').run(osId)
    const insert = db.prepare(
      `INSERT INTO os_itens (os_id, produto_id, variacao_id, quantidade, preco_unitario)
       VALUES (@os_id, @produto_id, @variacao_id, @quantidade, @preco_unitario)`
    )
    for (const item of itens) {
      insert.run({
        os_id: osId,
        produto_id: item.produto_id,
        variacao_id: item.variacao_id ?? null,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario
      })
    }
    // Mexeu no orçamento de uma OS recém-aberta = está orçando. O status
    // acompanha sozinho (e fica registrado na caixa-preta).
    if (os.status === 'aberta' && itens.length > 0) {
      db.prepare(`UPDATE ordens_servico SET status = 'orcamento' WHERE id = ?`).run(osId)
      gravarHistorico(osId, 'orcamento', 'Orçamento iniciado', vendedorId)
    }
  })()
}

export type ExtrasMudanca = {
  observacao?: string | null
  agendado_para?: string | null
}

export function mudarStatusOS(
  id: number,
  novo: StatusOS,
  vendedorId: number,
  extras: ExtrasMudanca = {}
): void {
  const db = obterBancoDeDados()
  const os = db
    .prepare('SELECT status, tipo_atendimento, agendado_para FROM ordens_servico WHERE id = ?')
    .get(id) as
    | { status: StatusOS; tipo_atendimento: TipoAtendimento; agendado_para: string | null }
    | undefined
  if (!os) throw new Error('OS não encontrada.')

  // Entrega não é uma simples mudança de status: passa pelo fechamento
  // (gera a venda, carimba a garantia) — botão "Entregar e receber".
  if (novo === 'entregue') {
    throw new Error('A entrega é feita pelo botão "Entregar e receber", que registra o recebimento.')
  }

  if (!podeTransitar(os.status, novo, os.tipo_atendimento)) {
    throw new Error(
      `Não dá pra ir de "${ROTULOS_STATUS[os.status]}" para "${ROTULOS_STATUS[novo]}".`
    )
  }

  const observacao = limpar(extras.observacao)
  if (novo === 'cancelada' && !observacao) {
    throw new Error('Informe o motivo do cancelamento.')
  }

  if (novo === 'aguardando_aprovacao') {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM os_itens WHERE os_id = ?').get(id) as { n: number }
    if (n === 0) throw new Error('Adicione ao menos um item ao orçamento antes de enviar pra aprovação.')
  }

  const agendadoPara = limpar(extras.agendado_para) ?? os.agendado_para
  if (novo === 'agendada' && !agendadoPara) {
    throw new Error('Informe a data/hora do agendamento.')
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE ordens_servico SET
         status = @novo,
         orcamento_aprovado_em = CASE WHEN @novo = 'aprovada'
           THEN datetime('now', 'localtime') ELSE orcamento_aprovado_em END,
         agendado_para = @agendado_para
       WHERE id = @id`
    ).run({ id, novo, agendado_para: agendadoPara })
    gravarHistorico(id, novo, observacao, vendedorId)
  })()
}

// "Este aparelho já passou aqui antes?" — busca por número de série.
export function historicoDoAparelho(numeroSerie: string, ignorarOsId?: number): OrdemServico[] {
  const db = obterBancoDeDados()
  const serie = (numeroSerie ?? '').trim()
  if (!serie) return []
  return db
    .prepare(
      `${SELECT_OS}
       WHERE os.numero_serie = ? AND os.id != ?
       ORDER BY os.id DESC
       LIMIT 10`
    )
    .all(serie, ignorarOsId ?? 0) as OrdemServico[]
}

// Reabre um serviço dentro da garantia: OS nova vinculada à original, sem
// orçamento (cortesia por padrão — o dono adiciona itens se for cobrar algo).
export function criarOSGarantia(osOrigemId: number, defeitoRelatado: string, tecnicoId: number): OrdemDetalhada {
  const db = obterBancoDeDados()
  const origem = db.prepare(`${SELECT_OS} WHERE os.id = ?`).get(osOrigemId) as OrdemServico | undefined
  if (!origem) throw new Error('OS de origem não encontrada.')
  if (origem.status !== 'entregue') {
    throw new Error('Só dá pra abrir garantia de uma OS já entregue.')
  }
  const dentroDaGarantia = db
    .prepare(
      `SELECT date('now', 'localtime') <= date(entregue_em, '+' || garantia_dias || ' days') AS ok
       FROM ordens_servico WHERE id = ?`
    )
    .get(osOrigemId) as { ok: number }
  if (!dentroDaGarantia.ok) {
    throw new Error(
      `A garantia desta OS terminou em ${origem.garantia_ate ?? '—'}. Abra uma OS comum.`
    )
  }

  const defeito = limpar(defeitoRelatado)
  if (!defeito) throw new Error('Descreva o problema apresentado na garantia.')

  let novaId!: number
  db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO ordens_servico
           (tipo_atendimento, cliente_id, tecnico_id, equipamento, numero_serie, senha_acesso,
            endereco_atendimento, defeito_relatado, os_origem_id)
         VALUES (@tipo, @cliente_id, @tecnico_id, @equipamento, @numero_serie, @senha_acesso,
                 @endereco, @defeito, @origem_id)`
      )
      .run({
        tipo: origem.tipo_atendimento,
        cliente_id: origem.cliente_id,
        tecnico_id: tecnicoId,
        equipamento: origem.equipamento,
        numero_serie: origem.numero_serie,
        senha_acesso: origem.senha_acesso,
        endereco: origem.endereco_atendimento,
        defeito,
        origem_id: osOrigemId
      })
    novaId = r.lastInsertRowid as number
    gravarHistorico(novaId, 'aberta', `Garantia da OS #${osOrigemId}`, tecnicoId)
  })()

  return obterOS(novaId)!
}
