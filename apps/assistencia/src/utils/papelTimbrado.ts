/**
 * O papel timbrado dos documentos A4 — cabeçalho com a identidade da loja.
 *
 * Mora aqui, e não dentro de um dos documentos, porque a regra que ele carrega
 * é sobre IDENTIDADE, não sobre orçamento nem sobre recibo: quando a loja marca
 * "usar a logo no lugar do nome", isso vale em todo papel que sai com o nome
 * dela em cima. Deixar a regra copiada em cada documento garantiria que um dia
 * um deles ficasse para trás.
 *
 * Não vale para a bobina térmica de propósito — lá o nome em texto é o que
 * sempre sai legível, mesmo com a cabeça de impressão suja. Ver o comentário da
 * config em electron/ipc/loja.ts.
 */

import { linhaCidadeUf, type DadosLoja } from './dadosLoja'

export const escaparHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** CSS do cabeçalho. Vai junto do CSS de cada documento. */
export const CSS_PAPEL_TIMBRADO = `
    .cabecalho { display: flex; align-items: flex-start; gap: 14px; padding-bottom: 12px; border-bottom: 2.5px solid #1a1a1a; }
    .logo { max-height: 64px; max-width: 150px; object-fit: contain; }
    /* Logo ocupando o lugar do nome: cresce porque agora é ela quem identifica
       o documento. O teto de largura segura o cabeçalho de três colunas. */
    .logo-titulo { max-height: 82px; max-width: 210px; }
    .loja-bloco { flex: 1; }
    .loja-nome { font-size: 17px; font-weight: 700; letter-spacing: 0.2px; }
    .loja-info { font-size: 10.5px; color: #444; margin-top: 2px; }
    .doc-meta { text-align: right; font-size: 11px; color: #444; white-space: nowrap; }
    .doc-meta .doc-titulo { font-size: 15px; font-weight: 700; color: #1a1a1a; letter-spacing: 0.5px; }
`

/**
 * O cabeçalho pronto.
 *
 * `meta` é o canto direito (título do documento, data de emissão). Passe HTML
 * já montado — cada documento diz ali o que é.
 */
export function cabecalhoLoja(loja: DadosLoja, meta: string): string {
  // A logo pode aparecer AO LADO do nome ou NO LUGAR dele. No segundo caso ela
  // é a identificação do documento, então cresce.
  const mostraLogo = Boolean(loja.exibir_logo && loja.logo)
  const noLugarDoNome = mostraLogo && loja.logo_no_lugar_do_nome
  // `alt` com o nome da loja não é decoração: se a imagem não renderizar na
  // conversão para PDF, o nome ainda aparece em vez de um espaço mudo.
  const logo = mostraLogo
    ? `<img class="logo${noLugarDoNome ? ' logo-titulo' : ''}" src="${loja.logo}" alt="${escaparHtml(loja.nome)}">`
    : ''

  const linhas: string[] = []
  if (loja.razao_social) linhas.push(escaparHtml(loja.razao_social))
  if (loja.cnpj) linhas.push(`CNPJ: ${escaparHtml(loja.cnpj)}`)
  if (loja.endereco) linhas.push(escaparHtml(loja.endereco))
  const cidadeUf = linhaCidadeUf(loja)
  if (cidadeUf) linhas.push(escaparHtml(cidadeUf))
  if (loja.telefone) linhas.push(`Telefone: ${escaparHtml(loja.telefone)}`)

  return `<div class="cabecalho">
    ${logo}
    <div class="loja-bloco">
      ${noLugarDoNome ? '' : `<div class="loja-nome">${escaparHtml(loja.nome)}</div>`}
      <div class="loja-info">${linhas.join(' · ')}</div>
    </div>
    ${meta}
  </div>`
}
