import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import type { UsuarioAuth, UsuarioParaLogin } from '@fhvptech/core/electron/auth/store'

// Queries sobre a tabela `usuarios` da veterinária. Implementam a parte de
// usuários da AuthStore que o motor de auth do @fhvptech/core consome. Diferente
// do varejo, não há vínculo com vendas — usuário é só quem opera o sistema.

const COLUNAS_PUBLICAS = `
  id, nome, ativo, papel, email,
  CASE WHEN pin_hash IS NOT NULL AND LENGTH(pin_hash) > 0 THEN 1 ELSE 0 END AS tem_pin
`

export function obterUsuario(id: number): UsuarioAuth | null {
  const db = obterBancoDeDados()
  const u = db
    .prepare(`SELECT ${COLUNAS_PUBLICAS} FROM usuarios WHERE id = ?`)
    .get(id) as UsuarioAuth | undefined
  return u ?? null
}

export function listarParaLogin(): UsuarioParaLogin[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT id, nome, papel,
              CASE WHEN pin_hash IS NOT NULL AND LENGTH(pin_hash) > 0 THEN 1 ELSE 0 END AS tem_pin
       FROM usuarios
       WHERE ativo = 1
       ORDER BY papel = 'dono' DESC, nome COLLATE NOCASE`
    )
    .all() as UsuarioParaLogin[]
}

// Uso interno do motor de auth — não exponha via IPC.
export function obterPinHash(id: number): string | null {
  const db = obterBancoDeDados()
  const row = db.prepare('SELECT pin_hash FROM usuarios WHERE id = ?').get(id) as
    | { pin_hash: string | null }
    | undefined
  return row?.pin_hash ?? null
}

export function gravarPinHash(id: number, pinHash: string): void {
  const db = obterBancoDeDados()
  const r = db.prepare('UPDATE usuarios SET pin_hash = ? WHERE id = ?').run(pinHash, id)
  if (r.changes === 0) throw new Error('Usuário não encontrado.')
}

export function contarDonosAtivos(): number {
  const db = obterBancoDeDados()
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM usuarios WHERE papel = 'dono' AND ativo = 1")
    .get() as { c: number }
  return row.c
}
