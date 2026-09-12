'# Roteiro de conferência manual — as adições do Neto

As cinco adições pedidas, para conferir na mão no aplicativo rodando. Tudo está
**local, sem commit, sem release e sem deploy**.

Rode com `npm run dev` de dentro de `apps/varejo`, numa loja de teste. Não use a
loja de produção do Neto para nada aqui, principalmente para os passos de
garantia: eles criam registro que fica no histórico.

> ⚠️ Para conferir na edição Básico, rode `EDICAO=basico npm run dev`. Sem a
> variável o padrão é **pro**. Nada aqui depende de plano: as quatro adições
> entram nas duas edições.

**Legenda do risco**, para decidir por onde começar se tiver pouco tempo:

- 🔴 **mexe em dinheiro, em estoque ou em promessa ao cliente.** Erro aqui é
  silencioso. Confira primeiro.
- 🟡 muda o que aparece na tela, sem tocar em dado.
- 🟢 conferência rápida, de olhar.

**Antes de começar**, deixe a loja de teste com:

- pelo menos 6 produtos, em 3 categorias diferentes, com preço **e** custo
  preenchidos, e um deles **sem** custo;
- 2 clientes cadastrados, um deles com origem de captação preenchida;
- 3 ou 4 vendas feitas, uma delas com cliente e uma sem (balcão);
- 2 contas a pagar já pagas, com categorias diferentes (ex.: Aluguel e Energia).

---

## 🔴 1. Garantias — o prazo que a loja promete

Esta é a parte mais delicada da entrega, porque o número que aparece aqui vira
uma promessa impressa na mão do cliente.

### 1.1 O prazo padrão da loja

Em **Configurações → Garantia**:

1. Abra a seção. **Esperado:** o campo mostra **90** e, ao lado, a explicação de
   que vale para todo produto sem prazo próprio.
2. Feche a seção. **Esperado:** o cabeçalho passa a mostrar o resumo
   **"90 dias"** sem precisar abrir.
3. Troque para `30` e salve. **Esperado:** aviso verde dizendo que vale para as
   vendas daqui pra frente, e o resumo do cabeçalho vira **"30 dias"** na hora
   (não precisa sair e voltar).
4. Tente salvar `abc`, `-5` e `5000`. **Esperado:** nos três casos a mensagem
   "Informe um número inteiro de dias, de 0 a 3650", em vermelho, **sem** salvar.
5. Volte para `90` antes de seguir.

### 1.2 O prazo por produto

Em **Produtos → Novo produto**:

1. Olhe o campo **Garantia (dias)**. **Esperado:** vem vazio, e a dica dentro do
   campo diz **"padrão da loja: 90"**.
2. Passe o mouse no ícone de informação ao lado do rótulo. **Esperado:** o texto
   explica que em branco usa o padrão e que zero é sem garantia.
3. Cadastre um produto **Furadeira** com garantia `365`. Salve.
4. Cadastre um produto **Ponta de estoque** com garantia `0`. Salve.
5. Cadastre um produto **Liquidificador** deixando a garantia **em branco**.
   Salve.
6. Reabra os três para editar. **Esperado:** a Furadeira reabre com `365`, a
   Ponta de estoque reabre com `0` (e **não** em branco), e o Liquidificador
   reabre **em branco** (e **não** com 90). Este passo é o que prova que o
   sistema distingue "sem garantia" de "usa o padrão".
7. Tente salvar um produto com garantia `12,5`. **Esperado:** a mensagem
   "A garantia deve ser um número inteiro de dias, de 0 a 3650."

### 1.3 🔴 Mudar o padrão não pode encurtar garantia já vendida

Este é o passo mais importante do roteiro inteiro.

1. Venda **um Liquidificador** (o que herda o padrão de 90 dias) para um
   cliente cadastrado. Anote o número da venda.
2. Vá em **Garantias → Consultar garantia**, digite o número da venda e busque.
   **Esperado:** o cartão do Liquidificador com a tarja verde **"Na garantia"** e
   a frase "até «hoje + 90 dias», faltam 90 dia(s)". Anote essa data.
