import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { promoverVendasVencidas } from './vendas'
import { comErroAmigavelDeVinculo } from '../erros'

export type TipoPessoa = 'fisica' | 'juridica'

/**
 * ── ⚠️ As tags de situação são CALCULADAS, nunca gravadas ───────────────────
 *
 * "Novo", "Reativado" e "Recorrente" não são etiquetas que alguém cola no
 * cliente: são leituras da história de compras dele, e mudam sozinhas quando
 * ele compra ou deixa de comprar.
 *
 * Guardar isso numa coluna seria mais rápido de consultar e estaria errado na
 * semana seguinte. Um "Recorrente" que parou de comprar em março continuaria
 * escrito Recorrente para sempre, e o lojista mandaria promoção de fidelidade
 * para quem sumiu — o oposto do que ele quer. Etiqueta gravada envelhece em
 * silêncio; conta refeita na hora, não.
 *
 * ── A escada, e ela é excludente ────────────────────────────────────────────
 * Cada cliente cai em exatamente um degrau, e a ordem importa:
 *
 *   1. Sem compras — cadastrado e nunca comprou.
 *   2. Inativo     — a última compra passou de INATIVO_DIAS.
 *   3. Reativado   — ficou um vão de VAO_REATIVACAO_DIAS sem comprar e voltou
 *                    dentro dos últimos JANELA_ATIVO_DIAS.
 *   4. Recorrente  — COMPRAS_RECORRENTE compras ou mais.
 *   5. Novo        — comprou pouco, e ainda está no prazo.
 *
 * ⚠️ Inativo vem ANTES de recorrente de propósito. Quem comprou dez vezes e
 * sumiu há seis meses é um problema, não um cliente fiel — e é exatamente esse
 * que o lojista precisa achar na lista.
 *
 * ⚠️ E reativado vem antes de recorrente pelo mesmo motivo: quem acabou de
 * voltar depois de um sumiço merece um tratamento diferente de quem nunca
 * parou, mesmo que os dois tenham o mesmo número de compras.
 *
 * ── ⚠️ Os prazos são chute informado, e ficam em um lugar só ────────────────
 * Ninguém mediu o ciclo de compra desta loja ainda. Estes números são o padrão
 * de varejo de vestuário e joia, e existem aqui como CONSTANTE justamente para
 * serem trocados numa linha quando o lojista disser qual é o ritmo dele.
 */
export const JANELA_ATIVO_DIAS = 90
export const VAO_REATIVACAO_DIAS = 120
export const INATIVO_DIAS = 180
export const COMPRAS_RECORRENTE = 3

export type SituacaoCliente =
  | 'sem_compras'
  | 'novo'
  | 'recorrente'
  | 'reativado'
  | 'inativo'

export type Cliente = {
  id: number
  nome: string
  telefone: string
  endereco: string | null
  cpf: string | null
  data_nascimento: string | null
  tipo_pessoa: TipoPessoa
  cnpj: string | null
  razao_social: string | null
  observacao: string | null
  origem_id: number | null
  data_cadastro: string
  // ── Derivados, só de leitura. Não existem como coluna. ──
  origem_nome: string | null
  situacao: SituacaoCliente
  num_compras: number
  total_comprado: number
  ultima_compra: string | null
}

export type DadosCliente = {
  nome: string
  telefone: string
  endereco: string | null
  cpf: string | null
  data_nascimento: string | null
  tipo_pessoa: TipoPessoa
  cnpj: string | null
  razao_social: string | null
  observacao: string | null
  origem_id: number | null
}

export type ClienteInadimplente = {
  id: number
  nome: string
  telefone: string
  total_devido: number
  vencimento_mais_antigo: string
}

export type ClienteVencendoHoje = {
  id: number
  nome: string
  telefone: string
  total: number
  data_vencimento: string
}

/**
 * A lista de clientes já vem com a origem e a situação calculada.
 *
 * ⚠️ `date('now','localtime')`, e não `'now'` seco. O SQLite calcula em UTC:
 * das 21h em diante ele já acha que é o dia seguinte, e o cliente que comprou
 * hoje à noite entraria na conta com um dia a mais de idade. Numa fronteira de
 * 90 ou 180 dias isso troca a tag de um cliente por causa do horário em que o
 * lojista abriu a tela.
 */
