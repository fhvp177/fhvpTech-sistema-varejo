import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

// Catálogo de serviços. ativo permite aposentar sem apagar (preserva histórico
// de vendas quando o faturamento existir).

export type Servico = {
  id: number
  nome: string
  preco: number
  ativo: number
  data_cadastro: string
}

export function listarServicos(): Servico[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT id, nome, preco, ativo, data_cadastro
       FROM servicos ORDER BY ativo DESC, nome COLLATE NOCASE`
    )
    .all() as Servico[]
}

function validarPreco(preco: number): number {
  const n = Number(preco)
  if (isNaN(n) || n < 0) throw new Error('O preço deve ser um valor maior ou igual a zero.')
  return Math.round(n * 100) / 100
}

export function criarServico(dados: { nome: string; preco: number }): { id: number } {
  const db = obterBancoDeDados()
  const nome = dados.nome.trim()
  if (!nome) throw new Error('Nome do serviço não pode ficar vazio.')
  const preco = validarPreco(dados.preco)
  const r = db.prepare('INSERT INTO servicos (nome, preco) VALUES (?, ?)').run(nome, preco)
  return { id: r.lastInsertRowid as number }
}

export function atualizarServico(id: number, dados: { nome?: string; preco?: number }): void {
  const db = obterBancoDeDados()
  const atual = db.prepare('SELECT nome, preco FROM servicos WHERE id = ?').get(id) as
    | { nome: string; preco: number }
    | undefined
  if (!atual) throw new Error('Serviço não encontrado.')
  const nome = dados.nome !== undefined ? dados.nome.trim() : atual.nome
  if (!nome) throw new Error('Nome do serviço não pode ficar vazio.')
  const preco = dados.preco !== undefined ? validarPreco(dados.preco) : atual.preco
  db.prepare('UPDATE servicos SET nome = ?, preco = ? WHERE id = ?').run(nome, preco, id)
}

export function alternarAtivoServico(id: number, ativo: boolean): void {
  const db = obterBancoDeDados()
  const r = db.prepare('UPDATE servicos SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, id)
  if (r.changes === 0) throw new Error('Serviço não encontrado.')
}

export function deletarServico(id: number): void {
  const db = obterBancoDeDados()
  db.prepare('DELETE FROM servicos WHERE id = ?').run(id)
}
