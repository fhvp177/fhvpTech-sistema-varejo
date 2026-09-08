import type { ItemNovidade } from '@fhvptech/core/ui/NovidadesModal'

export type ReleaseNovidades = { versao: string; itens: ItemNovidade[] }

// Novidades por versão, em linguagem do dono (não changelog técnico).
// A CADA release, adicione uma entrada nova aqui com os destaques amigáveis.
// A `versao` deve bater com a `version` do package.json.
// A assistência nasce sem histórico — as novidades do varejo não valem aqui.
// A primeira entrada é a da 1.0.0, a release que estreia o nicho.
export const NOVIDADES: ReleaseNovidades[] = [
  {
    versao: '1.5.0',
    itens: [
      {
        emoji: '🔐',
        titulo: 'Controle de caixa',
        descricao:
          'O caixa passa a ser aberto e fechado por turno, com contagem do dinheiro e '
          + 'conferência da diferença pelo responsável.'
      },
      {
        emoji: '🏦',
        titulo: 'Contas da oficina',
        descricao:
          'As vendas, as ordens entregues e as contas a pagar passam a movimentar as contas '
          + 'cadastradas, com saldo e extrato por período.'
      },
      {
        emoji: '📦',
        titulo: 'Peças separadas',
        descricao:
          'A peça apartada para um cliente fica reservada no estoque até o pagamento.'
      },
      {
        emoji: '📎',
        titulo: 'Comprovante de pagamento',
        descricao:
          'Cada venda passa a aceitar o comprovante anexado, em imagem ou PDF.'
      },
      {
        emoji: '📈',
        titulo: 'Lucro no Painel',
        descricao:
          'O Painel passa a exibir o custo das peças vendidas e o lucro bruto do período.'
      },
      {
        emoji: '👥',
        titulo: 'Situação do cliente',
        descricao:
          'A listagem de clientes passa a indicar como cada um retorna à oficina, com filtros.'
      },
      {
        emoji: '🕒',
        titulo: 'Horário das vendas',
        descricao:
          'As vendas passam a ser registradas no horário local, inclusive as anteriores.'
      },
      {
        emoji: '☁️',
        titulo: 'Backup em nuvem',
        descricao:
          'As oficinas com o plano contratado passam a manter uma cópia do sistema fora do '
          + 'computador, disponível na tela de Restauração.'
      }
    ]
  },
  {
    versao: '1.4.0',
    itens: [
      {
        emoji: '🔒',
        titulo: 'Licença por computador',
        descricao:
          'A licença passa a registrar em quais computadores o sistema é utilizado, ' +
          'conforme o plano contratado.'
      }
    ]
  },
  {
    versao: '1.3.0',
    itens: [
      {
        emoji: '🔄',
        titulo: 'Troca de vendedor no caixa',
        descricao:
          'O caixa passa a permitir a entrada de outro vendedor sem encerrar a venda em andamento.'
      },
      {
        emoji: '✨',
        titulo: 'Telas identificadas',
        descricao:
          'Cada tela passa a exibir seu ícone e um resumo do que apresenta.'
      }
    ]
  },
  {
    versao: '1.2.0',
    itens: [
      {
        emoji: '🛠️',
        titulo: 'Correção de bugs',
        descricao:
          'Foram corrigidos pequenos problemas nas listas de seleção do sistema.'
      }
    ]
  },
  {
    versao: '1.1.0',
    itens: [
      {
        emoji: '🎛️',
        titulo: 'Listas de seleção com a aparência do sistema',
        descricao:
          'As listas de escolha do sistema — cliente, fornecedor, categoria, unidade, impressora, mês e demais — passam a ser desenhadas pelo próprio programa, seguindo a mesma identidade visual do restante das telas, em lugar da lista padrão do Windows. A navegação por teclado foi preservada: setas para percorrer, Enter para escolher, Esc para fechar e digitação para localizar a opção desejada.'
      },
      {
        emoji: '✨',
        titulo: 'Sinalizações visuais no uso diário',
        descricao:
          'O item ativo do menu lateral passa a ser destacado também pela cor do texto. No caixa, o item recém-lido é realçado na lista e o total ganha destaque quando muda de valor. Itens excluídos deixam a lista de forma perceptível, e as telas sem registros passam a orientar o próximo passo.'
      },
      {
        emoji: '🛠️',
        titulo: 'Correção de bugs',
        descricao:
          'Foi corrigida uma situação em que as listas de seleção de cliente e de cidade, quando abertas dentro de uma janela do sistema, não respondiam ao clique do mouse, sendo possível escolher a opção apenas pelo teclado.'
      }
    ]
  },
  {
    versao: '1.0.1',
    itens: [
      // O atalho de configurar a máquina só existe no plano Pro. Sem este
      // portão, a loja do Básico leria sobre uma opção que o pacote dela não
      // tem.
      ...(__FEAT_MULTICAIXA__
        ? [
            {
              emoji: '🖥️',
              titulo: 'Configuração do caixa adicional',
              descricao:
                'Foi corrigida uma situação em que a opção "Configurar este computador", da tela de acesso, não era exibida nas lojas com apenas um usuário cadastrado, condição em que se encontra todo computador recém-instalado. A opção, necessária para conectar a máquina como caixa adicional ou para trazer os dados de outro computador, passa a ser exibida também nesses casos.'
            }
          ]
        : []),
      {
        emoji: '🛠️',
        titulo: 'Correção de bugs',
        descricao:
          'Foi corrigida uma situação em que o telefone do suporte deixava de ser exibido na tela de acesso das lojas com apenas um usuário cadastrado.'
      }
    ]
  },
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