export function listarClientes(): Cliente[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `WITH compras AS (
         SELECT cliente_id,
                total,
                date(data) AS d,
                /*
                  A compra anterior DESTE cliente. É o que permite achar o vão:
                  sem olhar de compra em compra, "ficou um tempo sem comprar e
                  voltou" não é distinguível de "comprou duas vezes seguidas".
                */
                LAG(date(data)) OVER (PARTITION BY cliente_id ORDER BY data, id) AS anterior
           FROM vendas
          WHERE cliente_id IS NOT NULL AND cancelada = 0
       ),
       resumo AS (
         SELECT cliente_id,
                COUNT(*) AS num_compras,
                SUM(total) AS total_comprado,
                MAX(d) AS ultima,
                /*
                  Quantas VOLTAS recentes: um vão longo seguido de uma compra
                  dentro da janela de ativo. Basta uma para o cliente ser um
                  reativado.
                */
                SUM(
                  CASE
                    WHEN anterior IS NOT NULL
                     AND julianday(d) - julianday(anterior) >= ${VAO_REATIVACAO_DIAS}
                     AND julianday(date('now','localtime')) - julianday(d) <= ${JANELA_ATIVO_DIAS}
                    THEN 1 ELSE 0
                  END
                ) AS retomadas
           FROM compras
          GROUP BY cliente_id
       )
       SELECT c.*,
              o.nome AS origem_nome,
              COALESCE(r.num_compras, 0) AS num_compras,
              COALESCE(r.total_comprado, 0) AS total_comprado,
              r.ultima AS ultima_compra,
              CASE
                WHEN COALESCE(r.num_compras, 0) = 0 THEN 'sem_compras'
                WHEN julianday(date('now','localtime')) - julianday(r.ultima) > ${INATIVO_DIAS}
                  THEN 'inativo'
                WHEN r.retomadas > 0 THEN 'reativado'
                WHEN r.num_compras >= ${COMPRAS_RECORRENTE} THEN 'recorrente'
                ELSE 'novo'
              END AS situacao
         FROM clientes c
         LEFT JOIN origens_cliente o ON o.id = c.origem_id
         LEFT JOIN resumo r ON r.cliente_id = c.id
        ORDER BY c.nome COLLATE NOCASE`
    )
    .all() as Cliente[]
}

export type LinhaCaptacao = {
  origem_id: number | null
  origem_nome: string
  clientes: number
  compradores: number
  num_compras: number
  total_comprado: number
  ticket_medio: number
  novos: number
  recorrentes: number
  reativados: number
  inativos: number
  sem_compras: number
}

/**
 * Quanto cada canal de captação trouxe, e que tipo de cliente ele trouxe.
 *
 * ── A pergunta que este relatório responde ──────────────────────────────────
 * Não é "quantos clientes vieram do Instagram". É se eles COMPRAM. Um canal que
 * traz cinquenta cadastros e nenhuma venda custa dinheiro e parece sucesso na
 * contagem de cadastros; o que traz oito clientes recorrentes é o que paga a
 * loja. Só a coluna do faturamento ao lado da coluna de cadastros mostra isso.
 *
 * ── ⚠️ Soma em cima de `listarClientes`, e não em SQL próprio ───────────────
 * A situação de cada cliente já é calculada lá, com todas as regras de degrau.
 * Escrever um segundo SQL aqui daria dois lugares para a definição de
 * "recorrente" morar, e no dia em que um mudasse, a tela e o relatório
 * passariam a discordar — sem nenhum erro, só com dois números diferentes para
 * a mesma pergunta.
 *
 * O custo é somar em memória. Para uma base de clientes de loja, é ruído.
 *
 * ⚠️ "Não informado" é uma LINHA do relatório, não uma omissão. É onde ficam os
 * clientes de antes desta funcionalidade, e escondê-los faria os totais não
 * baterem com o número de clientes da loja — o jeito mais rápido de o lojista
 * deixar de confiar no relatório inteiro.
 */
