import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import { promoverVendasVencidas } from './vendas'
import { comErroAmigavelDeVinculo } from '../erros'

export type TipoPessoa = 'fisica' | 'juridica'

/**
 * ── ⚠️ As etiquetas de situação são CALCULADAS, nunca gravadas ──────────
 *
 * "Novo", "Reativado" e "Recorrente" não são etiquetas que alguém cola no
 * cliente: são leituras da história de compras dele, e mudam sozinhas quando
 * ele volta à oficina ou deixa de voltar.
 *
 * Guardar isso numa coluna seria mais rápido de consultar e estaria errado na
 * semana seguinte. Um "Recorrente" que parou de aparecer em março continuaria
 * escrito Recorrente para sempre, e a oficina mandaria mensagem de fidelidade
 * para quem sumiu — o oposto do que ela quer. Etiqueta gravada envelhece em
 * silêncio; conta refeita na hora, não.
 *
 * ── A escada, e ela é excludente ──────────────────────────────────
 * Cada cliente cai em exatamente um degrau, e a ordem importa:
 *
 *   1. Sem compras — cadastrado e nunca comprou.
 *   2. Inativo     — a última compra passou de INATIVO_DIAS.
 *   3. Reativado   — ficou um vão de VAO_REATIVACAO_DIAS sem comprar e voltou
 *                    dentro dos últimos JANELA_ATIVO_DIAS.
 *   4. Recorrente  — COMPRAS_RECORRENTE compras ou mais.
 *   5. Novo        — comprou pouco, e ainda está no prazo.
 *
 * ⚠️ Inativo vem ANTES de recorrente de propósito. Quem trouxe dez aparelhos e
 * sumiu há seis meses é um problema, não um cliente fiel — e é exatamente esse
 * que o dono precisa achar na lista.
 *
 * ⚠️ E reativado vem antes de recorrente pelo mesmo motivo: quem acabou de
 * voltar depois de um sumiço merece um tratamento diferente de quem nunca
 * parou, mesmo que os dois tenham o mesmo número de compras.
 *
 * ── ⚠️ Os prazos são chute informado, e ficam em um lugar só ────────────
 * Ninguém mediu o ciclo de retorno desta oficina ainda. Estes números vieram do
 * varejo e existem aqui como CONSTANTE justamente para serem trocados numa
 * linha quando o dono disser qual é o ritmo dele.
 *
 * ⚠️ E numa assistência o ritmo é outro: conserto não é compra de roupa. Um
 * cliente que aparece uma vez por ano com o notebook não sumiu — ele só não
 * quebrou nada. Vale confirmar os prazos antes de tratar "inativo" como perda.
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
  data_cadastro: string
  // ── Derivados, só de leitura. Não existem como coluna. ──
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
 * A lista de clientes já vem com a situação calculada.
 *
 * ⚠️ `date('now','localtime')`, e não `'now'` seco. O SQLite calcula em UTC:
 * das 21h em diante ele já acha que é o dia seguinte, e o cliente que comprou
 * hoje à noite entraria na conta com um dia a mais de idade. Numa fronteira de
 * 90 ou 180 dias isso troca a etiqueta de um cliente por causa do horário em
 * que alguém abriu a tela.
 *
 * ⚠️ Conta VENDA, e a entrega de uma OS gera venda — então o conserto entregue
 * conta como visita. OS aberta e ainda na bancada não conta, e está certo: o
 * cliente ainda não voltou para buscar.
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
                  sem olhar de compra em compra, "ficou um tempo sem voltar e
                  voltou" não é distinguível de "voltou duas vezes seguidas".
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
         LEFT JOIN resumo r ON r.cliente_id = c.id
        ORDER BY c.nome COLLATE NOCASE`
    )
    .all() as Cliente[]
}

export function criarCliente(dados: DadosCliente): Cliente {
  const db = obterBancoDeDados()
  const result = db
    .prepare(
      // Hora da loja, e não UTC — ver o comentário em criarVenda. Aqui alimenta
      // "clientes novos" do Painel: cadastrado às 22h virava cadastro de amanhã.
      `INSERT INTO clientes (nome, telefone, endereco, cpf, data_nascimento, tipo_pessoa, cnpj, razao_social, observacao, data_cadastro)
       VALUES (@nome, @telefone, @endereco, @cpf, @data_nascimento, @tipo_pessoa, @cnpj, @razao_social, @observacao, datetime('now','localtime'))`
    )
    .run(dados)
  // Cliente recém-criado não comprou nada ainda, e é isso que os derivados
  // dizem. Inventar aqui uma situação diferente faria a lista mostrar uma coisa
  // antes de recarregar e outra depois.
  return {
    id: result.lastInsertRowid as number,
    data_cadastro: new Date().toISOString(),
    ...dados,
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
     observacao = @observacao
     WHERE id = @id`
  ).run({ ...dados, id })
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
