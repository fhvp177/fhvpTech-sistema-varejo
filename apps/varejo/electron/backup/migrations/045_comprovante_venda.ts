import type Database from 'better-sqlite3'

/**
 * Comprovante de pagamento anexado à venda — a foto do PIX que caiu.
 *
 * ── Para que serve ──────────────────────────────────────────────────────────
 * A joia sai para entrega e o cliente paga por PIX na porta. O entregador vê o
 * comprovante na tela do celular do cliente e pronto: não fica prova nenhuma no
 * sistema. Quando o valor não aparece na conta, uma semana depois, a conversa é
 * a palavra de um contra a do outro.
 *
 * ── ⚠️ Por que o arquivo mora NO BANCO, e não numa pasta ────────────────────
 * Porque o backup só leva o banco. `criarZip` empacota exatamente dois
 * arquivos: `database.sqlite` e `metadata.json` — nada mais.
 *
 * Comprovante em pasta separada teria três consequências, todas silenciosas:
 * não entraria em backup nenhum; restaurar um backup deixaria as vendas
 * apontando para arquivos que não existem mais; e a loja hospedada, que é a que
 * de fato roda no cliente, perderia tudo a cada troca de máquina.
 *
 * Guardar no banco resolve os três de uma vez, sem código novo: o comprovante
 * viaja em toda cópia, em todo envio para a nuvem, em toda restauração. É
 * também o que o resto do sistema já faz — a logo da loja mora na tabela
 * `config` como data URI desde sempre.
 *
 * ── ⚠️ E por que TABELA SEPARADA, e não uma coluna em `vendas` ──────────────
 * Este é o detalhe que decide se o sistema continua rápido.
 *
 * Quase toda consulta de venda faz `SELECT v.*`: a lista de vendas, o Painel, os
 * relatórios, o cupom. Uma coluna com a imagem viria junto em TODAS elas —
 * centenas de vendas × algumas centenas de KB, carregados para desenhar uma
 * tabela que só mostra data e valor. A tela ficaria mais lenta a cada mês, sem
 * nenhum erro, e a causa não estaria em lugar nenhum.
 *
 * Em tabela à parte, a imagem só é lida quando alguém abre aquela venda para
 * ver o comprovante. O `EXISTS` numa consulta de lista custa quase nada e é o
 * que permite mostrar o clipe na linha sem carregar a foto.
 *
 * ── Um por venda ────────────────────────────────────────────────────────────
 * `venda_id` é a chave primária, então anexar de novo SUBSTITUI. Um comprovante
 * é o comprovante daquele pagamento; uma pilha deles na mesma venda seria
 * sinal de erro, e escolher "qual é o certo" na hora da conferência é trabalho
 * que ninguém quer.
 */
export function aplicar045ComprovanteVenda(db: Database.Database): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS comprovantes_venda (
        venda_id INTEGER PRIMARY KEY REFERENCES vendas(id),
        -- 'image/jpeg' ou 'image/png'. Guardado separado dos dados para a tela
        -- montar o data URI sem ter que confiar no que veio gravado.
        mime TEXT NOT NULL,
        -- A imagem em base64, já reduzida no navegador antes de chegar aqui.
        dados TEXT NOT NULL,
        -- Tamanho em bytes do que foi gravado. Existe para a tela poder dizer
        -- "1,2 MB" sem carregar a imagem inteira só para medir.
        tamanho INTEGER NOT NULL,
        -- Nome do arquivo escolhido, quando havia um. Some no caminho da câmera.
        nome_arquivo TEXT,
        anexado_por INTEGER,
        anexado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
    `)

    db.prepare('INSERT OR IGNORE INTO _migrations (nome) VALUES (?)').run('045_comprovante_venda')
  })()
}