export function resumoCaptacao(): LinhaCaptacao[] {
  const clientes = listarClientes()
  const porOrigem = new Map<number | null, LinhaCaptacao>()

  for (const c of clientes) {
    const chave = c.origem_id ?? null
    let linha = porOrigem.get(chave)
    if (!linha) {
      linha = {
        origem_id: chave,
        origem_nome: c.origem_nome ?? 'Não informado',
        clientes: 0,
        compradores: 0,
        num_compras: 0,
        total_comprado: 0,
        ticket_medio: 0,
        novos: 0,
        recorrentes: 0,
        reativados: 0,
        inativos: 0,
        sem_compras: 0
      }
      porOrigem.set(chave, linha)
    }

    linha.clientes += 1
    linha.num_compras += c.num_compras
    linha.total_comprado += c.total_comprado
    if (c.num_compras > 0) linha.compradores += 1

    if (c.situacao === 'novo') linha.novos += 1
    else if (c.situacao === 'recorrente') linha.recorrentes += 1
    else if (c.situacao === 'reativado') linha.reativados += 1
    else if (c.situacao === 'inativo') linha.inativos += 1
    else linha.sem_compras += 1
  }

  const linhas = [...porOrigem.values()]
  for (const l of linhas) {
    l.total_comprado = +l.total_comprado.toFixed(2)
    // Ticket médio por COMPRA, não por cliente: é o valor que se compara com o
    // ticket médio do Painel, que também é por venda.
    l.ticket_medio = l.num_compras > 0 ? +(l.total_comprado / l.num_compras).toFixed(2) : 0
  }

  /*
   * Ordena pelo que o canal trouxe de dinheiro, do maior para o menor — que é a
   * ordem em que a pergunta é feita. "Não informado" vai para o fim mesmo que
   * some muito: ele não é um canal, é a ausência da resposta, e no topo da
   * tabela pareceria a melhor campanha da loja.
   */
  return linhas.sort((a, b) => {
    if (a.origem_id === null) return 1
    if (b.origem_id === null) return -1
    return b.total_comprado - a.total_comprado
  })
}

export function criarCliente(dados: DadosCliente): Cliente {
  const db = obterBancoDeDados()
  /*
   * ⚠️ `?? null` em campo novo, sempre.
   *
   * O INSERT usa parâmetros nomeados: quem chamar sem `origem_id` recebe
   * "missing named parameter" e o cadastro não acontece. E são três telas que
   * montam este objeto à mão — a de Clientes, o cadastro rápido do PDV e o da
   * devolução —, além de um renderer de versão anterior conversando com um
   * backend já atualizado.
   */
  const comPadroes = { ...dados, origem_id: dados.origem_id ?? null }
  const result = db
    .prepare(
      // Hora da loja, e não UTC — ver o comentário em criarVenda. Aqui alimenta
      // "clientes novos" do Painel: cadastrado às 22h virava cadastro de amanhã.
      `INSERT INTO clientes (nome, telefone, endereco, cpf, data_nascimento, tipo_pessoa, cnpj, razao_social, observacao, origem_id, data_cadastro)
       VALUES (@nome, @telefone, @endereco, @cpf, @data_nascimento, @tipo_pessoa, @cnpj, @razao_social, @observacao, @origem_id, datetime('now','localtime'))`
    )
    .run(comPadroes)
  // Cliente recém-criado não comprou nada ainda, e é isso que os derivados
  // dizem. Inventar aqui uma situação diferente faria a lista mostrar uma coisa
  // antes de recarregar e outra depois.
  return {
    id: result.lastInsertRowid as number,
    data_cadastro: new Date().toISOString(),
    ...comPadroes,
    origem_nome: null,
    situacao: 'sem_compras',
    num_compras: 0,
    total_comprado: 0,
    ultima_compra: null
  }
}

export function atualizarCliente(id: number, dados: DadosCliente): void {
  const db = obterBancoDeDados()
  db.prepare(
    `UPDATE clientes SET nome = @nome, telefone = @telefone, endereco = @endereco,
     cpf = @cpf, data_nascimento = @data_nascimento,
     tipo_pessoa = @tipo_pessoa, cnpj = @cnpj, razao_social = @razao_social,
     observacao = @observacao, origem_id = @origem_id
     WHERE id = @id`
  ).run({ ...dados, origem_id: dados.origem_id ?? null, id })
}

