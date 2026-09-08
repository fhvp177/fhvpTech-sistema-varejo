import { obterBancoDeDados } from '@fhvptech/core/electron/db/conexao'

/**
 * Comprovantes de pagamento anexados a vendas.
 *
 * A imagem chega do navegador já reduzida (ver `redimensionarComprovante`), em
 * base64. Aqui a preocupação é outra: garantir que o que entra é imagem, que
 * cabe, e que não dá para inventar um comprovante para uma venda que não existe.
 */

export type Comprovante = {
  venda_id: number
  mime: string
  dados: string
  tamanho: number
  nome_arquivo: string | null
  anexado_por: number | null
  anexado_em: string
  anexado_por_nome?: string | null
}

/**
 * Teto do que é aceito, já depois da redução feita no navegador.
 *
 * ⚠️ O limite existe DOS DOIS LADOS de propósito. O navegador reduz porque é
 * onde a imagem está e onde é barato; o banco recusa porque quem chama pode não
 * ser a tela — o canal é IPC, e um terminal de segundo caixa fala com ele pela
 * rede. Confiar só na redução do cliente deixaria o tamanho do banco na mão de
 * quem chama.
 *
 * 2 MB é folgado: um comprovante reduzido fica entre 100 e 300 KB. O teto está
 * aqui para barrar o acidente (mandar o arquivo original de 8 MB da câmera),
 * não para apertar o uso normal.
 */
const TAMANHO_MAXIMO = 2 * 1024 * 1024

/**
 * Imagem (o que o navegador produz no redimensionamento) e PDF.
 *
 * PDF entrou porque é como os bancos brasileiros geram o comprovante no
 * "salvar" e como ele chega por e-mail. Ele não passa por redimensionamento —
 * não há como reduzi-lo aqui —, mas também não precisa: sendo texto e não
 * imagem, costuma pesar menos que a foto já reduzida.
 */
const MIMES_ACEITOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

/**
 * Todo PDF começa com os bytes `%PDF-`, que em base64 viram `JVBERi0`.
 *
 * ⚠️ O `mime` vem de quem chamou, e quem chama pode não ser a tela: o canal é
 * IPC e o segundo caixa fala com ele pela rede. Sem conferir a assinatura, para
 * gravar qualquer coisa bastaria dizer que é PDF — e o que está guardado aqui
 * volta depois para ser aberto no visualizador do navegador.
 *
 * Não é antivírus: é a diferença entre aceitar um arquivo e aceitar um rótulo.
 */
const ASSINATURA_PDF = 'JVBERi0'

export type NovoComprovante = {
  venda_id: number
  mime: string
  /** Base64 puro, SEM o prefixo `data:...;base64,`. */
  dados: string
  nome_arquivo?: string | null
  anexado_por?: number | null
}

