import { obterBancoDeDados } from '../conexao'

export type Fornecedor = {
  id: number
  nome: string
  cnpj: string | null
  telefone: string | null
  email: string | null
  endereco: string | null
}

export type DadosFornecedor = Omit<Fornecedor, 'id'>

export function listarFornecedores(): Fornecedor[] {
  const db = obterBancoDeDados()
  return db.prepare('SELECT * FROM fornecedores ORDER BY nome COLLATE NOCASE').all() as Fornecedor[]
}

export function buscarFornecedorPorId(id: number): Fornecedor | undefined {
  const db = obterBancoDeDados()
  return db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(id) as Fornecedor | undefined
}

export function criarFornecedor(dados: DadosFornecedor): Fornecedor {
  const db = obterBancoDeDados()
  const result = db
    .prepare(
      `INSERT INTO fornecedores (nome, cnpj, telefone, email, endereco)
       VALUES (@nome, @cnpj, @telefone, @email, @endereco)`
    )
    .run(dados)
  return { id: result.lastInsertRowid as number, ...dados }
}

export function atualizarFornecedor(id: number, dados: DadosFornecedor): void {
  const db = obterBancoDeDados()
  db.prepare(
    `UPDATE fornecedores
     SET nome = @nome, cnpj = @cnpj, telefone = @telefone, email = @email, endereco = @endereco
     WHERE id = @id`
  ).run({ ...dados, id })
}

export function deletarFornecedor(id: number): void {
  const db = obterBancoDeDados()
  db.prepare('DELETE FROM fornecedores WHERE id = ?').run(id)
}
