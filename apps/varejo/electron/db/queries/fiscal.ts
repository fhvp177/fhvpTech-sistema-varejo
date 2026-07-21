import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

// Consultas de apoio da NFC-e. Aqui mora só o diagnóstico "a loja está pronta
// pra emitir?" — a emissão em si é da Fase 2 e vive no backend.
//
// A ideia do diagnóstico é simples: o lojista precisa descobrir o que falta
// SENTADO, com calma, e não com o cliente esperando no balcão. Por isso cada
// item é verificável de graça, sem chamar a API.

export type ProdutoSemClassificacao = {
  id: number
  nome: string
  codigo_barras: string | null
}

export type DiagnosticoFiscal = {
  total_produtos: number
  produtos_sem_ncm: number
  // Amostra pra tela não travar quando forem centenas.
  exemplos_sem_ncm: ProdutoSemClassificacao[]
}

// ─── Dados de uma venda para a nota ───────────────────────────────────────────

export type ItemFiscalVenda = {
  nome: string
  ncm: string | null
  cfop: string | null
  cst_csosn: string | null
  origem: string | null
  unidade: string | null
  quantidade: number
  valor_unitario: number
  codigo: string | null
  codigo_barras: string | null
}

// Dados fiscais do cliente — só usados na NF-e (venda para empresa), onde a
// SEFAZ exige o destinatário completo.
export type DestinatarioFiscal = {
  nome: string
  cnpj: string | null
  cpf: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  codigo_municipio: string | null
  inscricao_estadual: string | null
  indicador_ie: string | null
  telefone: string | null
}

export type VendaFiscal = {
  id: number
  total: number
  desconto: number
  cancelada: number
  forma_pagamento: string | null
  cliente_nome: string | null
  cliente_cpf: string | null
  cliente_cnpj: string | null
  /** 'juridica' decide o documento: PJ → NF-e, PF/sem cliente → NFC-e. */
  cliente_tipo_pessoa: string | null
  destinatario: DestinatarioFiscal | null
  itens: ItemFiscalVenda[]
}

// Junta a venda com a classificação fiscal de cada produto. O nome do item leva
// o tamanho junto (mesmo texto do cupom), pra a nota descrever o que o cliente
// levou — "Camiseta (M)" e não só "Camiseta".
export function vendaParaNota(vendaId: number): VendaFiscal | null {
  const db = obterBancoDeDados()

  const linha = db
    .prepare(
      `SELECT v.id, v.total, v.desconto, v.cancelada, v.forma_pagamento,
              c.nome AS cliente_nome, c.cpf AS cliente_cpf, c.cnpj AS cliente_cnpj,
              c.tipo_pessoa AS cliente_tipo_pessoa, c.razao_social, c.telefone,
              c.endereco_logradouro, c.endereco_numero, c.endereco_complemento,
              c.endereco_bairro, c.cidade, c.uf, c.cep, c.codigo_municipio,
              c.inscricao_estadual, c.indicador_ie
       FROM vendas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE v.id = ?`
    )
    .get(vendaId) as
    | (Omit<VendaFiscal, 'itens' | 'destinatario'> & Record<string, string | null>)
    | undefined
  if (!linha) return null

  // Destinatário só existe quando há cliente com nome — a NF-e precisa dele,
  // a NFC-e ignora.
  const destinatario: DestinatarioFiscal | null = linha.cliente_nome
    ? {
        // Na nota vale a razão social; o "nome" do cadastro costuma ser o
        // apelido pelo qual a loja conhece o cliente.
        nome: linha.razao_social || linha.cliente_nome,
        cnpj: linha.cliente_cnpj,
        cpf: linha.cliente_cpf,
        logradouro: linha.endereco_logradouro,
        numero: linha.endereco_numero,
        complemento: linha.endereco_complemento,
        bairro: linha.endereco_bairro,
        cidade: linha.cidade,
        uf: linha.uf,
        cep: linha.cep,
        codigo_municipio: linha.codigo_municipio,
        inscricao_estadual: linha.inscricao_estadual,
        indicador_ie: linha.indicador_ie,
        telefone: linha.telefone
      }
    : null

  const venda = { ...linha, destinatario }

  const itens = db
    .prepare(
      `SELECT p.nome || CASE WHEN pv.tamanho IS NOT NULL THEN ' (' || pv.tamanho || ')' ELSE '' END AS nome,
              p.ncm, p.cfop, p.cst_csosn, p.origem, p.unidade,
              iv.quantidade, iv.preco_unitario AS valor_unitario,
              p.referencia AS codigo,
              COALESCE(pv.codigo_barras, p.codigo_barras) AS codigo_barras
       FROM itens_venda iv
       JOIN produtos p ON p.id = iv.produto_id
       LEFT JOIN produto_variacoes pv ON pv.id = iv.variacao_id
       WHERE iv.venda_id = ?
       ORDER BY iv.id`
    )
    .all(vendaId) as ItemFiscalVenda[]

  return { ...venda, itens }
}

