# Roteiro de conferência manual — o sinal e o histórico de recebimentos

Os cinco itens da lista do Neto de 12/09/2026. Estão **commitados localmente,
sem release e sem deploy** até você mandar.

Os passos 1 a 7 são a conta e o histórico do dinheiro; os 8, 9 e 10 são o
arquivamento de produto, o interruptor de parcelamento e a data opcional; o 11
são os nomes novos na tela; o 12 é o sinal no pedido separado.

Rode com `npm run dev` de dentro de `apps/varejo`, numa **loja de teste**. Não
use a loja do Neto: os passos abaixo criam venda e movimento de dinheiro que
ficam no histórico dele.

**Legenda do risco:**

- 🔴 **mexe em dinheiro.** Erro aqui é silencioso e só aparece no fechamento.
- 🟡 muda o que aparece na tela, sem tocar em dado.

---

## Antes de começar: deixe a loja igual à do Neto

O defeito principal **só aparece** com um banco marcado como padrão de
recebimento. Com o caixa como padrão, o destino errado calha de ser o certo e
você não vê nada.

Em **Financeiro → Contas**:

1. Deixe a conta **Caixa da loja** existindo, do tipo caixa.
2. Crie (ou edite) uma conta **Nubank**, do tipo banco, e marque-a como
   **padrão para recebimentos**.
3. Confirme que o Caixa da loja **não** está mais marcado como padrão.

Depois abra o caixa em **Caixa → Abrir**, com qualquer fundo de troco.

---

## 🔴 1. O sinal em espécie tem que ficar na gaveta

Este é o conserto que motivou tudo.

1. No PDV, monte uma venda de **R$ 370,00** para um cliente cadastrado.
2. Em **Condição de pagamento**, escolha **Venda a prazo**.
3. Em **Sinal**, digite **185,00**.
   **Esperado:** aparece logo abaixo o bloco **"Como o cliente pagou o sinal"**,
   com os quatro botões (Dinheiro, Débito, Crédito, PIX).
4. Sem escolher nada, tente finalizar.
   **Esperado:** o sistema recusa e pede para escolher como o sinal foi pago.
5. Escolha **Dinheiro** e finalize.
6. Vá em **Financeiro → Contas** e olhe os saldos.
   **🔴 Esperado:** os **R$ 185,00 entraram no Caixa da loja**, e o Nubank
   continua como estava.

> Se os 185 aparecerem no Nubank, o conserto não está no ar — pare e me diga.

## 🔴 2. O sinal no PIX vai para o banco que você escolher

1. Nova venda a prazo, total **R$ 300,00**, sinal **R$ 100,00**.
2. Escolha **PIX** como forma do sinal.
   **Esperado:** aparece o seletor de conta ao lado. (Ele só aparece se a loja
   tiver **duas ou mais** contas ativas.)
3. Escolha **Nubank** e finalize.
4. **🔴 Esperado:** os R$ 100,00 entraram no **Nubank**, e o caixa não mudou.

## 🔴 3. Dinheiro vivo ignora a escolha de conta, de propósito

1. Nova venda a prazo com sinal.
2. Escolha **PIX** e selecione **Nubank**.
3. **Sem finalizar**, troque a forma para **Dinheiro**.
   **Esperado:** o seletor de conta **some** da tela.
4. Finalize.
5. **🔴 Esperado:** o dinheiro entrou no **Caixa da loja**. A nota está na
   gaveta do operador, então é lá que ela é registrada — quem quiser levar ao
   banco faz **sangria**.

## 🔴 4. O fechamento do caixa tem que bater

Este passo é o que prova o conserto do lado de quem confere.

1. Depois das vendas acima, vá em **Caixa → Fechar**.
2. Confira a lista de formas.
   **🔴 Esperado:** o dinheiro dos sinais em espécie aparece na linha
   **Dinheiro**. **Não pode existir** uma linha chamada "Crediário" com o valor
   de um sinal — era exatamente isso que acontecia antes.
3. Conte a gaveta com o valor certo e feche.
   **Esperado:** fecha sem diferença.

## 🟡 5. O histórico dentro da venda

