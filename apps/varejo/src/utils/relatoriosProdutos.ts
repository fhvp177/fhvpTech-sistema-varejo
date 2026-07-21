// Geradores de HTML (A4) dos relatórios baseados na lista de produtos:
// o relatório de estoque (balanço com coluna de contagem física) e a tabela de
// referências (a "cola do balcão"). Usados pela tela de Produtos e pela página
// Relatórios — um lugar só pra manter o layout.

import { nomeImpressao } from './nomeImpressao'

// Subconjunto do Produto que os relatórios consomem.
export type ProdutoRelatorio = {
  nome: string
  categoria: string | null
  codigo_barras: string | null
  referencia: string | null
  estoque: number
  fornecedor_nome?: string | null
  variacoes: Array<{ tamanho: string; codigo_barras: string; estoque: number }>
}

export function gerarHtmlRelatorioEstoque(produtos: ProdutoRelatorio[]): string {
  const data = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  const grupos = new Map<string, ProdutoRelatorio[]>()
  for (const p of produtos) {
    const cat = p.categoria || 'Sem Categoria'
    if (!grupos.has(cat)) grupos.set(cat, [])
    grupos.get(cat)!.push(p)
  }

  const categoriasOrdenadas = [...grupos.keys()].sort((a, b) => {
    if (a === 'Sem Categoria') return 1
    if (b === 'Sem Categoria') return -1
    return a.localeCompare(b, 'pt-BR')
  })

  const totalProdutos = produtos.length
  const totalItens = produtos.reduce((acc, p) => acc + p.estoque, 0)

  const tabelasHtml = categoriasOrdenadas.map((cat) => {
    const prods = grupos.get(cat)!.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    const linha = (nome: string, codigo: string, estoque: number, comFornecedor: string) => {
      const cls = estoque === 0 ? 'estoque-zero' : estoque <= 5 ? 'estoque-baixo' : ''
      return `<tr>
        <td>${nome}${comFornecedor}</td>
        <td class="col-codigo">${codigo}</td>
        <td class="col-estoque ${cls}">${estoque}</td>
        <td class="col-contagem"></td>
      </tr>`
    }
    const linhas = prods.map((p) => {
      const fornecedor = p.fornecedor_nome
        ? `<div class="fornecedor-nome">${p.fornecedor_nome}</div>`
        : ''
      // Produto de grade: uma linha por tamanho (cada um com seu código/estoque).
      if (p.variacoes.length > 0) {
        return p.variacoes
          .map((v) => linha(`${p.nome} — ${v.tamanho}`, v.codigo_barras, v.estoque, ''))
          .join('')
      }
      return linha(p.nome, p.codigo_barras ?? '—', p.estoque, fornecedor)
    }).join('')
    return `<div class="grupo-categoria">
      <div class="grupo-titulo">${cat} (${prods.length} produto${prods.length !== 1 ? 's' : ''})</div>
      <table>
        <thead><tr>
          <th>Produto</th>
          <th class="col-codigo">Cód. Barras</th>
          <th class="col-estoque">Estoque Sist.</th>
          <th class="col-contagem">Contagem Física</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${nomeImpressao.relatorioEstoque()}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
    @page { margin: 15mm; }
    .cabecalho { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 12px; }
    .cabecalho h1 { font-size: 16px; font-weight: bold; letter-spacing: 1px; }
    .cabecalho .info { font-size: 10px; color: #555; margin-top: 4px; }
    .resumo { display: flex; gap: 24px; margin-bottom: 16px; padding: 8px 12px; background: #f5f5f5; border: 1px solid #ddd; }
    .resumo div { font-size: 11px; }
    .resumo span { font-weight: bold; }
    .grupo-categoria { margin-bottom: 14px; page-break-inside: avoid; }
    .grupo-titulo { background: #333; color: #fff; padding: 4px 8px; font-weight: bold; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #eee; border: 1px solid #ccc; padding: 4px 6px; text-align: left; font-size: 10px; font-weight: bold; }
    tbody td { border: 1px solid #ddd; padding: 4px 6px; font-size: 10px; }
    .col-codigo { width: 130px; font-family: monospace; font-size: 9px; }
    .col-estoque { width: 90px; text-align: center; font-weight: bold; }
    .col-contagem { width: 110px; text-align: center; background: #fffef0; }
    .estoque-zero { color: #cc0000; }
    .estoque-baixo { color: #d97706; }
    .fornecedor-nome { font-size: 9px; color: #666; font-style: italic; margin-top: 1px; }
    .rodape { margin-top: 20px; text-align: center; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="cabecalho">
    <h1>RELATÓRIO DE ESTOQUE</h1>
    <div class="info">Gerado em: ${data}</div>
  </div>
  <div class="resumo">
    <div>Total de produtos: <span>${totalProdutos}</span></div>
    <div>Total de itens em estoque: <span>${totalItens}</span></div>
  </div>
  ${tabelasHtml}
  <div class="rodape">FHVP Tech — Balanço de Estoque</div>
</body>
</html>`
}

// A "cola do balcão": só referência + nome, em 3 colunas compactas — pra
// imprimir e deixar na mesa pro vendedor que ainda não decorou as referências.
// Deliberadamente sem preço/estoque: esses mudam toda hora e desatualizariam o
// papel; a referência é estável.
//
// Ordenado pela REFERÊNCIA, não pelo nome: no balcão o vendedor procura pelo
// número que vai digitar no PDV, e uma lista 1, 2, 3… é varrida com o dedo.
// A comparação é NUMÉRICA (`numeric: true`), senão "10" viria antes de "2" —
// referência é texto no banco, porque também aceita formatos como "AZ-15" (do
// catálogo do fornecedor). Assim os números saem em ordem de verdade e os
// alfanuméricos vêm depois, agrupados.
export function gerarHtmlTabelaReferencias(produtos: ProdutoRelatorio[]): string {
  const data = new Date().toLocaleDateString('pt-BR')
  const linhas = [...produtos]
    .sort((a, b) =>
      (a.referencia ?? '').localeCompare(b.referencia ?? '', 'pt-BR', {
        numeric: true,
        sensitivity: 'base'
      })
    )
    .map(
      (p) => `<div class="linha"><span class="ref">${p.referencia ?? '—'}</span><span class="nome">${p.nome}</span></div>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${nomeImpressao.tabelaReferencias()}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
    @page { margin: 12mm; }
    .cabecalho { text-align: center; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .cabecalho h1 { font-size: 15px; font-weight: bold; letter-spacing: 1px; }
    .cabecalho .info { font-size: 9px; color: #555; margin-top: 3px; }
    .colunas { column-count: 3; column-gap: 14px; column-rule: 1px solid #ddd; }
    .linha { display: flex; gap: 6px; padding: 2.5px 0; border-bottom: 1px solid #eee; break-inside: avoid; }
    .ref { font-family: monospace; font-weight: bold; min-width: 42px; text-align: right; flex-shrink: 0; }
    .nome { overflow: hidden; }
    .rodape { margin-top: 14px; text-align: center; font-size: 8px; color: #888; border-top: 1px solid #ccc; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="cabecalho">
    <h1>TABELA DE REFERÊNCIAS</h1>
    <div class="info">${produtos.length} produto(s) · Digite a referência no campo do leitor do caixa + Enter · Impressa em ${data}</div>
  </div>
  <div class="colunas">${linhas}</div>
  <div class="rodape">FHVP Tech — Tabela de Referências</div>
</body>
</html>`
}
