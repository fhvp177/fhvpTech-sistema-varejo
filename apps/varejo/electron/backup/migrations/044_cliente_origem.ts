import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

/**
 * De onde veio o cliente: Instagram, WhatsApp, presencial, indicação.
 *
 * ── A pergunta de negócio por trás disso ────────────────────────────────────
 * Não é "catalogar cliente". É saber qual canal traz gente que COMPRA. Fica
 * barato descobrir que o Instagram traz o dobro de cadastros e metade do
 * faturamento do que vem da indicação — e caro continuar investindo no lugar
 * errado por não ter o dado.
 *
 * Por isso a origem nasce junto com o relatório que a lê. Campo de cadastro
 * que ninguém cruza com venda vira trabalho para o vendedor e mais nada.
 *
 * ── ⚠️ Por que FK, e não texto copiado como em `produtos.categoria` ─────────
 * As categorias de produto guardam o NOME dentro do produto, e renomear uma
 * categoria obriga a sair propagando o texto novo por todas as linhas. Funciona
 * porque já está assim, mas é uma propagação que alguém pode esquecer.
 *
 * Aqui é `origem_id` apontando para a tabela. Renomear "Insta" para "Instagram"
 * é um UPDATE numa linha só, e nenhum cliente precisa ser tocado. Apagar uma
 * origem deixa `origem_id` NULL nos clientes dela, que lê como "não informado"
 * — o que é verdade, e não uma origem fantasma escrita por extenso.
 *
 * ── As quatro que já vêm cadastradas ────────────────────────────────────────
 * São chute informado, e ele muda quantas quiser: a tela é de cadastro livre,
 * igual à de categorias. Só existem para que o primeiro cliente cadastrado
 * depois da atualização já tenha o que escolher — lista vazia na estreia é o
 * jeito mais rápido de um recurso novo nunca ser usado.
 *
 * ⚠️ Nada de backfill. Todo cliente que já existe fica com origem NULL, que é
 * a verdade: ninguém perguntou de onde ele veio. Distribuir os antigos entre as
 * origens "para não ficar vazio" produziria exatamente o relatório mentiroso
 * que esta tabela existe para evitar.
 */
const ORIGENS_PADRAO = ['Instagram', 'WhatsApp', 'Presencial', 'Indicação']

export function aplicar044ClienteOrigem(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS origens_cliente (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE COLLATE NOCASE
      );
    `)

    adicionarColunaSeAusente(
      db,
      'clientes',
      'origem_id',
      'INTEGER REFERENCES origens_cliente(id)'
    )

    // Só semeia banco novo. Se a loja já mexeu na lista (criou, renomeou ou
    // apagou), reinserir os padrões ressuscitaria justamente o que ela apagou.
    const total = db.prepare('SELECT COUNT(*) AS n FROM origens_cliente').get() as { n: number }
    if (total.n === 0) {
      const inserir = db.prepare('INSERT OR IGNORE INTO origens_cliente (nome) VALUES (?)')
      for (const nome of ORIGENS_PADRAO) inserir.run(nome)
    }

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('044_cliente_origem')
  })()
}
