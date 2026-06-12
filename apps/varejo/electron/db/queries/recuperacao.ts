import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

export type UsuarioEmail = { id: number; nome: string; email: string }

// Busca um usuário ATIVO (dono OU vendedor) cujo email bate (case-insensitive,
// com trim). null se nenhum. Usado no envio e na validação do código. Tie-break:
// se um dono e um vendedor compartilharem o mesmo email (caso raro), o dono
// vence — ele tem o maior risco de lockout.
export function obterUsuarioAtivoPorEmail(email: string): UsuarioEmail | null {
  const alvo = email.trim().toLowerCase()
  if (!alvo) return null
  const db = obterBancoDeDados()
  const row = db
    .prepare(
      `SELECT id, nome, email FROM vendedores
       WHERE ativo = 1
         AND email IS NOT NULL AND LOWER(TRIM(email)) = ?
       ORDER BY papel = 'dono' DESC, id ASC
       LIMIT 1`
    )
    .get(alvo) as UsuarioEmail | undefined
  return row ?? null
}

export type CodigoRecuperacao = {
  id: number
  codigo_hash: string
  expira_em: string
  tentativas: number
}

// Substitui qualquer código anterior do vendedor por um novo (1 ativo por vez).
export function salvarCodigoRecuperacao(
  vendedorId: number,
  codigoHash: string,
  expiraEm: string
): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    db.prepare('DELETE FROM recuperacao_codigos WHERE vendedor_id = ?').run(vendedorId)
    db.prepare(
      'INSERT INTO recuperacao_codigos (vendedor_id, codigo_hash, expira_em) VALUES (?, ?, ?)'
    ).run(vendedorId, codigoHash, expiraEm)
  })()
}

export function obterCodigoRecuperacao(vendedorId: number): CodigoRecuperacao | null {
  const db = obterBancoDeDados()
  const row = db
    .prepare(
      `SELECT id, codigo_hash, expira_em, tentativas
       FROM recuperacao_codigos WHERE vendedor_id = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(vendedorId) as CodigoRecuperacao | undefined
  return row ?? null
}

export function incrementarTentativasCodigo(id: number): void {
  const db = obterBancoDeDados()
  db.prepare('UPDATE recuperacao_codigos SET tentativas = tentativas + 1 WHERE id = ?').run(id)
}

export function apagarCodigosRecuperacao(vendedorId: number): void {
  const db = obterBancoDeDados()
  db.prepare('DELETE FROM recuperacao_codigos WHERE vendedor_id = ?').run(vendedorId)
}