// ─── Registro local das notas emitidas ────────────────────────────────────────
// Espelha o que o backend guarda, mas serve à TELA: é daqui que sai o estado
// mostrado na lista de vendas. A autoridade sobre numeração e idempotência é do
// backend (ver nfce_numero/nfce_emissao lá).

export type NotaDaVenda = {
  id: number
  venda_id: number
  tentativa: number
  referencia: string
  acbr_id: string | null
  ambiente: string
  serie: number
  numero: number
  chave: string | null
  status: string
  motivo: string | null
  criada_em: string
}

// A nota que vale para a venda: a mais recente que não seja tentativa perdida.
export function notaDaVenda(vendaId: number): NotaDaVenda | null {
  const db = obterBancoDeDados()
  return (
    (db
      .prepare(
        `SELECT * FROM nfce_emitidas WHERE venda_id = ?
         ORDER BY tentativa DESC LIMIT 1`
      )
      .get(vendaId) as NotaDaVenda | undefined) ?? null
  )
}

// Notas de várias vendas de uma vez — a lista de vendas precisa disso sem
// disparar uma consulta por linha.
export function notasDasVendas(vendaIds: number[]): Record<number, NotaDaVenda> {
  if (!vendaIds.length) return {}
  const db = obterBancoDeDados()
  const marcadores = vendaIds.map(() => '?').join(',')
  const linhas = db
    .prepare(
      `SELECT n.* FROM nfce_emitidas n
       JOIN (
         SELECT venda_id, MAX(tentativa) AS t FROM nfce_emitidas
         WHERE venda_id IN (${marcadores})
         GROUP BY venda_id
       ) u ON u.venda_id = n.venda_id AND u.t = n.tentativa`
    )
    .all(...vendaIds) as NotaDaVenda[]

  const mapa: Record<number, NotaDaVenda> = {}
  for (const l of linhas) mapa[l.venda_id] = l
  return mapa
}

// Próximo número de tentativa da venda. Reenvio depois de uma rejeição precisa
// de referência NOVA — repetir a anterior faria a API devolver o documento
// antigo em vez de emitir outro.
export function proximaTentativa(vendaId: number): number {
  const db = obterBancoDeDados()
  const r = db
    .prepare('SELECT COALESCE(MAX(tentativa), 0) AS t FROM nfce_emitidas WHERE venda_id = ?')
    .get(vendaId) as { t: number }
  return r.t + 1
}

export function registrarNotaLocal(dados: {
  venda_id: number
  tentativa: number
  referencia: string
  acbr_id: string | null
  ambiente: string
  serie: number
  numero: number
  chave: string | null
  status: string
  motivo: string | null
}): void {
  const db = obterBancoDeDados()
  db.prepare(
    `INSERT INTO nfce_emitidas
       (venda_id, tentativa, referencia, acbr_id, ambiente, serie, numero, chave, status, motivo, atualizada_em)
     VALUES (@venda_id, @tentativa, @referencia, @acbr_id, @ambiente, @serie, @numero, @chave, @status, @motivo, datetime('now'))
     ON CONFLICT(referencia) DO UPDATE SET
       status = excluded.status, chave = excluded.chave, motivo = excluded.motivo,
       acbr_id = excluded.acbr_id, atualizada_em = datetime('now')`
  ).run(dados)
}

