import type Database from 'better-sqlite3'

// Senha de restauração PRÓPRIA do nicho.
//
// A assistência nasceu com a senha herdada do varejo (a migration 003, que veio
// junto na cópia). Duas razões para separar:
//
//  1. São produtos e clientes diferentes. Quem sabe a senha do varejo não
//     deveria conseguir restaurar backup numa assistência, e vice-versa —
//     restaurar backup SOBRESCREVE o banco inteiro do cliente.
//  2. A senha nova segue a identidade deste app, como já acontece com o PIN.
//
// ── Por que uma migration nova, e não editar a 003 ──────────────────────────
// A 003 já rodou em todo banco existente, inclusive no backup convertido do
// primeiro cliente. O runner casa por NOME: migration já registrada não roda de
// novo, então editá-la não teria efeito onde ela já passou — e teria onde não
// passou, deixando instalações com senhas diferentes. O próprio comentário da
// 003 manda fazer assim.
//
// ── O que está guardado aqui ────────────────────────────────────────────────
// Só o hash bcrypt (12 rounds). A senha em si não existe no repositório, e nem
// deveria: quem a conhece é o técnico. Para trocá-la de novo, gere outro hash
// com `npm run hash:gerar` e crie a at_005 — nunca edite esta.
const HASH_SENHA_RESTAURACAO =
  '$2b$12$4pV0NsBsZaNOEsUu1eolb.iWF4zQ9LNdPPLkMRtG0F.nwlSfgwGkS'

export function aplicarAt004SenhaRestauracao(db: Database.Database): void {
  db.transaction(() => {
    // REPLACE, e não IGNORE: a 003 já gravou a chave, e o que se quer aqui é
    // justamente substituir o valor dela.
    db.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').run(
      'backup_hash_senha_restauracao',
      HASH_SENHA_RESTAURACAO
    )
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      'at_004_senha_restauracao'
    )
  })()
}