1. Abra a aba **Vendas** e clique na venda do passo 1 (a de R$ 370 com sinal).
2. **Esperado:** abaixo dos itens, um bloco **"Recebimentos"** com uma linha:
   data e hora, **Sinal**, R$ 185,00, **Dinheiro**, **Caixa da loja**.
3. No mesmo diálogo, em **Registrar Pagamento**, receba os R$ 185,00 restantes
   escolhendo **PIX** e a conta **Nubank**.
4. **Esperado:** a lista ganha uma segunda linha na hora, sem fechar e reabrir:
   **Saldo**, R$ 185,00, **PIX**, **Nubank**. A venda passa a **Pago**.
5. Clique em **Desfazer último recebimento** (só o gerente vê).
6. **Esperado:** entra uma terceira linha, **Estorno**, com o valor
   **negativo e em vermelho**. As duas primeiras continuam lá — o histórico
   mostra o que aconteceu, não só o que sobrou.

## 🟡 6. Venda parcelada

1. Faça uma venda **Parcelada** em 2x, com sinal.
2. Pague a **2ª parcela** escolhendo PIX e uma conta.
3. Abra a venda.
   **Esperado:** o histórico mostra **Sinal** e **Parcela 2** (com o número
   certo, não a 1).

## 🟡 7. Venda antiga, de antes desta atualização

1. Abra uma venda a prazo **feita antes de hoje**, que tenha tido sinal.
2. **Esperado:** o bloco aparece, e na coluna **Forma** pode estar escrito
   **Crediário** ou um travessão.

> Isso é correto e não é bug: o conserto **não reescreve o passado**. Aquele
> sinal foi mesmo gravado como crediário na época. Se preferir, dá para
> corrigir os lançamentos antigos um a um pelo Financeiro, mas é decisão sua.

---

## 🟡 8. Arquivar produto

O que ele pediu foi "deixa eu apagar". O que o sistema passa a oferecer é
arquivar, porque apagar levaria junto o histórico da venda.

1. Na aba **Produtos**, abra o menu de um produto **que já foi vendido** e
   escolha **Arquivar**. Confirme.
   **Esperado:** a linha some da lista e aparece o aviso de que ele foi
   arquivado.
2. Confira que ele sumiu da **busca** da tela e do **inventário** (o valor total
   em estoque deve cair, se o produto tinha estoque).
3. No **caixa**, bipe (ou digite a referência de) esse produto.
   **🔴 Esperado:** o caixa **não** diz "não encontrado". Ele diz que o produto
   está arquivado, com o nome dele.
4. Volte em Produtos e clique no botão **Arquivados** ao lado da busca.
   **Esperado:** o produto reaparece, com um selo cinza escrito "arquivado".
5. Abra o menu dele e escolha **Reativar**.
   **Esperado:** volta ao normal e o caixa aceita de novo.
6. Abra uma **venda antiga** desse produto na aba Vendas.
   **🔴 Esperado:** a venda está inteira, com o item, o preço e a garantia. Nada
   do passado mudou.
7. Tente **excluir** (não arquivar) um produto que já foi vendido.
   **Esperado:** a recusa agora explica o porquê e indica o arquivamento.
8. Cadastre um produto novo, não venda nada, e **exclua**.
   **Esperado:** exclui normalmente. Quem nunca foi vendido continua podendo ser
   apagado de verdade.

## 🟡 9. A loja que não parcela

1. Em **Configurações → Condições de pagamento**, desligue **Oferecer venda
   parcelada**.
2. Vá ao caixa e monte uma venda.
   **Esperado:** a condição **Parcelado** não aparece mais. Ficam "À vista" e
   "Venda a prazo".
3. Volte na aba **Vendas** e abra uma venda **parcelada antiga**.
   **🔴 Esperado:** ela continua inteira, com as parcelas, e você ainda consegue
   dar baixa numa parcela pendente. Desligar decide o que o caixa **oferece**,
   não apaga o que já foi combinado.
4. Religue o interruptor e confirme que a condição volta.

## 🟡 10. Venda a prazo sem data

