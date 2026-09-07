# Roteiro manual — Observação no cupom, custo/lucro no Painel, captação de clientes

Os três pedidos do Neto Imports entregues em 06/09/2026.

Rodar com `npm run dev` dentro de `apps/varejo`, logado como **dono**
(PIN de desenvolvimento: `343761` / `1325`).

O que os testes automatizados **não** cobrem e por isso está aqui: o papel que
sai da impressora, o que aparece na tela, e o comportamento com vendedor logado.

> ⚠️ Precisa de um **caixa aberto** para vender. Se a venda for recusada com
> "caixa fechado", abrir em **Financeiro → Caixas**.

---

## 1. Observação da venda no cupom

1. **PDV**, montar uma venda qualquer à vista.
2. Rolar o painel da direita até o fim. ✅ Existe o campo **Observação**, com a
   dica *(sai no cupom)*, logo acima do botão de finalizar.
3. Escrever `Troca até 15/09` e finalizar.
4. No aviso que aparece, clicar em **Imprimir cupom**.
5. ✅ No papel, depois do bloco de pagamento e **antes** do aviso de "não é
   documento fiscal", sai a linha **OBS.: Troca até 15/09**.
6. ✅ O texto está em Courier negrito como o resto, e cabe na bobina.

### 1.1 Observação comprida não estoura o papel

