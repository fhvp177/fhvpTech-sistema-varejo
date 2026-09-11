# Roteiro de conferência manual — 10/09/2026

O que conferir na mão depois da rodada de correções de 10/09. Tudo está
**local, sem commit, sem release e sem deploy**.

Rode nos dois aplicativos (varejo e assistência) com `npm run dev` e dados de
teste. Nunca use uma loja de produção para os passos fiscais.

**Legenda do risco**, para você decidir por onde começar se tiver pouco tempo:

- 🔴 **mexe em dinheiro ou em nota fiscal.** Se algo aqui estiver errado, o
  estrago é silencioso. Confira primeiro.
- 🟡 muda o que aparece na tela, sem tocar em dado.
- 🟢 conferência rápida, de olhar.

---

## 🔴 1. Preço e custo do produto agora têm máscara

**Por que isto é o item mais perigoso da lista.** Os campos de preço e custo
deixaram de ser campo numérico do navegador e passaram a ser campo com máscara
brasileira. Isso exigiu mudar três coisas ao mesmo tempo: como o preço é
mostrado ao abrir um produto, como ele é lido ao salvar, e o que acontece com o
campo vazio. Um erro aqui não dá tela de erro: ele grava o preço errado.

O caso que o teste automatizado prende é o pior deles: um preço de R$ 1.234,56
sendo lido como R$ 1,23 — mil vezes menos.

Em **Produtos → Novo produto**:

1. Digite `1234,56` no preço. **Esperado:** o campo mostra `1.234,56`, com o
   ponto do milhar aparecendo sozinho.
2. Tente digitar uma letra no preço. **Esperado:** não entra nada.
3. Salve o produto e abra a lista. **Esperado:** o preço na lista é
   **R$ 1.234,56**. Se aparecer R$ 1,23 ou R$ 123.456,00, pare e me avise.
4. Clique em editar esse mesmo produto. **Esperado:** o campo reabre mostrando
   `1.234,56`, não `1234.56` nem vazio.
5. Salve de novo sem mexer em nada e confira a lista. **Esperado:** continua
   R$ 1.234,56. (Este passo pega o erro que só aparece na segunda gravação.)
6. Crie um produto deixando o preço **em branco** e tente salvar.
   **Esperado:** a mensagem "Preço inválido." Ele **não** pode ser salvo
   valendo R$ 0,00.
7. Repita o teste do preço de compra (custo), inclusive deixando em branco:
   custo em branco é permitido e vale zero.

Depois confira que o resto do sistema leu certo: abra o **Painel** e veja se o
custo dos produtos e o lucro bruto mudaram de forma coerente com o produto que
você cadastrou.

## 🔴 2. Valor da conta a pagar, mesma mudança

Em **Contas a Pagar → Nova conta**:

1. Digite `2500,90` no valor. **Esperado:** vira `2.500,90`.
2. Salve e confira o valor na lista. **Esperado:** R$ 2.500,90.
3. Edite a conta. **Esperado:** o campo reabre com `2.500,90`.
4. Registre um pagamento parcial de R$ 500,00. **Esperado:** o saldo devedor
   fica R$ 2.000,90.

## 🔴 3. (Só na assistência) Preço no cadastro rápido durante a venda

No PDV, com a venda aberta, cadastre um produto pela tela rápida:

1. Digite `89,90` no preço. **Esperado:** aceita, com vírgula.
2. Tente salvar com o preço vazio ou zerado. **Esperado:** "Informe um preço de
   venda válido."
3. Salve com preço válido e confira que ele entrou no carrinho pelo valor
   certo.

## 🔴 4. Nota fiscal: a venda não pode mais ficar presa

Esta é a correção mais importante que eu fiz em cima do trabalho do Codex, e
ela só aparece quando a internet cai.

O sistema passou a **reservar a nota antes de falar com o servidor**, para nunca
emitir duas vezes. O efeito colateral era grave: se a internet caísse bem nesse
instante, a venda ficava com uma nota "pendente" para sempre e **nunca mais
conseguia emitir**. Agora, quando o servidor confirma que não tem registro
daquela nota, a reserva é liberada.

Como reproduzir (precisa de servidor fiscal de teste, nunca de produção):

1. Faça uma venda. Antes de emitir, **desligue a internet da máquina**.
2. Clique em emitir a NFC-e. **Esperado:** mensagem dizendo que não foi possível
   falar com o servidor fiscal e para consultar a nota.
