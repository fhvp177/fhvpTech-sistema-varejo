import { obterBancoDeDados } from '../conexao'

export type Vendedor = {
  id: number
  nome: string
  ativo: number
  vendas_count: number
}

export function listarVendedores(): Vendedor[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT v.id, v.nome, v.ativo,
              (SELECT COUNT(*) FROM vendas vd WHERE vd.vendedor_id = v.id) AS vendas_count
       FROM vendedores v
       ORDER BY v.ativo DESC, v.nome COLLATE NOCASE`
    )
    .all() as Vendedor[]
}

export function criarVendedor(nome: string): { id: number; nome: string } {
  const db = obterBancoDeDados()
  const limpo = nome.trim()
  if (!limpo) throw new Error('Nome do vendedor não pode ficar vazio.')
  const result = db.prepare('INSERT INTO vendedores (nome) VALUES (?)').run(limpo)
  return { id: result.lastInsertRowid as number, nome: limpo }
}

export function atualizarVendedor(id: number, novoNome: string): void {
  const db = obterBancoDeDados()
  const limpo = novoNome.trim()
  if (!limpo) throw new Error('Nome do vendedor não pode ficar vazio.')
  const atual = db.prepare('SELECT nome FROM vendedores WHERE id = ?').get(id) as
    | { nome: string }
    | undefined
  if (!atual) throw new Error('Vendedor não encontrado.')
  if (atual.nome === limpo) return
  db.prepare('UPDATE vendedores SET nome = ? WHERE id = ?').run(limpo, id)
}

// Marca como ativo/inativo. Inativos somem do seletor do PDV
// mas continuam aparecendo nas vendas antigas.
export function alternarAtivoVendedor(id: number, ativo: boolean): void {
  const db = obterBancoDeDados()
  db.prepare('UPDATE vendedores SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, id)
}

// Bloqueia exclusão quando há vendas associadas — a única opção nesse caso é desativar.
export function deletarVendedor(id: number): void {
  const db = obterBancoDeDados()
  const { vendas_count } = db
    .prepare('SELECT COUNT(*) AS vendas_count FROM vendas WHERE vendedor_id = ?')
    .get(id) as { vendas_count: number }
  if (vendas_count > 0) {
    throw new Error(
      `Este vendedor possui ${vendas_count} venda${vendas_count !== 1 ? 's' : ''} registrada${
        vendas_count !== 1 ? 's' : ''
      } e não pode ser excluído. Você pode desativá-lo.`
    )
  }
  db.prepare('DELETE FROM vendedores WHERE id = ?').run(id)
}
