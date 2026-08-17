import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// O estado, ao lado da cidade, na linha de local e data do recibo.
//
// O recibo nasceu (at_002) guardando só a cidade, como o talão de papelaria
// costuma trazer. Na prática o dono pediu o estado junto e por extenso —
// "PACOTI - CEARÁ" —, que é como documento formal identifica o lugar quando o
// nome da cidade não é conhecido no país inteiro. Pacoti é exatamente esse caso.
//
// ── Por que uma migration nova em vez de mexer na at_002 ─────────────────────
// A at_002 já rodou nos bancos de desenvolvimento. O runner casa por NOME: uma
// migration já registrada não roda de novo, então editá-la não teria efeito
// nenhum onde ela já passou — e teria efeito onde não passou, deixando os dois
// bancos diferentes. Coluna nova é migration nova, sempre.
//
// A coluna é opcional: recibo antigo, emitido antes desta mudança, continua
// imprimindo só a cidade. Ele já foi assinado daquele jeito, e a segunda via
// tem que sair igual ao papel que a pessoa levou.
export function aplicarAt003ReciboUf(db: Database.Database): void {
  db.transaction(() => {
    // Sigla de 2 letras, como no resto do sistema (loja, cliente, nota). O nome
    // por extenso vive na tabela UFS do renderer e é montado na hora de
    // imprimir — guardar "Ceará" aqui espalharia a grafia por dois lugares.
    adicionarColunaSeAusente(db, 'recibos', 'uf', 'TEXT')

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('at_003_recibo_uf')
  })()
}
