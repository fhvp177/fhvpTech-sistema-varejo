import type Database from 'better-sqlite3'

// NO-OP DE PROPÓSITO — e é importante que o arquivo exista assim mesmo.
//
// No varejo, esta migration grava no `config` a identidade da PRIMEIRA loja do
// mundo (GN MODAS) em bancos anteriores a 2026-06-15, que é quando a identidade
// virou configurável. Lá isso preserva o cupom de quem legitimamente imprimia
// aqueles dados.
//
// Aqui ela não pode fazer nada. Se a assistência rodasse a versão do varejo, um
// banco antigo restaurado neste app passaria a imprimir o nome, o CNPJ e o
// endereço de uma loja de roupas de Pacoti no cupom de uma assistência técnica —
// dado de um cliente vazando pro sistema de outro. A assistência nasceu depois
// da data de corte e SEMPRE nasce neutra (ver LOJA_PADRAO em ipc/loja.ts), então
// não há legado nenhum a preservar deste lado.
//
// Por que manter o arquivo em vez de tirar a migration da lista: o runner casa
// por NOME. Um banco vindo do varejo já tem '030_loja_identidade_legada'
// carimbado; manter o nome na lista é o que garante que ele nunca rode de novo,
// aqui ou lá. Tirar da lista seria inofensivo hoje e uma armadilha no dia em que
// alguém comparasse as duas listas e "consertasse" a diferença copiando a versão
// do varejo por cima.
export function aplicar030LojaIdentidadeLegada(db: Database.Database): void {
  db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
    '030_loja_identidade_legada'
  )
}