export function anexarComprovante(c: NovoComprovante): void {
  const db = obterBancoDeDados()

  if (!MIMES_ACEITOS.has(c.mime)) {
    throw new Error('O comprovante precisa ser uma imagem (JPG ou PNG) ou um PDF.')
  }

  if (c.mime === 'application/pdf' && !c.dados.startsWith(ASSINATURA_PDF)) {
    throw new Error('O arquivo não é um PDF válido.')
  }

  /*
   * ⚠️ O base64 é validado ANTES de gravar, e não na hora de mostrar.
   *
   * O que sai daqui vira `src` de uma `<img>` na tela. Gravar sem conferir
   * deixaria o banco aceitar qualquer texto e transformaria a tela de vendas no
   * lugar onde esse texto é interpretado — que é o pior lugar para descobrir
   * que ele não era uma imagem.
   */
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(c.dados) || c.dados.length < 32) {
    throw new Error('Arquivo de comprovante inválido.')
  }

  // O base64 cresce 4/3 sobre o binário. É o tamanho real do arquivo que
  // interessa ao lojista, e é ele que o teto compara.
  const bytes = Math.floor((c.dados.length * 3) / 4)
  if (bytes > TAMANHO_MAXIMO) {
    throw new Error(
      `O comprovante tem ${(bytes / 1024 / 1024).toFixed(1)} MB e o limite é 2 MB. ` +
        (c.mime === 'application/pdf'
          ? 'Comprovante de banco costuma ter menos de 200 KB — confira se não é um extrato inteiro.'
          : 'Tire uma foto menor ou recorte a imagem.')
    )
  }

  const venda = db.prepare('SELECT id FROM vendas WHERE id = ?').get(c.venda_id)
  if (!venda) throw new Error('Venda não encontrada.')

  /*
   * ⚠️ Um comprovante por venda: anexar de novo SUBSTITUI.
   *
   * Não é economia de espaço, é evitar a pergunta "qual destes é o certo?" na
   * hora da conferência. Quando alguém anexa de novo, é porque o primeiro
   * estava errado ou ilegível.
   */
  db.prepare(
    `INSERT INTO comprovantes_venda (venda_id, mime, dados, tamanho, nome_arquivo, anexado_por)
     VALUES (@venda_id, @mime, @dados, @tamanho, @nome_arquivo, @anexado_por)
     ON CONFLICT(venda_id) DO UPDATE SET
       mime = excluded.mime,
       dados = excluded.dados,
       tamanho = excluded.tamanho,
       nome_arquivo = excluded.nome_arquivo,
       anexado_por = excluded.anexado_por,
       anexado_em = datetime('now','localtime')`
  ).run({
    venda_id: c.venda_id,
    mime: c.mime,
    dados: c.dados,
    tamanho: bytes,
    nome_arquivo: c.nome_arquivo ?? null,
    anexado_por: c.anexado_por ?? null
  })
}

/** A imagem inteira. Só chamado quando alguém abre o comprovante para ver. */
export function obterComprovante(vendaId: number): Comprovante | null {
  const db = obterBancoDeDados()
  const r = db
    .prepare(
      `SELECT c.*, v.nome AS anexado_por_nome
         FROM comprovantes_venda c
         LEFT JOIN vendedores v ON v.id = c.anexado_por
        WHERE c.venda_id = ?`
    )
    .get(vendaId) as Comprovante | undefined
  return r ?? null
}

/**
 * Só os metadados: quem anexou, quando, e quanto pesa — sem a imagem.
 *
 * É o que a tela de detalhe da venda pede ao abrir. Carregar a foto para
 * desenhar a linha "comprovante anexado em 06/09" seria trazer 200 KB para
 * mostrar 30 caracteres.
 */
export function resumoComprovante(
  vendaId: number
): Omit<Comprovante, 'dados'> | null {
  const db = obterBancoDeDados()
  const r = db
    .prepare(
      `SELECT c.venda_id, c.mime, c.tamanho, c.nome_arquivo, c.anexado_por,
              c.anexado_em, v.nome AS anexado_por_nome
         FROM comprovantes_venda c
         LEFT JOIN vendedores v ON v.id = c.anexado_por
        WHERE c.venda_id = ?`
    )
    .get(vendaId) as Omit<Comprovante, 'dados'> | undefined
  return r ?? null
}

/**
 * Quais vendas de uma lista têm comprovante.
 *
 * ⚠️ Uma consulta só para a página inteira, e sem trazer imagem nenhuma. A
 * alternativa — perguntar venda por venda — seriam vinte idas ao banco para
 * desenhar vinte clipes, e a lista de vendas é a tela mais aberta do sistema.
 */
export function vendasComComprovante(ids: number[]): number[] {
  if (ids.length === 0) return []
  const db = obterBancoDeDados()
  const marcadores = ids.map(() => '?').join(',')
  const linhas = db
    .prepare(`SELECT venda_id FROM comprovantes_venda WHERE venda_id IN (${marcadores})`)
    .all(...ids) as Array<{ venda_id: number }>
  return linhas.map((l) => l.venda_id)
}

export function removerComprovante(vendaId: number): void {
  const db = obterBancoDeDados()
  db.prepare('DELETE FROM comprovantes_venda WHERE venda_id = ?').run(vendaId)
}