3. Vá em **Configurações → Garantia** e mude o padrão para **30** dias. Salve.
4. Volte em **Garantias** e busque a mesma venda de novo. **Esperado:** a data
   continua **exatamente a mesma** que você anotou no passo 2. Se ela tiver
   encurtado, **pare e me avise**: a loja estaria voltando atrás numa promessa
   já feita.
5. Faça uma venda **nova** de outro Liquidificador e consulte. **Esperado:**
   agora sim, 30 dias. A mudança vale só para frente.
6. Devolva o padrão para 90 antes de seguir.

### 1.4 🔴 A garantia impressa no cupom

A automação não imprime. Este bloco é só seu.

1. Faça uma venda de **um Liquidificador** e mande **imprimir o cupom**.
   **Esperado:** entre o bloco PAGAMENTO e o QR do PIX aparece a seção
   **GARANTIA**, com a linha "90 dias, até «data»".
2. Confira no papel que a seção **não passa da largura da bobina**, como o
   resto do cupom. Nada pode sair cortado à direita.
3. Faça uma venda com **Liquidificador + Furadeira** (90 e 365 dias) e imprima.
   **Esperado:** agora saem **duas linhas**, uma por produto, cada uma com a
   sua data. Imprimir só uma encurtaria a garantia da furadeira no papel que o
   cliente guarda.
4. Faça uma venda só com a **Ponta de estoque** e imprima. **Esperado:** a
   seção GARANTIA aparece com a frase "Esta venda não tem garantia.", e
   **nenhuma data**.
5. Faça uma venda com **Liquidificador + Ponta de estoque** e imprima.
   **Esperado:** duas linhas, sendo "Ponta de estoque: sem garantia".
6. Abra uma venda **antiga** (feita antes desta atualização, se houver na sua
   loja de teste) e mande imprimir o cupom. **Esperado:** o cupom sai **sem** a
   seção GARANTIA. O sistema não sabe o que foi prometido naquela época e não
   pode inventar.
7. Salve um desses cupons em **PDF** e confira que o bloco saiu igual.

### 1.5 O atendimento de garantia

Em **Garantias → Consultar garantia**:

1. Busque pelo **número da venda**. **Esperado:** acha.
2. Busque pelo **nome do cliente**, mesmo parcial ("mar" para Maria).
   **Esperado:** acha.
3. Busque pelo **telefone sem pontuação** (digite só os números, sem parênteses
   nem traço). **Esperado:** acha. Este é o jeito que se digita com o cliente na
   frente.
4. **Bipe o código de barras** do produto no campo de busca. **Esperado:** acha
   as vendas daquele produto.
5. Busque uma bobagem qualquer. **Esperado:** "Nenhuma compra encontrada com
   isso.", sem erro.
6. Clique em **Abrir atendimento** num item dentro da garantia. Deixe o campo
   **Problema apresentado** vazio e olhe o botão. **Esperado:** o botão "Abrir
   atendimento" está desabilitado.
7. Escreva o problema e confirme. **Esperado:** aviso verde "Atendimento aberto,
   dentro da garantia." e o contador **Em aberto** no topo sobe para 1.
8. Volte a buscar a mesma venda. **Esperado:** embaixo do botão aparece
   "1 atendimento(s) já registrado(s) nesta peça".

### 1.6 🔴 Fora do prazo abre, mas avisa

1. Pegue uma venda **antiga o bastante para a garantia ter vencido** (ou mude a
   data da venda no banco de teste, ou use a Ponta de estoque, que tem zero
   dias).
2. Busque e olhe a tarja. **Esperado:** **"Garantia vencida"** em vermelho, com
   "terminou em «data», há N dia(s)"; ou **"Sem garantia"** em cinza, no caso da
   ponta de estoque.
3. Clique em **Abrir atendimento**. **Esperado:** antes do campo de problema
   aparece uma **tarja amarela** dizendo que a peça está fora da garantia e que
   o atendimento abre assim mesmo.
4. Confirme. **Esperado:** o atendimento abre, com aviso "Atendimento aberto,
   mas FORA do prazo de garantia", e o contador **Fora do prazo** no topo sobe.
   O sistema **não** pode barrar: quem decide se cobre é você.

