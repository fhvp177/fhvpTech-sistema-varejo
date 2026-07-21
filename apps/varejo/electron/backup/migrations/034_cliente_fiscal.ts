import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Dados fiscais do cliente — o que a NF-e (modelo 55, venda para empresa) exige
// do destinatário e que o cadastro nunca precisou guardar.
//
// Por que só agora: até aqui o sistema só emitia NFC-e (consumidor final), onde
// o destinatário é opcional e basta o CPF. Na NF-e o destinatário é uma empresa
// identificada, e a SEFAZ exige endereço completo: logradouro, número, bairro,
// município (nome E código IBGE) e UF. Sem isso a nota é rejeitada.
//
// O endereço em texto livre que já existe (`clientes.endereco`) CONTINUA sendo
// o que aparece no cupom — não é tocado aqui. Estes campos são um conjunto à
// parte, só para a nota, exatamente como foi feito com o endereço do emitente
// (migration 032). O mesmo motivo vale: o cupom de ninguém pode mudar.
//
// Tudo nasce vazio. Só interessa a cliente pessoa jurídica, e mesmo assim só
// quando o lojista for de fato emitir NF-e para ele — a tela pede na hora.
export function aplicar034ClienteFiscal(db: Database.Database): void {
  db.transaction(() => {
    // Endereço decomposto (o texto livre segue intocado, para o cupom).
    adicionarColunaSeAusente(db, 'clientes', 'endereco_logradouro', 'TEXT')
    adicionarColunaSeAusente(db, 'clientes', 'endereco_numero', 'TEXT')
    adicionarColunaSeAusente(db, 'clientes', 'endereco_complemento', 'TEXT')
    adicionarColunaSeAusente(db, 'clientes', 'endereco_bairro', 'TEXT')
    adicionarColunaSeAusente(db, 'clientes', 'cidade', 'TEXT')
    adicionarColunaSeAusente(db, 'clientes', 'uf', 'TEXT')
    adicionarColunaSeAusente(db, 'clientes', 'cep', 'TEXT')
    // Código IBGE do município — obrigatório na nota e que ninguém sabe de
    // cabeça; o sistema resolve pelo CEP.
    adicionarColunaSeAusente(db, 'clientes', 'codigo_municipio', 'TEXT')

    // Inscrição Estadual do destinatário e como ele se enquadra:
    //   1 = contribuinte de ICMS (tem IE) — o caso da revenda
    //   2 = isento de inscrição
    //   9 = não contribuinte (consumidor final PJ, ex.: escritório)
    // Default 9 porque é o caso mais brando: quem não sabe, não é contribuinte.
    adicionarColunaSeAusente(db, 'clientes', 'inscricao_estadual', 'TEXT')
    adicionarColunaSeAusente(db, 'clientes', 'indicador_ie', "TEXT DEFAULT '9'")

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('034_cliente_fiscal')
  })()
}
