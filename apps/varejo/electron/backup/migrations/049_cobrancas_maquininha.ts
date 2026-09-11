import type Database from 'better-sqlite3'

/**
 * A memória das cobranças feitas na maquininha.
 *
 * ── Por que isto precisa existir no banco ────────────────────────────────────
 * Quando o PDV manda um valor pra maquininha, o dinheiro sai da mão do cliente
 * ANTES do sistema saber. O cartão é aprovado lá, e só depois a notícia volta.
 * A volta pode não acontecer: a internet piscou, o PC desligou, o operador
 * fechou o programa.
 *
 * Se a cobrança vivesse só numa variável da tela, esse desligamento apagaria a
 * lembrança de uma cobrança que EXISTE no mundo real, com dinheiro dentro, do
 * lado da adquirente. No próximo atendimento o caixa passaria o cartão de novo,
 * e o cliente pagaria duas vezes.
 *
 * Esta tabela é a lembrança que sobrevive ao reinício. As regras que a governam
 * ficam em `@fhvptech/core/electron/pagamento/filaLogica`, testadas sem banco e
 * sem maquininha.
 *
 * ── ⚠️ `referencia` é UNIQUE, e isso é a trava de verdade ────────────────────
 * A lógica sabe que não pode cobrar duas vezes, mas lógica é uma decisão tomada
 * antes de escrever. Dois cliques rápidos no mesmo botão são duas decisões
 * tomadas com a mesma leitura do banco, e as duas concluem "pode cobrar".
 *
 * O UNIQUE é o que não depende de ninguém raciocinar direito: a segunda
 * gravação com a mesma referência simplesmente não entra. É a mesma família de
 * proteção do banco síncrono que impede vender a última unidade duas vezes.
 *
 * ── Por que `venda_id` nasce nulo e continua nulo por um tempo ───────────────
 * No balcão a cobrança vem ANTES da venda: fecha o carrinho, cobra, o cliente
 * passa o cartão, e só então a venda é gravada. Existe uma fresta de segundos
 * em que há dinheiro cobrado e venda nenhuma.
 *
 * Deixar essa coluna nula é o que torna a fresta VISÍVEL. Uma cobrança aprovada
 * sem venda é dinheiro que entrou sem o estoque baixar e sem o caixa fechar, e
 * o sistema tem como perguntar ao operador em vez de o valor aparecer sozinho
 * no extrato da adquirente no fim do mês.
 *
 * ── As datas em hora da loja ─────────────────────────────────────────────────
 * `datetime('now','localtime')`, nunca `CURRENT_TIMESTAMP`. O segundo é UTC por
 * definição no SQLite, o que no Brasil joga tudo três horas à frente e, das 21h
 * em diante, para o dia seguinte. Foi exatamente o defeito consertado na
 * migration 046, e ele não vai renascer numa tabela nova.
 *
 * ── Nada disto aparece pro lojista ainda ─────────────────────────────────────
 * A feature está atrás do tapume `__FEAT_PAGAMENTO__`, desligado em todas as
 * edições. A tabela pode nascer antes da tela porque tabela vazia não custa
 * nada, e criá-la agora evita uma migration futura em loja com movimento.
 */
export function aplicar049CobrancasMaquininha(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cobrancas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referencia TEXT NOT NULL UNIQUE,
        provedor TEXT NOT NULL,
        valor REAL NOT NULL,
        meio TEXT NOT NULL
          CHECK(meio IN ('credito','debito','pix')),
        parcelas INTEGER,
        situacao TEXT NOT NULL DEFAULT 'aguardando'
          CHECK(situacao IN ('aguardando','aprovada','recusada','cancelada','desconhecido')),
        id_externo TEXT,
        bandeira TEXT,
        autorizacao TEXT,
        cnpj_credenciadora TEXT,
        detalhe TEXT,
        venda_id INTEGER REFERENCES vendas(id),
        criada_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        atualizada_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
    `)

    // A pergunta que o sistema faz ao abrir o caixa: "sobrou dinheiro cobrado
    // sem venda?". Sem este índice ela varreria a tabela inteira toda vez.
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_cobrancas_orfas ON cobrancas(situacao, venda_id)'
    )
    db.exec('CREATE INDEX IF NOT EXISTS idx_cobrancas_venda ON cobrancas(venda_id)')

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '049_cobrancas_maquininha'
    )
  })()
}