### 1.7 🔴 Encerrar não mexe em dinheiro nem em estoque

1. Anote, antes de começar: o **estoque** do produto, o **saldo do caixa** (aba
   Contas) e o **total de vendas do dia** no Painel.
2. Em **Garantias → Atendimentos**, abra um atendimento e clique em
   **Encerrar atendimento**.
3. Escolha **Devolver o dinheiro**. **Esperado:** aparece uma tarja amarela
   avisando que isto registra a decisão mas **não move dinheiro**, e que a
   devolução se faz na tela de Vendas.
4. Confirme. **Esperado:** o atendimento vira "Dinheiro devolvido" e sai da
   lista de abertos.
5. **Confira os três números do passo 1.** Esperado: os três **iguais**. Se o
   estoque subiu ou o caixa mudou, pare e me avise — seriam duas fontes mexendo
   no mesmo dinheiro.
6. Agora faça a devolução de verdade pela tela de **Vendas**, como sempre.
   **Esperado:** aí sim o estoque volta e o caixa baixa, uma vez só.

### 1.8 Quem pode o quê

1. Entre como **vendedor** (não dono) e abra **Garantias**. **Esperado:** a tela
   abre normalmente, consulta funciona e **Abrir atendimento** funciona. É
   trabalho de balcão.
2. Olhe um atendimento em aberto. **Esperado:** o botão **Encerrar atendimento**
   **não aparece** para o vendedor.
3. Volte como dono. **Esperado:** o botão aparece.
4. Encerre um atendimento como dono e clique em **Reabrir**. **Esperado:** volta
   para "Em aberto", sem desfecho.

### 1.9 🟡 Os outros desfechos

1. Encerre um atendimento como **Trocar o produto** e outro como
   **Não tinha defeito**.
2. Use os filtros no alto da aba Atendimentos. **Esperado:** o de troca aparece
   em **Resolvidas**; o "não tinha defeito" aparece em **Recusadas**. Os dois
   aparecem em **Todas**.
3. Olhe os contadores do topo. **Esperado:** "Resolvidas (30 dias)" e
   "Recusadas (30 dias)" acompanham.

---

## 🔴 2. Resumo financeiro do mês, na tela

Em **Relatórios**, o painel novo fica no alto, antes dos cards de sempre.

1. Abra a tela. **Esperado:** o painel abre já no **mês corrente**, com quatro
   números: Receitas, Despesas, Resultado e Saldo no fim do mês.
2. 🔴 **Confira a conta que fecha.** Logo abaixo dos quatro números há um bloco
   cinza: saldo no começo do mês, receitas menos despesas, dinheiro que mudou de
   lugar, e saldo no fim. **Esperado:** somando os três primeiros na
   calculadora, dá exatamente o quarto. Se não fechar, pare e me avise.
3. 🔴 Compare o **Saldo no fim do mês** com a soma dos saldos na aba **Contas**.
   **Esperado:** o mesmo número (quando o mês escolhido é o corrente).
4. Faça uma **sangria** no caixa (leve dinheiro para o cofre) e recarregue a
   tela. **Esperado:** a linha "Dinheiro que mudou de lugar" muda, e as Despesas
   **não**. Sangria não é gasto.
5. Passe o mouse no ícone de informação dessa linha. **Esperado:** a explicação
   aparece.
6. Troque o mês pelo seletor, escolhendo um mês **sem movimento nenhum**.
   **Esperado:** a frase "Nenhum lançamento no livro-caixa em «mês»", e o saldo
   continua aparecendo (o dinheiro parado nas contas não some).
7. Olhe o gráfico **Receitas por período**. **Esperado:** o mês inteiro aparece,
   com os dias parados em branco — não só os dias que tiveram venda.
8. Passe o mouse numa barra. **Esperado:** aparece "Dia N: entrou R$ x, saiu
   R$ y".
9. Olhe **Despesas por categoria**. **Esperado:** as categorias que você usou
   nas contas a pagar, da maior para a menor. Some as barras: tem que dar a
   linha de Despesas do topo.
10. Lance um **ajuste negativo** na aba Contas (dinheiro saindo sem conta a
    pagar) e recarregue. **Esperado:** aparece uma linha **"Outras saídas"**, no
    fim da lista, separada de "Sem categoria".