// Guarda o XML da nota. Vale ouro por dois motivos: é o documento que o
// lojista é obrigado a manter por 5 anos, e a ACBr só dá o primeiro download
// de graça (os seguintes custam crédito). Guardando aqui, nunca pedimos duas
// vezes o mesmo arquivo.
export function guardarXmlNota(referencia: string, xml: string): void {
  const db = obterBancoDeDados()
  db.prepare(
    `UPDATE nfce_emitidas SET xml = ?, atualizada_em = datetime('now')
     WHERE referencia = ? AND (xml IS NULL OR xml = '')`
  ).run(xml, referencia)
}

export function obterXmlNota(referencia: string): string | null {
  const db = obterBancoDeDados()
  const r = db.prepare('SELECT xml FROM nfce_emitidas WHERE referencia = ?').get(referencia) as
    | { xml: string | null }
    | undefined
  return r?.xml || null
}

// Notas de um mês, para o relatório e para entregar os XMLs ao contador.
export type NotaDoMes = NotaDaVenda & { venda_total: number; venda_data: string; tem_xml: number }

export function notasDoMes(mes: string): NotaDoMes[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT n.*, v.total AS venda_total, v.data AS venda_data,
              CASE WHEN n.xml IS NOT NULL AND n.xml <> '' THEN 1 ELSE 0 END AS tem_xml
       FROM nfce_emitidas n
       JOIN vendas v ON v.id = n.venda_id
       WHERE substr(n.criada_em, 1, 7) = ?
       ORDER BY n.criada_em DESC`
    )
    .all(mes) as NotaDoMes[]
}

// Meses que têm nota — alimenta o seletor do relatório.
export function mesesComNotas(): string[] {
  const db = obterBancoDeDados()
  const linhas = db
    .prepare(
      `SELECT DISTINCT substr(criada_em, 1, 7) AS mes FROM nfce_emitidas
       ORDER BY mes DESC`
    )
    .all() as Array<{ mes: string }>
  return linhas.map((l) => l.mes).filter(Boolean)
}

export function atualizarStatusNotaLocal(
  referencia: string,
  status: string,
  chave: string | null,
  motivo: string | null
): void {
  const db = obterBancoDeDados()
  db.prepare(
    `UPDATE nfce_emitidas
     SET status = ?, chave = COALESCE(?, chave), motivo = COALESCE(?, motivo),
         atualizada_em = datetime('now')
     WHERE referencia = ?`
  ).run(status, chave, motivo, referencia)
}

// ─── Classificação fiscal dos produtos ────────────────────────────────────────
// NCM, CFOP, CST/CSOSN, origem e unidade. Sem NCM o produto não sai em nota
// nenhuma, então isto é pré-requisito de tudo.
//
// Fica separado de criarProduto/atualizarProduto pelo mesmo motivo do cliente:
// aqueles caminhos são usados no PDV, no cadastro rápido e na importação de XML,
// e não quero acrescentar responsabilidade fiscal a eles.

export type FiscalProduto = {
  ncm: string
  cfop: string
  cst_csosn: string
  origem: string
  unidade: string
}

export type ProdutoClassificacao = {
  id: number
  nome: string
  categoria: string | null
  codigo_barras: string | null
  ncm: string | null
  cfop: string | null
  cst_csosn: string | null
  origem: string | null
  unidade: string | null
}

export function obterFiscalProduto(id: number): FiscalProduto | null {
  const db = obterBancoDeDados()
  const r = db
    .prepare('SELECT ncm, cfop, cst_csosn, origem, unidade FROM produtos WHERE id = ?')
    .get(id) as Record<string, string | null> | undefined
  if (!r) return null
  return {
    ncm: r.ncm ?? '',
    cfop: r.cfop ?? '',
    cst_csosn: r.cst_csosn ?? '',
    origem: r.origem ?? '0',
    unidade: r.unidade ?? 'UN'
  }
}

export function salvarFiscalProduto(id: number, dados: FiscalProduto): void {
  const db = obterBancoDeDados()
  db.prepare(
    `UPDATE produtos SET ncm = @ncm, cfop = @cfop, cst_csosn = @cst_csosn,
       origem = @origem, unidade = @unidade
     WHERE id = @id`
  ).run({ ...dados, id })
}

// Lista para a tela de classificação. `apenasPendentes` mostra só quem ainda
// não pode ser faturado — que é como o lojista trabalha: resolver o que falta.
export function listarParaClassificar(opcoes: {
  apenasPendentes?: boolean
  categoria?: string | null
  busca?: string
  limite?: number
}): ProdutoClassificacao[] {
  const db = obterBancoDeDados()
  const cond: string[] = []
  const params: unknown[] = []

  if (opcoes.apenasPendentes) cond.push(`(ncm IS NULL OR TRIM(ncm) = '')`)
  if (opcoes.categoria) {
    cond.push('categoria = ?')
    params.push(opcoes.categoria)
  }
  const busca = (opcoes.busca ?? '').trim()
  if (busca) {
    cond.push('(nome LIKE ? OR codigo_barras LIKE ?)')
    params.push(`%${busca}%`, `%${busca}%`)
  }

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  params.push(opcoes.limite ?? 500)

  return db
    .prepare(
      `SELECT id, nome, categoria, codigo_barras, ncm, cfop, cst_csosn, origem, unidade
       FROM produtos ${where}
       ORDER BY categoria IS NULL, categoria, nome
       LIMIT ?`
    )
    .all(...params) as ProdutoClassificacao[]
}

// Aplica a mesma classificação a vários produtos de uma vez. É o que torna a
// tarefa viável: uma loja de roupas tem dezenas de camisetas com o mesmo NCM, e
// preencher uma a uma seria cruel.
//
// `somentePendentes` protege quem já foi classificado pelo contador — aplicar
// em lote nunca deve sobrescrever um ajuste feito à mão sem querer.
export function aplicarFiscalEmLote(args: {
  ids?: number[]
  categoria?: string | null
  dados: Partial<FiscalProduto>
  somentePendentes?: boolean
}): number {
  const db = obterBancoDeDados()

  // Só mexe no que veio preenchido — campo em branco no formulário significa
  // "não alterar", nunca "apagar o que já existe".
  const campos: string[] = []
  const valores: unknown[] = []
  for (const campo of ['ncm', 'cfop', 'cst_csosn', 'origem', 'unidade'] as const) {
    const bruto = args.dados[campo]
    const v = bruto === undefined || bruto === null ? '' : String(bruto).trim()
    if (v) {
      campos.push(`${campo} = ?`)
      valores.push(v)
    }
  }
  if (!campos.length) return 0

  // Tudo posicional (better-sqlite3 não mistura nomeado com posicional).
  const cond: string[] = []
  if (args.ids?.length) {
    cond.push(`id IN (${args.ids.map(() => '?').join(',')})`)
    valores.push(...args.ids)
  } else if (args.categoria !== undefined) {
    if (args.categoria === null) {
      cond.push('categoria IS NULL')
    } else {
      cond.push('categoria = ?')
      valores.push(args.categoria)
    }
  }
  // Protege quem o contador já ajustou: aplicar em lote não sobrescreve.
  if (args.somentePendentes) cond.push(`(ncm IS NULL OR TRIM(ncm) = '')`)
  if (!cond.length) return 0

  const r = db
    .prepare(`UPDATE produtos SET ${campos.join(', ')} WHERE ${cond.join(' AND ')}`)
    .run(...valores)
  return Number(r.changes ?? 0)
}

// Categorias que ainda têm produto sem NCM — alimenta o "classifique por
// categoria", que é o caminho rápido.
export function categoriasPendentes(): Array<{ categoria: string | null; total: number }> {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT categoria, COUNT(*) AS total FROM produtos
       WHERE ncm IS NULL OR TRIM(ncm) = ''
       GROUP BY categoria ORDER BY total DESC`
    )
    .all() as Array<{ categoria: string | null; total: number }>
}

