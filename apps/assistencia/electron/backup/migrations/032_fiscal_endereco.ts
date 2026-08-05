import type Database from 'better-sqlite3'
import { separarEnderecoLegado, separacaoConfiavel } from '@fhvptech/core/lib/enderecoLoja'

// Pré-preenche o endereço ESTRUTURADO da nota fiscal (logradouro, número,
// bairro, complemento) a partir do endereço em texto livre que a loja já tem.
//
// Contexto da decisão (caminho B, escolhas do usuário):
//  - o texto livre `loja_endereco` continua sendo a fonte do CUPOM; nada aqui
//    muda o que é impresso pra loja nenhuma. Estes campos são um conjunto
//    À PARTE, usado só pra cadastrar o emitente na ACBr, que exige o endereço
//    decomposto em campos obrigatórios.
//  - o pré-preenchimento é conveniência, não fonte da verdade. Só acontece
//    quando a separação é CONFIÁVEL (remonta exatamente o texto original). Se
//    houver qualquer dúvida, deixa em branco: melhor o lojista digitar 4 campos
//    do que emitir nota com um palpite de endereço que ele não conferiu.
//
// Idempotente por natureza: só escreve se o campo ainda não existir, então
// nunca sobrescreve o que o lojista já ajustou à mão.
export function aplicar032FiscalEndereco(db: Database.Database): void {
  db.transaction(() => {
    const ler = (chave: string): string | null => {
      const row = db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave) as
        | { valor: string }
        | undefined
      return row ? row.valor : null
    }
    const gravarSeAusente = (chave: string, valor: string) => {
      db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)').run(chave, valor)
    }

    // Já preenchido antes (reinstalação, restauração de backup, execução
    // repetida)? Não mexe.
    const jaTem = ler('fiscal_endereco_logradouro')
    const textoLivre = (ler('loja_endereco') ?? '').trim()

    if (jaTem === null && textoLivre) {
      const partes = separarEnderecoLegado(textoLivre)

      // Só adianta o trabalho se a separação for perfeita. Caso contrário os
      // campos ficam ausentes e a tela fiscal pede o preenchimento — sem
      // arriscar um endereço meio certo numa nota fiscal.
      if (separacaoConfiavel(textoLivre, partes)) {
        gravarSeAusente('fiscal_endereco_logradouro', partes.logradouro)
        gravarSeAusente('fiscal_endereco_numero', partes.numero)
        gravarSeAusente('fiscal_endereco_complemento', partes.complemento)
        gravarSeAusente('fiscal_endereco_bairro', partes.bairro)
      }
    }

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('032_fiscal_endereco')
  })()
}
