// Gera o HTML do relatório de vendas de um mês (formato A4, estilo do relatório
// de estoque em Produtos.tsx). O resumo gerencial é calculado a partir das
// vendas já carregadas no front; o ranking de produtos mais vendidos é opcional
// e vem de uma query agregada no backend (vendas:produtosMaisVendidos).

import { nomeImpressao } from './nomeImpressao'

type StatusPagamento = 'pago' | 'pendente' | 'inadimplente' | 'parcelado'

// Subconjunto da Venda do histórico — só o que o relatório consome.
export type VendaRelatorio = {
  id: number
  data: string
  total: number
  desconto: number
  valor_pago: number
  valor_devolvido: number
  status_pagamento: StatusPagamento
  num_parcelas: number | null
  cliente_nome?: string | null
  vendedor_nome?: string | null
}

export type ProdutoMaisVendido = {
  produto_nome: string
  quantidade: number
  receita: number
}

// A receber com VENCIMENTO dentro do mês (parcelas + vendas a prazo em aberto).
// Vem de query própria no backend (vendas:aReceberDoMes) porque inclui parcelas
// de vendas de meses anteriores — as vendas do mês não bastam pra calcular.
export type VencimentosMes = {
  a_vencer: number
  vencido: number
}

const MESES_LONGO = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

// 'YYYY-MM' → 'Junho / 2026'. Exportado pra o título do diálogo reusar o mesmo rótulo.
export const rotuloMes = (mes: string): string => {
  const [ano, m] = mes.split('-')
  return `${MESES_LONGO[Number(m) - 1] ?? '?'} / ${ano}`
}

const STATUS_LABEL: Record<StatusPagamento, string> = {
  pago: 'Pago',
  pendente: 'A prazo',
  parcelado: 'Parcelado',
  inadimplente: 'Inadimplente'
}

const STATUS_ORDEM: StatusPagamento[] = ['pago', 'pendente', 'parcelado', 'inadimplente']

const fmtMoeda = (valor: number): string =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtData = (iso: string): string => new Date(iso).toLocaleDateString('pt-BR')