// ─── Cadastro fiscal do cliente (destinatário da NF-e) ────────────────────────
// Fica separado de criarCliente/atualizarCliente de propósito: aquelas funções
// são usadas no PDV e no cadastro rápido, e não quero acrescentar campos
// obrigatórios a um caminho que já funciona. Aqui só o que a NF-e precisa.

export type FiscalCliente = {
  endereco_logradouro: string
  endereco_numero: string
  endereco_complemento: string
  endereco_bairro: string
  cidade: string
  uf: string
  cep: string
  codigo_municipio: string
  inscricao_estadual: string
  indicador_ie: string
}

export function obterFiscalCliente(id: number): FiscalCliente | null {
  const db = obterBancoDeDados()
  const r = db
    .prepare(
      `SELECT endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro,
              cidade, uf, cep, codigo_municipio, inscricao_estadual, indicador_ie
       FROM clientes WHERE id = ?`
    )
    .get(id) as Record<string, string | null> | undefined
  if (!r) return null
  // Normaliza nulos em string vazia — a tela trabalha com campos controlados.
  return {
    endereco_logradouro: r.endereco_logradouro ?? '',
    endereco_numero: r.endereco_numero ?? '',
    endereco_complemento: r.endereco_complemento ?? '',
    endereco_bairro: r.endereco_bairro ?? '',
    cidade: r.cidade ?? '',
    uf: r.uf ?? '',
    cep: r.cep ?? '',
    codigo_municipio: r.codigo_municipio ?? '',
    inscricao_estadual: r.inscricao_estadual ?? '',
    indicador_ie: r.indicador_ie ?? '9'
  }
}

