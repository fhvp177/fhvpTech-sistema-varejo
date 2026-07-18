import type { ItemNovidade } from '@fhvptech/core/ui/NovidadesModal'

export type ReleaseNovidades = { versao: string; itens: ItemNovidade[] }

// Novidades por versão, em linguagem de lojista (não changelog técnico).
// A CADA release, adicione uma entrada nova aqui com os destaques amigáveis.
// A `versao` deve bater com a `version` do package.json.
export const NOVIDADES: ReleaseNovidades[] = [
  {
    versao: '1.28.0',
    itens: [
      {
        emoji: '🗂️',
        titulo: 'Pasta de dados com o nome do sistema',
        descricao:
          'A pasta onde o sistema guarda os dados e backups no computador passa a se chamar "FHVP Tech Varejo". A mudança é automática e não exige nenhuma ação: dados, licença e backups são preservados e continuam funcionando normalmente.'
      },
      {
        emoji: '🛠️',
        titulo: 'Melhorias internas e correção de bugs',
        descricao:
          'Ajustes internos de manutenção e correções para deixar o sistema mais estável.'
      }
    ]
  },
  {
    versao: '1.27.0',
    itens: [
      {
        emoji: '🔄',
        titulo: 'Correção na atualização automática',
        descricao:
          'Corrigido o erro "Falha ao desinstalar os arquivos do aplicativo antigo", que impedia a atualização do sistema em alguns computadores.'
      },
      {
        emoji: '📊',
        titulo: 'Destaque na aba Relatórios',
        descricao:
          'Os cards da aba Relatórios agora recebem um destaque visual ao passar o mouse, indicando qual relatório será gerado.'
      }
    ]
  },
  {
    versao: '1.26.0',
    itens: [
      {
        emoji: '🔦',
        titulo: 'Tour guiado pelas telas',
        descricao:
          'O sistema agora se apresenta sozinho: um holofote destaca cada parte importante da tela, na ordem certa, com uma explicação curta do que ela faz. Pro dono, o tour começa logo depois do guia de boas-vindas; pro vendedor, no primeiro login dele — cada um vê só o que usa. Quer rever depois? É só clicar em "Fazer o tour" nas Configurações.'
      }
    ]
  },
  {
    versao: '1.25.0',
    itens: [
      {
        emoji: '📄',
        titulo: 'Importe a nota fiscal do fornecedor (XML)',
        descricao:
          'Chegou mercadoria? Arraste o XML da nota pra dentro do sistema (botão "Importar XML" em Produtos): ele lê os produtos, cadastra o fornecedor e calcula o custo real — com frete e impostos. Você só informa o lucro que quer (ex.: 30% em cima do custo) e confirma. Na recompra, o sistema reconhece os itens sozinho e repõe o estoque, sem digitar nada de novo.'
      },
      {
        emoji: '🧾',
        titulo: 'Notas de entrada + pacote do contador',
        descricao:
          'Cada nota importada fica guardada em "Notas de entrada": de lá sai o relatório mensal de compras e o botão "Exportar XMLs", que salva os arquivos originais do mês numa pasta — é exatamente o que o contador pede todo mês.'
      },
      {
        emoji: '🔢',
        titulo: 'Referência curta nos produtos',
        descricao:
          'Todo produto agora tem uma referência curta (ex.: "10"), numerada sozinha e editável. Sem leitor na mão? No caixa, digite a referência + Enter e o produto cai direto no carrinho. Nas buscas, quem bate na referência aparece em primeiro. E dá pra imprimir a "Tabela de referências" — a cola pro vendedor deixar no balcão.'
      },
      {
        emoji: '📊',
        titulo: 'Aba Relatórios',
        descricao:
          'Uma aba nova no menu reúne todos os relatórios do sistema num lugar só: vendas do mês, balanço de estoque, tabela de referências e compras por nota fiscal — cada um com "Salvar PDF" e "Imprimir".'
      },
      {
        emoji: '🧭',
        titulo: 'Configurações mais claras',
        descricao:
          'O "Backup manual" ganhou casa própria dentro da seção de backup (com aviso de sucesso ali mesmo), e o "Salvar configurações" ficou sozinho no rodapé — acabou a confusão entre os dois botões. O tutorial de boas-vindas também foi renovado e agora apresenta o sistema inteirinho.'
      }
    ]
  },
  {
    versao: '1.24.0',
    itens: [
      {
        emoji: '📥',
        titulo: 'Contas a Pagar',
        descricao:
          'Uma aba nova para anotar tudo o que a loja tem a pagar — duplicata de fornecedor, aluguel, luz, água, salário, imposto. Cadastre com valor e vencimento, dê baixa quando pagar (de uma vez ou em partes) e veja num relance o que está vencido, o que vence nos próximos dias e o total em aberto.'
      },
      {
        emoji: '🔔',
        titulo: 'Aviso de conta a vencer',
        descricao:
          'O sino te lembra quando uma conta está vencida, vence hoje ou vence em breve — para nunca mais pagar em atraso por esquecimento. E o painel agora mostra "A pagar" lado a lado com "A receber", fechando a conta do caixa: quanto entra e quanto sai.'
      }
    ]
  },
  {
    versao: '1.23.0',
    itens: [
      {
        emoji: '📅',
        titulo: 'Quanto vence no período',
        descricao:
          'O quadro "A receber" do painel e o relatório do mês agora mostram tudo o que vence no período — incluindo parcelas de vendas de meses anteriores — separando o que está a vencer do que já está em atraso.'
      },
      {
        emoji: '🗓️',
        titulo: 'Painel abre no mês corrente',
        descricao:
          'Ao abrir o sistema, o painel já mostra o mês atual (em vez dos últimos 30 dias). Os botões de período continuam lá para trocar quando quiser.'
      },
      {
        emoji: '✨',
        titulo: 'Toques de vida na interface',
        descricao:
          'O sino badala quando chega aviso novo, as confirmações ganham um check que se desenha, erros dão uma tremidinha e os ícones respondem ao passar do mouse. Tudo sutil — e quem pediu menos movimento no Windows não vê nada disso.'
      }
    ]
  },
  {
    versao: '1.22.0',
    itens: [
      {
        emoji: '↩️',
        titulo: 'Estornar um recebimento',
        descricao:
          'Recebeu por engano? Agora o dono pode reverter um pagamento já registrado — uma parcela específica ou a venda inteira — direto no detalhe da venda. O valor sai do total recebido e a venda volta a ficar em aberto.'
      },
      {
        emoji: '🗂️',
        titulo: 'Aba "Canceladas"',
        descricao:
          'As vendas canceladas agora ficam numa aba própria no histórico, mostrando quem cancelou, quando e por quê — sem se misturar com as vendas ativas.'
      },
      {
        emoji: '📊',
        titulo: 'Relatório do mês mais fiel ao caixa',
        descricao:
          'As vendas à vista agora entram certinho no "Recebido" do relatório (antes ficavam de fora e ainda apareciam como "a receber"). Os números do mês ficaram mais fiéis ao que realmente entrou.'
      }
    ]
  },
  {
    versao: '1.21.1',
    itens: [
      {
        emoji: '💰',
        titulo: 'Receba direto do painel',
        descricao:
          'Nos quadros de "Inadimplentes" e "Vencem hoje", clique no cliente e use o botão Receber para registrar o pagamento ali mesmo — total ou parcial, e parcela por parcela. Sem precisar abrir a tela de Vendas.'
      },
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