1. No caixa, monte uma venda a prazo para um cliente.
2. Repare no campo **Data de vencimento**: ele agora diz **(opcional)**.
3. Deixe vazio e finalize.
   **Esperado:** a venda é aceita, e ao deixar o campo em branco aparece o aviso
   de que ela não entra na cobrança por vencimento.
4. Abra a venda na lista.
   **Esperado:** onde ficaria a data, está escrito **"sem prazo combinado"**.
5. Vá ao **Painel**.
   **Esperado:** no card **A receber**, uma linha tracejada **"Sem prazo
   combinado"** com o valor dessa venda.
6. Confira que ela **não** virou "Atrasada" na lista de vendas, nem hoje nem
   depois: sem prazo, não há o que vencer.

## 🟡 11. Os nomes na tela

Nomenclatura pedida pelo lojista. Não muda dado nenhum — o que ele chama de
"venda com sinal" continua sendo a mesma venda a prazo no banco.

1. No caixa, olhe a **condição de pagamento**.
   **Esperado:** a segunda opção agora se chama **"Com sinal ou a prazo"**, com
   a explicação "Recebe parte agora, se houver, e o restante depois".
2. Na aba **Vendas**, olhe a coluna de situação.
   **Esperado:** a venda que teve sinal aparece como **"Com sinal"**; a que não
   teve, como **"A prazo"**. A que está atrasada continua **"Inadimplente"** —
   atraso ganha de tudo, porque é a etiqueta que manda cobrar.
3. Abra uma venda com sinal.
   **Esperado:** no topo do diálogo, **"Com sinal · falta R$ X"**.
4. Abra a ficha de um cliente devedor (aba Clientes).
   **Esperado:** os mesmos nomes ali.

> O nome é **calculado** na hora, de "houve entrada?". Se você estornar o
> recebimento, a mesma venda volta a se chamar "A prazo" sozinha. É por isso que
> "com sinal" não virou uma condição de pagamento nova: ela mudaria de categoria
> sem ninguém ter mexido na venda.

## 🔴 12. Sinal no pedido separado

Este é o defeito que você achou testando: o PDV aceitava o sinal e o botão
"Separar pedido" o descartava em silêncio.

1. No caixa, monte uma venda de **R$ 200,00**, escolha **Com sinal ou a prazo**
   e digite **R$ 100,00** de sinal, forma **Cartão de débito**, conta
   **Banco Picpay**.
2. Repare nos dois botões: agora têm símbolos diferentes, e o roxo diz
   **"Separar pedido — sinal R$ 100,00"**.
3. Clique em **Separar pedido** e confirme.
4. Vá em **Financeiro → Contas**.
   **🔴 Esperado:** os R$ 100,00 **já estão** no Banco Picpay. Antes, este
   dinheiro simplesmente não existia para o sistema.
5. Abra a aba **Pedidos**.
   **Esperado:** o pedido mostra R$ 200,00 e, ao lado, **"falta R$ 100,00"**.
6. Clique em **Receber e concluir**.
   **🔴 Esperado:** o valor grande agora é **R$ 100,00**, com a linha "Total
   R$ 200,00 · sinal de R$ 100,00 já recebido". Era aqui que ele oferecia os
   200 e esquecia o sinal.
7. Receba escolhendo **Dinheiro** e confirme.
8. Confira as contas de novo.
   **🔴 Esperado:** R$ 100,00 no Picpay (o sinal) e R$ 100,00 no Caixa (a
   entrega). **Total de R$ 200,00, nem um centavo a mais.**
9. Abra a venda que nasceu desse pedido, na aba Vendas.
   **Esperado:** no bloco **Recebimentos**, duas linhas: **Sinal** R$ 100,00
   pelo Picpay e o pagamento da entrega no Caixa.

### 🔴 12b. Cancelar pedido com sinal

1. Separe outro pedido com sinal, dessa vez no **PIX**.
2. Na aba Pedidos, escolha **Cancelar**.
   **Esperado:** o aviso diz que o sinal **sai da conta em que entrou** e que
   você deve devolver o valor ao cliente.
3. Confirme e olhe as contas.
   **🔴 Esperado:** o valor saiu da mesma conta e na mesma forma. A peça também
   voltou a ficar disponível.

### 🔴 12c. Caixa fechado

