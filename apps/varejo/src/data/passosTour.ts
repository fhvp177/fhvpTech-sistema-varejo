import type { PassoTour } from '@fhvptech/core/ui/TourGuiado'

// Roteiro do tour guiado do varejo. O motor (holofote + balão) vive no core;
// aqui é só a história: por onde passar e o que dizer em cada parada.
//
// Gerente faz o tour completo; vendedor faz a versão enxuta (só o dia a dia dele,
// sem telas que o cadeado não deixa entrar). Features desligadas na edição
// (dashboard) ficam de fora do roteiro.
export function construirPassosTour(ehDono: boolean): PassoTour[] {
  const passos: PassoTour[] = [
    {
      rota: '/produtos',
      titulo: 'Vamos dar uma volta pela loja?',
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
      rota: '/produtos',
      alvo: 'produtos-busca',
      titulo: 'Achar um produto',
      descricao:
        'Busque por nome, código, categoria ou fornecedor. Dica: digitando a referência curta (ex.: "10"), o produto dela aparece em primeiro na lista.'
    },
    {
      alvo: 'produtos-leitor',
      titulo: 'O campo do leitor',
      descricao:
        'Aponte o leitor de código de barras aqui que o produto é filtrado na hora — sem precisar clicar em nada antes.'
    }
  ]

  if (ehDono) {
    passos.push(
      {
        alvo: 'produtos-novo',
        titulo: 'Cadastrar produto',
        descricao:
          'Cadastro completo: preço, custo, categoria, fornecedor, grade de tamanhos (pra roupas) e a referência curta — que o sistema numera sozinho se você deixar em branco.'
      },
      {
        alvo: 'produtos-importar-xml',
        titulo: 'Importar a nota do fornecedor',
        descricao:
          'Chegou mercadoria? Arraste o XML da nota fiscal aqui: o sistema cadastra os produtos, o fornecedor e o custo real — você só diz quanto quer de lucro. Na recompra, ele reconhece tudo e repõe o estoque sozinho.'
      },
      {
        alvo: 'produtos-imprimir',
        titulo: 'Imprimir estoque e referências',
        descricao:
          'Daqui saem o balanço de estoque (com coluna pra contagem física) e a tabela de referências — a "cola" pro vendedor deixar no balcão.'
      }
    )
  }

  passos.push(
    {
      rota: '/vendas',
      alvo: 'vendas-nova',
      titulo: 'O caixa',
      descricao:
        'Este botão abre o caixa em tela cheia: bipe o código de barras ou digite a referência + Enter e o produto cai no carrinho. À vista, fiado ou parcelado, cupom na hora — e F2 consulta um preço sem mexer na venda.'
    },
    {
      alvo: 'vendas-relatorio',
      titulo: 'Histórico de vendas',
      descricao:
        'Toda venda fica registrada nesta tela: busque por cliente, filtre por situação, receba pagamentos e registre trocas ou devoluções abrindo o detalhe. E este botão gera o relatório do mês.'
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
          'O espelho do fiado: tudo que a LOJA deve — fornecedor, aluguel, luz, salário — com vencimento e baixa. O sino avisa antes de vencer.'
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
        rota: '/',
        titulo: 'O painel do gerente',
        descricao:
          'Faturamento, lucro, ticket médio, ranking de vendedores, o que entra e o que sai — a loja inteira num relance, pra decidir com dados.'
      })
    }
    passos.push(
      {
        alvo: 'sino',
        titulo: 'O sino te procura',
        descricao:
          'Dinheiro pra receber, conta vencendo, estoque no fim, backup com problema — o sino junta os avisos importantes. Você não precisa vigiar nada.'
      },
      {
        rota: '/configuracoes',
        titulo: 'Configurações e segurança',
        descricao:
          'Dados da loja no cupom, vendedores com PIN próprio, impressoras, backup automático e o backup manual. É daqui também que você refaz este tour quando quiser.'
      },
      {
        titulo: 'Pronto! A loja é sua 🚀',
        descricao:
          'Esse foi o essencial — o resto você descobre usando. Qualquer dúvida, o assistente e o suporte estão no menu. Boas vendas!'
      }
    )
  } else {
    passos.push({
      titulo: 'Pronto! Bom trabalho 🚀',
      descricao:
        'Esse é o seu dia a dia: caixa, produtos e clientes. Qualquer coisa além disso, chame o gerente da loja. Boas vendas!'
    })
  }

  return passos
}
