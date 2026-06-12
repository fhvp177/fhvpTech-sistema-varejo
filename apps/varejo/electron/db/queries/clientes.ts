import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

export type TipoPessoa = 'fisica' | 'juridica'

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

export function listarClientes(): Cliente[] {
  const db = obterBancoDeDados()
  return db
    .prepare('SELECT * FROM clientes ORDER BY nome COLLATE NOCASE')
    .all() as Cliente[]
}

export function criarCliente(dados: DadosCliente): Cliente {
  const db = obterBancoDeDados()
  const result = db
    .prepare(
      `INSERT INTO clientes (nome, telefone, endereco, cpf, data_nascimento, tipo_pessoa, cnpj, razao_social, observacao)
       VALUES (@nome, @telefone, @endereco, @cpf, @data_nascimento, @tipo_pessoa, @cnpj, @razao_social, @observacao)`
    )
    .run(dados)
  return { id: result.lastInsertRowid as number, data_cadastro: new Date().toISOString(), ...dados }
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
  db.prepare('DELETE FROM clientes WHERE id = ?').run(id)
}

// Retorna clientes inadimplentes.
// Para vendas parceladas: soma apenas as parcelas em atraso (não o total da venda).
// Para vendas simples: usa o total da venda.
export function listarInadimplentes(): ClienteInadimplente[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT
         c.id, c.nome, c.telefone,
         SUM(
           CASE WHEN v.num_parcelas IS NULL
           THEN v.total
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

// Retorna clientes com vendas pendentes que vencem hoje
export function listarVencendoHoje(): ClienteVencendoHoje[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT DISTINCT c.id, c.nome, c.telefone, v.total, v.data_vencimento
       FROM clientes c
       JOIN vendas v ON v.cliente_id = c.id
       WHERE v.status_pagamento = 'pendente'
         AND date(v.data_vencimento) = date('now')
       ORDER BY c.nome COLLATE NOCASE`
    )
    .all() as ClienteVencendoHoje[]
}