11. Clique em **PDF** e depois em **Imprimir**. **Esperado:** o papel traz os
    mesmos números da tela, mais a tabela dia a dia. Confira que o total do PDF
    bate com o da tela.

---

## 🟡 3. Inventário de estoque, na aba de Produtos

1. Abra **Produtos** como **dono**. **Esperado:** logo abaixo da busca aparece o
   bloco **Inventário de estoque** com quatro números: itens em estoque, valor a
   custo, valor a preço de venda e lucro previsto.
2. 🔴 Confira o **valor a custo** na calculadora, somando custo × estoque de dois
   ou três produtos. **Esperado:** bate.
3. **Digite algo na busca.** Esperado: os números do inventário **não mudam**.
   O inventário é da loja, não da busca.
4. Olhe o aviso amarelo. **Esperado:** aparece dizendo quantos produtos estão em
   estoque **sem custo cadastrado** (você deixou um assim de propósito).
   Cadastre o custo dele e recarregue: o aviso some e o valor a custo sobe.
5. Clique em **Dinheiro parado em cada categoria**. **Esperado:** abre a lista
   por categoria, da que tem mais dinheiro para a que tem menos, com barra e
   percentual. Some os valores: tem que dar o total a custo.
6. Cadastre um produto **sem categoria** e dê estoque a ele. **Esperado:**
   aparece a linha **"Sem categoria"**, sempre no **fim** da lista, mesmo que
   seja a maior.
7. Entre como **vendedor**. **Esperado:** o bloco inteiro **não aparece**. Ele
   mostra custo e margem, que é informação de dono.
8. 🟢 Abra a mesma tela no **celular** (ou estreitando a janela até 360px).
   **Esperado:** os quatro números viram 2×2, nada corta e a página **não rola
   para o lado**.

---

## 🟡 4. ROAS e tráfego pago, no Painel

1. Abra o **Painel**. Role até os dois cards novos, logo abaixo de "Forma de
   pagamento" e "Top 5 categorias". **Esperado:** **Tráfego pago** e **ROAS**,
   lado a lado no computador, um embaixo do outro no celular.
2. Sem nada lançado. **Esperado:** o card de Tráfego pago diz "Nenhum
   investimento lançado neste período" e o de ROAS diz que sem investimento não
   há divisão a fazer. Nenhum dos dois pode mostrar `0,00x` ou `NaN`.
3. Clique em **Lançar**. **Esperado:** abre a caixa com o seletor de mês e um
   campo de dinheiro para **cada origem de cliente** já cadastrada.
4. Se a loja de teste não tiver origem nenhuma, a caixa avisa onde cadastrar
   (Clientes → Origens). Cadastre pelo menos "Instagram".
5. Digite `1000` no campo do Instagram. **Esperado:** o campo formata sozinho
   para **1.000,00**, e o cursor **não pula para o fim** enquanto você digita no
   meio do número.
6. Salve. **Esperado:** os cards recarregam com o investimento de R$ 1.000,00.
7. 🔴 Volte em **Lançar**, troque para `1500` e salve. **Esperado:** o card
   mostra **R$ 1.500,00**, e não R$ 2.500,00. Corrigir não pode somar.
8. Apague o campo (deixe vazio) e salve. **Esperado:** o investimento some e os
   cards voltam ao estado vazio.
9. Lance R$ 1.000 de novo. Marque um cliente com a origem **Instagram** e faça
   uma venda de R$ 3.000 para ele. Recarregue o Painel. **Esperado:**
   **ROAS atribuído 3,00x**; e o **ROAS geral** maior, porque ele divide o
   faturamento da loja inteira pelo mesmo gasto.
10. Olhe o aviso amarelo no card de ROAS. **Esperado:** diz quantos clientes
    ainda estão **sem origem preenchida**. É o que separa "o anúncio não
    funciona" de "ninguém preencheu de onde o cliente veio".
11. Troque o filtro do Painel de **mês** para **últimos 30 dias**. **Esperado:**
    o investimento aparece **rateado** (um valor quebrado, proporcional aos dias
    do mês que a janela pegou), e o texto embaixo do card explica isso.
