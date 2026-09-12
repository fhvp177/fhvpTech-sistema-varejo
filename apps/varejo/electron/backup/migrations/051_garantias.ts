import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

/**
 * Garantia: até quando a loja responde pelo que vendeu.
 *
 * ── O pedido ────────────────────────────────────────────────────────────────
 * "Criação de um módulo de garantias, que atualmente não tem no sistema."
 *
 * ── ⚠️ O prazo é CONGELADO na venda, e é a decisão central ──────────────────
 * `itens_venda.garantia_dias` guarda o prazo que valia no dia em que a peça
 * saiu da loja. É a mesma família de decisão do `custo_unitario` (migration
 * 043) e do `comissao_pct` (migration 038), e pelo mesmo motivo, elevado:
 *
 * Garantia não é um número do sistema, é uma PROMESSA feita a uma pessoa. Lida
 * do produto na hora da consulta, ela mudaria de tamanho sozinha: baixar o
 * prazo padrão de 90 para 30 dias encurtaria, no mesmo instante, a garantia de
 * todo mundo que já comprou — inclusive de quem está com o cupom na mão
 * dizendo "aqui está escrito noventa dias".
 *
 * Congelado, o passado fica de pé e a mudança só vale para quem comprar depois.
 *
 * ── A escada do prazo: produto, senão a loja ────────────────────────────────
 * `produtos.garantia_dias` nulo significa "use o padrão da loja", que vive em
 * `config`. Não é o mesmo que zero: zero é "este item não tem garantia" (uma
 * liquidação, uma ponta de estoque), e é uma decisão diferente de não ter
 * decidido nada.
 *
 * O padrão nasce em 90 dias: é o prazo do Código de Defesa do Consumidor para
 * produto durável, e a loja muda nas Configurações se quiser outro.
 *
 * ── ⚠️ O atendimento de garantia NÃO mexe em dinheiro ───────────────────────
 * Esta tabela registra o que foi decidido: trocou, consertou, devolveu o
 * dinheiro, recusou. Ela NÃO lança devolução, não estorna venda e não devolve
 * peça ao estoque.
 *
 * Isso é escolha, não esquecimento. A devolução já existe no sistema, com
 * crédito de cliente, baixa no livro-caixa e reposição de estoque. Um segundo
 * caminho que mexesse no mesmo dinheiro daria duas fontes para a mesma verdade,
 * e a primeira troca registrada nos dois lugares tiraria o caixa do lugar.
 *
 * Quem resolve a garantia devolvendo dinheiro faz a devolução pela tela de
 * devolução, como sempre, e registra aqui o que aconteceu.
 *
 * ── `dentro_do_prazo` é congelado na ABERTURA ───────────────────────────────
 * O cliente chega no dia 88 e a peça volta do conserto no dia 100. O que decide
 * se a loja cobre é o dia em que ele RECLAMOU, não o dia em que o caso fechou.
 * Recalcular na hora de fechar transformaria um atendimento coberto em fora de
 * garantia enquanto a peça estava na bancada.
 */
export function aplicar051Garantias(db: Database.Database): void {
  db.transaction(() => {
    // NULL = herda o padrão da loja. Zero = sem garantia, de propósito.
    adicionarColunaSeAusente(db, 'produtos', 'garantia_dias', 'INTEGER')

    /*
     * ⚠️ Nulo aqui é venda ANTERIOR a esta migration, e não "sem garantia".
     * São coisas diferentes na hora de responder ao cliente, e a consulta trata
     * cada uma com a sua frase: a venda antiga cai no padrão da loja de hoje
     * (é o melhor palpite disponível) e diz na tela que foi estimada.
     */
    adicionarColunaSeAusente(db, 'itens_venda', 'garantia_dias', 'INTEGER')

    db.exec(`
      CREATE TABLE IF NOT EXISTS garantias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_venda_id INTEGER NOT NULL REFERENCES itens_venda(id),
        venda_id INTEGER NOT NULL REFERENCES vendas(id),
        -- Hora da LOJA. CURRENT_TIMESTAMP é UTC por definição no SQLite, e no
        -- Brasil joga tudo três horas à frente (ver a migration 046).
        aberta_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        aberta_por INTEGER REFERENCES vendedores(id),
        defeito TEXT NOT NULL,
        situacao TEXT NOT NULL DEFAULT 'aberta'
          CHECK(situacao IN ('aberta','resolvida','recusada')),
        -- Só quando sai de 'aberta'. 'devolucao' registra a DECISÃO; o dinheiro
        -- continua saindo pela tela de devolução.
        desfecho TEXT
          CHECK(desfecho IS NULL OR desfecho IN
            ('troca','conserto','devolucao','sem_defeito','fora_do_prazo')),
        observacao TEXT,
        -- Congelado na abertura: vale o dia em que o cliente reclamou.
        dentro_do_prazo INTEGER NOT NULL DEFAULT 1,
        fechada_em TEXT,
        fechada_por INTEGER REFERENCES vendedores(id)
      );
    `)

    // As duas perguntas da tela: "o que está aberto?" e "este item já teve
    // atendimento?". Sem os índices, as duas varrem a tabela inteira.
    db.exec('CREATE INDEX IF NOT EXISTS idx_garantias_situacao ON garantias(situacao)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_garantias_item ON garantias(item_venda_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_garantias_venda ON garantias(venda_id)')

    /*
     * 90 dias, o prazo legal do produto durável. `INSERT OR IGNORE` para a loja
     * que já tiver respondido isto não ser sobreposta numa reaplicação.
     */
    db.prepare(
      "INSERT OR IGNORE INTO config (chave, valor) VALUES ('garantia_padrao_dias', '90')"
    ).run()

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('051_garantias')
  })()
}
