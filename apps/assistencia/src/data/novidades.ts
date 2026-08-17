import type { ItemNovidade } from '@fhvptech/core/ui/NovidadesModal'

export type ReleaseNovidades = { versao: string; itens: ItemNovidade[] }

// Novidades por versão, em linguagem do dono (não changelog técnico).
// A CADA release, adicione uma entrada nova aqui com os destaques amigáveis.
// A `versao` deve bater com a `version` do package.json.
// A assistência nasce sem histórico — as novidades do varejo não valem aqui.
// A primeira entrada é a da 1.0.0, a release que estreia o nicho.
export const NOVIDADES: ReleaseNovidades[] = [
  {
    versao: '1.0.0',
    itens: [
      {
        emoji: '🔧',
        titulo: 'Ordens de serviço',
        descricao:
          'O acompanhamento do trabalho da bancada e dos atendimentos externos, do recebimento do aparelho até a entrega. Inclui orçamento para aprovação do cliente, laudo técnico com registro fotográfico, controle de garantia e comprovantes de entrada e de entrega.'
      },
      {
        emoji: '🧾',
        titulo: 'Recibos',
        descricao:
          'Emissão de recibo para o dinheiro que entra fora do caixa, como adiantamentos e acertos. O valor sai também por extenso e a numeração é controlada pelo sistema.'
      },
      {
        emoji: '📄',
        titulo: 'Nota fiscal de mercadoria e de serviço',
        descricao:
          'Emissão de NFC-e e NF-e para as peças e de NFS-e para a mão de obra. Quando a venda tem os dois, os dois documentos ficam disponíveis lado a lado.'
      },
      {
        emoji: '💳',
        titulo: 'Forma de pagamento na venda',
        descricao:
          'A venda passa a registrar como foi paga, o que alimenta o relatório de faturamento por meio de pagamento e a própria nota fiscal.'
      }
    ]
  }
]

// Compara versões "x.y.z": >0 se a>b, <0 se a<b, 0 se iguais.
export function compararVersao(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

// Releases com novidades entre a última versão vista (exclusivo) e a atual
// (inclusivo), da mais nova pra mais antiga.
export function novidadesParaMostrar(ultimaVista: string, atual: string): ReleaseNovidades[] {
  return NOVIDADES.filter(
    (n) => compararVersao(n.versao, ultimaVista) > 0 && compararVersao(n.versao, atual) <= 0
  ).sort((a, b) => compararVersao(b.versao, a.versao))
}