const escapar = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export function gerarHtmlRelatorioVendas(
  vendas: VendaRelatorio[],
  mes: string,
  produtosMaisVendidos?: ProdutoMaisVendido[],
  vencimentosMes?: VencimentosMes
): string {
  const geradoEm = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  // ── Agregados do mês ──
  const nVendas = vendas.length
  const faturamento = vendas.reduce((acc, v) => acc + v.total, 0)
  const devolvido = vendas.reduce((acc, v) => acc + (v.valor_devolvido ?? 0), 0)
  const recebido = vendas.reduce((acc, v) => acc + v.valor_pago, 0)
  const descontos = vendas.reduce((acc, v) => acc + (v.desconto ?? 0), 0)
  const aReceber = vendas.reduce((acc, v) => acc + Math.max(0, v.total - v.valor_pago), 0)
  const faturamentoLiquido = faturamento - devolvido
  const ticketMedio = nVendas > 0 ? faturamento / nVendas : 0

  const cardsResumo: Array<[string, string]> = [
    ['Faturamento', fmtMoeda(faturamento)],
    ['Nº de vendas', String(nVendas)],
    ['Ticket médio', fmtMoeda(ticketMedio)],
    ['Recebido', fmtMoeda(recebido)],
    ['A receber (vendas do mês)', fmtMoeda(aReceber)],
    ['Descontos concedidos', fmtMoeda(descontos)],
    ['Devoluções', fmtMoeda(devolvido)],
    ['Faturamento líquido', fmtMoeda(faturamentoLiquido)]
  ]
  const cardsHtml = cardsResumo
    .map(([rotulo, valor]) => `<div class="card"><div class="card-rotulo">${rotulo}</div><div class="card-valor">${valor}</div></div>`)
    .join('')

  // Faixa "a receber no mês" ancorada no vencimento — número que os cards acima
  // não cobrem: parcelas de vendas de meses ANTERIORES que vencem neste mês.
  const totalVencimentos = vencimentosMes ? vencimentosMes.a_vencer + vencimentosMes.vencido : 0
  const faixaVencimentos = vencimentosMes
    ? `<div class="faixa-venc">
        <div class="faixa-venc-texto">
          <div class="faixa-venc-titulo">A RECEBER NO MÊS (POR VENCIMENTO)</div>
          <div class="faixa-venc-sub">Parcelas e vendas a prazo com vencimento em ${rotuloMes(mes)}, ainda em aberto — inclui vendas de meses anteriores.</div>
        </div>
        <div class="faixa-venc-valores">
          <div class="faixa-venc-total">${fmtMoeda(totalVencimentos)}</div>
          <div class="faixa-venc-sub">${fmtMoeda(vencimentosMes.a_vencer)} a vencer · ${fmtMoeda(vencimentosMes.vencido)} em atraso</div>
        </div>
      </div>`
    : ''

  // ── Por status ──
  const porStatus = STATUS_ORDEM.map((s) => {
    const doStatus = vendas.filter((v) => v.status_pagamento === s)
    return { status: s, qtd: doStatus.length, total: doStatus.reduce((acc, v) => acc + v.total, 0) }
  }).filter((linha) => linha.qtd > 0)

  const statusHtml = porStatus
    .map(
      (l) => `<tr>
        <td>${STATUS_LABEL[l.status]}</td>
        <td class="col-num">${l.qtd}</td>
        <td class="col-num">${fmtMoeda(l.total)}</td>
      </tr>`
    )
    .join('')

  // ── Por vendedor ──
  const mapaVendedor = new Map<string, { qtd: number; total: number }>()
  for (const v of vendas) {
    const nome = v.vendedor_nome || 'Sem vendedor'
    const atual = mapaVendedor.get(nome) ?? { qtd: 0, total: 0 }
    atual.qtd += 1
    atual.total += v.total
    mapaVendedor.set(nome, atual)
  }
  const porVendedor = [...mapaVendedor.entries()].sort((a, b) => b[1].total - a[1].total)
  const vendedorHtml = porVendedor
    .map(
      ([nome, d]) => `<tr>
        <td>${escapar(nome)}</td>
        <td class="col-num">${d.qtd}</td>
        <td class="col-num">${fmtMoeda(d.total)}</td>
      </tr>`
    )
    .join('')

  // ── Produtos mais vendidos (opcional) ──
  const secaoProdutos =
    produtosMaisVendidos && produtosMaisVendidos.length > 0
      ? `<div class="grupo">
          <div class="grupo-titulo">PRODUTOS MAIS VENDIDOS</div>
          <table>
            <thead><tr>
              <th>Produto</th>
              <th class="col-num">Qtd.</th>
              <th class="col-num">Receita</th>
            </tr></thead>
            <tbody>
              ${produtosMaisVendidos
                .map(
                  (p) => `<tr>
                    <td>${escapar(p.produto_nome)}</td>
                    <td class="col-num">${p.quantidade}</td>
                    <td class="col-num">${fmtMoeda(p.receita)}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`
      : ''

  // ── Lista das vendas do mês ──
  const vendasOrdenadas = vendas.slice().sort((a, b) => a.data.localeCompare(b.data))
  const listaHtml = vendasOrdenadas
    .map((v) => {
      const status = v.num_parcelas
        ? `${STATUS_LABEL[v.status_pagamento]} (${v.num_parcelas}x)`
        : STATUS_LABEL[v.status_pagamento]
      const dev = (v.valor_devolvido ?? 0) > 0 ? ' ↩' : ''
      return `<tr>
        <td class="col-id">${v.id}</td>
        <td>${fmtData(v.data)}</td>
        <td>${escapar(v.cliente_nome || 'Venda avulsa')}</td>
        <td>${escapar(v.vendedor_nome || '—')}</td>
        <td class="col-num">${fmtMoeda(v.total)}</td>
        <td>${status}${dev}</td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${nomeImpressao.relatorioVendas(mes)}</title>
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
    .faixa-venc { display: flex; justify-content: space-between; align-items: center; gap: 16px; border: 1px solid #ccc; background: #eef2f7; padding: 8px 10px; margin: -10px 0 18px; }
    .faixa-venc-titulo { font-size: 10px; font-weight: bold; letter-spacing: 0.3px; }
    .faixa-venc-sub { font-size: 9px; color: #555; margin-top: 2px; }
    .faixa-venc-valores { text-align: right; white-space: nowrap; }
    .faixa-venc-total { font-size: 14px; font-weight: bold; }
    .grupo { margin-bottom: 16px; page-break-inside: avoid; }
    .grupo-titulo { background: #333; color: #fff; padding: 4px 8px; font-weight: bold; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #eee; border: 1px solid #ccc; padding: 4px 6px; text-align: left; font-size: 10px; font-weight: bold; }
    tbody td { border: 1px solid #ddd; padding: 4px 6px; font-size: 10px; }
    .col-num { text-align: right; white-space: nowrap; }
    .col-id { width: 40px; color: #666; font-family: monospace; }
    .duas-colunas { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .rodape { margin-top: 20px; text-align: center; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="cabecalho">
    <h1>RELATÓRIO DE VENDAS</h1>
    <div class="ref">${rotuloMes(mes)}</div>
    <div class="info">Gerado em: ${geradoEm}</div>
  </div>

  <div class="cards">
    ${cardsHtml}
  </div>

  ${faixaVencimentos}

  <div class="duas-colunas">
    <div class="grupo">
      <div class="grupo-titulo">POR STATUS</div>
      <table>
        <thead><tr><th>Status</th><th class="col-num">Vendas</th><th class="col-num">Total</th></tr></thead>
        <tbody>${statusHtml || '<tr><td colspan="3">—</td></tr>'}</tbody>
      </table>
    </div>
    <div class="grupo">
      <div class="grupo-titulo">POR VENDEDOR</div>
      <table>
        <thead><tr><th>Vendedor</th><th class="col-num">Vendas</th><th class="col-num">Total</th></tr></thead>
        <tbody>${vendedorHtml || '<tr><td colspan="3">—</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  ${secaoProdutos}

  <div class="grupo">
    <div class="grupo-titulo">VENDAS DO MÊS (${nVendas})</div>
    <table>
      <thead><tr>
        <th class="col-id">#</th>
        <th>Data</th>
        <th>Cliente</th>
        <th>Vendedor</th>
        <th class="col-num">Total</th>
        <th>Status</th>
      </tr></thead>
      <tbody>${listaHtml || '<tr><td colspan="6">Nenhuma venda no mês.</td></tr>'}</tbody>
    </table>
  </div>

  <div class="rodape">FHVP Tech — Relatório de Vendas</div>
</body>
</html>`
}
