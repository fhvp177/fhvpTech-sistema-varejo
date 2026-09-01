// HTML do relatório de comissões de um mês (A4), no mesmo estilo dos demais
// relatórios do sistema. É o papel que o gerente entrega ao vendedor junto com
// o pagamento — por isso o detalhamento venda a venda é opcional: às vezes ele
// quer só o consolidado, às vezes precisa provar a conta linha por linha.

import { nomeImpressao } from './nomeImpressao'

const MESES_LONGO = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

export const rotuloMesComissao = (mes: string): string => {
  const [ano, m] = mes.split('-')
  return `${MESES_LONGO[Number(m) - 1] ?? '?'} / ${ano}`
}

const dinheiro = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const pct = (v: number): string =>
  `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

const dataBr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/')

const escapar = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export type LinhaRelatorioComissao = {
  vendedor_id: number | null
  vendedor_nome: string
  qtd_vendas: number
  base: number
  valor_comissao: number
  pct_vigente: number
  pct_misto: number
  comissionavel: number
  pago_em: string | null
  valor_pago_comissao: number | null
}

export type DetalheRelatorioComissao = {
  venda_id: number
  data: string
  cliente_nome: string | null
  total: number
  devolvido: number
  base: number
  pct: number
  valor_comissao: number
}

export function gerarHtmlRelatorioComissoes(
  mes: string,
  linhas: LinhaRelatorioComissao[],
  opcoes: {
    nomeLoja?: string
    /** Detalhamento venda a venda, por vendedor. Ausente = só o consolidado. */
    detalhes?: Map<number | null, DetalheRelatorioComissao[]>
  } = {}
): string {
  const geradoEm = new Date().toLocaleString('pt-BR')
  const comissionaveis = linhas.filter((l) => l.comissionavel === 1)

  const totalComissao = comissionaveis.reduce((s, l) => s + l.valor_comissao, 0)
  const totalBase = comissionaveis.reduce((s, l) => s + l.base, 0)
  const totalPago = comissionaveis.reduce((s, l) => s + (l.valor_pago_comissao ?? 0), 0)
  const emAberto = comissionaveis
    .filter((l) => l.pago_em === null)
    .reduce((s, l) => s + l.valor_comissao, 0)

  const cards = [
    ['Vendedores', String(comissionaveis.length)],
    ['Base de cálculo', dinheiro(totalBase)],
    ['Comissão apurada', dinheiro(totalComissao)],
    ['Em aberto', dinheiro(emAberto)]
  ]
    .map(
      ([rotulo, valor]) =>
        `<div class="card"><div class="card-rotulo">${rotulo}</div><div class="card-valor">${valor}</div></div>`
    )
    .join('')

  const linhasHtml = linhas
    .map((l) => {
      const semVendedor = l.comissionavel === 0
      const situacao = semVendedor
        ? '<span class="obs">não comissiona</span>'
        : l.pago_em
          ? `Pago em ${dataBr(l.pago_em)}`
          : 'Em aberto'
      const percentual = semVendedor
        ? '—'
        : l.pct_misto === 1
          ? '<span class="obs">misto</span>'
          : pct(l.pct_vigente)
      return `<tr${semVendedor ? ' class="linha-info"' : ''}>
        <td>${escapar(l.vendedor_nome)}</td>
        <td class="col-num">${l.qtd_vendas}</td>
        <td class="col-num">${dinheiro(l.base)}</td>
        <td class="col-num">${percentual}</td>
        <td class="col-num"><strong>${dinheiro(l.valor_comissao)}</strong></td>
        <td>${situacao}</td>
      </tr>`
    })
    .join('')

  const detalhesHtml = opcoes.detalhes
    ? comissionaveis
        .map((l) => {
          const vendas = opcoes.detalhes!.get(l.vendedor_id) ?? []
          if (vendas.length === 0) return ''
          const corpo = vendas
            .map(
              (v) => `<tr>
                <td class="col-id">#${v.venda_id}</td>
                <td>${dataBr(v.data)}</td>
                <td>${escapar(v.cliente_nome ?? 'Consumidor')}</td>
                <td class="col-num">${dinheiro(v.total)}</td>
                <td class="col-num">${v.devolvido > 0 ? `− ${dinheiro(v.devolvido)}` : '—'}</td>
                <td class="col-num">${dinheiro(v.base)}</td>
                <td class="col-num">${pct(v.pct)}</td>
                <td class="col-num"><strong>${dinheiro(v.valor_comissao)}</strong></td>
              </tr>`
            )
            .join('')
          return `<div class="grupo">
            <div class="grupo-titulo">${escapar(l.vendedor_nome)} — ${dinheiro(l.valor_comissao)}</div>
            <table>
              <thead><tr>
                <th>Venda</th><th>Data</th><th>Cliente</th>
                <th class="col-num">Total</th><th class="col-num">Devolvido</th>
                <th class="col-num">Base</th><th class="col-num">%</th>
                <th class="col-num">Comissão</th>
              </tr></thead>
              <tbody>${corpo}</tbody>
            </table>
          </div>`
        })
        .join('')
    : ''

  const assinaturas = comissionaveis
    .map(
      (l) => `<div class="assinatura">
        <div class="linha-assinatura"></div>
        <div class="nome-assinatura">${escapar(l.vendedor_nome)} — ${dinheiro(l.valor_comissao)}</div>
      </div>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${nomeImpressao.relatorioComissoes(mes)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
    @page { margin: 15mm; }
    .cabecalho { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 12px; }
    .cabecalho h1 { font-size: 16px; font-weight: bold; letter-spacing: 1px; }
    .cabecalho .ref { font-size: 12px; font-weight: bold; margin-top: 4px; }
    .cabecalho .info { font-size: 10px; color: #555; margin-top: 2px; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 18px; }
    .card { border: 1px solid #ddd; background: #f5f5f5; padding: 6px 8px; }
    .card-rotulo { font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: 0.3px; }
    .card-valor { font-size: 13px; font-weight: bold; margin-top: 2px; }
    .grupo { margin-bottom: 16px; page-break-inside: avoid; }
    .grupo-titulo { background: #333; color: #fff; padding: 4px 8px; font-weight: bold; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    thead th { background: #eee; border: 1px solid #ccc; padding: 4px 6px; text-align: left; font-size: 10px; font-weight: bold; }
    tbody td { border: 1px solid #ddd; padding: 4px 6px; font-size: 10px; }
    .col-num { text-align: right; white-space: nowrap; }
    .col-id { width: 46px; color: #666; font-family: monospace; }
    .linha-info td { color: #666; background: #fafafa; font-style: italic; }
    .obs { color: #777; font-size: 9px; }
    .regra { border: 1px solid #ccc; background: #eef2f7; padding: 8px 10px; margin-bottom: 16px; font-size: 10px; }
    .assinaturas { margin-top: 26px; page-break-inside: avoid; }
    .assinaturas h2 { font-size: 11px; margin-bottom: 14px; }
    .assinatura { display: inline-block; width: 48%; margin: 18px 1% 0; }
    .linha-assinatura { border-top: 1px solid #000; }
    .nome-assinatura { font-size: 9px; text-align: center; margin-top: 3px; }
    .rodape { margin-top: 20px; text-align: center; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="cabecalho">
    <h1>RELATÓRIO DE COMISSÕES</h1>
    <div class="ref">${rotuloMesComissao(mes)}</div>
    ${opcoes.nomeLoja ? `<div class="info">${escapar(opcoes.nomeLoja)}</div>` : ''}
    <div class="info">Gerado em: ${geradoEm}</div>
  </div>

  <div class="cards">${cards}</div>

  <div class="regra">
    <strong>Como a comissão é calculada:</strong> percentual do vendedor aplicado sobre o valor
    da venda já com o desconto abatido, menos o que foi devolvido. Vendas canceladas não entram.
  </div>

  <table>
    <thead><tr>
      <th>Vendedor</th>
      <th class="col-num">Vendas</th>
      <th class="col-num">Base</th>
      <th class="col-num">%</th>
      <th class="col-num">Comissão</th>
      <th>Situação</th>
    </tr></thead>
    <tbody>${linhasHtml}</tbody>
  </table>

  ${detalhesHtml}

  ${
    comissionaveis.length > 0
      ? `<div class="assinaturas"><h2>Recebi o valor da comissão referente a ${rotuloMesComissao(mes)}:</h2>${assinaturas}</div>`
      : ''
  }

  <div class="rodape">
    Total apurado: ${dinheiro(totalComissao)} · Já pago: ${dinheiro(totalPago)} · Em aberto: ${dinheiro(emAberto)}
  </div>
</body>
</html>`
}
