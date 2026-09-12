import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

/**
 * As categorias de conta a pagar da loja.
 *
 * Espelha `categorias.ts` (as de produto) de propósito: mesma modelagem, mesmas
 * regras de renomear e apagar. O lojista aprende uma vez e vale para as duas
 * telas. O que NÃO vem junto é a grade de tamanhos, que só faz sentido em
 * produto de vestuário.
 *
 * ⚠️ A conta guarda o NOME, não o id — ver a migration 054.
 */

export type CategoriaConta = {
  id: number
  nome: string
  /** Quantas contas usam esta categoria. É o que avisa antes de apagar. */
  contas_count: number
}

export function listarCategoriasConta(): CategoriaConta[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT c.id, c.nome,
              (SELECT COUNT(*) FROM contas_pagar cp
                WHERE cp.categoria = c.nome COLLATE NOCASE) AS contas_count
         FROM categorias_conta c
        ORDER BY c.nome COLLATE NOCASE`
    )
    .all() as CategoriaConta[]
}

export function criarCategoriaConta(nome: string): { id: number; nome: string } {
  const db = obterBancoDeDados()
  const limpo = nome.trim()
  if (!limpo) throw new Error('Nome da categoria não pode ficar vazio.')
  const r = db.prepare('INSERT INTO categorias_conta (nome) VALUES (?)').run(limpo)
  return { id: Number(r.lastInsertRowid), nome: limpo }
}

/**
 * Renomeia e PROPAGA o nome novo para as contas que a usam.
 *
 * ⚠️ Sem propagar, renomear partiria o histórico em dois: as contas antigas
 * ficariam com o nome velho e as novas com o novo, e o relatório de despesas
 * por categoria mostraria a mesma despesa em duas linhas — que é exatamente o
 * problema que este cadastro veio resolver.
 */
export function atualizarCategoriaConta(id: number, novoNome: string): void {
  const db = obterBancoDeDados()
  const limpo = novoNome.trim()
  if (!limpo) throw new Error('Nome da categoria não pode ficar vazio.')

  const atual = db.prepare('SELECT nome FROM categorias_conta WHERE id = ?').get(id) as
    | { nome: string }
    | undefined
  if (!atual) throw new Error('Categoria não encontrada.')
  if (atual.nome === limpo) return

  db.transaction(() => {
    db.prepare('UPDATE categorias_conta SET nome = ? WHERE id = ?').run(limpo, id)
    db.prepare('UPDATE contas_pagar SET categoria = ? WHERE categoria = ? COLLATE NOCASE').run(
      limpo,
      atual.nome
    )
  })()
}

/**
 * Apaga a categoria e deixa as contas dela SEM categoria.
 *
 * ⚠️ As contas NÃO são apagadas, e isso precisa ser óbvio para quem clica: são
 * despesas pagas, com valor e data, e elas continuam no livro e no relatório do
 * mês. O que se perde é só a etiqueta — elas passam a contar em "Sem categoria".
 */
export function deletarCategoriaConta(id: number): void {
  const db = obterBancoDeDados()
  const atual = db.prepare('SELECT nome FROM categorias_conta WHERE id = ?').get(id) as
    | { nome: string }
    | undefined
  if (!atual) return

  db.transaction(() => {
    db.prepare('UPDATE contas_pagar SET categoria = NULL WHERE categoria = ? COLLATE NOCASE').run(
      atual.nome
    )
    db.prepare('DELETE FROM categorias_conta WHERE id = ?').run(id)
  })()
}
