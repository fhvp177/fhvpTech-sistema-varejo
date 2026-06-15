import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'
import type {
  UsuarioAuth,
  UsuarioParaLogin,
  PapelUsuario
} from '@fhvptech/core/electron/auth/store'

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

// ───── Gestão de usuários (área do dono) ──────────────────────────────

// Lista completa pra tela de gestão (inclui inativos). Login usa listarParaLogin.
export function listarUsuarios(): UsuarioAuth[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT ${COLUNAS_PUBLICAS}
       FROM usuarios
       ORDER BY ativo DESC, papel = 'dono' DESC, nome COLLATE NOCASE`
    )
    .all() as UsuarioAuth[]
}

export function criarUsuario(
  nome: string,
  opts: { papel?: PapelUsuario; email?: string | null } = {}
): { id: number; nome: string } {
  const db = obterBancoDeDados()
  const limpo = nome.trim()
  if (!limpo) throw new Error('Nome do usuário não pode ficar vazio.')
  const papel: PapelUsuario = opts.papel ?? 'funcionario'
  const email = opts.email?.trim() || null
  const result = db
    .prepare('INSERT INTO usuarios (nome, papel, email) VALUES (?, ?, ?)')
    .run(limpo, papel, email)
  return { id: result.lastInsertRowid as number, nome: limpo }
}

export function atualizarUsuario(
  id: number,
  dados: { nome?: string; email?: string | null }
): void {
  const db = obterBancoDeDados()
  const atual = db.prepare('SELECT nome, email FROM usuarios WHERE id = ?').get(id) as
    | { nome: string; email: string | null }
    | undefined
  if (!atual) throw new Error('Usuário não encontrado.')

  const novoNome = dados.nome !== undefined ? dados.nome.trim() : atual.nome
  if (!novoNome) throw new Error('Nome do usuário não pode ficar vazio.')
  const novoEmail = dados.email !== undefined ? dados.email?.trim() || null : atual.email

  if (novoNome === atual.nome && novoEmail === atual.email) return

  db.prepare('UPDATE usuarios SET nome = ?, email = ? WHERE id = ?').run(novoNome, novoEmail, id)
}

// Troca o papel. Bloqueia rebaixar o último dono ativo (sempre precisa de ≥1 dono).
export function alterarPapel(id: number, novoPapel: PapelUsuario): void {
  const db = obterBancoDeDados()
  const atual = db.prepare('SELECT papel FROM usuarios WHERE id = ?').get(id) as
    | { papel: PapelUsuario }
    | undefined
  if (!atual) throw new Error('Usuário não encontrado.')
  if (atual.papel === novoPapel) return

  if (atual.papel === 'dono' && novoPapel === 'funcionario') {
    const outros = db
      .prepare(
        "SELECT COUNT(*) AS c FROM usuarios WHERE papel = 'dono' AND ativo = 1 AND id != ?"
      )
      .get(id) as { c: number }
    if (outros.c === 0) {
      throw new Error('Não é possível rebaixar o último dono. Promova outro usuário a dono antes.')
    }
  }

  db.prepare('UPDATE usuarios SET papel = ? WHERE id = ?').run(novoPapel, id)
}

// Ativa/inativa. Inativos somem do login. Bloqueia desativar o último dono ativo.
export function alternarAtivoUsuario(id: number, ativo: boolean): void {
  const db = obterBancoDeDados()
  if (!ativo) {
    const u = db.prepare('SELECT papel FROM usuarios WHERE id = ?').get(id) as
      | { papel: PapelUsuario }
      | undefined
    if (u?.papel === 'dono') {
      const outros = db
        .prepare(
          "SELECT COUNT(*) AS c FROM usuarios WHERE papel = 'dono' AND ativo = 1 AND id != ?"
        )
        .get(id) as { c: number }
      if (outros.c === 0) {
        throw new Error(
          'Não é possível desativar o último dono. Promova outro usuário a dono antes.'
        )
      }
    }
  }
  db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, id)
}

// Bloqueia excluir o último dono ativo. (Quando houver vendas com usuario_id —
// no faturamento — adicionar aqui uma guarda por vendas, como no varejo.)
export function deletarUsuario(id: number): void {
  const db = obterBancoDeDados()
  const u = db.prepare('SELECT papel, ativo FROM usuarios WHERE id = ?').get(id) as
    | { papel: PapelUsuario; ativo: number }
    | undefined
  if (!u) throw new Error('Usuário não encontrado.')

  if (u.papel === 'dono' && u.ativo === 1) {
    const outros = db
      .prepare(
        "SELECT COUNT(*) AS c FROM usuarios WHERE papel = 'dono' AND ativo = 1 AND id != ?"
      )
      .get(id) as { c: number }
    if (outros.c === 0) {
      throw new Error('Não é possível excluir o último dono. Promova outro usuário a dono antes.')
    }
  }

  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id)
}
