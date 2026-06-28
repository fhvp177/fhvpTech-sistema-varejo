import type { ItemNovidade } from '@fhvptech/core/ui/NovidadesModal'

export type ReleaseNovidades = { versao: string; itens: ItemNovidade[] }

// Novidades por versão, em linguagem de lojista (não changelog técnico).
// A CADA release, adicione uma entrada nova aqui com os destaques amigáveis.
// A `versao` deve bater com a `version` do package.json.
export const NOVIDADES: ReleaseNovidades[] = [
  {
    versao: '1.21.1',
    itens: [
      {
        emoji: '✨',
        titulo: 'Abertura mais suave do painel',
        descricao:
          'Enquanto o painel carrega, agora aparece um esboço da própria tela no lugar do "Carregando…" — dá a sensação de que tudo abre mais rápido.'
      }
    ]
  },
  {
    versao: '1.21.0',
    itens: [
      {
        emoji: '🔄',
        titulo: 'Atualizações sem interrupção',
        descricao:
          'Quando sai uma versão nova, o sistema instala sozinho e reabre na hora — sem aquela janela do Windows pedindo os "próximos passos".'
      }
    ]
  },
  {
    versao: '1.20.0',
    itens: [
      {
        emoji: '🪟',
        titulo: 'Janelas com a cara do sistema',
        descricao:
          'As confirmações (excluir produto, cliente, etc.) e a janela de impressão agora seguem o visual do sistema — acabaram as caixas cinzas do Windows.'
      },
      {
        emoji: '🖨️',
        titulo: 'Impressora favorita',
        descricao:
          'O sistema lembra a impressora que você usa em cada coisa (cupom e relatórios/etiquetas) e já abre nela.'
      },
      {
        emoji: '⚡',
        titulo: 'Cupom direto no caixa',
        descricao:
          'Em Configurações → Impressão, ligue "imprimir direto" e o cupom sai na hora, sem abrir nenhuma janela.'
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
