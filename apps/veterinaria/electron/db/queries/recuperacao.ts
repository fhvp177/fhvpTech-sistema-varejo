import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import type { UsuarioEmail, CodigoRecuperacao } from '@fhvptech/core/electron/auth/store'

// Parte de recuperação de PIN por email da AuthStore (ver @fhvptech/core). Opera
// sobre `usuarios` e `recuperacao_codigos`. O motor (core) cuida de hash, prazo
// e tentativas; aqui é só persistência.

// Busca um usuário ATIVO cujo email bate (case-insensitive, com trim). null se
// nenhum. Tie-break: o dono vence (maior risco de lockout).
export function obterUsuarioAtivoPorEmail(email: string): UsuarioEmail | null {
  const alvo = email.trim().toLowerCase()
  if (!alvo) return null
  const db = obterBancoDeDados()
  const row = db
    .prepare(
      `SELECT id, nome, email FROM usuarios
       WHERE ativo = 1
         AND email IS NOT NULL AND LOWER(TRIM(email)) = ?
       ORDER BY papel = 'dono' DESC, id ASC
       LIMIT 1`
    )
    .get(alvo) as UsuarioEmail | undefined
  return row ?? null
}

// Substitui qualquer código anterior do usuário por um novo (1 ativo por vez).
export function salvarCodigoRecuperacao(
  usuarioId: number,
  codigoHash: string,
  expiraEm: string
): void {
  const db = obterBancoDeDados()
  db.transaction(() => {
    db.prepare('DELETE FROM recuperacao_codigos WHERE usuario_id = ?').run(usuarioId)
    db.prepare(
      'INSERT INTO recuperacao_codigos (usuario_id, codigo_hash, expira_em) VALUES (?, ?, ?)'
    ).run(usuarioId, codigoHash, expiraEm)
  })()
}

export function obterCodigoRecuperacao(usuarioId: number): CodigoRecuperacao | null {
  const db = obterBancoDeDados()
  const row = db
    .prepare(
      `SELECT id, codigo_hash, expira_em, tentativas
       FROM recuperacao_codigos WHERE usuario_id = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(usuarioId) as CodigoRecuperacao | undefined
  return row ?? null
}

export function incrementarTentativasCodigo(codigoId: number): void {
  const db = obterBancoDeDados()
  db.prepare('UPDATE recuperacao_codigos SET tentativas = tentativas + 1 WHERE id = ?').run(
    codigoId
  )
}

export function apagarCodigosRecuperacao(usuarioId: number): void {
  const db = obterBancoDeDados()
  db.prepare('DELETE FROM recuperacao_codigos WHERE usuario_id = ?').run(usuarioId)
}
