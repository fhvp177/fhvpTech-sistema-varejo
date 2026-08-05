import type { PassoTour } from '@fhvptech/core/ui/TourGuiado'

// Roteiro do tour guiado da assistência técnica. O motor (holofote + balão) vive
// no core; aqui é só a história: por onde passar e o que dizer em cada parada.
//
// Gerente faz o tour completo; técnico faz a versão enxuta (só o dia a dia dele,
// sem telas que o cadeado não deixa entrar). Features desligadas na edição
// (dashboard) ficam de fora do roteiro.
//
// ⚠️ Diferença que importa em relação ao roteiro do varejo: aqui a rota '/' NÃO
// desenha tela — ela encaminha o gerente pra '/dashboard' e o técnico pra
// '/painel' (o Painel Diário), porque a Dashboard é somenteDono. Por isso os
// passos apontam pro caminho EXPLÍCITO de cada tela: mandar o tour pra '/' o
// faria pousar em telas diferentes conforme quem estivesse logado.
export function construirPassosTour(ehDono: boolean): PassoTour[] {
  const passos: PassoTour[] = [
    {
      rota: '/painel',
      titulo: 'Vamos dar uma volta?',
      descricao:
        'Este tour passa pelas telas do sistema mostrando onde cada coisa mora — leva uns 2 minutos. Use as setas do teclado pra avançar e voltar, ou Esc pra sair quando quiser.'
    },
    {
      alvo: 'menu',
      titulo: 'O menu lateral',
      descricao:
        'Tudo mora aqui, organizado por assunto: cadastros, operação do dia a dia, financeiro e sistema. Os itens com cadeado são só do gerente.'
    },
    {
      rota: '/painel',
      titulo: 'Painel Diário — a sua fila de trabalho',
      descricao:
        'É por aqui que o dia começa: as visitas de hoje, o que está na bancada, o que espera resposta do cliente e o que já está pronto pra retirada. Cada cartão leva direto pra ordem de serviço dele.'
    },
    {
      alvo: 'painel-nova-os',
      titulo: 'Abrir uma OS',
      descricao:
        'Chegou aparelho pra consertar ou saiu instalação de câmera? Abra a ordem de serviço aqui. A regra é simples: ficou pra fazer, é OS; levou embora na hora, é venda no caixa.'
    },
    {
      rota: '/os',
      alvo: 'os-abas',
      titulo: 'Todas as ordens, por situação',
      descricao:
        'As abas separam o que está em andamento, o que aguarda aprovação do orçamento, o que está pronto e o que já foi encerrado. A coluna "Movimento" pinta de amarelo o que está parado há 3 dias e de vermelho o que passou de 7.'
    },
    {
      alvo: 'os-nova',
      titulo: 'Como uma OS caminha',
      descricao:
        'Abre → orçamento → cliente aprova → execução → pronta → entrega. Em cada etapa o sistema mostra só o botão da próxima ação, e o histórico registra quem fez o quê. Na entrega, a OS vira venda sozinha e baixa as peças do estoque.'
    },
    {
      rota: '/produtos',
      alvo: 'produtos-busca',
      titulo: 'Peças e serviços',
      descricao:
        'Aqui moram as peças e também os serviços (formatação, limpeza, visita técnica). Busque por nome, código, categoria ou fornecedor — digitando a referência curta (ex.: "10"), o item dela aparece em primeiro.'
    },
    {
      alvo: 'produtos-leitor',
      titulo: 'O campo do leitor',
      descricao:
        'Aponte o leitor de código de barras aqui que a peça é filtrada na hora — sem precisar clicar em nada antes.'
    }
  ]

  if (ehDono) {
    passos.push(
      {
        alvo: 'produtos-novo',
        titulo: 'Cadastrar peça ou serviço',
        descricao:
          'Cadastro completo: preço, custo, categoria, fornecedor e a referência curta — que o sistema numera sozinho se você deixar em branco. Serviço não tem estoque nem código de barras; o resto funciona igual.'
      },
      {
        alvo: 'produtos-importar-xml',
        titulo: 'Importar a nota do fornecedor',
        descricao:
          'Chegou peça nova? Arraste o XML da nota fiscal aqui: o sistema cadastra os itens, o fornecedor e o custo real — você só diz quanto quer de lucro. Na recompra, ele reconhece tudo e repõe o estoque sozinho.'
      },
      {
        alvo: 'produtos-imprimir',
        titulo: 'Imprimir estoque e referências',
        descricao:
          'Daqui saem o balanço de estoque (com coluna pra contagem física) e a tabela de referências — a "cola" pra deixar no balcão.'
      }
    )
  }

  passos.push(
    {
      rota: '/vendas',
      alvo: 'vendas-nova',
      titulo: 'O caixa',
      descricao:
        'Este botão abre o caixa em tela cheia: bipe o código de barras ou digite a referência + Enter e o item cai no carrinho. À vista, fiado ou parcelado, cupom na hora — e F2 consulta um preço sem mexer na venda.'
    },
    {
      alvo: 'vendas-relatorio',
      titulo: 'Histórico de vendas',
      descricao:
        'Toda venda fica registrada nesta tela — inclusive as que nasceram do fechamento de uma OS. Busque por cliente, filtre por situação, receba pagamentos e registre trocas ou devoluções abrindo o detalhe.'
    },
    {
      rota: '/clientes',
      titulo: 'Clientes e fiado',
      descricao:
        'Cadastre clientes e venda no fiado sem medo: o sistema mostra quem deve, o que vence hoje e o que atrasou. Os pagamentos são recebidos aqui mesmo, parcela por parcela.'
    }
  )

  if (ehDono) {
    passos.push(
      {
        rota: '/contas-pagar',
        titulo: 'Contas a pagar',
        descricao:
          'O espelho do fiado: tudo que você deve — fornecedor, aluguel, luz, salário — com vencimento e baixa. O sino avisa antes de vencer.'
      },
      {
        rota: '/relatorios',
        titulo: 'Relatórios',
        descricao:
          'Todos os relatórios num lugar só: vendas do mês, estoque, tabela de referências e as compras por nota fiscal — em PDF ou direto na impressora. Os XMLs do contador saem daqui também.'
      }
    )
    if (__FEAT_DASHBOARD__) {
      passos.push({
        rota: '/dashboard',
        titulo: 'O painel do gerente',
        descricao:
          'Faturamento, lucro, ticket médio, ranking de técnicos, o que entra e o que sai — o negócio inteiro num relance, pra decidir com dados.'
      })
    }
    passos.push(
      {
        alvo: 'sino',
        titulo: 'O sino te procura',
        descricao:
          'Visita marcada pra hoje, orçamento parado esperando resposta, aparelho pronto encalhado, conta vencendo, estoque no fim, backup com problema — o sino junta os avisos importantes. Você não precisa vigiar nada.'
      },
      {
        rota: '/configuracoes',
        titulo: 'Configurações e segurança',
        descricao:
          'Dados da sua empresa no cupom, técnicos com PIN próprio, impressoras, backup automático e o backup manual. É daqui também que você refaz este tour quando quiser.'
      },
      {
        titulo: 'Pronto! O sistema é seu 🚀',
        descricao:
          'Esse foi o essencial — o resto você descobre usando. Qualquer dúvida, o assistente e o suporte estão no menu. Bom trabalho!'
      }
    )
  } else {
    passos.push({
      titulo: 'Pronto! Bom trabalho 🚀',
      descricao:
        'Esse é o seu dia a dia: as ordens de serviço, o caixa, as peças e os clientes. Qualquer coisa além disso, chame o gerente.'
    })
  }

  return passos
}