3. Clique em emitir de novo, ainda sem internet. **Esperado:** o sistema
   **recusa** e diz que já existe nota em andamento. Isso está certo: é o que
   impede a nota sair duas vezes.
4. **Religue a internet** e use o botão de consultar a nota.
   **Esperado:** a nota sai de "pendente" e passa a mostrar o motivo "o servidor
   fiscal não tem registro desta nota: ela não chegou a ser emitida. Pode emitir
   novamente."
5. Emita novamente. **Esperado:** a nota é autorizada normalmente, e a venda
   fica com **uma** nota válida, não duas.

E o caso que já estava na lista do Codex, que continua valendo conferir:

6. Com a cota de emissão do mês estourada, tente emitir.
   **Esperado:** mensagem clara de cota atingida. A nota fica como erro, **não**
   como "processando" para sempre.

## 🔴 5. O sistema volta a abrir depois de fechado

O bug que o cliente relatou: fechar o aplicativo com caixa aberto, ou com uma
nota travada em "processando", e ele não abrir mais sem reiniciar o Windows.

1. Abra um turno de caixa com R$ 50,00 de fundo.
2. Emita ou imprima algo (um cupom serve), para criar a janela invisível de
   impressão.
3. Feche o aplicativo pelo X e conclua a pergunta de backup.
4. Abra o aplicativo de novo pelo atalho, **sem reiniciar o Windows**.
   **Esperado:** a tela de login aparece. Depois de entrar, o mesmo turno
   continua aberto, com o fundo de R$ 50,00 intacto.

⚠️ Se ele não abrir, antes de qualquer coisa: abra o Gerenciador de Tarefas e
veja se sobrou um processo do sistema rodando sem janela. Essa informação é o
que diz se a correção pegou ou não.

## 🟡 6. A barra de botões some do computador, no navegador

Este é o bug da sua captura do netoimports.

1. Abra `netoimports.fhvptech.com` (ou o `npm run dev:web`) numa janela larga
   do computador. **Esperado:** nenhuma barra de botões embaixo. O menu é só o
   da lateral esquerda, como sempre foi.
2. Estreite a janela do navegador até ficar em largura de celular.
   **Esperado:** a ilha arredondada de navegação aparece flutuando embaixo, com
   Caixa, Painel, Produtos, Clientes e Mais.
3. Alargue de novo. **Esperado:** ela some outra vez, sem deixar sobra nem
   espaço em branco no rodapé.
4. Abra no celular de verdade e confira que continua como estava.

## 🟡 7. Cabeçalho das tabelas que rolam

O bug da sua captura da tela de NCM. Conferir em **cada** um destes lugares,
sempre rolando a lista até o meio:

- Produtos → Classificação fiscal (NCM), com a lista longa
- Notas de entrada (a lista de itens)
- Relatórios → Notas fiscais
- Comissões (só no varejo)
- PDV → a tabela de itens da venda

**Esperado, em todos:** ao rolar, os produtos passam **por baixo** do
cabeçalho sem aparecer através dele. A faixa "Produto / Categoria / NCM" fica
sólida e legível o tempo todo.

## 🟡 8. Endereço do caixa adicional, agora com máscara

Na tela de login → Configurar este computador → Conectar como caixa adicional:

1. Digite só números no campo de endereço, por exemplo `19216800110`.
   **Esperado:** vira `192.168.0.110`, com os pontos aparecendo sozinhos.
2. Tente digitar letra ou ponto. **Esperado:** não entra.
3. Deixe a **porta em branco** e conecte com um código válido.
   **Esperado:** conecta normalmente (a porta padrão é aplicada sozinha).
4. Repita em "Trazer os dados de outro computador", que usa os mesmos campos.

⚠️ Este é o passo que eu mais queria que você fizesse de ponta a ponta com as
duas máquinas, porque é o único caminho aqui que eu não consigo exercitar de
verdade por teste automatizado.

## 🟡 9. Configurações da assistência: acabou o botão de salvar

A tela dizia "tudo aqui salva sozinho" e ainda tinha um botão "Salvar
configurações" no fim da seção de backup. Quem mexia num interruptor e saía da
tela achava que tinha configurado, e não tinha. Agora cada opção grava na hora,
como já era no varejo.

Em **Configurações → Backup de Dados** (na assistência):