12. 🟢 No celular, confira que os dois cards não estouram a largura e que os
    números grandes não saem cortados.

---

## 🟢 5. Conferência geral, no fim

1. Feche e reabra o aplicativo. **Esperado:** abre normal, sem tela branca. É o
   passo que pega migration que não rodou.
2. Abra **cada aba do menu**, uma por uma. **Esperado:** nenhuma tela branca,
   nenhum "carregando" eterno.
3. Faça uma **venda completa** ponta a ponta (bipar, fechar, imprimir o cupom).
   **Esperado:** nada mudou no fluxo do caixa.
4. Rode um **backup manual** em Configurações. **Esperado:** conclui sem erro.
5. Se tiver como, abra a **loja hospedada** no navegador depois do deploy e
   repita os passos 1.5, 2.1 e 4.1. É onde o handler que falta aparece como
   "pedaço de tela que sumiu", sem dar erro.

---

## O que a automação já prende, e você não precisa refazer

Para você saber onde não gastar tempo. Tudo isto roda em `npm test` e foi
provado ao contrário (quebrei cada regra de propósito e vi o teste ficar
vermelho):

- a escada do prazo de garantia, inclusive o zero como decisão;
- que mudar o padrão da loja não mexe em venda já feita;
- que encerrar a garantia não toca em estoque, caixa, devolução nem crédito;
- que fora do prazo abre marcado, em vez de ser barrado;
- as datas do cupom, inclusive a virada de ano;
- a conta do resumo financeiro fechando até o saldo final;
- o estorno caindo do lado certo (abate despesa, não vira receita);
- o rateio do investimento por dias, com fevereiro e ano bissexto;
- que corrigir o investimento substitui em vez de somar;
- a soma das categorias batendo com os totais, no financeiro e no inventário.

---

# Segunda rodada — o que mudou depois da sua conferência de 11/09

Tudo aqui nasceu do que você viu testando na loja pelo navegador. Recarregue a
página (Ctrl+F5) antes de começar: são mudanças de interface, e o navegador
guarda a versão antiga.

## 🔴 6. Impressão pelo navegador

Era o ponto mais grave: toda impressão parava numa caixa vermelha falando de
Windows, sem saída.

1. Em **Vendas**, mande **imprimir** o cupom de uma venda. **Esperado:** a caixa
   de impressão do **próprio navegador** abre direto. A caixa vermelha
   "Nenhuma impressora encontrada" **não pode mais aparecer** em lugar nenhum.
2. Repita em **Relatórios** (qualquer card), no **extrato de conta** e no
   **comprovante de abertura de caixa**. **Esperado:** o mesmo caminho nos três.
3. Vá em **Configurações → Impressão**. **Esperado:** o texto explicando que por
   aqui a impressora é escolhida na hora de imprimir, e o resumo da seção
   fechada dizendo "Caixa de impressão do aparelho".
4. 🟢 No **aplicativo instalado** (`npm run dev`), confira que nada mudou: a
   caixa de escolher impressora continua aparecendo, com a lista do Windows.

## 🔴 7. Nome do arquivo ao salvar em PDF

1. Em **Vendas**, clique em **Salvar PDF** num cupom. Na caixa do navegador,
   escolha "Salvar como PDF" e clique em Salvar. **Esperado:** o nome sugerido é
   **`Cupom-Venda-0074.pdf`** (com o número da venda), e não mais um nome
   genérico.
2. Repita num relatório de **Relatórios**. **Esperado:** o nome do relatório,
   com o período.
3. 🟢 Depois de salvar, olhe o **título da aba** do navegador. **Esperado:**
   voltou a ser o do sistema, não ficou com o nome do cupom.

## 🔴 8. Calendários em português

Os campos de data deixaram de ser o do navegador e passaram a ser nossos.

1. Em **Relatórios**, abra qualquer campo **De** ou **até**. **Esperado:** o
   calendário abre em **português** ("Setembro 2026", "D S T Q Q S S"), e a data
   no campo aparece como **11/09/2026**, nunca 09/11/2026.
