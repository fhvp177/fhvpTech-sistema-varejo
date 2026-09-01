# Roteiro manual — Comissão de vendedores (varejo)

Percentual sobre o valor da venda, contando pela data da venda, com fechamento
que registra o pagamento.

Rodar com `npm run dev` dentro de `apps/varejo`, logado como **gerente**
(PIN de desenvolvimento: `343761` / `1325`).

O que os testes automatizados **não** cobrem e por isso está aqui: o que aparece
na tela, o papel impresso, e o comportamento com o vendedor logado.

---

## 1. O módulo nasce escondido

1. Abrir o app. No menu lateral, seção **Financeiro**.
2. ✅ **Não existe** item "Comissões". Só Contas a Pagar.

> É o esperado: loja que não paga comissão não vê a aba, e não há interruptor
> separado para explicar. Quem liga é o percentual.

## 2. Ligar pelo percentual da loja

3. **Configurações → Vendedores**. Antes do cadastro aparece o card
   **Comissão dos vendedores**.
4. ✅ O texto embaixo diz que em branco/zero nada é calculado e a aba não aparece.
5. No campo, tentar digitar **letras** e o sinal de **menos**.
   ✅ São recusados — o campo é mascarado, aceita só número com duas casas.
6. Tentar digitar `300`.
   ✅ Trava em `100` (não existe comissão maior que a venda inteira).
7. Digitar `3` e clicar **Salvar**.
   ✅ Toast "Percentual salvo. A aba Comissões está em Financeiro."
   ✅ O item **Comissões** aparece na hora em Financeiro, sem reiniciar o app.

## 3. Percentual individual

8. Ainda em Configurações → Vendedores, editar (lápis) um vendedor.
   ✅ Aparece um terceiro campo, estreito, com `%` do lado direito e o texto
   explicando: em branco segue o padrão da loja, `0` é quem não ganha comissão.
9. Colocar `5` num vendedor e salvar.
   ✅ Na linha dele passa a aparecer "· 5% comissão".
   ✅ Nos que ficaram em branco **não** aparece nada — porque eles seguem a loja,
   e mostrar "3%" ali daria a impressão de valor próprio.

## 4. Vender e conferir

10. Fazer uma venda **à vista** de R$ 100 com o vendedor de 5%.
11. Ir em **Financeiro → Comissões**. Mês atual já selecionado.
    ✅ O vendedor aparece com 1 venda, base R$ 100,00, 5%, comissão R$ 5,00.
12. Clicar no **nome do vendedor**.
    ✅ Abre o detalhamento venda a venda: número da venda, data, cliente, total,
    devolvido, base, % e comissão. O rodapé bate com o total da linha.
    ✅ Rolar a lista dentro do diálogo funciona com a roda do mouse.

## 5. Desconto e devolução entram sozinhos

13. Fazer uma venda de R$ 200 com **R$ 50 de desconto**.
    ✅ A base dessa venda é R$ 150 (e não R$ 200): quem dá desconto reduz a
    própria comissão, sem regra escrita para isso.
14. Registrar uma **devolução** de R$ 50 sobre a venda de R$ 100.
    ✅ A base cai para R$ 50 e a comissão para R$ 2,50.
15. **Cancelar** uma venda do mês.
    ✅ Ela some inteira da apuração — some da contagem, da base e da comissão.

## 6. O percentual congela na venda — o teste que vale o módulo

16. Anotar a comissão do mês.
17. Ir em Configurações e mudar o percentual daquele vendedor de `5` para `10`.
18. Voltar em **Comissões**, mesmo mês.
    ✅ O valor **não mudou**. As vendas já feitas guardam o percentual do dia.
    ✅ Na coluna `%` pode aparecer "misto" se houver vendas com percentuais
    diferentes — passar o mouse mostra a explicação.
19. Fazer uma venda **nova** agora.
    ✅ Só ela sai a 10%; o detalhamento mostra as duas taxas lado a lado.

> É o comportamento que impede um aumento de salário reescrever um mês que já
> foi pago.

## 7. Fechar e pagar

20. Clicar **Registrar pagamento** na linha de um vendedor.
    ✅ O diálogo mostra o valor apurado em destaque e um campo de observação.
