# Roteiro manual — Empréstimos (assistência técnica)

Fase 1: vencimento único, comprovante 80mm e o interruptor por loja.
Rodar com `npm run dev` dentro de `apps/assistencia`, logado como **gerente**
(PIN de desenvolvimento: `132540`).

O que os testes automatizados **não** cobrem e por isso está aqui: a impressora
de verdade, o que aparece na tela, e o comportamento com o técnico logado.

---

## 1. O módulo nasce escondido

1. Abrir o app. No menu lateral, seção **Financeiro**.
2. ✅ **Não existe** item "Empréstimos". Só Contas a Pagar e Recibos.

> É o esperado: loja que não contratou não vê a aba. O interruptor começa
> desligado em toda instalação, inclusive nas que já existem.

## 2. Ligar

3. **Configurações → Módulos**. A seção existe e o resumo diz "nenhum ligado".
4. Clicar **Ligar** em Empréstimos.
5. ✅ Toast "Empréstimos ligado."
6. ✅ O item **Empréstimos** aparece na hora em Financeiro, sem precisar
   reiniciar o app.

## 3. Registrar um empréstimo

7. Abrir **Empréstimos → Novo empréstimo**.
8. Buscar um cliente cadastrado no seletor e escolher **com o mouse**.
   ✅ O clique seleciona (não só as setas + Enter).
   ✅ O diálogo do empréstimo **continua aberto** — escolher cliente não fecha o
   cadastro pela metade.
   ✅ Nome e CPF/CNPJ são preenchidos sozinhos, e continuam editáveis.
   ✅ Sem cliente escolhido, o seletor diz "— Sem cliente cadastrado —"
   (e não "— Venda avulsa —", que é vocabulário do PDV).
9. No campo CPF/CNPJ, tentar digitar **letras**.
   ✅ São recusadas. Digitar 11 dígitos → formata como CPF; passar de 11 → vira
   CNPJ sozinho.
10. Valor emprestado: `500`.
    ✅ A prévia embaixo já mostra **Total a receber R$ 500,00** e a nota
    "Sem juros — o devedor devolve o capital emprestado."
11. ✅ A unidade do campo **Juros** já vem em **R$** (é como o dono pensa:
    "quanto eu ganho em cima"), e o campo pede `0,00`.
12. Digitar `100` em Juros.
    ✅ A prévia vira **R$ 600,00**, com "500,00 de capital + 100,00 de juros (20%)"
    — ele mostra a porcentagem equivalente sem você precisar calcular.
13. Clicar em **%** ao lado do campo. ✅ Agora o `100` é lido como 100% e a prévia
    salta para R$ 1.000,00 — a unidade muda a leitura, não o número digitado.
    ✅ O campo passa a pedir `0` em vez de `0,00`.
14. Voltar para **R$**, deixar `100`. Vencimento: **daqui a 5 dias**. Salvar.
12. ✅ Toast "Empréstimo registrado" e a pergunta **"Imprimir comprovante?"**.

### 3.1 O papel

13. Responder **Imprimir**. Sai na impressora térmica (ou no diálogo).
14. ✅ Conferir no papel de 80mm:
    - nada cortado na direita — o texto cabe inteiro na bobina;
    - "Valor emprestado: 500,00", "Juros combinado: 100,00 (20%)" e
      "Total a devolver: 600,00";
    - o valor por extenso entre parênteses;
    - a frase "Declaro ter recebido a quantia de R$ 500,00...";
    - **linha de assinatura com o nome do DEVEDOR** (não o da loja);
    - **NÃO tem QR de PIX** — este papel é da entrega do dinheiro.

## 4. Receber em partes

15. Na lista, botão **Receber**. ✅ O valor já vem preenchido com o total (600,00).
16. Trocar para `200` e confirmar.
17. ✅ Toast de 200,00 · a pergunta de imprimir recibo aparece.
18. Imprimir. ✅ No papel: "Valor recebido 200,00", "Ainda falta 400,00", e a
    linha de assinatura agora é a **da loja** (quem dá quitação).