export function salvarFiscalCliente(id: number, dados: FiscalCliente): void {
  const db = obterBancoDeDados()
  db.prepare(
    `UPDATE clientes SET
       endereco_logradouro = @endereco_logradouro,
       endereco_numero = @endereco_numero,
       endereco_complemento = @endereco_complemento,
       endereco_bairro = @endereco_bairro,
       cidade = @cidade, uf = @uf, cep = @cep,
       codigo_municipio = @codigo_municipio,
       inscricao_estadual = @inscricao_estadual,
       indicador_ie = @indicador_ie
     WHERE id = @id`
  ).run({ ...dados, id })
}

// Grava como o cliente pagou. Hoje vem do modal ao emitir a nota; quando o TEF
// for integrado, virá da própria transação do cartão.
export function gravarFormaPagamento(vendaId: number, forma: string): void {
  const db = obterBancoDeDados()
  db.prepare('UPDATE vendas SET forma_pagamento = ? WHERE id = ?').run(forma, vendaId)
}

export function diagnosticoFiscal(limiteExemplos = 20): DiagnosticoFiscal {
  const db = obterBancoDeDados()

  const total = db.prepare('SELECT COUNT(*) AS n FROM produtos').get() as { n: number }

  // Só conta produto que pode ser vendido: NCM em branco é o que trava a nota.
  const semNcm = db
    .prepare(`SELECT COUNT(*) AS n FROM produtos WHERE ncm IS NULL OR TRIM(ncm) = ''`)
    .get() as { n: number }

  const exemplos = db
    .prepare(
      `SELECT id, nome, codigo_barras FROM produtos
       WHERE ncm IS NULL OR TRIM(ncm) = ''
       ORDER BY nome LIMIT ?`
    )
    .all(limiteExemplos) as ProdutoSemClassificacao[]

  return {
    total_produtos: total.n,
    produtos_sem_ncm: semNcm.n,
    exemplos_sem_ncm: exemplos
  }
}