21. Confirmar.
    ✅ Toast com o valor. A linha vira "Pago em DD/MM" com selo verde.
    ✅ O botão vira **Estornar**.
22. Tentar registrar o pagamento **do mesmo mês** de novo.
    ✅ Não há botão — o período já está fechado.

## 8. A trava contra pagar duas vezes

Este passo é a razão de o fechamento existir. Precisa de dois períodos.

23. Fechar a comissão de um vendedor no **mês atual**.
24. Trocar o MesPicker para o **mês anterior** e fechar lá também.
    ✅ Passa — meses diferentes não se encostam.
25. Reabrir o mês atual e clicar **Estornar**, depois confirmar.
    ✅ Volta a "Em aberto" e o botão de pagamento reaparece.

> A sobreposição de períodos (ex.: pagar 01–31/08 e depois 15/08–15/09) é
> recusada pelo backend com mensagem dizendo de quem, de qual período e quando
> foi pago. Pela tela do mês inteiro isso não é alcançável — a trava está lá
> para quando o período livre for exposto, e está coberta por
> `comissaoFechamento.test.ts`.

## 9. Devolução depois do fechamento

26. Com um mês já **pago**, registrar uma devolução numa venda daquele mês.
27. Voltar em Comissões, no mês pago.
    ✅ A comissão apurada **caiu**, mas o registro do pagamento **não mudou**.
    ✅ Abaixo do selo verde aparece em âmbar: "Pago R$ X — houve devolução depois
    do fechamento."

> O registro é histórico do que saiu do caixa, não uma fórmula viva. O aviso é
> como o gerente descobre que pagou a mais e acerta no mês seguinte.

## 10. Venda sem vendedor

Só aparece em loja com histórico anterior à versão que passou a exigir vendedor.

28. Se houver, a linha **Sem vendedor** aparece por último, em itálico e cinza.
    ✅ Entra na base (explica a diferença contra o faturamento do mês).
    ✅ Comissão R$ 0,00, sem botão de pagamento, e o rodapé explica por quê.

## 11. Papel impresso

29. Botão **Resumo** → uma página com os cards, a linha de cada vendedor, a
    explicação da regra e o espaço de assinatura de cada um.
    ✅ Imprime em A4 sem cortar coluna.
30. Botão **Detalhado** → o mesmo, mais uma tabela por vendedor com cada venda.
    ✅ Cada bloco de vendedor não se parte no meio entre páginas.
31. Salvar como PDF.
    ✅ O arquivo sai como `Relatorio-Comissoes-AAAA-MM`.

## 12. Vendedor não vê comissão nenhuma

32. Sair e entrar como **vendedor** (não gerente).
33. ✅ O item **Comissões** não aparece no menu.
34. Digitar `/comissoes` na URL (ou reabrir o app já na rota).
    ✅ Cai na tela "Restrito ao gerente", não na página.
35. ✅ Em Configurações o vendedor já não entra — a seção inteira é do gerente.

> A proteção real está no backend: todo canal `comissoes:*` chama `requerDono()`,
> e `comissoesIsolamento.test.ts` quebra o build se um canal novo esquecer.

## 13. Segundo caixa (multi-caixa)

36. Com o servidor ligado e um terminal pareado, logar no terminal como gerente.
37. ✅ A aba Comissões **não** funciona pelo terminal — os canais são locais.

> Decisão consciente: o notebook pode estar fora da loja, e folha de pagamento é
> o dado mais sensível do banco. Mover para `CANAIS_REDE` é uma linha, se um dia
> for pedido.

---

## O que fica de fora desta fase

- **Comissão por recebimento** (proporcional ao que o cliente pagou). Hoje a
  comissão conta na data da venda. Mudar isso exige gravar a data de cada
  recebimento — o sistema ainda não guarda —, e só valeria do dia da instalação
  em diante.
- **Percentual por categoria ou produto.** Hoje é por vendedor, com padrão da
  loja.
- **Vendedor consultar a própria comissão.** v1 é só do gerente.
- **Período livre** (quinzena, semana). A tabela já guarda datas; só a tela é
  mensal.
