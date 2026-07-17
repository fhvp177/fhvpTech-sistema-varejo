// Nomes padronizados (filesystem-safe) para todas as impressões do sistema.
// Servem tanto como nome do PDF ao salvar quanto do arquivo temporário gerado
// na impressão. O número vem do id da entidade (cupom/devolução) ou de um
// carimbo de data/hora (relatório/etiquetas, que não têm id próprio).

const pad = (n: number, casas = 4): string => String(n).padStart(casas, '0')
const dois = (n: number): string => String(n).padStart(2, '0')

// AAAA-MM-DD (data local)
const dataSlug = (d: Date): string =>
  `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`

// AAAA-MM-DD-HHmm (data + hora local)
const dataHoraSlug = (d: Date): string =>
  `${dataSlug(d)}-${dois(d.getHours())}${dois(d.getMinutes())}`

export const nomeImpressao = {
  cupomVenda: (vendaId: number): string => `Cupom-Venda-${pad(vendaId)}`,
  devolucao: (devId: number, vendaId: number): string =>
    `Devolucao-${pad(devId)}-ref-Venda-${pad(vendaId)}`,
  relatorioEstoque: (d: Date = new Date()): string => `Relatorio-Estoque-${dataSlug(d)}`,
  tabelaReferencias: (d: Date = new Date()): string => `Tabela-Referencias-${dataSlug(d)}`,
  // mes vem como 'YYYY-MM' (já filesystem-safe) — ex.: Relatorio-Vendas-2026-06
  relatorioVendas: (mes: string): string => `Relatorio-Vendas-${mes}`,
  relatorioEntradas: (mes: string): string => `Relatorio-Entradas-${mes}`,
  etiquetas: (d: Date = new Date()): string => `Etiquetas-${dataHoraSlug(d)}`
}
