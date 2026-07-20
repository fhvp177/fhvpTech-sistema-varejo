import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Fundação fiscal da NFC-e (plano Pro, atrás da flag __FEAT_NFE__).
//
// Três coisas: (1) campos de tributação nos produtos, (2) o livro das notas
// emitidas, (3) o controle de numeração. Nada aqui emite nota — é só o terreno.
//
// ── Por que o NCM é preenchido automaticamente ────────────────────────────────
// NCM é a classificação fiscal do produto, e o lojista não sabe o NCM de uma
// blusa. Sem ajuda, uma loja com 800 produtos teria 800 campos em branco antes
// de emitir a primeira nota — inviável na prática.
//
// A saída: a importação de XML de fornecedor (v1.25.0) já guarda o NCM que o
// PRÓPRIO fornecedor usou naquele produto, em `notas_entrada_itens`, com
// `produto_id` amarrado. É fonte confiável (quem fabrica/distribui classifica
// certo) e de graça. Então todo produto que um dia entrou por XML já nasce
// classificado; só sobra conferência do contador no que foi cadastrado à mão.
//
// ── Por que o CFOP NÃO é preenchido automaticamente ───────────────────────────
// Tentador, porque `notas_entrada_itens` também tem CFOP — mas seria ERRADO. O
// CFOP daquela nota é o da operação do FORNECEDOR vendendo pra loja; o CFOP da
// NFC-e é o da loja vendendo pro consumidor, e depende do estado do destinatário
// e do regime. Copiar um no outro produz nota que a SEFAZ aceita e o Fisco
// contesta depois. Fica como default global na config, com override por produto
// quando o contador pedir (ex.: substituição tributária).
//
// ── Por que campo fiscal em branco é melhor que campo chutado ─────────────────
// Faltando NCM, a emissão trava e o lojista VÊ o problema. Com NCM errado, a
// nota é autorizada e o problema só aparece numa fiscalização, meses depois,
// como passivo do cliente. Por isso não existe NCM "padrão" aqui.
export function aplicar031FiscalNfce(db: Database.Database): void {
  db.transaction(() => {
    // ── 1. Tributação no produto ──────────────────────────────────────────────
    // Sem default: em branco = "ainda não classificado", e a tela de conferência
    // usa exatamente isso pra listar o que falta.
    adicionarColunaSeAusente(db, 'produtos', 'ncm', 'TEXT')
    // Override por produto; o normal é herdar o default da config.
    adicionarColunaSeAusente(db, 'produtos', 'cfop', 'TEXT')
    // CST (Lucro Presumido/Real) ou CSOSN (Simples Nacional) — qual dos dois
    // vale depende do regime da loja, por isso uma coluna só.
    adicionarColunaSeAusente(db, 'produtos', 'cst_csosn', 'TEXT')
    // Origem da mercadoria (0-8). '0' = nacional cobre a esmagadora maioria do
    // varejo e é campo obrigatório na nota; deixar em branco travaria tudo sem
    // ganho real. Editável quando houver importado.
    adicionarColunaSeAusente(db, 'produtos', 'origem', "TEXT DEFAULT '0'")
    // Unidade comercial (UN, PC, KG...). 'UN' é o caso comum do varejo.
    adicionarColunaSeAusente(db, 'produtos', 'unidade', "TEXT DEFAULT 'UN'")

    // Produtos que já existiam não passam pelo DEFAULT do ALTER em bancos
    // antigos — garante que ninguém fique com origem/unidade nulas.
    db.exec(`UPDATE produtos SET origem = '0' WHERE origem IS NULL OR TRIM(origem) = ''`)
    db.exec(`UPDATE produtos SET unidade = 'UN' WHERE unidade IS NULL OR TRIM(unidade) = ''`)

    // ── 2. Backfill de NCM e unidade pelas notas de entrada ───────────────────
    // Só onde ainda está vazio (nunca sobrescreve escolha do contador) e só se a
    // tabela existir — bancos que nunca importaram XML não têm nada a puxar.
    const temNotasEntrada = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notas_entrada_itens'`)
      .get()

    if (temNotasEntrada) {
      // Entrada mais recente vence (id maior = importada depois): se o
      // fornecedor reclassificou o produto, a classificação nova prevalece.
      db.exec(`
        UPDATE produtos SET ncm = (
          SELECT nei.ncm FROM notas_entrada_itens nei
          WHERE nei.produto_id = produtos.id
            AND nei.ncm IS NOT NULL AND TRIM(nei.ncm) <> ''
          ORDER BY nei.id DESC LIMIT 1
        )
        WHERE (ncm IS NULL OR TRIM(ncm) = '')
          AND EXISTS (
            SELECT 1 FROM notas_entrada_itens nei
            WHERE nei.produto_id = produtos.id
              AND nei.ncm IS NOT NULL AND TRIM(nei.ncm) <> ''
          )
      `)

      // Mesma ideia pra unidade, mas só por cima do default 'UN' — quem vende
      // por peça, metro ou quilo já vem certo do XML do fornecedor.
      db.exec(`
        UPDATE produtos SET unidade = (
          SELECT UPPER(TRIM(nei.unidade)) FROM notas_entrada_itens nei
          WHERE nei.produto_id = produtos.id
            AND nei.unidade IS NOT NULL AND TRIM(nei.unidade) <> ''
          ORDER BY nei.id DESC LIMIT 1
        )
        WHERE unidade = 'UN'
          AND EXISTS (
            SELECT 1 FROM notas_entrada_itens nei
            WHERE nei.produto_id = produtos.id
              AND nei.unidade IS NOT NULL AND TRIM(nei.unidade) <> ''
          )
      `)
    }

    // ── 3. Livro das notas emitidas ───────────────────────────────────────────
    // Uma LINHA POR TENTATIVA, não por venda: rejeição faz parte do histórico e
    // o lojista (e o contador) precisa enxergar o que deu errado. O que não pode
    // haver é duas notas VÁLIDAS pra mesma venda — e isso é garantido pelo
    // índice único parcial lá embaixo, no banco, não na confiança do código.
    //
    // `referencia` é a chave de idempotência que vai pra ACBr ("seu
    // identificador único... ajuda a evitar o envio duplicado"). Formato
    // `v<venda_id>-t<tentativa>`: reenvio depois de rejeição precisa de
    // referência NOVA, senão a API devolve o documento antigo em vez de emitir.
    //
    // `xml` é cache proposital: a ACBr dá o primeiro download de XML de graça e
    // cobra 1 crédito nos seguintes. Guardando aqui, reimprimir e exportar pro
    // contador não custa nada — e a guarda de 5 anos é obrigação legal do
    // lojista de qualquer forma. (PDF e ESC/POS são sempre grátis, esses não
    // precisam de cache.)
    db.exec(`
      CREATE TABLE IF NOT EXISTS nfce_emitidas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
        tentativa INTEGER NOT NULL DEFAULT 1,
        referencia TEXT NOT NULL UNIQUE,
        acbr_id TEXT,
        ambiente TEXT NOT NULL CHECK(ambiente IN ('homologacao','producao')),
        serie INTEGER NOT NULL,
        numero INTEGER NOT NULL,
        chave TEXT,
        status TEXT NOT NULL DEFAULT 'pendente'
          CHECK(status IN ('pendente','autorizado','rejeitado','denegado','cancelado','erro')),
        protocolo TEXT,
        motivo TEXT,
        xml TEXT,
        criada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizada_em DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_nfce_venda ON nfce_emitidas(venda_id);
      CREATE INDEX IF NOT EXISTS idx_nfce_status ON nfce_emitidas(status);

      -- No máximo UMA nota vigente por venda. 'cancelado' fica de fora de
      -- propósito: cancelou, pode emitir outra.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nfce_venda_vigente
        ON nfce_emitidas(venda_id) WHERE status IN ('autorizado','pendente');

      -- Numeração é responsabilidade NOSSA: a ACBr exige nNF e serie no envio,
      -- não gera sequência. Contador por série, incrementado dentro de
      -- transação. O número é reservado ANTES do envio, então falha de emissão
      -- queima o número — buraco na sequência se resolve com inutilização, que
      -- é justamente por que o histórico de tentativas acima existe.
      --
      -- ⚠️ Quando nascer o 2º caixa (multi-caixa remoto), esta reserva TEM que
      -- ser feita num lugar só, senão dois terminais emitem com o mesmo número
      -- e a SEFAZ rejeita a segunda.
      CREATE TABLE IF NOT EXISTS nfce_numeracao (
        serie INTEGER PRIMARY KEY,
        proximo_numero INTEGER NOT NULL DEFAULT 1
      );
    `)

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('031_fiscal_nfce')
  })()
}