1. Feche o caixa.
2. Tente separar um pedido **com sinal**.
   **Esperado:** recusa, avisando do caixa. Dinheiro fora de turno some da
   conferência.
3. Tente separar um pedido **sem sinal**.
   **Esperado:** passa normalmente. Separar peça não movimenta dinheiro.

## 🟡 13. O peso dos botões

1. No caixa, monte uma venda, escolha **Com sinal ou a prazo** e **não** informe
   a data de vencimento.
   **Esperado:** o botão roxo **"Separar pedido — a peça fica na loja"** sobe
   para cima, e o "Finalizar venda — o cliente leva agora" fica embaixo, mais
   discreto. Os dois continuam ali.
2. Clique mesmo assim em **Finalizar venda**.
   **Esperado:** uma pergunta: "O cliente está levando a mercadoria agora, sem
   data para pagar o restante?". Dá para confirmar e seguir.
3. Agora informe uma data de vencimento.
   **Esperado:** os botões voltam à ordem normal, com o "Finalizar" em cima e
   sem pergunta nenhuma.

## 🔴 14. Transferência entre contas

1. Vá em **Financeiro → Contas**, clique numa conta para abrir o extrato dela.
2. Clique em **Transferir**.
   **Esperado:** o diálogo já vem com a conta aberta como origem, e o saldo de
   cada conta aparece na lista.
3. Escolha o destino. **Esperado:** a conta de origem **não** aparece na lista
   de destino.
4. Transfira **R$ 100,00** do Caixa para o Banco, com uma observação.
5. **🔴 Esperado:** o caixa caiu R$ 100,00 e o banco subiu R$ 100,00. O extrato
   de cada uma mostra a linha dizendo de onde veio e para onde foi.
6. Vá em **Relatórios** e abra **Transferências entre contas**.
   **Esperado:** a linha com data, as duas contas, o valor, a observação e quem
   fez.
7. **🔴 O teste que mais importa:** no mesmo Relatórios, olhe o resumo do mês.
   **O faturamento NÃO pode ter subido R$ 100,00.** Transferência não é venda —
   é o mesmo dinheiro mudando de conta. Se o número subiu, me avise.
8. Se o caixa estiver aberto, feche-o.
   **Esperado:** o esperado em dinheiro já desceu os R$ 100,00 que saíram. Na
   prática, transferir do caixa é uma sangria.

## 🟡 15. Categorias de contas a pagar

1. Em **Contas a pagar**, clique em **Nova conta**.
   **Esperado:** ao lado do campo Categoria, um botão de etiqueta.
2. Clique nele.
   **Esperado:** a lista já vem com as categorias que o sistema sugeria e
   **também com as que você já digitou** nas suas contas.
3. Crie uma categoria nova e feche. **Esperado:** ela aparece nas sugestões do
   campo.
4. Renomeie uma categoria que já está em uso.
   **🔴 Esperado:** as contas que usavam o nome antigo passam a mostrar o novo,
   na lista atrás do modal. Sem isso, o relatório de despesas mostraria a mesma
   despesa em duas linhas.
5. Exclua uma categoria que está em uso.
   **Esperado:** o aviso diz quantas contas usam e deixa claro que **as contas
   continuam registradas** — elas só passam a contar como "Sem categoria".
6. Confirme e confira: as contas continuam na lista, sem a etiqueta.

## 🟡 16. Conta no recebimento do pedido

1. Separe um pedido e vá receber.
2. Escolha **PIX**.
   **Esperado:** aparece o seletor de conta, como já acontecia no caixa. Era a
   última tela de recebimento que escolhia a conta sozinha.
3. Escolha uma conta e confirme. Confira que o dinheiro entrou nela.

---

## O que este roteiro NÃO cobre

- **A tela de Pedidos separados** continua escolhendo a conta sozinha quando o
  cliente paga na entrega. Ela só conclui como "à vista", então não tem sinal e
  não tem o defeito acima — mas também não pergunta a conta. É trabalho
  separado, e está anotado.
- **Impressão.** Nada mudou no cupom: a forma do sinal não sai no papel, que
  continua mostrando total, entrada e saldo.
