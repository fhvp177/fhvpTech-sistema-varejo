import type Database from 'better-sqlite3'

// Nova senha de restauração.
//
// Restaurar backup SOBRESCREVE o banco inteiro do cliente, e a senha é o que
// separa isso de um acidente. A anterior era compartilhada com o app de
// assistência técnica (que nasceu de uma cópia deste), então quem a conhecia
// conseguia restaurar em qualquer um dos dois produtos. Cada um passa a ter a
// sua.
//
// ⚠️ ISTO ALCANÇA LOJA EM PRODUÇÃO. A senha antiga deixa de funcionar assim que
// o cliente atualizar — quem der suporte precisa saber a nova antes disso.
//
// ── Por que uma migration nova, e não editar a 003 ──────────────────────────
// A 003 já rodou em todos os bancos instalados. O runner casa por NOME:
// migration já registrada não roda de novo, então editá-la não teria efeito em
// quem já a aplicou (ou seja, em todo mundo) e teria em quem não aplicou,
// deixando instalações com senhas diferentes.
//
// ── O que está guardado aqui ────────────────────────────────────────────────
// Só o hash bcrypt (12 rounds). A senha em si não existe no repositório. Para
// trocá-la de novo, gere outro hash com `npm run hash:gerar` e crie a 038 —
// nunca edite esta.
const HASH_SENHA_RESTAURACAO =
  '$2b$12$4pV0NsBsZaNOEsUu1eolb.iWF4zQ9LNdPPLkMRtG0F.nwlSfgwGkS'

export function aplicar037SenhaRestauracao(db: Database.Database): void {
  db.transaction(() => {
    // REPLACE, e não IGNORE: a 003 já gravou esta chave, e o que se quer aqui
    // é justamente substituir o valor dela.
    db.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').run(
      'backup_hash_senha_restauracao',
      HASH_SENHA_RESTAURACAO
    )
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '037_senha_restauracao'
    )
  })()
}