export function deletarCliente(id: number): void {
  const db = obterBancoDeDados()
  comErroAmigavelDeVinculo(
    () => db.prepare('DELETE FROM clientes WHERE id = ?').run(id),
    'Não dá pra excluir este cliente porque ele tem vendas no histórico. ' +
      'Mantenha o cadastro para preservar o histórico de compras e dívidas.'
  )
}

// Retorna clientes inadimplentes (com valores VENCIDOS, anteriores a hoje).
// Para vendas parceladas: soma apenas as parcelas em atraso (não o total da venda).
// Para vendas simples: usa o saldo em aberto (total - valor_pago), descontando
// entrada e pagamentos parciais já recebidos.
// Promove vencidos antes de consultar para não depender da ordem de carregamento
// da tela (igual listarVendas/resumoDashboard fazem).
export function listarInadimplentes(): ClienteInadimplente[] {
  const db = obterBancoDeDados()
  promoverVendasVencidas()
  return db
    .prepare(
      `SELECT
         c.id, c.nome, c.telefone,
         SUM(
           CASE WHEN v.num_parcelas IS NULL
           THEN (v.total - v.valor_pago)
           ELSE COALESCE(p_late.valor_overdue, 0)
           END
         ) AS total_devido,
         MIN(
           CASE WHEN v.num_parcelas IS NULL
           THEN v.data_vencimento
           ELSE p_late.min_venc
           END
         ) AS vencimento_mais_antigo
       FROM clientes c
       JOIN vendas v ON v.cliente_id = c.id
         AND v.cancelada = 0
         AND (v.status_pagamento = 'inadimplente'
           OR (v.status_pagamento = 'pendente' AND date(v.data_vencimento) < date('now')))
       LEFT JOIN (
         SELECT venda_id,
                SUM(valor)          AS valor_overdue,
                MIN(data_vencimento) AS min_venc
         FROM parcelas WHERE status = 'inadimplente'
         GROUP BY venda_id
       ) p_late ON p_late.venda_id = v.id
       GROUP BY c.id
       HAVING total_devido > 0
       ORDER BY vencimento_mais_antigo ASC`
    )
    .all() as ClienteInadimplente[]
}

// Retorna clientes com valores que vencem HOJE e ainda têm saldo em aberto.
// - Venda simples (a prazo): saldo = total - valor_pago, com vencimento hoje.
// - Venda parcelada: soma das parcelas pendentes que vencem hoje (mesmo que a
//   venda já esteja inadimplente por uma parcela mais antiga em atraso).
// Agrega por cliente: um cartão por cliente, somando tudo que vence hoje.
export function listarVencendoHoje(): ClienteVencendoHoje[] {
  const db = obterBancoDeDados()
  promoverVendasVencidas()
  return db
    .prepare(
      `SELECT c.id, c.nome, c.telefone,
              SUM(d.devido) AS total,
              MIN(d.venc)   AS data_vencimento
       FROM clientes c
       JOIN (
         SELECT v.cliente_id AS cliente_id,
                (v.total - v.valor_pago) AS devido,
                v.data_vencimento AS venc
         FROM vendas v
         WHERE v.num_parcelas IS NULL
           AND v.cancelada = 0
           AND v.status_pagamento = 'pendente'
           AND date(v.data_vencimento) = date('now')
         UNION ALL
         SELECT v.cliente_id AS cliente_id,
                p.valor AS devido,
                p.data_vencimento AS venc
         FROM parcelas p
         JOIN vendas v ON v.id = p.venda_id
         WHERE p.status = 'pendente'
           AND v.cancelada = 0
           AND date(p.data_vencimento) = date('now')
       ) d ON d.cliente_id = c.id
       GROUP BY c.id
       HAVING total > 0
       ORDER BY c.nome COLLATE NOCASE`
    )
    .all() as ClienteVencendoHoje[]
}
