// Gerador do relatório de entradas (notas fiscais de compra importadas por XML)
// — o resumo mensal que o contador recebe junto com os XMLs exportados. Usado
// pelo modal Notas de Entrada (tela de Produtos) e pela página Relatórios.

import { nomeImpressao } from './nomeImpressao'

export type NotaEntradaRelatorio = {
  id: number
  chave: string
  numero: string | null
  serie: string | null
  fornecedor_nome: string
  fornecedor_cnpj: string | null
  data_emissao: string | null
  valor_total: number
  importada_em: string
  total_itens: number
  produtos_novos: number
  reposicoes: number
}

const dinheiro = (v: number): string =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// 'YYYY-MM' → 'Julho de 2026' (capitalizado)
export const rotuloMesEntradas = (mes: string): string => {
  const [ano, m] = mes.split('-').map(Number)
  const rotulo = new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  })
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1)
}

export const dataCurtaEntrada = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('pt-BR')
}

export function gerarHtmlRelatorioEntradas(mes: string, notas: NotaEntradaRelatorio[]): string {
  const geradoEm = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  const total = notas.reduce((s, n) => s + n.valor_total, 0)
  const linhas = notas
    .map(
      (n) => `<tr>
        <td>${dataCurtaEntrada(n.data_emissao)}</td>
        <td class="num">${n.numero ?? '—'}${n.serie ? `/${n.serie}` : ''}</td>
        <td>${n.fornecedor_nome}</td>
        <td class="num">${n.fornecedor_cnpj ?? '—'}</td>
        <td class="chave">${n.chave}</td>
        <td class="valor">${dinheiro(n.valor_total)}</td>
      </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${nomeImpressao.relatorioEntradas(mes)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
    @page { margin: 15mm; }
    .cabecalho { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 12px; }
    .cabecalho h1 { font-size: 16px; font-weight: bold; letter-spacing: 1px; }
    .cabecalho .info { font-size: 10px; color: #555; margin-top: 4px; }
    .resumo { display: flex; gap: 24px; margin-bottom: 16px; padding: 8px 12px; background: #f5f5f5; border: 1px solid #ddd; }
    .resumo span { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #eee; border: 1px solid #ccc; padding: 4px 6px; text-align: left; font-size: 10px; font-weight: bold; }
    tbody td { border: 1px solid #ddd; padding: 4px 6px; font-size: 10px; }
    .num { white-space: nowrap; }
    .chave { font-family: monospace; font-size: 8px; }
    .valor { text-align: right; white-space: nowrap; font-weight: bold; }
    tfoot td { border: 1px solid #ccc; padding: 5px 6px; font-weight: bold; background: #f5f5f5; }
    .rodape { margin-top: 20px; text-align: center; font-size: 9px; color: #888; border-top: 1px solid #ccc; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="cabecalho">
    <h1>RELATÓRIO DE ENTRADAS — ${rotuloMesEntradas(mes).toUpperCase()}</h1>
    <div class="info">Notas fiscais de compra importadas · Gerado em: ${geradoEm}</div>
  </div>
  <div class="resumo">
    <div>Notas no mês: <span>${notas.length}</span></div>
    <div>Total das compras: <span>${dinheiro(total)}</span></div>
  </div>
  <table>
    <thead><tr>
      <th>Emissão</th><th>Nº/Série</th><th>Fornecedor</th><th>CNPJ</th>
      <th>Chave de acesso</th><th>Valor</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
    <tfoot><tr><td colspan="5">TOTAL</td><td class="valor">${dinheiro(total)}</td></tr></tfoot>
  </table>
  <div class="rodape">FHVP Tech — Relatório de Entradas (compras) · Os arquivos XML originais podem ser exportados pelo sistema</div>
</body>
</html>`
}
