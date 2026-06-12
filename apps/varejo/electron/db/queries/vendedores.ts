import { obterBancoDeDados } from '../conexao'

export type PapelVendedor = 'dono' | 'vendedor'

export type Vendedor = {
  id: number
  nome: string
  ativo: number
  papel: PapelVendedor
  email: string | null
  tem_pin: number
  vendas_count: number
}

// Versão mínima usada na tela de login — não inclui dados sensíveis e nem
// contagens. Pin_hash NUNCA sai do main process.
export type VendedorParaLogin = {
  id: number
  nome: string
  papel: PapelVendedor
  tem_pin: number
}

const COLUNAS_PUBLICAS = `
  v.id, v.nome, v.ativo, v.papel, v.email,
  CASE WHEN v.pin_hash IS NOT NULL AND LENGTH(v.pin_hash) > 0 THEN 1 ELSE 0 END AS tem_pin,
  (SELECT COUNT(*) FROM vendas vd WHERE vd.vendedor_id = v.id) AS vendas_count
`

export function listarVendedores(): Vendedor[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT ${COLUNAS_PUBLICAS}
       FROM vendedores v
       ORDER BY v.ativo DESC, v.papel = 'dono' DESC, v.nome COLLATE NOCASE`
    )
    .all() as Vendedor[]
}

export function listarParaLogin(): VendedorParaLogin[] {
  const db = obterBancoDeDados()
  return db
    .prepare(
      `SELECT v.id, v.nome, v.papel,
              CASE WHEN v.pin_hash IS NOT NULL AND LENGTH(v.pin_hash) > 0 THEN 1 ELSE 0 END AS tem_pin
       FROM vendedores v
       WHERE v.ativo = 1
       ORDER BY v.papel = 'dono' DESC, v.nome COLLATE NOCASE`
    )
    .all() as VendedorParaLogin[]
}

export function obterVendedor(id: number): Vendedor | null {
  const db = obterBancoDeDados()
  const v = db
    .prepare(`SELECT ${COLUNAS_PUBLICAS} FROM vendedores v WHERE v.id = ?`)
    .get(id) as Vendedor | undefined
  return v ?? null
}

// Uso interno do módulo de auth — não exponha via IPC.
export function obterPinHash(id: number): string | null {
  const db = obterBancoDeDados()
  const row = db.prepare('SELECT pin_hash FROM vendedores WHERE id = ?').get(id) as
    | { pin_hash: string | null }
    | undefined
  return row?.pin_hash ?? null
}

export function gravarPinHash(id: number, pinHash: string): void {
  const db = obterBancoDeDados()
  const r = db.prepare('UPDATE vendedores SET pin_hash = ? WHERE id = ?').run(pinHash, id)
  if (r.changes === 0) throw new Error('Vendedor não encontrado.')
}

export function contarDonosAtivos(): number {
  const db = obterBancoDeDados()
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM vendedores WHERE papel = 'dono' AND ativo = 1")
    .get() as { c: number }
  return row.c
}

export function criarVendedor(
  nome: string,
  opts: { papel?: PapelVendedor; email?: string | null } = {}
): { id: number; nome: string } {
  const db = obterBancoDeDados()
  const limpo = nome.trim()
  if (!limpo) throw new Error('Nome do vendedor não pode ficar vazio.')
  const papel: PapelVendedor = opts.papel ?? 'vendedor'
  const email = opts.email?.trim() || null
  const result = db
    .prepare('INSERT INTO vendedores (nome, papel, email) VALUES (?, ?, ?)')
    .run(limpo, papel, email)
  return { id: result.lastInsertRowid as number, nome: limpo }
}

export function atualizarVendedor(
  id: number,
  dados: { nome?: string; email?: string | null }
): void {
  const db = obterBancoDeDados()
  const atual = db.prepare('SELECT nome, email FROM vendedores WHERE id = ?').get(id) as
    | { nome: string; email: string | null }
    | undefined
  if (!atual) throw new Error('Vendedor não encontrado.')

  const novoNome = dados.nome !== undefined ? dados.nome.trim() : atual.nome
  if (!novoNome) throw new Error('Nome do vendedor não pode ficar vazio.')
  const novoEmail =
    dados.email !== undefined ? (dados.email?.trim() || null) : atual.email

  if (novoNome === atual.nome && novoEmail === atual.email) return

  db.prepare('UPDATE vendedores SET nome = ?, email = ? WHERE id = ?').run(
    novoNome,
    novoEmail,
    id
  )
}

// Troca o papel de um vendedor. Bloqueia rebaixar o último dono ativo
// (sistema sempre precisa ter ao menos 1 dono ativo).
export function alterarPapel(id: number, novoPapel: PapelVendedor): void {
  const db = obterBancoDeDados()
  const atual = db.prepare('SELECT papel, ativo FROM vendedores WHERE id = ?').get(id) as
    | { papel: PapelVendedor; ativo: number }
    | undefined
  if (!atual) throw new Error('Vendedor não encontrado.')
  if (atual.papel === novoPapel) return

  if (atual.papel === 'dono' && novoPapel === 'vendedor') {
    const outros = db
      .prepare(
        "SELECT COUNT(*) AS c FROM vendedores WHERE papel = 'dono' AND ativo = 1 AND id != ?"
      )
      .get(id) as { c: number }
    if (outros.c === 0) {
      throw new Error(
        'Não é possível rebaixar o último dono. Promova outro vendedor a dono antes.'
      )
    }
  }

  db.prepare('UPDATE vendedores SET papel = ? WHERE id = ?').run(novoPapel, id)
}

// Marca como ativo/inativo. Inativos somem do seletor do PDV e do login,
// mas continuam aparecendo nas vendas antigas. Bloqueia desativar o último
// dono ativo.
export function alternarAtivoVendedor(id: number, ativo: boolean): void {
  const db = obterBancoDeDados()
  if (!ativo) {
    const v = db.prepare('SELECT papel FROM vendedores WHERE id = ?').get(id) as
      | { papel: PapelVendedor }
      | undefined
    if (v?.papel === 'dono') {
      const outros = db
        .prepare(
          "SELECT COUNT(*) AS c FROM vendedores WHERE papel = 'dono' AND ativo = 1 AND id != ?"
        )
        .get(id) as { c: number }
      if (outros.c === 0) {
        throw new Error(
          'Não é possível desativar o último dono. Promova outro vendedor a dono antes.'
        )
      }
    }
  }
  db.prepare('UPDATE vendedores SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, id)
}

// Bloqueia exclusão quando há vendas associadas ou é o último dono ativo —
// nesses casos, só dá pra desativar.
export function deletarVendedor(id: number): void {
  const db = obterBancoDeDados()
  const v = db.prepare('SELECT papel, ativo FROM vendedores WHERE id = ?').get(id) as
    | { papel: PapelVendedor; ativo: number }
    | undefined
  if (!v) throw new Error('Vendedor não encontrado.')

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

  if (v.papel === 'dono' && v.ativo === 1) {
    const outros = db
      .prepare(
        "SELECT COUNT(*) AS c FROM vendedores WHERE papel = 'dono' AND ativo = 1 AND id != ?"
      )
      .get(id) as { c: number }
    if (outros.c === 0) {
      throw new Error(
        'Não é possível excluir o último dono. Promova outro vendedor a dono antes.'
      )
    }
  }

  db.prepare('DELETE FROM vendedores WHERE id = ?').run(id)
}
