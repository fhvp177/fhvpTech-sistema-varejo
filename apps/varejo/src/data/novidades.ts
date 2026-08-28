import type { ItemNovidade } from '@fhvptech/core/ui/NovidadesModal'

export type ReleaseNovidades = { versao: string; itens: ItemNovidade[] }

// Novidades por versão, em linguagem de lojista (não changelog técnico).
// A CADA release, adicione uma entrada nova aqui com os destaques amigáveis.
// A `versao` deve bater com a `version` do package.json.
export const NOVIDADES: ReleaseNovidades[] = [
  {
    versao: '1.37.1',
    itens: [
      {
        emoji: '🛠️',
        titulo: 'Correção de bugs',
        descricao:
          'Foi corrigida uma situação em que as listas de seleção abertas dentro de uma janela do sistema não respondiam à rolagem pela roda do mouse, sendo possível percorrê-las apenas pelo teclado. A correção alcança todas as listas do programa, entre elas as de cliente, cidade, produto e categoria.'
      }
    ]
  },
  {
    versao: '1.37.0',
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
    versao: '1.36.1',
    itens: [
      // O atalho de configurar a máquina só existe no plano Pro — mesmo portão
      // do anúncio do Multicaixa na 1.32.0. Sem ele, a loja do Básico leria
      // sobre uma opção que o pacote dela não tem.
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
    versao: '1.36.0',
    itens: [
      {
        emoji: '🛠️',
        titulo: 'Correção de bugs',
        descricao:
          'Foi corrigida uma situação em que o aviso "Instalando a nova versão" permanecia na tela sem que a atualização fosse concluída, em computadores configurados como caixa adicional. A tela de atualização passa a informar quando a instalação não pode ser concluída e a permitir nova tentativa, mantendo o sistema disponível na versão atual enquanto isso. Nas atualizações em que o backup automático não puder ser realizado, o aviso passa a ser exibido antes da instalação.'
      }
    ]
  },
  {
    versao: '1.35.0',
    itens: [
      {
        emoji: '📱',
        titulo: 'QR code do PIX em todos os cupons',
        descricao:
          'Com a chave PIX informada em Configurações, todo cupom de venda passa a ser impresso com o QR code do pagamento, inclusive o da venda à vista — que antes era impresso sem o código, por já constar como paga no momento da impressão. O valor do QR code acompanha a situação da venda: cobra o saldo devido quando há entrada, parcela ou prazo em aberto, e o valor total nos demais casos. O texto acima do código acompanha a mesma distinção, trazendo "PAGUE COM PIX" quando há valor em aberto e "PAGAMENTO POR PIX" quando o cupom já consta como pago. Vendas sem valor a cobrar seguem sem o código, assim como as lojas que não informarem a chave PIX.'
      },
      {
        emoji: '🛠️',
        titulo: 'Correção de bugs',
        descricao:
          'Foi corrigida uma situação em que a venda à vista era registrada com data de vencimento, o que refletia no histórico de vendas e nos relatórios.'
      }
    ]
  },
  {
    versao: '1.34.0',
    itens: [
      {
        emoji: '📱',
        titulo: 'QR code do PIX no cupom',
        descricao:
          'Em Configurações, na seção Dados da loja, passa a ser possível informar a chave PIX do estabelecimento. Com a chave informada, os documentos que ainda possuem valor a receber — cupom de venda a prazo, parcelas em aberto e vendas em atraso — são impressos com um QR code do PIX já preenchido com o valor devido, permitindo ao cliente efetuar o pagamento pela câmera do celular. O cupom de venda já quitada permanece sem o código. A tela de configuração exibe uma prévia do QR code, para conferência da chave antes da gravação. Sem chave informada, os documentos permanecem inalterados.'
      },
      {
        emoji: '🔑',
        titulo: 'Digitação do PIN',
        descricao:
          'Após uma tentativa incorreta, o campo do PIN permanece selecionado, permitindo nova digitação sem necessidade de clicar novamente. O mesmo passa a valer na autorização do gerente, na recuperação de PIN e no cadastro de e-mail. O acesso passa a ser confirmado automaticamente ao completar os dígitos.'
      },
      {
        emoji: '🧾',
        titulo: 'Classificação fiscal a partir da nota de entrada',
        descricao:
          'Produtos cadastrados por meio da importação de XML de nota fiscal passam a receber automaticamente o NCM e a unidade informados na própria nota. Os campos preenchidos manualmente não são alterados.'
      },
      {
        emoji: '🏢',
        titulo: 'Preenchimento do cadastro fiscal pelo CNPJ',
        descricao:
          'No cadastro fiscal do cliente, um botão permite buscar os dados da empresa a partir do CNPJ, preenchendo razão social, endereço e código do município. O sistema informa quando a situação cadastral não consta como ativa.'
      },
      {
        emoji: '🛠️',
        titulo: 'Correção de bugs',
        descricao:
          'Foram corrigidas situações em que janelas de cadastro ultrapassavam a altura da tela, deixando o título e os botões fora de alcance, e em que listas de seleção apareciam cortadas. Também foi corrigida a exibição dos campos de nota fiscal, que em determinada situação apareciam no formulário incorreto.'
      }
    ]
  },
  {
    versao: '1.33.0',
    itens: [
      {
        emoji: '🕐',
        titulo: 'Aviso de data e hora incorretas',
        descricao:
          'Quando a data do computador não confere com a data real, o sistema passa a exibir uma tela própria, que informa a data correta e orienta o ajuste, em lugar da tela de ativação de licença. Nas situações em que a data do computador está correta, o sistema se restabelece sozinho e abre normalmente. Os dados da loja permanecem preservados em qualquer um desses casos.'
      }
    ]
  },
  {
    versao: '1.32.2',
    itens: [
      {
        emoji: '🛠️',
        titulo: 'Correção na verificação de atualizações',
        descricao:
          'Em alguns computadores, o sistema informava estar na versão mais recente mesmo havendo uma versão nova publicada, e o botão de verificar atualização não mudava esse resultado. A situação foi corrigida.'
      }
    ]
  },
  {
    versao: '1.32.1',
    itens: [
      {
        emoji: '🧾',
        titulo: 'Impressão do cupom não fiscal',
        descricao:
          'Em impressora térmica de 80mm, o cupom saía com informações faltando — número do pedido, quantidades, valores, total e rodapé — e com nomes de produto cortados. A impressão foi corrigida e o cupom passa a sair completo. O texto ganhou traço mais encorpado, para melhor leitura no papel térmico; as colunas de quantidade, valor unitário e total ficaram mais espaçadas entre si; e as divisórias entre as seções passaram a ser tracejadas. As mesmas correções valem para o comprovante de devolução. O cupom salvo em PDF passa a ser gerado no formato da bobina, e não mais em folha A4.'
      },
      {
        emoji: '🛠️',
        titulo: 'Correção na tela de devolução',
        descricao:
          'Em vendas com produtos de nome extenso, a tabela de itens da tela de devolução ultrapassava os limites da janela e parte das informações ficava sobreposta ao restante da tela. A situação foi corrigida, e o nome do produto passa a ser exibido por completo.'
      }
    ]
  },
  {
    versao: '1.32.0',
    itens: [
      // Multicaixa e clonagem só existem no plano Pro — mesmo tratamento que a
      // nota fiscal recebe abaixo. Sem o portão, a loja do Básico que pula da
      // 1.31.0 pra cá leria o anúncio de um recurso que o pacote dela nem tem.
      ...(__FEAT_MULTICAIXA__
        ? [
            {
              emoji: '🖥️',
              titulo: 'Multicaixa: mais de um computador na mesma loja',
              descricao:
                'Outro computador com o sistema instalado passa a trabalhar nos mesmos dados desta loja — mesmos produtos, mesmo estoque, mesmas vendas, atualizados na hora. Funciona na rede da loja e também fora dela, pela internet. Os dados continuam guardados apenas no computador principal, que precisa ficar ligado enquanto os demais estiverem em uso; sem conexão com ele, os outros avisam e não registram vendas. Para ativar, acesse Configurações e abra a seção Multicaixa.'
            },
            {
              emoji: '📋',
              titulo: 'Copiar os dados para outro computador',
              descricao:
                'Passa a ser possível levar produtos, clientes, vendas e configurações para outro computador pela própria rede, sem gerar backup, copiar arquivo e restaurar manualmente. Serve para instalar o sistema em uma máquina nova ou trocar o computador da loja. A operação substitui integralmente os dados do computador de destino e guarda uma cópia do que havia nele antes. A opção fica em "Configurar este computador", na tela de entrada.'
            }
          ]
        : [])
    ]
  },
  {
    versao: '1.31.0',
    itens: [
      {
        emoji: '🧮',
        titulo: 'Calculadora mais completa',
        descricao:
          'A calculadora passa a aceitar a conta inteira de uma vez, como "89,90-10%", respeitando a ordem correta das operações e permitindo parênteses. O resultado provável aparece enquanto a conta é digitada, e as últimas contas ficam guardadas em um histórico — basta tocar em uma delas para reaproveitar o resultado. Os números passam a ser exibidos com separador de milhar, o ponto e a vírgula funcionam igualmente como separador decimal, e o tamanho da janela pode ser aumentado ou reduzido pelos botões do cabeçalho.'
      },
      {
        emoji: '⌨️',
        titulo: 'Calculadora e atalhos no caixa',
        descricao:
          'A tecla F10 abre e fecha a calculadora em qualquer tela, inclusive dentro do caixa, onde a barra lateral não fica visível. A barra de atalhos exibida no rodapé do caixa passa a usar letras maiores e em caixa alta, para leitura à distância durante o atendimento.'
      },
      {
        emoji: '🛠️',
        titulo: 'Correção na tecla Esc dentro do caixa',
        descricao:
          'Ao fechar com a tecla Esc uma janela aberta no caixa — como a busca de produto, o cadastro rápido ou a consulta de preço —, o caixa inteiro também era encerrado. A situação foi corrigida: a tecla Esc passa a fechar apenas a janela em uso, e encerra o caixa somente quando não há nenhuma janela aberta.'
      }
    ]
  },
  {
    versao: '1.30.0',
    itens: [
      // Toda a novidade desta versão é da nota fiscal (Pro). No Básico o array
      // fica vazio e o aviso simplesmente não aparece.
      ...(__FEAT_NFE__
        ? [
            {
              emoji: '🧾',
              titulo: 'Escolha do tipo de nota na hora de emitir',
              descricao:
                'Ao emitir a nota fiscal, passa a ser possível escolher entre NF-e e NFC-e a cada venda. O tipo mais comum já vem sugerido conforme o cliente — empresa recebe NF-e, consumidor recebe NFC-e —, e é possível trocar quando necessário. A NF-e também pode ser emitida para clientes pessoa física: os dados fiscais do cliente, antes disponíveis apenas para empresas, agora podem ser preenchidos em qualquer cadastro, com a cidade sugerida automaticamente a partir da loja.'
            }
          ]
        : [])
    ]
  },
  {
    versao: '1.29.1',
    itens: [
      {
        emoji: '🛠️',
        titulo: 'Correção na exibição das tabelas',
        descricao:
          'Em computadores com tela menor, os botões de editar e excluir podiam não aparecer nas telas de Produtos e de Clientes, e alguns textos ficavam cortados. A exibição foi corrigida: as colunas passam a se ajustar ao tamanho da tela e as ações ficam sempre acessíveis.'
      },
      {
        emoji: '🔍',
        titulo: 'Ajuste do tamanho da tela pelo teclado',
        descricao:
          'Os atalhos Ctrl e + para aumentar e Ctrl e - para diminuir o tamanho da tela passam a funcionar corretamente. O atalho Ctrl e 0 retorna ao tamanho padrão a qualquer momento.'
      }
    ]
  },
  {
    versao: '1.29.0',
    itens: [
      // A nota fiscal só existe no plano Pro. Anunciá-la a quem não a tem seria
      // prometer o que a tela não entrega — a flag tira o item (e o texto) do
      // binário do Básico.
      ...(__FEAT_NFE__
        ? [
            {
              emoji: '🧾',
              titulo: 'Emissão de nota fiscal',
              descricao:
                'O sistema passa a emitir nota fiscal eletrônica diretamente pela tela de Vendas. Para venda ao consumidor é emitida a NFC-e, que sai na mesma impressora térmica dos cupons; para venda a empresa, a NF-e em folha A4 — o sistema escolhe o documento conforme o cliente da venda. A habilitação é feita na nova tela "Nota fiscal", que reúne os dados da empresa, o certificado digital, o código de segurança e a classificação fiscal dos produtos. As notas emitidas e os arquivos XML para o contador ficam disponíveis em Relatórios.'
            }
          ]
        : []),
      {
        emoji: '🧮',
        titulo: 'Calculadora dentro do sistema',
        descricao:
          'Uma calculadora passa a ficar disponível na barra lateral. Ela abre em uma janela flutuante que pode ser posicionada em qualquer lugar da tela, permitindo fazer contas sem sair do sistema. Também aceita o teclado do computador.'
      },
      {
        emoji: '⚙️',
        titulo: 'Configurações mais organizadas',
        descricao:
          'As seções de Configurações agora podem ser recolhidas, e cada uma exibe um resumo do que está configurado quando está fechada. O sistema lembra quais seções ficaram abertas. A seção de Backup permanece sempre visível.'
      },
      {
        emoji: '👤',
        titulo: 'O perfil "Dono" passa a se chamar "Gerente"',
        descricao:
          'O perfil com acesso total ao sistema passa a ser identificado como "Gerente" em todas as telas. Nada muda no funcionamento nem nas permissões: é apenas o nome exibido.'
      },
      {
        emoji: '📋',
        titulo: 'Tabela de referências em ordem numérica',
        descricao:
          'A tabela de referências para impressão passa a ser ordenada pelo número da referência, em ordem crescente, facilitando a consulta no balcão.'
      }
    ]
  },
  {
    versao: '1.28.1',
    itens: [
      {
        emoji: '🛠️',
        titulo: 'Manutenção e correção de bugs',
        descricao:
          'Ajustes internos que melhoram o diagnóstico e a estabilidade do sistema.'
      }
    ]
  },
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
          'O sistema agora se apresenta sozinho: um holofote destaca cada parte importante da tela, na ordem certa, com uma explicação curta do que ela faz. Pro gerente, o tour começa logo depois do guia de boas-vindas; pro vendedor, no primeiro login dele — cada um vê só o que usa. Quer rever depois? É só clicar em "Fazer o tour" nas Configurações.'
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
          'Recebeu por engano? Agora o gerente pode reverter um pagamento já registrado — uma parcela específica ou a venda inteira — direto no detalhe da venda. O valor sai do total recebido e a venda volta a ficar em aberto.'
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
