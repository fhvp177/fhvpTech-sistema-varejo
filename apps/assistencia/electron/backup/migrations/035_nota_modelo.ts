import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Qual documento a nota é: 65 = NFC-e (consumidor) · 55 = NF-e (empresa).
//
// Por que precisa estar gravado: a ACBr tem endereços SEPARADOS para os dois
// (`/nfce/...` e `/nfe/...`). Sem saber o modelo, imprimir, cancelar ou
// consultar uma NF-e bateria no endereço da NFC-e e o documento "não existiria"
// — um erro confuso, num momento ruim (o cliente esperando a nota).
//
// A tabela nasceu antes da NF-e existir, quando só havia um modelo possível.
// Tudo que já foi emitido é NFC-e, então o default 65 descreve a realidade.
export function aplicar035NotaModelo(db: Database.Database): void {
  db.transaction(() => {
    adicionarColunaSeAusente(db, 'nfce_emitidas', 'modelo', 'INTEGER NOT NULL DEFAULT 65')
    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('035_nota_modelo')
  })()
}
