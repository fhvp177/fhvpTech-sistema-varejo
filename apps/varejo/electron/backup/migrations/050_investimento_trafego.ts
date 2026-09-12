import type Database from 'better-sqlite3'

/**
 * Quanto a loja gastou em anúncio, mês a mês, em cada canal.
 *
 * ── Por que isto precisa existir ────────────────────────────────────────────
 * O sistema sabe tudo o que ENTROU. Não sabe nada do que foi gasto para fazer
 * entrar: a fatura do Instagram e a do Google não passam por aqui. Sem esse
 * número, "ROAS" é uma divisão sem o de baixo.
 *
 * É o único dado desta família que o lojista digita na mão, e é assim mesmo:
 * não existe caminho por onde o valor investido chegue sozinho.
 *
 * ── ⚠️ O vínculo é com a ORIGEM DO CLIENTE, e é o ponto todo ────────────────
 * `origens_cliente` já é a lista de por onde o cliente chegou na loja, criada
 * pelo próprio lojista (migration 044), e é a mesma lista que o cadastro de
 * cliente usa. Amarrar o investimento nela é o que permite comparar o que foi
 * gasto num canal com o que aquele canal trouxe de volta.
 *
 * Inventar uma segunda lista de "canais de anúncio" daria dois lugares para o
 * lojista escrever "Instagram", com uma letra de diferença, e o retorno nunca
 * encontraria o gasto.
 *
 * ── ⚠️ Não existe flag de "canal pago" ──────────────────────────────────────
 * A linha de investimento JÁ É a declaração de que aquele canal foi pago
 * naquele mês. Uma coluna `paga` na origem diria "o Instagram é um canal pago",
 * o que é verdade em março e mentira em abril, quando o anúncio ficou parado.
 *
 * A consequência é a certa: canal sem investimento no período não entra na
 * conta do ROAS daquele período, porque de fato não custou nada nele.
 *
 * ── ⚠️ `UNIQUE(mes, origem_id)` é o que impede o gasto dobrado ──────────────
 * O lojista vai voltar nessa tela para corrigir o valor, e vai voltar mais de
 * uma vez. Sem o UNIQUE, cada correção viraria uma linha nova e o investimento
 * do mês cresceria sozinho: o ROAS despencaria sem nada ter acontecido.
 *
 * Com ele, gravar de novo substitui (INSERT ... ON CONFLICT DO UPDATE), e o
 * mês tem um valor por canal, sempre.
 *
 * ── A origem apagada leva o investimento junto ──────────────────────────────
 * `ON DELETE CASCADE`. Investimento num canal que não existe mais não tem
 * retorno com que ser comparado: ele viraria uma despesa órfã derrubando o ROAS
 * de todo mês passado, sem linha nenhuma na tela explicando de onde vem.
 */
export function aplicar050InvestimentoTrafego(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS investimentos_trafego (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- 'YYYY-MM'. O mês é a unidade porque é assim que a fatura do anúncio
        -- chega, e é o recorte que o lojista consegue conferir.
        mes TEXT NOT NULL,
        origem_id INTEGER NOT NULL
          REFERENCES origens_cliente(id) ON DELETE CASCADE,
        valor REAL NOT NULL DEFAULT 0,
        observacao TEXT,
        -- Hora da LOJA, nunca CURRENT_TIMESTAMP: no Brasil o segundo joga tudo
        -- três horas à frente e, das 21h em diante, para o dia seguinte.
        criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        UNIQUE(mes, origem_id)
      );
    `)

    // A pergunta de toda abertura do Painel é "quanto foi investido neste
    // período?", e ela varre por mês.
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_investimento_mes ON investimentos_trafego(mes)'
    )

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run(
      '050_investimento_trafego'
    )
  })()
}