7. Nova venda, e na observação colar um texto longo **sem espaços**, por
   exemplo `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.
8. Imprimir. ✅ O texto **quebra em várias linhas** dentro dos 68mm. Nada some
   pela direita.

> Em bobina, o que passa da largura não sai cortado: sai ausente. É o motivo do
> `overflow-wrap` nessa linha.

### 1.2 Sem observação, nada é impresso

9. Venda nova, observação **vazia**. Imprimir.
10. ✅ Não existe nenhum "OBS.:" no papel — nem vazio, nem com traço.

### 1.3 A observação some junto com a venda

11. Fazer uma venda **com** observação e finalizar.
12. ✅ O campo volta vazio para a próxima venda.

> Se sobrasse, o bilhete de um cliente sairia no cupom do próximo, e isso só
> apareceria no papel dele.

### 1.4 O pedido separado leva o bilhete para a venda

13. **PDV**, montar um carrinho e usar **Separar** em vez de Finalizar,
    escrevendo uma observação no diálogo (ex.: `entregar depois das 18h`).
14. **Pedidos**, concluir esse pedido informando a forma de pagamento.
15. Imprimir o cupom da venda gerada.
16. ✅ A observação escrita no pedido saiu no cupom da venda.

---

## 2. Custo dos produtos e lucro bruto no Painel

### 2.1 Sem preço de compra, não inventa número

1. Com uma loja cujos produtos **não** têm custo cadastrado, abrir o **Painel**.
2. ✅ Os cartões **Custo dos produtos** e **Lucro bruto** mostram **—**, não
   `R$ 0,00`, e trazem embaixo o convite para cadastrar o preço de compra.

> Custo zero faria o lucro bruto ficar igual ao faturamento: o número errado
> mais convincente que este Painel poderia mostrar.

### 2.2 Com custo, os números aparecem

3. **Produtos**, cadastrar o **preço de compra** de um produto (ex.: custo 40,
   preço 100).
4. Vender esse produto.
5. **Painel** ✅ Seis cartões na faixa de cima, em duas fileiras de três no
   monitor e três fileiras de duas no celular.
6. ✅ **Custo dos produtos** mostra 40 e **Lucro bruto** mostra 60, com
   *margem 60,0%* embaixo.
7. ✅ A variação do cartão de **custo** é **cinza**, não verde nem vermelha.
   A do lucro é colorida normalmente.

### 2.3 ★ Reajustar o preço de compra não mexe no lucro do passado

8. Anotar o valor do **Lucro bruto** do período.
9. **Produtos**, mudar o preço de compra daquele produto de 40 para **90**.
10. Voltar ao **Painel** e recarregar o período.
11. ✅ O lucro bruto **continua o mesmo**. A venda já feita guardou o custo do
    dia dela.
12. Vender outra unidade do mesmo produto.
13. ✅ Agora sim: a venda nova entra com custo 90, e só ela.

> Este é o teste que importa nesta seção. Antes, o passo 10 encolhia o lucro de
> todo o histórico de uma vez, e não havia como explicar a diferença no fim do mês.

---

## 3. Origem de captação e as tags de cliente

### 3.1 A lista de origens

1. **Clientes → Novo cliente**. ✅ Existe o campo **Como chegou até nós
   (opcional)**, entre Endereço e Observação, com um botão de lápis ao lado.
2. Abrir a lista. ✅ Já vêm **Instagram, WhatsApp, Presencial, Indicação**.
3. Clicar no lápis. ✅ Abre **Como o cliente chegou**, com criar, renomear e
   excluir — igual ao de categorias.
4. Criar uma origem nova (ex.: `Feira`). ✅ Aparece na lista e no seletor sem
   fechar o formulário.
5. Tentar criar `instagram` (minúsculo). ✅ Recusado, com mensagem em português
   dizendo que já existe.
6. **Como vendedor** (trocar de conta com F7): abrir o cadastro de cliente.
   ✅ O seletor existe e funciona; o botão de lápis **não aparece**.

### 3.2 Renomear não toca em cliente nenhum

7. Cadastrar um cliente com origem **Instagram**.
8. No gerenciador, renomear **Instagram** para **Insta**.
9. ✅ O cliente continua ligado à origem, agora escrita **Insta**. Nenhum
   cadastro precisou ser reaberto.

### 3.3 Excluir avisa quantos clientes perdem a origem

10. Tentar excluir uma origem que tem clientes.
11. ✅ O aviso diz **quantos** clientes vieram por ela e o que acontece com eles.
12. Confirmar. ✅ Os clientes continuam cadastrados, agora sem origem.

### 3.4 A origem no cadastro rápido do PDV

13. **PDV → cadastrar cliente na hora** (o botão ao lado do seletor de cliente).
14. ✅ O campo **Como chegou até nós** aparece ali também, antes do endereço.
15. Cadastrar um cliente por ali escolhendo uma origem.
16. **Clientes** ✅ Ele aparece com essa origem.

> ⚠️ Conferir também o caminho sem origem: cadastrar pelo PDV **sem** escolher
> nada. Tem que gravar normalmente. (Era aqui que o cadastro quebrava antes do
> conserto, e nenhum teste automatizado consegue pegar isso — os dois drivers de
> banco discordam.)

### 3.5 As tags de situação

17. **Clientes** ✅ Acima da lista há uma faixa de etiquetas: **Novo,
    Recorrente, Reativado, Inativo, Sem compras**, cada uma com a contagem, e
    depois de um traço vertical as **origens**, também com contagem.
18. ✅ No monitor, cada linha tem a coluna **Situação** com a etiqueta colorida
    e, embaixo, *via <origem>*.
19. ✅ No celular, a situação aparece como primeiro item da linha cinza.
20. Clicar em **Sem compras**. ✅ Só sobram clientes que nunca compraram, e a
    etiqueta fica destacada.
21. Clicar nela de novo. ✅ Desliga o filtro.
22. Combinar: clicar em **Sem compras** e depois em **Instagram**.
    ✅ Mostra quem veio pelo Instagram e nunca comprou. Aparece o **limpar**.
23. Com um filtro ligado, digitar na busca. ✅ Os dois valem juntos.

### 3.6 As tags mudam sozinhas

24. Escolher um cliente marcado **Sem compras** e fazer uma venda para ele.
25. Voltar a **Clientes**. ✅ Ele virou **Novo**, sem ninguém ter editado nada.
26. Fazer mais duas vendas para ele. ✅ Virou **Recorrente**.

> Os degraus dependem de datas (90/120/180 dias), então "Reativado" e "Inativo"
> não dão para simular à mão em um dia. Eles estão cobertos por teste
> automatizado, inclusive a ordem de precedência entre eles.

### 3.7 O relatório de captação

27. **Relatórios** ✅ Existe o card **Captação de clientes**.
28. Gerar em PDF.
29. ✅ Uma linha por origem, com Cadastros, **Compraram**, Conversão, Compras,
    Faturamento, Ticket médio e a quebra por situação.
30. ✅ **Não informado** aparece como linha e fica no **fim** da tabela, mesmo
    que seja a que mais faturou.
31. ✅ A soma da coluna Cadastros bate com o total de clientes da loja.
32. ✅ No rodapé, a legenda explicando cada situação.

---

## O que conferir se algo aqui falhar

- **Cupom sem a observação**: ver se a venda gravou (`vendas.observacao`) — o
  campo do PDV pode ter sido limpo antes de finalizar.
- **Lucro mudando com o reajuste**: sinal de que `itens_venda.custo_unitario`
  não está sendo gravado, ou de que o Painel voltou a ler só `produtos.custo`.
  Há teste automatizado para os dois lados.
- **Cadastro de cliente falhando** com "missing named parameter": alguma tela
  novo caminho monta o objeto sem `origem_id` e a normalização na consulta foi
  removida.
