import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

/**
 * Origens de captação: por onde o cliente chegou na loja.
 *
 * A lista é livre, do mesmo jeito que as categorias de produto — quem define é
 * o lojista, porque só ele sabe onde anuncia. A diferença é que aqui o vínculo
 * é por `origem_id`, e não pelo nome copiado dentro do cliente. Ver a migration
 * 044 para o porquê.
 */
export type OrigemCliente = {
  id: number
  nome: string
  clientes_count: number
}

export function listarOrigens(): OrigemCliente[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT o.id, o.nome,
              (SELECT COUNT(*) FROM clientes c WHERE c.origem_id = o.id) AS clientes_count
         FROM origens_cliente o
        ORDER BY o.nome COLLATE NOCASE`
    )
    .all() as OrigemCliente[]
}

export function criarOrigem(nome: string): { id: number; nome: string } {
  const db = obterBancoDeDados()
  const limpo = nome.trim()
  if (!limpo) throw new Error('Nome da origem não pode ficar vazio.')

  // O UNIQUE é COLLATE NOCASE, então "instagram" colidiria com "Instagram". Sem
  // esta checagem o lojista receberia um erro de banco em inglês.
  const jaExiste = db
    .prepare('SELECT id FROM origens_cliente WHERE nome = ? COLLATE NOCASE')
    .get(limpo)
  if (jaExiste) throw new Error(`Já existe uma origem chamada "${limpo}".`)

  const r = db.prepare('INSERT INTO origens_cliente (nome) VALUES (?)').run(limpo)
  return { id: r.lastInsertRowid as number, nome: limpo }
}

/**
 * Renomear é UPDATE numa linha só, e nenhum cliente precisa ser tocado — é
 * justamente o que o vínculo por id compra.
 */
export function atualizarOrigem(id: number, novoNome: string): void {
  const db = obterBancoDeDados()
  const limpo = novoNome.trim()
  if (!limpo) throw new Error('Nome da origem não pode ficar vazio.')

  const colisao = db
    .prepare('SELECT id FROM origens_cliente WHERE nome = ? COLLATE NOCASE AND id != ?')
    .get(limpo, id)
  if (colisao) throw new Error(`Já existe uma origem chamada "${limpo}".`)

  const r = db.prepare('UPDATE origens_cliente SET nome = ? WHERE id = ?').run(limpo, id)
  if (r.changes === 0) throw new Error('Origem não encontrada.')
}

/**
 * Apagar solta os clientes que a usavam, e eles voltam a "não informado".
 *
 * ⚠️ Não é `DELETE` seco: sem zerar o `origem_id` antes, a chave estrangeira
 * deixaria clientes apontando para uma origem que não existe mais, e o
 * relatório passaria a contar um grupo sem nome que ninguém consegue explicar.
 */
export function deletarOrigem(id: number): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    db.prepare('UPDATE clientes SET origem_id = NULL WHERE origem_id = ?').run(id)
    db.prepare('DELETE FROM origens_cliente WHERE id = ?').run(id)
  })()
}