19. ✅ Na lista: Devido 600,00, embaixo "pago 200,00", Falta 400,00.
20. ✅ Cartão **Total a receber** caiu para 400,00 e **Recebido no mês** subiu para 200,00.
    ✅ O rodapé dele mostra 500,00 em capital emprestado (o principal não muda ao receber).

## 5. Acréscimo depois do acordo fechado

21. Clicar no **nome do devedor** → abre o extrato.
22. ✅ Os três blocos do topo: **Capital emprestado** 500,00 (com "+ 100,00 de
    juros (20%)" embaixo), **Total devido** 600,00 e **Saldo a receber** 400,00.
    ✅ O extrato mostra "Empréstimo concedido 600,00" e "Pagamento recebido -200,00".
23. Botão **Acréscimo** → valor `50`, motivo `juros de setembro`. Lançar.
24. ✅ Deve hoje virou 650,00 · Falta virou 450,00.
25. ✅ A linha "Acréscimo — juros de setembro +50,00" aparece no extrato, em vermelho.

> O campo Juros do cadastro é uma CALCULADORA: ele produz o total uma vez, e o
> total é congelado. Este acréscimo aqui é outra coisa — é um lançamento datado,
> feito depois, quando você decide cobrar algo a mais. Em nenhum dos dois o
> sistema recalcula nada sozinho com o passar do tempo.

## 6. Estorno

26. No extrato, clicar no ícone de **desfazer** do pagamento de 200,00. Confirmar.
27. ✅ Falta volta para 650,00.
28. ✅ A linha **continua no extrato**, riscada e com "(estornado)" ao lado.
    Não some — é isso que permite explicar depois o que aconteceu.

## 7. Quitar

29. **Receber** o valor cheio (650,00). Confirmar.
30. ✅ Recibo diz "QUITADO" e "Dou plena quitação do empréstimo".
31. ✅ Some do filtro "Em aberto" e aparece em "Quitados", com etiqueta verde.

## 8. Atraso e o sino

32. Criar outro empréstimo com vencimento **ontem**.
33. ✅ Etiqueta vermelha "Em atraso" e a coluna diz "1d de atraso".
34. ✅ Cartão **Em atraso** mostra o valor.
35. Abrir o sino (canto superior direito).
    ✅ Aviso vermelho **"Empréstimos em atraso"**. Clicar leva pra tela.

### 8.1 O teste das 23h (opcional, mas vale uma vez)

36. Criar um empréstimo com vencimento **hoje**.
37. Mudar o relógio do Windows para **23h30 de hoje**. Recarregar (Ctrl+R).
38. ✅ Ele continua **Em aberto** — não vira "Em atraso".
39. ⚠️ Devolver o relógio ao normal antes de continuar (o guardião de relógio da
    licença olha isso).

## 9. Cancelamento

40. No extrato de um empréstimo, **Cancelar empréstimo**. Confirmar.
41. ✅ Etiqueta cinza "Cancelado", sai dos cartões do topo.
42. ✅ Continua na lista com filtro "Todos" — nada foi apagado.
43. ✅ Não dá mais para receber nem lançar ajuste nele.

## 10. O técnico não vê nada disso

44. Sair (menu do usuário → Sair) e entrar como **técnico**.
45. ✅ O item Empréstimos **não** aparece no menu — nem bloqueado com cadeado.
46. ✅ O sino nem existe pra ele, então nenhum aviso de empréstimo vaza.

> A proteção não é só a tela sumir: todo canal do módulo exige sessão de gerente
> no processo principal, inclusive os de leitura. Isso está preso por teste
> (`emprestimosIsolamento.test.ts`).

## 11. Desligar

47. Voltar como gerente. **Configurações → Módulos → Desligar**.
48. ✅ O aviso explica que nada é apagado.
49. ✅ A aba some do menu.
50. **Ligar** de novo. ✅ Todos os empréstimos estão lá, do jeito que estavam.

## 12. O faturamento não se mexeu

51. Abrir a **Dashboard** e anotar o faturamento do mês.
52. Criar um empréstimo e receber um pagamento dele.
53. Voltar à Dashboard e recarregar.
54. ✅ O faturamento é **exatamente o mesmo**. Empréstimo não é venda: é dinheiro
    seu que só mudou de lugar.

---

## Conferir de passagem (correções que saíram junto)

### O clique dentro de diálogo

Vinha dos componentes base de seleção, não desta tela. Confirmar nas outras duas:

- **Vendas → Devolução → Crédito ao cliente**: escolher o cliente com o mouse.
- **Recibos → Novo recibo → campo Cidade**: escolher a cidade com o mouse.

Em ambas: o clique seleciona e o diálogo continua aberto.

### Os seletores que viraram nossos

Todo `<select>` do Windows foi trocado pelo componente da casa. A lista aberta
agora tem a nossa borda, o nosso cinza e o ✓ na opção atual — nada de barra azul
do sistema. **Vale abrir cada um destes uma vez** e conferir três coisas: abre,
escolhe com o mouse, e o teclado (setas + Enter, Esc pra fechar) continua
funcionando.

| Onde | O quê |
|---|---|
| Contas a Pagar → Nova conta | Fornecedor |
| Etiquetas A4 (barra do topo) | Layout |
| Ordens de Serviço → Nova OS | Cliente |
| Ordens de Serviço → Fechar OS | Parcelas |
| Recibos → Novo recibo | Cliente cadastrado |
| Recibos (barra do topo) | Filtro de mês |
| Produtos → Novo produto | Categoria e Fornecedor |
| Configurações → Loja | UF |
| Configurações → Segurança | Bloqueio automático |
| Configurações → Backup | Frequência e "ao fechar" |
| Configurações → Impressão | Impressora de cada tipo |
| Configurações → PIX | Tipo de chave |
| Nota fiscal → Configuração | Regime, bobina e ambiente |
| Nota fiscal → Classificação | Unidade e origem |
| Relatórios | Mês das entradas |
| Importar XML | Vincular produto, categoria, margem (% / R$) |
| Qualquer filtro de mês | Mês e ano |
| Diálogo de impressão | Escolher impressora |

Dois pontos que valem atenção especial:

- **Importar XML**: os seletores ali são miúdos e vivem dentro de uma tabela que
  rola. Conferir que a lista abre por cima da tabela (não recortada) e que ela
  acompanha se a tabela rolar.
- **Filtro de mês**: os meses futuros do ano corrente continuam cinza e não
  selecionáveis, como antes.

## As animações de trabalho (conferir nos dois apps)

Cinco realces novos, todos curtos e todos com um emprego. **Ligue "Reduzir
animações" no Windows e refaça o roteiro uma vez**: tudo tem que continuar
funcionando, só sem movimento.

| Onde | O que esperar |
|---|---|
| **PDV** → bipar um produto | A linha se acende e apaga em ~0,8s. Bipar o MESMO produto de novo acende a mesma linha outra vez (não cria linha nova). |
| **PDV** → o número TOTAL | Pulso curto atrás do valor toda vez que ele muda. **Não** deve pulsar ao abrir a tela. |
| **PDV** → cursor | Depois de bipar, de cadastrar na hora ou de fechar a consulta de preço, o campo de leitura dá uma "onda" ao receber o foco. **Não** deve dar onda ao abrir o PDV. |
| **PDV** → lixeirinha do item | A linha sai deslizando pra esquerda antes de sumir. Clicar duas vezes rápido não deve mandar a remoção duas vezes. |
| **Produtos / Clientes / Fornecedores / Contas a Pagar** → excluir | Mesma saída deslizando. ⚠️ Se a exclusão der **erro**, a linha tem que ficar parada — nada de deslizar e voltar. |
| **Contas a Pagar / Empréstimos** → cartões do topo | Pulsam ao registrar um pagamento. **Não** pulsam ao abrir a tela (ali o número apareceu, não mudou). |
| Qualquer lista vazia | Ícone grande boiando devagar, com uma dica embaixo. |

## Fase 2 — carnê, promissória e QR do PIX

### O carnê na tela

55. **Novo empréstimo** → capital `900`, juros `R$ 0`.
56. Em **"Condição de pagamento"**, escolher **Parcelado (carnê)**.
    ✅ O campo "Vencimento" some e aparece "1ª parcela vence em".
57. Abrir o seletor de parcelas e **rolar a lista com a roda do mouse**.
    ✅ Ela rola. (Já foi um bug: a lista abria e ficava parada dentro do diálogo.)
    ✅ **Rolar até o fim: a última opção (24x) tem que aparecer inteira.**
    Se o campo estiver perto do rodapé da janela, a lista encolhe ou vira pra
    cima — o que ela nunca pode é terminar fora da tela. (Já foi um bug: as
    duas últimas opções ficavam inalcançáveis mesmo rolando até o fim.)
    ✅ Testar também com a **janela do app reduzida** pela metade.
58. Parcelas: `4`. Primeira parcela: **daqui a 30 dias**.
    ✅ A prévia lista as 4 parcelas, com data e valor — e **a soma bate 900,00**.
    ✅ O seletor de quantidade mostra "de R$ 225,00 (aprox.)" em cada opção.
58. Trocar para `7` parcelas. ✅ 900 ÷ 7 não fecha: a **1ª parcela fica maior**
    que as outras, e aparece a nota explicando que a sobra vai nela.
59. Voltar para `4` e salvar.

### Receber parcela

60. Na lista, o botão do carnê diz **"Ver carnê"**, não "Receber".
    ⚠️ Isso é de propósito: carnê não aceita pagamento de valor livre.
61. Clicar → abre o extrato com o bloco **Carnê · 0 de 4 pagas**.
62. **Receber** na 1ª parcela. ✅ Pergunta confirmando o valor e a data da parcela
    (sem campo pra editar o valor — ele é o que está no papel do cliente).
63. ✅ A parcela fica riscada com "paga", o contador vira **1 de 4**, e o cartão
    "Total a receber" do topo **pulsa** com o valor novo.
64. ✅ No **Extrato**, embaixo, aparece "Pagamento recebido" com o valor da parcela.

### O carnê impresso

65. No bloco do carnê, **Imprimir carnê**. Sai em **A4**, não na bobina.
66. ✅ Conferir no papel:
    - um canhoto por parcela, com **linha tracejada no meio** (via da loja | via do cliente);
    - número, vencimento e valor em cada um;
    - **QR do PIX** em cada parcela **em aberto**, com o valor daquela parcela;
    - a parcela já paga sai com o selo **PAGA** e **sem QR**;
    - o topo mostra quanto ainda falta e em quantas parcelas.

> Por que a paga não leva QR: reimprimir um carnê meio pago não pode virar
> convite pra pagar de novo o que já foi pago.

### A promissória

67. No rodapé do extrato, **Promissória**. Sai em A4.
68. ✅ Conferir:
    - "NOTA PROMISSÓRIA Nº ..." e o valor grande no topo;
    - a fórmula "pagarei por esta única via... ou à sua ordem";
    - o valor **em número e por extenso** (se divergirem, vale o extenso — por
      isso os dois saem da mesma fonte);
    - o CNPJ da loja como credora e o CPF do devedor como emitente;
    - linha de assinatura com o nome do devedor;
    - ⚠️ **NÃO tem QR de PIX** — título de crédito não é boleto.

### Sem chave PIX cadastrada

69. Em Configurações, apagar a chave PIX e imprimir o carnê de novo.
    ✅ O carnê sai igual, só **sem os QRs**. Nada quebra.