1. Desligue o backup automático. **Esperado:** aparece "Salvo." logo abaixo.
2. **Saia da tela e volte.** **Esperado:** continua desligado.
3. Religue, mude a frequência para "a cada 4 horas", saia e volte.
   **Esperado:** as duas coisas ficaram.
4. Mude "backup ao fechar" e "backup a cada venda", saindo e voltando.
5. Confira que **não existe mais** o botão "Salvar configurações".

## 🟢 10. Configurações da assistência: o visual

Olhar apenas. Compare lado a lado com a mesma tela do varejo.

1. O título e o ícone do topo estão no mesmo tamanho dos do varejo.
2. Diminua a largura da janela do aplicativo até ficar estreita.
   **Esperado:** o botão "Verificar atualizações" desce e ocupa a linha inteira
   em vez de sair pela direita; a logo fica em cima e os botões dela embaixo; o
   caminho da pasta de backup ocupa a linha e o botão desce.
3. O botão "Fazer backup agora" agora é verde, como no varejo.

## 🟢 11. Categorias: a camiseta virou régua, e a linha alinhou

Acrescentado em 11/09, a pedido dele. Só no varejo (a assistência não tem grade
de tamanhos). Abra **Produtos → Gerenciar categorias**:

1. O ícone que liga a grade de tamanhos agora é uma **régua**, não uma
   camiseta. **Esperado:** ele continua acendendo em azul quando a categoria
   tem grade e ficando apagado quando não tem; clicar continua ligando e
   desligando.
2. Com categorias de nomes bem diferentes (por exemplo "TV" e "Eletrodomésticos
   de linha branca"), olhe a coluna dos ícones. **Esperado:** todas as réguas na
   **mesma posição**, uma embaixo da outra, e o lápis e a lixeira também
   alinhados.
3. Confira a contagem: **esperado** "1 produto" e "0 produtos" numa linha só,
   sem quebrar em duas como aparecia na foto do celular.
4. Cadastre uma categoria de nome muito comprido. **Esperado:** o nome é cortado
   com reticências e a linha não entorta; passar o mouse mostra o nome inteiro.
5. Repita tudo no celular, que é onde o defeito apareceu.
6. Abra o **tour** e o **guia de boas-vindas** e leia o trecho sobre cadastro de
   produto. **Esperado:** não fala mais em "roupas"; fala em "quem vende por
   tamanho".

---

## O que eu NÃO consegui provar, e por quê

Seja severo comigo aqui. Nada abaixo foi testado por mim na mão.

- **Nenhum item deste roteiro foi executado.** Tudo que eu afirmo está provado
  por teste automatizado ou por leitura do código. Impressão, emissão real de
  nota e o par de máquinas do multicaixa só se provam no uso.
- **A impressão durante o fechamento.** Se você fechar o aplicativo no
  exato instante em que um cupom está sendo mandado para a impressora, agora o
  programa encerra em vez de esperar. Antes ele ficava preso para sempre, que
  era o bug; mas eu não consigo dizer que a impressão nunca é cortada nessa
  fresta. Se você vir cupom saindo pela metade ao fechar, é por aqui.
- **A largura da NFC-e (72mm).** Continua sem ninguém ter impresso, desde 09/09.
  O roteiro é `docs/roteiro-danfe-largura.md`.

## O que ficou para você decidir

- **Histórico de caixa no notebook.** Não é bug: está bloqueado de propósito,
  com o motivo escrito em `multicaixa/canais.ts`. Mover é uma linha, e a
  decisão é sua.
- **O cálculo do fechamento de caixa.** Li a conta e ela está correta. Preciso
  de um fechamento específico que pareceu errado para refazer a conta.
- **Revendedor só renovar, nunca emitir chave.** É a maior tarefa da sua lista
  e ainda não foi começada.
- **Cupom de abertura e fechamento de caixa** e **campo de assinatura nos
  documentos.** Features novas, não começadas.
- **Empréstimos (assistência) continua com campo de dinheiro sem máscara.**
  Deixei de propósito: aquela tela tem uma leitura de número própria, escrita
  para o campo antigo, e já produziu um erro de cem vezes no saldo de um
  cliente. Merece um trabalho separado, com teste separado.
- **Preço na importação de XML** também ficou de fora, pelo mesmo tipo de
  motivo: a carga vem do arquivo da nota e mexe em várias linhas de uma vez.