2. Clique num dia. **Esperado:** fecha e preenche.
3. Clique em **Hoje**. **Esperado:** vai para a data de hoje.
4. Escolha uma data em **De** e abra o **até**. **Esperado:** os dias
   anteriores ao **De** aparecem apagados e não clicam.
5. Navegue com as setas para **dezembro** e depois mais um mês. **Esperado:**
   vira para **Janeiro 2027** certinho.
6. 🔴 Agora o caso que quebra fácil: em **Contas a Pagar**, clique em **Nova
   conta** e abra o **Vencimento** dentro do diálogo. **Esperado:**
   - o calendário aparece **por cima** do diálogo, inteiro, sem ficar cortado;
   - **clicar num dia funciona** (não é só olhar);
   - a **roda do mouse** rola a página normalmente;
   - clicar num dia **não fecha o diálogo** junto.
7. Repita o passo 6 no **vencimento** da venda a prazo, em **Vendas**.
8. Role a página com o calendário aberto. **Esperado:** ele acompanha o campo.
9. Abra um campo de data que esteja perto do **rodapé** da tela. **Esperado:**
   o calendário abre **para cima**, inteiro dentro da tela.

## 🟡 9. Os gráficos

1. No **Painel**, escolha um período com **poucos dias de movimento**.
   **Esperado:** as barras ficam com largura de dedo, não blocos gigantes.
2. **Clique** no gráfico. **Esperado:** **nada** acontece visualmente — o
   retângulo amarelo em volta sumiu.
3. Aperte **Tab** até o gráfico receber o foco pelo teclado. **Esperado:** aí
   sim aparece um anel, mas fino e **na cor do sistema**, não o amarelo do
   Windows. (Isto é acessibilidade, e é de propósito.)
4. Olhe o gráfico de **Vendas por dia da semana**. **Esperado:** mesma coisa.

## 🟡 10. Garantias: cores e o recado do estoque

1. Em **Garantias → Atendimentos**, encerre um atendimento. **Esperado:** na
   lista de desfechos, "Trocar", "Consertar" e "Devolver o dinheiro" têm ícone
   **verde**; "Não tinha defeito" e "Recusar por prazo" têm ícone **vermelho**.
2. Clique num deles. **Esperado:** a borda do escolhido acompanha a cor (verde
   ou vermelha), em vez do azul de antes.
3. Escolha **Trocar o produto**. **Esperado:** aparece a tarja amarela
   explicando exatamente o que fazer no estoque: devolução na tela de Vendas,
   **desmarcando** "devolver ao estoque", e a peça nova saindo numa venda nova
   com o crédito.

## 🟡 11. Tráfego pago: quais são os canais

1. No **Painel**, no card **Tráfego pago**, clique em **Lançar**.
   **Esperado:** antes dos campos, o texto explica que a lista são as **origens
   de cliente** da sua loja e que se preenche **só onde há anúncio pago**.
2. Olhe cada linha. **Esperado:** embaixo do nome do canal, quantos clientes
   vieram por ele ("12 cliente(s) vieram por aqui").
3. Lance um valor em um canal e salve. Reabra. **Esperado:** o canal com valor
   aparece **no topo** da lista.

## 🟢 12. Comprovante de abertura de caixa

1. Em **Caixa**, com um caixa **aberto**, olhe os botões. **Esperado:** um botão
   novo, **Comprovante de abertura**.
2. Clique. **Esperado:** sai o papel com o nome do caixa, quem abriu, a data e a
   hora, o **fundo de troco** e uma linha de assinatura.
3. 🔴 Confira que o papel **não traz** valor esperado, contado nem diferença.
   Se trouxer, me avise: o fechamento desta loja é às cegas de propósito, e um
   número desses no papel da manhã derruba a conferência da noite.

---

# Terceira rodada — 11/09, noite

Recarregue com Ctrl+F5 antes de começar.

## 🔴 13. Papel dos comprovantes de caixa

1. Vá em **Configurações → Impressão**. **Esperado:** no fim da seção, o bloco
   **"Abertura e fechamento de caixa"** com duas opções, e
   **"Impressora térmica (bobina 80mm)"** já escolhida.
