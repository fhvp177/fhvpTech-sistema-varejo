import type Database from 'better-sqlite3'
import { adicionarColunaSeAusente } from '@fhvptech/core/electron/db/migrationUtils'

// Classificação fiscal do SERVIÇO — o terreno da NFS-e.
//
// A migration 031 (herdada do varejo) deu aos produtos o que a SEFAZ pede: NCM,
// CFOP, CSOSN. Nada disso serve para serviço. Serviço é tributado pelo
// MUNICÍPIO, e o que o identifica é outro par de números:
//
//   • item da lista da LC 116/2003 — ex.: "14.01" (manutenção de máquinas e
//     aparelhos), "14.02" (assistência técnica), "17.01" (assessoria);
//   • alíquota do ISS que a prefeitura cobra daquele item, em percentual.
//
// ── Por que aqui NÃO há preenchimento automático ─────────────────────────────
// Na 031 o NCM é herdado do XML do fornecedor: numa loja de 800 produtos, isso
// é a diferença entre viável e inviável. Serviço não tem esse atalho — ele não
// entra por nota de compra, nasce do cadastro do próprio lojista. E não existe
// item "padrão" da LC 116 que se possa chutar: errar o item muda o imposto e
// vira passivo invisível, exatamente o que a 031 evita ao deixar o NCM em
// branco em vez de adivinhar. Quem informa os dois números é o contador do
// cliente, uma vez, para o punhado de serviços que a assistência presta —
// tipicamente menos de dez linhas.
//
// As colunas ficam em `produtos` porque desde a 027 é lá que serviço mora
// (mesma tabela, coluna `tipo`). Produto físico simplesmente as deixa nulas,
// como serviço deixa NCM e CFOP nulos.
export function aplicarAt001NfseServico(db: Database.Database): void {
  db.transaction(() => {
    // Item da lista da LC 116/2003. TEXT porque o formato é "NN.NN" — guardar
    // como número perderia o zero à esquerda de "01.07" e o ponto.
    adicionarColunaSeAusente(db, 'produtos', 'item_lista_servico', 'TEXT')

    // Alíquota do ISS em PERCENTUAL (5 = 5%), como a prefeitura publica e como
    // a ACBr espera. Guardar como fração (0,05) obrigaria a converter em três
    // lugares e é o tipo de detalhe que um dia sai errado numa nota.
    adicionarColunaSeAusente(db, 'produtos', 'aliquota_iss', 'REAL')

    // Algumas prefeituras exigem o código de tributação DELAS, além do item da
    // LC 116. Opcional: só é enviado quando preenchido.
    adicionarColunaSeAusente(db, 'produtos', 'codigo_tributacao_municipio', 'TEXT')

    // CNAE do serviço. Também opcional, exigido por parte dos provedores.
    adicionarColunaSeAusente(db, 'produtos', 'codigo_cnae', 'TEXT')

    // ── Livro das NFS-e emitidas — tabela PRÓPRIA, e não uma linha a mais em
    // `nfce_emitidas`. Duas razões concretas, as duas descobertas tentando o
    // contrário:
    //
    // 1. A `nfce_emitidas` tem índice único garantindo UMA nota vigente por
    //    venda (`idx_nfce_venda_vigente`). Numa assistência a venda mista é o
    //    normal — peça + mão de obra —, e ela precisa das DUAS notas ao mesmo
    //    tempo: a mercadoria vai pro estado, o serviço vai pro município. Com a
    //    NFS-e na mesma tabela, a segunda emissão batia no índice.
    //
    // 2. O CHECK de status de lá é o vocabulário da SEFAZ
    //    ('autorizado','rejeitado'…). A prefeitura fala outro
    //    ('autorizada','negada','processando'…) — no feminino, e com estados que
    //    não existem na SEFAZ. Encaixar um no outro exigiria reconstruir uma
    //    tabela que guarda documento fiscal de verdade.
    //
    // Bônus da separação: o caminho da NFC-e/NF-e continua byte a byte igual ao
    // do varejo, então fix de lá segue sendo copiar-colar.
    db.exec(`
      CREATE TABLE IF NOT EXISTS nfse_emitidas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
        tentativa INTEGER NOT NULL DEFAULT 1,
        -- Prefixo 's' na referência (s<venda>-t<n>) — a idempotência no backend
        -- é por referência dentro do cliente, e ela não pode colidir com a da
        -- NFC-e da MESMA venda ('v<venda>-t<n>').
        referencia TEXT NOT NULL UNIQUE,
        acbr_id TEXT,
        ambiente TEXT NOT NULL CHECK(ambiente IN ('homologacao','producao')),
        numero INTEGER NOT NULL DEFAULT 0,
        -- O que a prefeitura devolve pro cliente conferir a nota no site dela.
        -- É o análogo da chave de acesso da NFC-e, mas não tem o mesmo nome nem
        -- o mesmo tamanho.
        codigo_verificacao TEXT,
        link_url TEXT,
        status TEXT NOT NULL DEFAULT 'processando'
          CHECK(status IN ('processando','autorizada','negada','cancelada','substituida','erro')),
        motivo TEXT,
        xml TEXT,
        criada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizada_em DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_nfse_venda ON nfse_emitidas(venda_id);

      -- Mesma regra da NFC-e: no máximo UMA nota de serviço vigente por venda.
      -- 'cancelada' e 'negada' ficam de fora — cancelou ou foi recusada, pode
      -- emitir outra.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nfse_venda_vigente
        ON nfse_emitidas(venda_id) WHERE status IN ('autorizada','processando');
    `)

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('at_001_nfse_servico')
  })()
}
