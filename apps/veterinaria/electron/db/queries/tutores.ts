import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

// Tutores (donos dos pets, e pagadores das contas) e seus pets. O pet pertence
// a um tutor; a maioria das operações de pet parte do tutor selecionado.

export type Tutor = {
  id: number
  nome: string
  telefone: string | null
  email: string | null
  data_cadastro: string
  pets_count: number
}

export type Pet = {
  id: number
  tutor_id: number
  nome: string
  especie: string | null
  raca: string | null
  nascimento: string | null
  data_cadastro: string
}

// ───── Tutores ────────────────────────────────────────────────────────

export function listarTutores(): Tutor[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT t.id, t.nome, t.telefone, t.email, t.data_cadastro,
              (SELECT COUNT(*) FROM pets p WHERE p.tutor_id = t.id) AS pets_count
       FROM tutores t
       ORDER BY t.nome COLLATE NOCASE`
    )
    .all() as Tutor[]
}

export function criarTutor(dados: {
  nome: string
  telefone?: string | null
  email?: string | null
}): { id: number } {
  const db = obterBancoDeDados()
  const nome = dados.nome.trim()
  if (!nome) throw new Error('Nome do tutor não pode ficar vazio.')
  const r = db
    .prepare('INSERT INTO tutores (nome, telefone, email) VALUES (?, ?, ?)')
    .run(nome, dados.telefone?.trim() || null, dados.email?.trim() || null)
  return { id: r.lastInsertRowid as number }
}

export function atualizarTutor(
  id: number,
  dados: { nome?: string; telefone?: string | null; email?: string | null }
): void {
  const db = obterBancoDeDados()
  const atual = db
    .prepare('SELECT nome, telefone, email FROM tutores WHERE id = ?')
    .get(id) as { nome: string; telefone: string | null; email: string | null } | undefined
  if (!atual) throw new Error('Tutor não encontrado.')
  const nome = dados.nome !== undefined ? dados.nome.trim() : atual.nome
  if (!nome) throw new Error('Nome do tutor não pode ficar vazio.')
  const telefone = dados.telefone !== undefined ? dados.telefone?.trim() || null : atual.telefone
  const email = dados.email !== undefined ? dados.email?.trim() || null : atual.email
  db.prepare('UPDATE tutores SET nome = ?, telefone = ?, email = ? WHERE id = ?').run(
    nome,
    telefone,
    email,
    id
  )
}

export function deletarTutor(id: number): void {
  const db = obterBancoDeDados()
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM pets WHERE tutor_id = ?').get(id) as {
    c: number
  }
  if (c > 0) {
    throw new Error(
      `Este tutor tem ${c} pet${c !== 1 ? 's' : ''} cadastrado${c !== 1 ? 's' : ''}. ` +
        'Remova os pets antes de excluir o tutor.'
    )
  }
  db.prepare('DELETE FROM tutores WHERE id = ?').run(id)
}

// ───── Pets ───────────────────────────────────────────────────────────

export function listarPets(tutorId: number): Pet[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT id, tutor_id, nome, especie, raca, nascimento, data_cadastro
       FROM pets WHERE tutor_id = ? ORDER BY nome COLLATE NOCASE`
    )
    .all(tutorId) as Pet[]
}

export function criarPet(
  tutorId: number,
  dados: { nome: string; especie?: string | null; raca?: string | null; nascimento?: string | null }
): { id: number } {
  const db = obterBancoDeDados()
  const nome = dados.nome.trim()
  if (!nome) throw new Error('Nome do pet não pode ficar vazio.')
  const tutor = db.prepare('SELECT 1 FROM tutores WHERE id = ?').get(tutorId)
  if (!tutor) throw new Error('Tutor não encontrado.')
  const r = db
    .prepare(
      'INSERT INTO pets (tutor_id, nome, especie, raca, nascimento) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      tutorId,
      nome,
      dados.especie?.trim() || null,
      dados.raca?.trim() || null,
      dados.nascimento?.trim() || null
    )
  return { id: r.lastInsertRowid as number }
}

export function atualizarPet(
  id: number,
  dados: { nome?: string; especie?: string | null; raca?: string | null; nascimento?: string | null }
): void {
  const db = obterBancoDeDados()
  const atual = db
    .prepare('SELECT nome, especie, raca, nascimento FROM pets WHERE id = ?')
    .get(id) as
    | { nome: string; especie: string | null; raca: string | null; nascimento: string | null }
    | undefined
  if (!atual) throw new Error('Pet não encontrado.')
  const nome = dados.nome !== undefined ? dados.nome.trim() : atual.nome
  if (!nome) throw new Error('Nome do pet não pode ficar vazio.')
  const especie = dados.especie !== undefined ? dados.especie?.trim() || null : atual.especie
  const raca = dados.raca !== undefined ? dados.raca?.trim() || null : atual.raca
  const nascimento =
    dados.nascimento !== undefined ? dados.nascimento?.trim() || null : atual.nascimento
  db.prepare(
    'UPDATE pets SET nome = ?, especie = ?, raca = ?, nascimento = ? WHERE id = ?'
  ).run(nome, especie, raca, nascimento, id)
}

export function deletarPet(id: number): void {
  const db = obterBancoDeDados()
  db.prepare('DELETE FROM pets WHERE id = ?').run(id)
}