2. Com a térmica escolhida, imprima o **comprovante de abertura** (tela de
   Caixa) e o **de fechamento** (Caixa → histórico → um turno → imprimir).
   **Esperado:** os dois saem no formato de **cupom**, estreito, com a mesma
   cara do cupom de venda: logo, nome da loja, divisórias tracejadas.
3. 🔴 Confira na bobina que **nada sai cortado à direita**. É o erro que não dá
   mensagem: o que passa de 72mm simplesmente não aparece no papel.
4. Troque para **Folha A4** e imprima os dois de novo. **Esperado:** agora saem
   no formato de relatório, em folha inteira, com tabela.
5. 🔴 No comprovante de **abertura**, nos dois formatos: ele **não pode** trazer
   valor esperado, contado nem diferença. Se trouxer, me avise.
6. 🟢 No fechamento em bobina, confira que a diferença sai escrita por extenso
   (**FALTA 20,00**, **SOBRA 30,00** ou **CONFERE**), e não só com sinal.

## 🟡 14. Tráfego pago: a tela do lançamento

1. No **Painel → Tráfego pago → Lançar**. **Esperado:** cada linha mostra o
   **nome do canal** à esquerda, com "N cliente(s) vieram por aqui" embaixo, e o
   campo de dinheiro à direita, **estreito**.
2. 🔴 O nome do canal **tem que estar visível**. Antes o campo tomava a linha
   inteira, o nome sumia e o texto de baixo quebrava uma palavra por linha.
3. Digite um valor e salve. Reabra. **Esperado:** o canal com valor aparece no
   topo, e o valor está lá.

## 🟢 15. Cartão do vendedor no login

1. Saia do sistema e volte para a tela de escolha de usuário.
2. Passe o **Tab** até um vendedor ficar selecionado. **Esperado:** o cartão fica
   com **uma** linha azul em volta, arredondada nos quatro cantos, sem canto
   quadrado e sem a segunda linha mais clara por fora.
3. Com vários vendedores cadastrados, ande com as **setas**. **Esperado:** o
   contorno acompanha, inteiro, inclusive no **primeiro e no último** da lista
   (era ali que ele era cortado pela rolagem).

---

# Quarta rodada — em qual conta o dinheiro entra

## 🔴 16. A escolha da conta no recebimento

Faça isto com **duas contas ativas** cadastradas (o seletor some com uma só).

1. No **PDV**, monte uma venda à vista e escolha **PIX**. **Esperado:** aparece
   um seletor de conta logo abaixo das formas de pagamento, começando em
   **"Conta automática"**.
2. Escolha o segundo banco e feche a venda. Vá em **Contas** e confira o extrato.
   **Esperado:** o dinheiro entrou **no banco que você escolheu**, e não no que o
   sistema escolheria.
3. 🔴 Volte ao PDV e escolha **Dinheiro**. **Esperado:** o seletor de conta
   **some**. Essa é a regra: a nota está na gaveta do operador.
4. Feche a venda em dinheiro e confira. **Esperado:** entrou no **caixa**.
5. Em **Vendas**, abra uma venda a prazo e registre um recebimento por **PIX**
   escolhendo uma conta. **Esperado:** cai na conta escolhida.
6. Repita com **Dinheiro**. **Esperado:** o seletor some e o valor cai no caixa.
7. Faça o mesmo na baixa de uma **parcela**.
8. 🔴 Feche o caixa do dia e confira o **esperado em dinheiro**. **Esperado:** ele
   conta só o que entrou em espécie. Se um PIX que você mandou para o banco
   estiver sendo cobrado da gaveta, pare e me avise.

## 🔴 17. O recebimento pelo Painel passou a perguntar a forma

Isto era um defeito, não um recurso novo.

1. No **Painel**, clique num cliente inadimplente e abra o recebimento.
   **Esperado:** agora existe um seletor de **forma de pagamento** (não existia),
   e ao lado o de conta.
2. Receba um valor por **PIX** por essa tela.
3. 🔴 Feche o caixa e olhe o esperado em dinheiro. **Esperado:** esse PIX **não**
   é cobrado da gaveta. Antes ele era: sem forma, o fechamento tratava como
   dinheiro, e a diferença aparecia dias depois sem explicação.
