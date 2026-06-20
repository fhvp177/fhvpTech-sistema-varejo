import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

export type Categoria = {
  id: number
  nome: string
  produtos_count: number
  usa_tamanhos: number
}

export function listarCategorias(): Categoria[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT c.id, c.nome, c.usa_tamanhos,
              (SELECT COUNT(*) FROM produtos p WHERE p.categoria = c.nome COLLATE NOCASE) AS produtos_count
       FROM categorias c
       ORDER BY c.nome COLLATE NOCASE`
    )
    .all() as Categoria[]
}

// Liga/desliga a grade de tamanhos (P/M/G/GG) para os produtos desta categoria.
export function definirUsaTamanhos(id: number, usa: boolean): void {
  const db = obterBancoDeDados()
  const r = db.prepare('UPDATE categorias SET usa_tamanhos = ? WHERE id = ?').run(usa ? 1 : 0, id)
  if (r.changes === 0) throw new Error('Categoria não encontrada.')
}

export function criarCategoria(nome: string): { id: number; nome: string } {
  const db = obterBancoDeDados()
  const limpo = nome.trim()
  if (!limpo) throw new Error('Nome da categoria não pode ficar vazio.')
  const result = db.prepare('INSERT INTO categorias (nome) VALUES (?)').run(limpo)
  return { id: result.lastInsertRowid as number, nome: limpo }
}

// Renomeia uma categoria e propaga o novo nome para todos os produtos que a usam.
export function atualizarCategoria(id: number, novoNome: string): void {
  const db = obterBancoDeDados()
  const limpo = novoNome.trim()
  if (!limpo) throw new Error('Nome da categoria não pode ficar vazio.')

  const atual = db.prepare('SELECT nome FROM categorias WHERE id = ?').get(id) as
    | { nome: string }
    | undefined
  if (!atual) throw new Error('Categoria não encontrada.')
  if (atual.nome === limpo) return

  db.transaction(() => {
    db.prepare('UPDATE categorias SET nome = ? WHERE id = ?').run(limpo, id)
    db.prepare('UPDATE produtos SET categoria = ? WHERE categoria = ? COLLATE NOCASE')
      .run(limpo, atual.nome)
  })()
}

// Remove a categoria e seta categoria=NULL nos produtos que a usavam.
export function deletarCategoria(id: number): void {
  const db = obterBancoDeDados()
  const atual = db.prepare('SELECT nome FROM categorias WHERE id = ?').get(id) as
    | { nome: string }
    | undefined
  if (!atual) return

  db.transaction(() => {
    db.prepare('UPDATE produtos SET categoria = NULL WHERE categoria = ? COLLATE NOCASE')
      .run(atual.nome)
    db.prepare('DELETE FROM categorias WHERE id = ?').run(id)
  })()
}
